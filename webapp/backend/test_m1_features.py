import pytest
import sqlite3
import pandas as pd
import os
import io
import tempfile
from datetime import datetime

import db_manager
import models_v2
import processor_lib
import fifo_engine
import reconciliation

@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    """Isolated database fixture for M1 unit tests."""
    db_file = tmp_path / "test_m1_transactions.db"
    monkeypatch.setattr(db_manager, "DB_PATH", str(db_file))
    db_manager.init_db()
    yield str(db_file)

# --- FEATURE 1 TESTS ---

def test_certified_range_insertion_guard():
    """Verify that insert_transactions blocks insertion within active certification date ranges."""
    conn = db_manager.get_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO certifications (title, start_date, end_date, cpa_name)
        VALUES ('Cert 2025-H1', '2025-01-01 00:00:00', '2025-06-30 23:59:59', 'CPA Test')
    """)
    conn.commit()
    conn.close()

    txs = [
        {
            "fecha": "2025-03-15 10:00:00",
            "exchange": "Binance Spot",
            "tipo_operacion": "Compra",
            "moneda": "BTC",
            "monto_compra_cripto": 1.0,
            "cotizacion_compra": 100000.0,
            "monto_ars": 100000.0,
            "comentarios": "Certified date insertion attempt"
        },
        {
            "fecha": "2025-08-15 10:00:00",
            "exchange": "Binance Spot",
            "tipo_operacion": "Compra",
            "moneda": "BTC",
            "monto_compra_cripto": 1.0,
            "cotizacion_compra": 110000.0,
            "monto_ars": 110000.0,
            "comentarios": "Uncertified date insertion"
        }
    ]

    inserted, skipped = db_manager.insert_transactions(txs)
    assert inserted == 1
    assert skipped == 1

    conn = db_manager.get_connection()
    df = pd.read_sql_query("SELECT * FROM transactions", conn)
    conn.close()
    assert len(df) == 1
    assert df.iloc[0]['fecha'] == "2025-08-15 10:00:00"

def test_certified_row_deletion_protection():
    """Verify that clear_db and delete_transactions_by_exchange do not delete certified rows."""
    conn = db_manager.get_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_compra_cripto, cotizacion_compra, monto_ars, is_certified)
        VALUES ('hash_cert_1', '2025-01-10 10:00:00', 'Binance Spot', 'Compra', 'BTC', 1.0, 100000.0, 100000.0, 1)
    """)
    c.execute("""
        INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_compra_cripto, cotizacion_compra, monto_ars, is_certified)
        VALUES ('hash_uncert_1', '2025-07-10 10:00:00', 'Binance Spot', 'Compra', 'BTC', 1.0, 110000.0, 110000.0, 0)
    """)
    conn.commit()
    conn.close()

    deleted = db_manager.delete_transactions_by_exchange("Binance Spot")
    assert deleted == 1

    conn = db_manager.get_connection()
    df = pd.read_sql_query("SELECT * FROM transactions", conn)
    conn.close()
    assert len(df) == 1
    assert df.iloc[0]['tx_hash'] == 'hash_cert_1'

    db_manager.clear_db()
    conn = db_manager.get_connection()
    df = pd.read_sql_query("SELECT * FROM transactions", conn)
    conn.close()
    assert len(df) == 1

def test_fifo_immutability_for_certified_rows():
    """Verify that recalculate_fifo_costs_db does not update cotizacion_compra of certified rows."""
    conn = db_manager.get_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_compra_cripto, cotizacion_compra, monto_ars, is_certified)
        VALUES ('buy_1', '2025-01-01 10:00:00', 'Binance', 'Compra', 'BTC', 1.0, 5000000.0, 5000000.0, 0)
    """)
    c.execute("""
        INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_venta_cripto, cotizacion_compra, monto_ars, is_certified)
        VALUES ('sell_cert', '2025-02-01 10:00:00', 'Binance', 'Venta', 'BTC', 0.5, 999999.0, 3000000.0, 1)
    """)
    c.execute("""
        INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_venta_cripto, cotizacion_compra, monto_ars, is_certified)
        VALUES ('sell_uncert', '2025-02-02 10:00:00', 'Binance', 'Venta', 'BTC', 0.5, 0.0, 3000000.0, 0)
    """)
    conn.commit()
    conn.close()

    fifo_engine.recalculate_fifo_costs_db()

    conn = db_manager.get_connection()
    df = pd.read_sql_query("SELECT tx_hash, cotizacion_compra FROM transactions", conn)
    conn.close()
    row_cert = df[df['tx_hash'] == 'sell_cert'].iloc[0]
    row_uncert = df[df['tx_hash'] == 'sell_uncert'].iloc[0]

    assert row_cert['cotizacion_compra'] == 999999.0  # Unchanged
    assert row_uncert['cotizacion_compra'] == 5000000.0  # Calculated via FIFO

# --- FEATURE 2 TESTS ---

def test_canonical_hash_utc_normalization():
    """Verify that ISO UTC timestamps and naive timestamps normalize to identical hashes."""
    h1 = models_v2.compute_canonical_tx_hash(
        "2025-05-10T14:30:00Z", "Binance", "Compra", "BTC", 1.0, 0.0, 50000.0, "Ref123"
    )
    h2 = models_v2.compute_canonical_tx_hash(
        "2025-05-10 14:30:00", "Binance Spot", "COMPRA", "btc", 1.0, 0.0, 50000.0, "Ref123"
    )
    assert h1 == h2

def test_canonical_hash_multi_pass_order_id():
    """Verify that labeled order IDs (e.g. 'ID: b14a-99f8') produce identical hashes to short/alphanumeric IDs."""
    h1 = models_v2.compute_canonical_tx_hash(
        "2025-05-10 14:30:00", "Binance", "Compra", "BTC", 1.0, 0.0, 50000.0, "Binance Spot Trade: b14a-99f8"
    )
    h2 = models_v2.compute_canonical_tx_hash(
        "2025-05-10 14:30:00", "Binance", "Compra", "BTC", 1.0, 0.0, 50000.0, "ID: b14a-99f8"
    )
    assert h1 == h2

def test_get_canonical_exchange_root_expanded():
    """Verify exchange root resolution for newly supported exchange aliases."""
    assert models_v2.get_canonical_exchange_root("KuCoin Spot") == "KUCOIN"
    assert models_v2.get_canonical_exchange_root("Coinbase Pro") == "COINBASE"
    assert models_v2.get_canonical_exchange_root("Kraken") == "KRAKEN"
    assert models_v2.get_canonical_exchange_root("BingX Futures") == "BINGX"
    assert models_v2.get_canonical_exchange_root("Gate.io") == "GATE"
    assert models_v2.get_canonical_exchange_root("Belo App") == "BELO"
    assert models_v2.get_canonical_exchange_root("SatoshiTango") == "SATOSHITANGO"
    assert models_v2.get_canonical_exchange_root("Varios Manuales") == "MANUAL"

# --- FEATURE 3 TESTS ---

def test_is_cancelled_transaction_expanded_status():
    """Verify that is_cancelled_transaction catches outcome, resultado, and condition columns with negative status."""
    row_cancelled = {"Resultado": "Rechazado por el sistema", "Monto": 100}
    row_valid = {"Resultado": "Completado", "Monto": 100}
    row_condition = {"Condition": "Order Cancelled", "Monto": 100}
    
    assert processor_lib.is_cancelled_transaction(row_cancelled) is True
    assert processor_lib.is_cancelled_transaction(row_valid) is False
    assert processor_lib.is_cancelled_transaction(row_condition) is True

def test_find_column_fuzzy():
    """Verify fuzzy column matching capabilities across candidate lists."""
    df = pd.DataFrame(columns=["Fecha/Hora", "Tipo de Operacion", "Monto Destino (USDT)"])
    col_fecha = processor_lib.find_column_fuzzy(df, ["fecha", "date", "created_at"])
    col_tipo = processor_lib.find_column_fuzzy(df, ["tipo", "type"])
    col_monto = processor_lib.find_column_fuzzy(df, ["monto", "monto_destino", "amount"])

    assert col_fecha == "Fecha/Hora"
    assert col_tipo == "Tipo de Operacion"
    assert col_monto == "Monto Destino (USDT)"

def test_process_fiwind_english_and_swap():
    """Verify that process_fiwind correctly parses English SWAP, DEPOSIT, and WITHDRAWAL rows."""
    csv_data = """Date,Action,Source Currency,Source Amount,Destination Currency,Destination Amount,Rate
2025-04-01 12:00:00,SWAP,ARS,1000000,USDT,1000,1000.0
2025-04-02 12:00:00,DEPOSIT,USDT,500,USDT,500,1000.0
2025-04-03 12:00:00,WITHDRAWAL,USDT,200,USDT,200,1000.0
"""
    file_obj = io.StringIO(csv_data)
    txs, raw = processor_lib.process_fiwind(file_obj, "fiwind_english.csv")
    
    assert len(txs) == 3
    assert txs[0]['Tipo de Operación'] == 'Compra'
    assert txs[0]['Moneda'] == 'USDT'
    assert txs[1]['Tipo de Operación'] == 'Ingreso Cripto'
    assert txs[2]['Tipo de Operación'] == 'Retiro Cripto'

def test_process_ripio_trade_non_ars():
    """Verify that process_ripio_trade handles non-ARS crypto/fiat and crypto/crypto pairs."""
    csv_data = """codigo_operacion,fecha,moneda,monto
ORD123,2025-05-01 10:00:00,USD,-1000
ORD123,2025-05-01 10:00:00,USDT,1000
"""
    file_obj = io.StringIO(csv_data)
    txs, raw = processor_lib.process_ripio_trade(file_obj, "ripio_non_ars.csv")
    
    assert len(txs) == 1
    assert txs[0]['Tipo de Operación'] == 'Compra'
    assert txs[0]['Moneda'] == 'USDT'
    assert txs[0]['Monto ARS'] > 0

# --- FEATURE 4 TESTS ---

def test_reconciliation_engine_default_db_path():
    """Verify ReconciliationEngine uses db_manager.DB_PATH by default."""
    engine = reconciliation.ReconciliationEngine()
    assert engine.db_path == db_manager.DB_PATH

def test_reconciliation_engine_certified_period_suppression():
    """Verify that phantom sales in certified periods are suppressed in run_full_audit."""
    conn = db_manager.get_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO certifications (title, start_date, end_date, cpa_name)
        VALUES ('Cert Q1', '2025-01-01 00:00:00', '2025-03-31 23:59:59', 'CPA')
    """)
    # Unbacked sell within certified period
    c.execute("""
        INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_compra_cripto, monto_venta_cripto, monto_ars, is_certified)
        VALUES ('phantom_cert', '2025-02-15 10:00:00', 'Binance', 'Venta', 'BTC', 0.0, 1.0, 100000.0, 1)
    """)
    # Unbacked sell after certified period
    c.execute("""
        INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_compra_cripto, monto_venta_cripto, monto_ars, is_certified)
        VALUES ('phantom_uncert', '2025-07-15 10:00:00', 'Binance', 'Venta', 'BTC', 0.0, 1.0, 100000.0, 0)
    """)
    conn.commit()
    conn.close()

    engine = reconciliation.ReconciliationEngine()
    audit = engine.run_full_audit()

    assert audit["success"] is True
    anomalies = audit["anomalies"]
    assert len(anomalies) == 1
    assert anomalies[0]["date"] == "2025-07-15 10:00:00"
