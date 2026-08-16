import unittest
import os
import sqlite3
import pandas as pd
import db_manager
import processor_lib
import fifo_engine
from reconciliation import ReconciliationEngine

class TestCryptoTaxProAuditAndStress(unittest.TestCase):
    def setUp(self):
        self.db_path = "test_audit_stress_temp.db"
        if os.path.exists(self.db_path):
            try: os.remove(self.db_path)
            except Exception: pass
            
        self.original_get_connection = db_manager.get_connection
        db_manager.get_connection = lambda: sqlite3.connect(self.db_path)
        db_manager.init_db()

    def tearDown(self):
        db_manager.get_connection = self.original_get_connection
        if os.path.exists(self.db_path):
            try: os.remove(self.db_path)
            except Exception: pass

    def test_certified_range_date_format_leakage_protection(self):
        """
        Verifies that certified date ranges block raw imports regardless of date string format
        (DD/MM/YYYY, YYYY-MM-DD, or ISO T-format).
        """
        # 1. Create a certification for full year 2025
        cert_id = db_manager.add_certification(
            title="Certificación 2025",
            start_date="2025-01-01 00:00:00",
            end_date="2025-12-31 23:59:59",
            cpa_name="Contador Público Test"
        )
        self.assertIsNotNone(cert_id)

        # 2. Attempt inserting transactions in 2025 with different date format strings
        test_txs = [
            {
                'Fecha': '15/05/2025 14:30:00', # DD/MM/YYYY Spanish format
                'Exchange': 'Binance Spot',
                'Tipo de Operación': 'Compra',
                'Moneda': 'USDT',
                'Monto Compra (Cripto)': 100.0,
                'Cotización Compra': 1200.0,
                'Monto ARS': 120000.0,
                'Comentarios': 'Importacion en formato DD/MM/YYYY'
            },
            {
                'Fecha': '2025-08-20 10:00:00', # Standard ISO YYYY-MM-DD
                'Exchange': 'Bitso Alpha',
                'Tipo de Operación': 'Venta',
                'Moneda': 'BTC',
                'Monto Venta (Cripto)': 0.5,
                'Cotización Venta': 65000000.0,
                'Monto ARS': 32500000.0,
                'Comentarios': 'Importacion ISO'
            },
            {
                'Fecha': '2025-11-01T18:45:12Z', # ISO T format with Z
                'Exchange': 'Fiwind',
                'Tipo de Operación': 'Ingreso Cripto',
                'Moneda': 'ETH',
                'Monto Compra (Cripto)': 2.0,
                'Cotización Compra': 3500000.0,
                'Monto ARS': 7000000.0,
                'Comentarios': 'Importacion T Z'
            }
        ]

        inserted, skipped = db_manager.insert_transactions(test_txs)
        self.assertEqual(inserted, 0, "No transactions should be inserted into a certified date period!")
        self.assertEqual(skipped, 3, "All 3 transactions inside the certified range must be skipped.")

        # 3. Attempt inserting a transaction outside the certified date range (2026)
        valid_2026_tx = {
            'Fecha': '10/01/2026 12:00:00',
            'Exchange': 'Fiwind',
            'Tipo de Operación': 'Compra',
            'Moneda': 'USDT',
            'Monto Compra (Cripto)': 500.0,
            'Cotización Compra': 1300.0,
            'Monto ARS': 650000.0,
            'Comentarios': 'Transacción válida 2026'
        }
        inserted_2026, skipped_2026 = db_manager.insert_transactions([valid_2026_tx])
        self.assertEqual(inserted_2026, 1, "Transactions outside certified periods must be accepted.")

    def test_same_timestamp_deposit_and_sale_fifo(self):
        """
        Verifies that an Ingreso/Compra occurring on the EXACT SAME second as a Venta
        is sorted first, preventing false FIFO cost deficits.
        """
        timestamp = '2025-06-01 12:00:00'
        
        # Insert Venta first in list
        venta_tx = {
            'Fecha': timestamp,
            'Exchange': 'Fiwind',
            'Tipo de Operación': 'Venta',
            'Moneda': 'USDT',
            'Monto Compra (Cripto)': 0,
            'Monto Venta (Cripto)': 1000.0,
            'Cotización Compra': 0,
            'Cotización Venta': 1200.0,
            'Monto ARS': 1200000.0,
            'Comentarios': 'Venta concurrente'
        }
        # Insert Ingreso second in list
        ingreso_tx = {
            'Fecha': timestamp,
            'Exchange': 'Fiwind',
            'Tipo de Operación': 'Ingreso Cripto',
            'Moneda': 'USDT',
            'Monto Compra (Cripto)': 1000.0,
            'Monto Venta (Cripto)': 0,
            'Cotización Compra': 1100.0,
            'Cotización Venta': 0,
            'Monto ARS': 1100000.0,
            'Comentarios': 'Ingreso concurrente'
        }

        db_manager.insert_transactions([venta_tx, ingreso_tx])

        # Recalculate FIFO costs
        result = fifo_engine.recalculate_fifo_costs_db()
        self.assertTrue(result['success'])

        # Verify that Venta cotizacion_compra was updated to 1100.0 (from the Deposit)
        conn = db_manager.get_connection()
        c = conn.cursor()
        c.execute("SELECT cotizacion_compra FROM transactions WHERE tipo_operacion = 'Venta'")
        cot_compra = c.fetchone()[0]
        conn.close()

        self.assertAlmostEqual(cot_compra, 1100.0, places=2, msg="FIFO engine should match same-second deposit cost basis!")

    def test_same_timestamp_reconciliation_audit(self):
        """
        Verifies that ReconciliationEngine does not flag phantom sales when
        Deposit and Sale occur at the exact same timestamp.
        """
        timestamp = '2025-07-04 15:30:00'
        
        txs = [
            {
                'Fecha': timestamp,
                'Exchange': 'Binance Spot',
                'Tipo de Operación': 'Venta',
                'Moneda': 'BTC',
                'Monto Compra (Cripto)': 0,
                'Monto Venta (Cripto)': 1.0,
                'Monto ARS': 60000000.0,
                'Comentarios': 'Venta BTC'
            },
            {
                'Fecha': timestamp,
                'Exchange': 'Binance Spot',
                'Tipo de Operación': 'Compra',
                'Moneda': 'BTC',
                'Monto Compra (Cripto)': 1.0,
                'Monto Venta (Cripto)': 0,
                'Monto ARS': 58000000.0,
                'Comentarios': 'Compra BTC'
            }
        ]

        db_manager.insert_transactions(txs)
        
        recon = ReconciliationEngine(db_path=self.db_path)
        audit_res = recon.run_full_audit()

        self.assertTrue(audit_res['success'])
        self.assertEqual(len(audit_res['anomalies']), 0, "No phantom sales should be detected when deposit and sale share timestamp!")
        self.assertAlmostEqual(audit_res['final_balances'].get('BTC', 0.0), 0.0)

    def test_fuzzy_column_parsing_varying_headers(self):
        """
        Tests processor_lib.find_column_fuzzy with various real-world Excel/CSV header naming styles.
        """
        df = pd.DataFrame(columns=[
            'Fecha & Hora (UTC)',
            'Tipo de Transaccion',
            'Moneda Principal',
            'Cantidad Comprada',
            'Precio ARS Final',
            'ID de Referencia'
        ])

        col_date = processor_lib.find_column_fuzzy(df, ['fecha', 'date', 'datetime', 'created_at'])
        col_type = processor_lib.find_column_fuzzy(df, ['tipo', 'type', 'action', 'operacion'])
        col_curr = processor_lib.find_column_fuzzy(df, ['moneda', 'currency', 'asset'])
        col_amt = processor_lib.find_column_fuzzy(df, ['monto', 'cantidad', 'amount'])
        col_ars = processor_lib.find_column_fuzzy(df, ['monto_ars', 'total_ars', 'precio_ars', 'monto ars'])

        self.assertEqual(col_date, 'Fecha & Hora (UTC)')
        self.assertEqual(col_type, 'Tipo de Transaccion')
        self.assertEqual(col_curr, 'Moneda Principal')
        self.assertEqual(col_amt, 'Cantidad Comprada')
        self.assertEqual(col_ars, 'Precio ARS Final')

    def test_certification_lifecycle_and_status_sync(self):
        """
        Tests creating a certification, verifying transactions in range get is_certified = 1,
        and deleting the certification, verifying they revert to is_certified = 0.
        """
        tx1 = {
            'Fecha': '2024-03-15 10:00:00',
            'Exchange': 'Fiwind',
            'Tipo de Operación': 'Compra',
            'Moneda': 'USDT',
            'Monto Compra (Cripto)': 1000.0,
            'Cotización Compra': 1000.0,
            'Monto ARS': 1000000.0,
            'Comentarios': 'Tx 2024'
        }
        db_manager.insert_transactions([tx1])

        # Verify initial status is uncertified
        conn = db_manager.get_connection()
        c = conn.cursor()
        c.execute("SELECT is_certified FROM transactions WHERE fecha LIKE '2024-03-15%'")
        status_before = c.fetchone()[0]
        conn.close()
        self.assertEqual(status_before, 0)

        # Add Certification for 2024
        cert_id = db_manager.add_certification(
            title="Certificación 2024",
            start_date="2024-01-01 00:00:00",
            end_date="2024-12-31 23:59:59",
            cpa_name="Contador 2024"
        )

        # Verify status updated to certified
        conn = db_manager.get_connection()
        c = conn.cursor()
        c.execute("SELECT is_certified, certification_id FROM transactions WHERE fecha LIKE '2024-03-15%'")
        row_certified = c.fetchone()
        conn.close()
        self.assertEqual(row_certified[0], 1)
        self.assertEqual(row_certified[1], cert_id)

        # Delete Certification and verify status reverts to 0
        db_manager.delete_certification(cert_id)

        conn = db_manager.get_connection()
        c = conn.cursor()
        c.execute("SELECT is_certified, certification_id FROM transactions WHERE fecha LIKE '2024-03-15%'")
        row_reverted = c.fetchone()
        conn.close()
        self.assertEqual(row_reverted[0], 0)
        self.assertIsNone(row_reverted[1])

if __name__ == '__main__':
    unittest.main()
