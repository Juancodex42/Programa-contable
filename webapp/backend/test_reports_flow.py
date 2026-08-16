import os
import sys
import sqlite3
import pandas as pd

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db_manager
import processor_lib

def run_tests():
    print("=== TEST 1: DB INITIALIZATION & MIGRATION ===")
    db_manager.init_db()
    
    conn = db_manager.get_connection()
    c = conn.cursor()
    
    # Check empty rows
    c.execute("SELECT COUNT(*) FROM transactions WHERE exchange IS NULL OR TRIM(exchange) = '' OR fecha IS NULL OR TRIM(fecha) = '' OR moneda IS NULL OR TRIM(moneda) = ''")
    empty_count = c.fetchone()[0]
    print(f"Empty/Corrupt rows in DB: {empty_count} (Expected: 0)")
    assert empty_count == 0, f"Expected 0 empty rows, found {empty_count}"
    
    # Check legacy 'Bitso' or 'Ripio'
    c.execute("SELECT COUNT(*) FROM transactions WHERE exchange IN ('Bitso', 'Ripio')")
    legacy_count = c.fetchone()[0]
    print(f"Legacy 'Bitso'/'Ripio' rows in DB: {legacy_count} (Expected: 0)")
    assert legacy_count == 0, f"Expected 0 legacy rows, found {legacy_count}"
    
    # Check distinct exchanges
    c.execute("SELECT exchange, COUNT(*) FROM transactions GROUP BY exchange")
    exchange_distribution = c.fetchall()
    print("Exchange distribution in DB after migration:")
    for ex, cnt in exchange_distribution:
        print(f" - '{ex}': {cnt} transactions")
        
    print("\n=== TEST 2: INSERT VALIDATION (PREVENT EMPTY ROWS) ===")
    import time
    unique_time = f"2029-07-30 10:00:{int(time.time()) % 60:02d}"
    invalid_txs = [
        {"Fecha": "", "Exchange": "Binance Spot", "Moneda": "BTC"},
        {"Fecha": unique_time, "Exchange": "", "Moneda": "USDT"},
        {"Fecha": unique_time, "Exchange": "Bitso Alpha", "Moneda": ""},
        {"Fecha": unique_time, "Exchange": "OKX", "Moneda": "BTC", "Tipo de Operación": "Compra", "Monto ARS": 100000, "Comentarios": f"TestUnique_{time.time()}"}
    ]
    inserted, skipped = db_manager.insert_transactions(invalid_txs, trigger_fifo_recalc=False)
    print(f"Insert test: {inserted} inserted, {skipped} skipped (Expected: 1 inserted, 3 skipped)")
    assert inserted == 1, f"Expected 1 valid insert, got {inserted}"
    assert skipped == 3, f"Expected 3 skipped invalid rows, got {skipped}"
    
    print("\n=== TEST 3: DATE RANGE & EXCHANGE ALIAS FILTERING ===")
    selected_exchanges = ['Binance Spot', 'Binance P2P', 'Bitso Alpha', 'Fiwind', 'Ripio Trade', 'Ripio Classic', 'OKX', 'Bybit', 'Bitget']
    
    # Query with selected exchanges
    txs_all = db_manager.get_transactions(selected_exchanges, date_start='', date_end='')
    print(f"Total transactions for selected exchanges (no date bounds): {len(txs_all)}")
    assert len(txs_all) > 0, "Expected non-zero transactions for selected exchanges"
    
    # Query with date_start only
    txs_start_only = db_manager.get_transactions(selected_exchanges, date_start='2025-01-01')
    print(f"Transactions starting from 2025-01-01: {len(txs_start_only)}")
    
    # Query with date_end only
    txs_end_only = db_manager.get_transactions(selected_exchanges, date_end='2025-12-31')
    print(f"Transactions up to 2025-12-31: {len(txs_end_only)}")
    
    # Query with full date range
    txs_range = db_manager.get_transactions(selected_exchanges, date_start='2025-01-01', date_end='2025-12-31')
    print(f"Transactions for full 2025 year: {len(txs_range)}")

    print("\n=== TEST 4: MASTER EXCEL GENERATION ===")
    excel_io = processor_lib.generate_excel_bytes(txs_range if txs_range else txs_all)
    excel_size = len(excel_io.getvalue())
    print(f"Generated Excel size: {excel_size} bytes")
    assert excel_size > 0, "Excel output should be greater than 0 bytes"
    
    print("\nALL VERIFICATION TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
