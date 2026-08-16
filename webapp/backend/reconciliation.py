import sqlite3
import pandas as pd
from datetime import datetime, timedelta
import os
import db_manager

class ReconciliationEngine:
    def __init__(self, db_path=None):
        if db_path is None:
            self.db_path = db_manager.DB_PATH
        else:
            self.db_path = db_path
        
    def _get_connection(self):
        if self.db_path == db_manager.DB_PATH:
            return db_manager.get_connection()
        return sqlite3.connect(self.db_path)
        
    def run_full_audit(self):
        """
        Reconstructs the ledger for all currencies chronologically.
        Simulates the wallet balances mathematically.
        Returns a list of 'Phantom Sales' or negative balance anomalies.
        """
        try:
            conn = self._get_connection()
            query = """
                SELECT fecha, exchange, tipo_operacion, moneda, monto_compra_cripto, monto_venta_cripto, comentarios, is_certified 
                FROM transactions 
                ORDER BY fecha ASC, 
                         CASE 
                            WHEN LOWER(tipo_operacion) LIKE '%compra%' OR LOWER(tipo_operacion) LIKE '%ingreso%' OR LOWER(tipo_operacion) LIKE '%deposito%' THEN 1 
                            ELSE 2 
                         END ASC
            """
            df = pd.read_sql_query(query, conn)
            
            # Fetch active certification ranges (start_date, end_date) directly from current DB
            certified_ranges = []
            try:
                c_cursor = conn.cursor()
                c_cursor.execute("SELECT start_date, end_date FROM certifications")
                cert_rows = c_cursor.fetchall()
                for s_date, e_date in cert_rows:
                    if not s_date or not e_date:
                        continue
                    s_str = str(s_date).replace('T', ' ').strip()
                    e_str = str(e_date).replace('T', ' ').strip()
                    if len(s_str) == 10:
                        s_str += " 00:00:00"
                    if len(e_str) == 10:
                        e_str += " 23:59:59"
                    certified_ranges.append((s_str, e_str))
            except Exception:
                certified_ranges = []
                
            conn.close()
        except Exception as e:
            return {"success": False, "error": str(e), "anomalies": []}
            
        if df.empty:
            return {"success": True, "anomalies": [], "final_balances": {}}
            
        anomalies = []
        ledgers = {}
        
        for index, row in df.iterrows():
            crypto = str(row['moneda']).upper().strip()
            if not crypto or crypto == 'NONE' or crypto == 'ARS':
                continue
                
            op_type = str(row['tipo_operacion']).strip().upper()
            monto_compra = float(row['monto_compra_cripto'])
            monto_venta = float(row['monto_venta_cripto'])
            
            if crypto not in ledgers:
                ledgers[crypto] = 0.0
                
            is_buy = 'COMPRA' in op_type or 'INGRESO' in op_type or (monto_compra > 0 and monto_venta == 0)
            is_sell = 'VENTA' in op_type or 'RETIRO' in op_type or (monto_venta > 0 and monto_compra == 0)
            
            if is_buy:
                ledgers[crypto] += monto_compra
            elif is_sell:
                epsilon = 0.00000001
                amount = monto_venta
                
                # Check for Phantom Sale
                if ledgers[crypto] - amount < -epsilon:
                    missing_amount = abs(ledgers[crypto] - amount)
                    
                    # Check if this anomaly occurred within a certified date range or is explicitly certified
                    is_certified_period = False
                    tx_fecha_str = str(row['fecha']).replace('T', ' ').strip()
                    if len(tx_fecha_str) == 10:
                        tx_fecha_str += " 00:00:00"

                    for s_str, e_str in certified_ranges:
                        if s_str <= tx_fecha_str <= e_str:
                            is_certified_period = True
                            break

                    if not is_certified_period and row.get('is_certified') in (1, '1', True):
                        is_certified_period = True

                    if not is_certified_period:
                        anomalies.append({
                            "crypto": crypto,
                            "currency": crypto,
                            "date": row['fecha'],
                            "exchange": row['exchange'],
                            "type": row['tipo_operacion'],
                            "attempted_amount": amount,
                            "current_ledger": ledgers[crypto],
                            "missing": missing_amount,
                            "source_ref": row['comentarios'],
                            "message": f"Phantom Sale Detected: Venta de {amount} {crypto} pero el saldo histórico registrado era {ledgers[crypto]} (Falta registrar {missing_amount} {crypto} previos)."
                        })
                
                ledgers[crypto] -= amount
                
        return {
            "success": True,
            "anomalies": anomalies,
            "final_balances": ledgers
        }

    def run_auto_correction(self):
        """
        Runs the audit and injects 'Ajuste de Conciliación Automática' transactions 
        for any detected phantom sales to balance the ledger.
        """
        audit = self.run_full_audit()
        if not audit["success"]:
            return audit
            
        anomalies = audit.get("anomalies", [])
        if not anomalies:
            return {"success": True, "message": "No anomalies found. Ledger is perfectly balanced.", "fixed_count": 0, "inserted_corrections": 0}
            
        import hashlib
        from models_v2 import TransactionModel
        import db_manager
        
        inserted_total = 0
        fixes = []
        
        # We need to insert a "Compra" or "Ingreso" just 1 second before the anomaly date
        for a in anomalies:
            try:
                # Parse the date and shift it 1 second earlier using timedelta
                anomaly_date = datetime.strptime(a['date'], '%Y-%m-%d %H:%M:%S')
                fixed_date = anomaly_date - timedelta(seconds=1)
                
                # Create a synthetic transaction using the strict Pydantic model
                model = TransactionModel(
                    fecha=fixed_date,
                    exchange="Sistema de Conciliación",
                    tipo_operacion="Ingreso Automático",
                    moneda=a['crypto'],
                    monto_compra_cripto=a['missing'],
                    monto_venta_cripto=0.0,
                    cotizacion_compra=0.0,
                    cotizacion_venta=0.0,
                    monto_ars=0.0,
                    comentarios=f"Ajuste automático para cubrir Phantom Sale referenciada como: {a['source_ref']}"
                )
                
                dt_dict = model.to_dict()
                
                # Generate stable hash for the adjustment
                hash_source = f"{dt_dict['Fecha']}{dt_dict['Exchange']}{dt_dict['Tipo de Operación']}{dt_dict['Monto Compra (Cripto)']}"
                dt_dict['tx_hash'] = hashlib.md5(hash_source.encode('utf-8')).hexdigest()
                fixes.append(dt_dict)
            except Exception as e:
                print(f"Error creating fix for anomaly: {e}")
                
        if fixes:
            inserted, skipped = db_manager.insert_transactions(fixes)
            inserted_total = inserted
            
        # Re-run audit to confirm
        verification = self.run_full_audit()
        
        return {
            "success": True,
            "message": f"Se aplicaron {inserted_total} ajustes automáticos.",
            "fixed_count": inserted_total,
            "inserted_corrections": inserted_total,
            "remaining_anomalies": len(verification.get("anomalies", []))
        }

    def classify_single_anomaly(self, date_str, exchange_str, crypto_str, missing_amount, origin_type):
        """
        Classifies an anomaly by inserting a transaction with the selected origin type.
        origin_type can be: 'Capital Inicial / Años Anteriores', 'Exchange Externo', 'P2P / Efectivo'.
        """
        import hashlib
        from models_v2 import TransactionModel
        import db_manager

        try:
            anomaly_date = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')
            fixed_date = anomaly_date - timedelta(seconds=1)
        except Exception:
            fixed_date = datetime.now()

        model = TransactionModel(
            fecha=fixed_date,
            exchange=origin_type,
            tipo_operacion="Compra",
            moneda=crypto_str,
            monto_compra_cripto=float(missing_amount),
            monto_venta_cripto=0.0,
            cotizacion_compra=0.0,
            cotizacion_venta=0.0,
            monto_ars=0.0,
            comentarios=f"Ingreso clasificado manualmente como: {origin_type} para subsanar venta del {date_str} en {exchange_str}"
        )
        dt_dict = model.to_dict()
        hash_source = f"{dt_dict['Fecha']}{dt_dict['Exchange']}{dt_dict['Tipo de Operación']}{dt_dict['Monto Compra (Cripto)']}{hashlib.md5(str(datetime.now().timestamp()).encode()).hexdigest()[:6]}"
        dt_dict['tx_hash'] = hashlib.md5(hash_source.encode('utf-8')).hexdigest()
        
        inserted, skipped = db_manager.insert_transactions([dt_dict])
        return {"success": True, "inserted": inserted, "message": f"Operación clasificada como '{origin_type}' guardada con éxito."}

