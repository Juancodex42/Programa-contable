import unittest
import os
import io
import sqlite3
import pandas as pd
import db_manager
import processor_lib
import api_manager
import fifo_engine
from models_v2 import compute_canonical_tx_hash

class TestFileUploadDeduplicationAndGaps(unittest.TestCase):
    def setUp(self):
        # Create a temporary test DB connection
        self.db_path = "test_temp_transactions.db"
        if os.path.exists(self.db_path):
            os.remove(self.db_path)
            
        # Patch db_manager get_connection to use our test DB
        self.original_get_connection = db_manager.get_connection
        db_manager.get_connection = lambda: sqlite3.connect(self.db_path)
        db_manager.init_db()

    def tearDown(self):
        db_manager.get_connection = self.original_get_connection
        if os.path.exists(self.db_path):
            try: os.remove(self.db_path)
            except Exception: pass

    def test_deduplication_between_api_and_file_upload(self):
        """Validates that an API trade and a CSV upload for the exact same order produce identical hashes and deduplicate."""
        # 1. Simulate API Trade
        api_trade = {
            'Fecha': '2025-05-10 14:30:00',
            'Exchange': 'Binance Spot',
            'Tipo de Operación': 'Venta',
            'Moneda': 'BTC',
            'Monto Compra (Cripto)': 0,
            'Monto Venta (Cripto)': 1.0,
            'Cotización Compra': 0,
            'Cotización Venta': 60000000.0,
            'Monto ARS': 60000000.0,
            'Comentarios': 'Binance Spot: 987654321'
        }
        
        inserted_api, skipped_api = db_manager.insert_transactions([api_trade])
        self.assertEqual(inserted_api, 1)
        
        # 2. Simulate File Upload for the exact same trade
        file_trade = {
            'Fecha': '2025-05-10 14:30:00',
            'Exchange': 'Binance P2P',
            'Tipo de Operación': 'Venta',
            'Moneda': 'BTC',
            'Monto Compra (Cripto)': 0,
            'Monto Venta (Cripto)': 1.0,
            'Cotización Compra': 0,
            'Cotización Venta': 60000000.0,
            'Monto ARS': 60000000.0,
            'Comentarios': 'ID: 987654321'
        }
        
        inserted_file, skipped_file = db_manager.insert_transactions([file_trade])
        self.assertEqual(inserted_file, 0, "Duplicate transaction from file upload should be skipped!")
        self.assertEqual(skipped_file, 1, "Duplicate transaction from file upload should trigger skipped count!")

    def test_gaps_decrease_when_uploading_deposits(self):
        """Validates that uploading a deposit or initial purchase decreases gap warnings."""
        # 1. Insert a Venta with no prior purchases (creates 1 gap)
        venta_tx = {
            'Fecha': '2025-06-01 10:00:00',
            'Exchange': 'Fiwind',
            'Tipo de Operación': 'Venta',
            'Moneda': 'USDT',
            'Monto Compra (Cripto)': 0,
            'Monto Venta (Cripto)': 1000.0,
            'Cotización Compra': 0,
            'Cotización Venta': 1200.0,
            'Monto ARS': 1200000.0,
            'Comentarios': 'Venta inicial'
        }
        db_manager.insert_transactions([venta_tx])
        
        initial_gaps = db_manager.check_history_gaps()
        self.assertEqual(len(initial_gaps), 1, "Should detect 1 gap due to missing buy history")
        self.assertEqual(initial_gaps[0]['deficit'], 1000.0)
        
        # 2. Now upload a Fiwind excel file with an Ingreso/Deposito of 1000 USDT prior to the sale
        ingreso_tx = {
            'Fecha': '2025-05-31 09:00:00',
            'Exchange': 'Fiwind',
            'Tipo de Operación': 'Ingreso Cripto',
            'Moneda': 'USDT',
            'Monto Compra (Cripto)': 1000.0,
            'Monto Venta (Cripto)': 0,
            'Cotización Compra': 1180.0,
            'Cotización Venta': 0,
            'Monto ARS': 1180000.0,
            'Comentarios': 'Depósito acreditado'
        }
        db_manager.insert_transactions([ingreso_tx])
        
        # 3. Check gaps again after deposit upload
        final_gaps = db_manager.check_history_gaps()
        self.assertEqual(len(final_gaps), 0, "Gaps should drop to 0 after uploading the missing deposit!")

if __name__ == '__main__':
    unittest.main()
