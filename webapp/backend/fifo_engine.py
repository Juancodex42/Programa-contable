import collections
import pandas as pd
import sqlite3

def recalculate_fifo_costs_db():
    """
    Runs a chronological FIFO analysis on all transactions in the database.
    Updates the 'cotizacion_compra' field for Venta transactions with the 
    weighted cost basis unit price in ARS calculated from previous buys.
    """
    from db_manager import get_connection
    
    conn = get_connection()
    try:
        # 1. Fetch all transactions sorted chronologically (COMPRA before VENTA on same date)
        query = """
            SELECT tx_hash, fecha, exchange, tipo_operacion, moneda, 
                   monto_compra_cripto, monto_venta_cripto, 
                   cotizacion_compra, cotizacion_venta, monto_ars 
            FROM transactions 
            ORDER BY fecha ASC, 
                     CASE 
                        WHEN LOWER(tipo_operacion) LIKE '%compra%' OR LOWER(tipo_operacion) LIKE '%ingreso%' OR LOWER(tipo_operacion) LIKE '%deposito%' THEN 1 
                        ELSE 2 
                     END ASC,
                     tx_hash ASC
        """
        df = pd.read_sql_query(query, conn)
        
        if df.empty:
            return {"success": True, "message": "No transactions found.", "updated_count": 0}
            
        # Pre-fetch tax settings for all unique years
        from db_manager import get_tax_settings
        df['year_temp'] = df['fecha'].str.slice(0, 4)
        unique_years = df['year_temp'].dropna().unique()
        settings_by_year = {}
        for y in unique_years:
            try:
                y_int = int(y)
                settings_by_year[y_int] = get_tax_settings(y_int)
            except Exception:
                pass

        # Group transactions by coin (moneda) and run FIFO logic for each coin
        # Note: We skip ARS and fiat currencies.
        coins = df['moneda'].str.upper().str.strip().unique()
        
        updates = []  # list of tuples (cotizacion_compra, tx_hash) to update in DB
        
        for coin in coins:
            if not coin or coin in ('ARS', 'USD', 'NONE', 'EUR'):
                continue
                
            coin_df = df[df['moneda'].str.upper().str.strip() == coin]
            
            # Queue to hold purchase lots (FIFO)
            # Each element: {"fecha": ..., "qty_remaining": ..., "price_ars": ...}
            buy_queue = collections.deque()
            
            for _, row in coin_df.iterrows():
                tx_hash = row['tx_hash']
                op_type = str(row['tipo_operacion']).upper().strip()
                m_compra = float(row['monto_compra_cripto'] or 0.0)
                m_venta = float(row['monto_venta_cripto'] or 0.0)
                cot_compra = float(row['cotizacion_compra'] or 0.0)
                cot_venta = float(row['cotizacion_venta'] or 0.0)
                m_ars = float(row['monto_ars'] or 0.0)
                
                # Identify Inflows (Buy/Ingreso)
                is_buy = "COMPRA" in op_type or "INGRESO" in op_type or m_compra > 0
                is_sell = "VENTA" in op_type or "RETIRO" in op_type or m_venta > 0
                
                # To prevent confusion, if it's both, we treat it by its values
                if is_buy and m_compra > 0:
                    # Determine unit price in ARS for this buy
                    if m_compra > 0 and m_ars > 0:
                        unit_price_ars = m_ars / m_compra
                    elif cot_compra > 0:
                        unit_price_ars = cot_compra
                    else:
                        unit_price_ars = 0.0
                        
                    buy_queue.append({
                        "fecha": row['fecha'],
                        "qty_remaining": m_compra,
                        "price_ars": unit_price_ars
                    })
                    
                if is_sell and m_venta > 0:
                    # Match this sale against the FIFO queue
                    total_cost_ars = 0.0
                    remaining_to_match = m_venta
                    
                    while remaining_to_match > 0 and buy_queue:
                        buy_lot = buy_queue[0]
                        matched_qty = min(remaining_to_match, buy_lot['qty_remaining'])
                        
                        total_cost_ars += matched_qty * buy_lot['price_ars']
                        buy_lot['qty_remaining'] -= matched_qty
                        remaining_to_match -= matched_qty
                        
                        if buy_lot['qty_remaining'] <= 1e-9:
                            buy_queue.popleft()
                            
                    # Handle unmatched amounts (Phantom Sales/Lack of history)
                    if remaining_to_match > 0:
                        if cot_compra > 0:
                            total_cost_ars += remaining_to_match * cot_compra
                        # Note: If no purchase history or cot_compra exists, cost is 0.0.
                        # The history gap scanner (check_history_gaps) alerts the user to the missing buy.
                        
                    # Calculate effective buy price in ARS per unit
                    effective_buy_price = total_cost_ars / m_venta if m_venta > 0 else 0.0
                    
                    # Round to 2 decimal places for database stability
                    effective_buy_price = round(effective_buy_price, 2)
                    
                    updates.append((effective_buy_price, tx_hash))
                    
        # 2. Write updates to DB (excluding certified transactions)
        if updates:
            c = conn.cursor()
            # Perform bulk update safely excluding is_certified = 1 rows
            c.executemany("""
                UPDATE transactions 
                SET cotizacion_compra = ? 
                WHERE tx_hash = ? AND (is_certified IS NULL OR is_certified = 0)
            """, updates)
            conn.commit()
            return {"success": True, "message": f"Successfully updated Venta transactions with FIFO cost.", "updated_count": len(updates)}
        else:
            return {"success": True, "message": "No Venta transactions to update.", "updated_count": 0}
            
    except Exception as e:
        print(f"Error recalculating FIFO costs: {e}")
        return {"success": False, "error": str(e), "updated_count": 0}
    finally:
        conn.close()
