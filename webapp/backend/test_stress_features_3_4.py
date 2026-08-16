import pytest
import io
import os
import pandas as pd
import sqlite3

import processor_lib
import reconciliation
import db_manager

def test_status_false_positives():
    """Verify that completed transactions with phrases containing status-like keywords are not falsely cancelled."""
    row_tricky_error = {"Resultado": "Completado sin error", "Monto": 100}
    row_tricky_refund = {"Status": "Completed (refund: n/a)", "Monto": 100}
    row_tricky_rechaz = {"Estado": "Finalizado (sin rechazo)", "Monto": 100}
    row_tricky_disput = {"Outcome": "Success / Dispute Resolved", "Monto": 100}

    assert processor_lib.is_cancelled_transaction(row_tricky_error) is False, "Falsely cancelled row with 'sin error'"
    assert processor_lib.is_cancelled_transaction(row_tricky_refund) is False, "Falsely cancelled row with 'refund: n/a'"
    assert processor_lib.is_cancelled_transaction(row_tricky_rechaz) is False, "Falsely cancelled row with 'sin rechazo'"
    assert processor_lib.is_cancelled_transaction(row_tricky_disput) is False, "Falsely cancelled row with 'Dispute Resolved'"

def test_fiwind_deposit_ars_valuation():
    """Verify that Fiwind crypto deposits calculate ARS value based on exchange rate instead of 1:1."""
    csv_fiwind = """Date,Action,Source Currency,Source Amount,Destination Currency,Destination Amount,Rate
2025-04-02 12:00:00,DEPOSIT,USDT,500,USDT,500,0
"""
    txs, _ = processor_lib.process_fiwind(io.StringIO(csv_fiwind), "fiwind_dep.csv")
    assert len(txs) == 1
    dep_tx = txs[0]
    # 500 USDT deposit should be at least 500 * 1000 ARS/USD = 500,000 ARS
    assert dep_tx["Monto ARS"] >= 500000.0, f"Deposit 500 USDT severely undervalued at ARS {dep_tx['Monto ARS']}"

def test_fiwind_crypto_crypto_swap_valuation():
    """Verify that non-USD crypto-to-crypto swaps in Fiwind are not valued at $1 USD."""
    csv_fiwind = """Date,Action,Source Currency,Source Amount,Destination Currency,Destination Amount,Rate
2025-04-05 12:00:00,SWAP,BTC,1.0,ETH,15.0,0
"""
    txs, _ = processor_lib.process_fiwind(io.StringIO(csv_fiwind), "fiwind_swap.csv")
    assert len(txs) == 2
    sale_tx = [t for t in txs if t['Tipo de Operación'] == 'Venta'][0]
    assert sale_tx["Monto ARS"] >= 100000.0, f"1 BTC swap valued at ARS {sale_tx['Monto ARS']}"

def test_ripio_crypto_crypto_pair_valuation():
    """Verify that non-stable crypto-to-crypto trading pairs in Ripio are correctly valued in ARS."""
    csv_ripio = """codigo_operacion,fecha,moneda,monto
ORD_ETH_BTC_1,2025-05-01 10:00:00,BTC,-0.05
ORD_ETH_BTC_1,2025-05-01 10:00:00,ETH,1.0
"""
    txs, _ = processor_lib.process_ripio_trade(io.StringIO(csv_ripio), "ripio_eth_btc.csv")
    assert len(txs) == 1
    tx = txs[0]
    assert tx["Monto ARS"] >= 10000.0, f"0.05 BTC for 1 ETH valued at ARS {tx['Monto ARS']}"

def test_reconciliation_gap_period_suppression():
    """Verify that anomalies in uncertified gap periods are NOT suppressed by MAX(end_date)."""
    test_db = r"c:\Users\juanc\Desktop\Carpetas varias\Motor Programa Contable\.agents\teamwork_preview_challenger_m1_2\test_gap_pytest.db"
    if os.path.exists(test_db):
        os.remove(test_db)

    conn = sqlite3.connect(test_db)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tx_hash TEXT UNIQUE, fecha TEXT, exchange TEXT, tipo_operacion TEXT, moneda TEXT,
            monto_compra_cripto REAL DEFAULT 0, monto_venta_cripto REAL DEFAULT 0,
            cotizacion_compra REAL DEFAULT 0, cotizacion_venta REAL DEFAULT 0,
            monto_ars REAL DEFAULT 0, comentarios TEXT, is_certified INTEGER DEFAULT 0
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS certifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, start_date TEXT, end_date TEXT, cpa_name TEXT
        )
    """)
    c.execute("INSERT INTO certifications (title, start_date, end_date) VALUES ('Cert 2024', '2024-01-01 00:00:00', '2024-12-31 23:59:59')")
    c.execute("INSERT INTO certifications (title, start_date, end_date) VALUES ('Cert 2026', '2026-01-01 00:00:00', '2026-12-31 23:59:59')")
    c.execute("""
        INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_compra_cripto, monto_venta_cripto, monto_ars, is_certified)
        VALUES ('sell_2025_gap', '2025-06-15 12:00:00', 'Binance', 'Venta', 'BTC', 0, 1.0, 5000000, 0)
    """)
    conn.commit()
    conn.close()

    engine = reconciliation.ReconciliationEngine(db_path=test_db)
    audit = engine.run_full_audit()

    if os.path.exists(test_db):
        os.remove(test_db)

    assert audit["success"] is True
    anomalies = audit["anomalies"]
    assert len(anomalies) == 1, f"Expected 1 anomaly in uncertified gap year, got {len(anomalies)}"
    assert anomalies[0]["date"] == "2025-06-15 12:00:00"
