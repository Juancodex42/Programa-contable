import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "webapp", "backend"))

import sqlite3
from fifo_engine import recalculate_fifo_costs_db
from db_manager import get_modal_spread, DB_PATH

def test_fifo_run():
    print("Database path:", DB_PATH)
    
    # 1. Check stats before recalculation
    print("\n--- stats BEFORE recalculation ---")
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM transactions WHERE tipo_operacion='Venta' AND cotizacion_compra > 0")
    ventas_con_costo_before = c.fetchone()[0]
    print(f"Ventas with cotizacion_compra > 0: {ventas_con_costo_before}")
    
    spread_before = get_modal_spread()
    print("get_modal_spread() result:", spread_before)
    
    # 2. Run FIFO recalculation
    print("\n--- Running recalculate_fifo_costs_db() ---")
    res = recalculate_fifo_costs_db()
    print("Recalculate result:", res)
    
    # 3. Check stats after recalculation
    print("\n--- stats AFTER recalculation ---")
    c.execute("SELECT COUNT(*) FROM transactions WHERE tipo_operacion='Venta' AND cotizacion_compra > 0")
    ventas_con_costo_after = c.fetchone()[0]
    print(f"Ventas with cotizacion_compra > 0: {ventas_con_costo_after}")
    
    spread_after = get_modal_spread()
    print("get_modal_spread() result:", spread_after)
    
    # Fetch all non-fallback spreads
    c.execute("""
        SELECT cotizacion_compra, cotizacion_venta, moneda, fecha, exchange
        FROM transactions 
        WHERE tipo_operacion='Venta' AND cotizacion_compra > 0 AND cotizacion_venta > 0
    """)
    rows = c.fetchall()
    spreads = []
    for row in rows:
        buy_price = float(row[0])
        sell_price = float(row[1])
        spread = ((sell_price / buy_price) - 1.0) * 100.0
        if abs(spread - 17.647) >= 0.1 and -30.0 < spread < 50.0:
            spreads.append((round(spread, 1), row[2], row[3], row[4]))
            
    print(f"\nNon-fallback Spreads (Count: {len(spreads)}):")
    for s, coin, date, exch in sorted(spreads, key=lambda x: x[0]):
        print(f"  Spread: {s}%, Coin: {coin}, Date: {date}, Exch: {exch}")
        
    conn.close()

if __name__ == "__main__":
    test_fifo_run()
