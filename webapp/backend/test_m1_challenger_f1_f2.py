import pytest
import sqlite3
import os
import pandas as pd

from models_v2 import compute_canonical_tx_hash, get_canonical_exchange_root
from db_manager import (
    insert_transactions,
    clear_db,
    delete_transactions_by_exchange,
    deduplicate_existing_database,
    add_certification,
    sync_certified_transactions_status
)
from fifo_engine import recalculate_fifo_costs_db

# --- FEATURE 1 STRESS TESTS: CERTIFIED RANGE & OVERWRITE PROTECTION ---

def test_certified_range_insertion_blocking_boundary(monkeypatch, tmp_path):
    """Stress test: certified range insertion blocking at exact boundaries and edge timestamps."""
    test_db = str(tmp_path / "test_cert_insert.db")
    monkeypatch.setattr("db_manager.DB_PATH", test_db)
    monkeypatch.setattr("fifo_engine.recalculate_fifo_costs_db", lambda: None)
    
    from db_manager import init_db, get_connection
    init_db()
    
    conn = get_connection()
    c = conn.cursor()
    # Insert certification for Q1 2025: 2025-01-01 00:00:00 to 2025-03-31 23:59:59
    c.execute("""
        INSERT INTO certifications (title, start_date, end_date)
        VALUES ('Cert Q1 2025', '2025-01-01 00:00:00', '2025-03-31 23:59:59')
    """)
    conn.commit()
    conn.close()
    
    txs = [
        # Outside (before) -> Should insert
        {"Fecha": "2024-12-31 23:59:59", "Exchange": "Binance Spot", "Tipo de Operación": "Compra", "Moneda": "BTC", "Monto Compra (Cripto)": 1.0, "Monto ARS": 100.0},
        # Exact start boundary -> Should block
        {"Fecha": "2025-01-01 00:00:00", "Exchange": "Binance Spot", "Tipo de Operación": "Compra", "Moneda": "BTC", "Monto Compra (Cripto)": 1.0, "Monto ARS": 100.0},
        # Middle of certified range -> Should block
        {"Fecha": "2025-02-15 12:00:00", "Exchange": "Bitso Alpha", "Tipo de Operación": "Venta", "Moneda": "BTC", "Monto Venta (Cripto)": 0.5, "Monto ARS": 60.0},
        # Exact end boundary -> Should block
        {"Fecha": "2025-03-31 23:59:59", "Exchange": "Fiwind", "Tipo de Operación": "Compra", "Moneda": "ETH", "Monto Compra (Cripto)": 2.0, "Monto ARS": 200.0},
        # Outside (after) -> Should insert
        {"Fecha": "2025-04-01 00:00:00", "Exchange": "Ripio Trade", "Tipo de Operación": "Compra", "Moneda": "USDT", "Monto Compra (Cripto)": 100.0, "Monto ARS": 100.0},
    ]
    
    inserted, skipped = insert_transactions(txs, trigger_fifo_recalc=False)
    assert inserted == 2, f"Expected 2 inserted, got {inserted}"
    assert skipped == 3, f"Expected 3 skipped, got {skipped}"


def test_certified_range_insertion_with_iso_t_string(monkeypatch, tmp_path):
    """Stress test: certified range storing start_date/end_date with 'T' separator."""
    test_db = str(tmp_path / "test_cert_iso_t.db")
    monkeypatch.setattr("db_manager.DB_PATH", test_db)
    monkeypatch.setattr("fifo_engine.recalculate_fifo_costs_db", lambda: None)
    
    from db_manager import init_db, get_connection
    init_db()
    
    conn = get_connection()
    c = conn.cursor()
    # Insert certification stored with ISO T format
    c.execute("""
        INSERT INTO certifications (title, start_date, end_date)
        VALUES ('Cert ISO T', '2025-01-01T00:00:00', '2025-03-31T23:59:59')
    """)
    conn.commit()
    conn.close()
    
    txs = [
        {"Fecha": "2025-01-01 12:00:00", "Exchange": "Binance Spot", "Tipo de Operación": "Compra", "Moneda": "BTC", "Monto Compra (Cripto)": 1.0, "Monto ARS": 100.0},
        {"Fecha": "2025-02-10 08:30:00", "Exchange": "Bitso Alpha", "Tipo de Operación": "Venta", "Moneda": "BTC", "Monto Venta (Cripto)": 0.5, "Monto ARS": 60.0},
    ]
    
    inserted, skipped = insert_transactions(txs, trigger_fifo_recalc=False)
    assert skipped == 2, f"Expected 2 skipped for ISO 'T' certification range, got skipped={skipped}, inserted={inserted}"


def test_certified_range_insertion_short_timestamp(monkeypatch, tmp_path):
    """Stress test: certified range storing end_date without seconds ('2025-03-31 23:59')."""
    test_db = str(tmp_path / "test_cert_short_ts.db")
    monkeypatch.setattr("db_manager.DB_PATH", test_db)
    monkeypatch.setattr("fifo_engine.recalculate_fifo_costs_db", lambda: None)
    
    from db_manager import init_db, get_connection
    init_db()
    
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO certifications (title, start_date, end_date)
        VALUES ('Cert Short TS', '2025-01-01 00:00', '2025-03-31 23:59')
    """)
    conn.commit()
    conn.close()
    
    txs = [
        # Transaction at 2025-03-31 23:59:30 must be blocked by certified range ending 23:59
        {"Fecha": "2025-03-31 23:59:30", "Exchange": "Binance Spot", "Tipo de Operación": "Compra", "Moneda": "BTC", "Monto Compra (Cripto)": 1.0, "Monto ARS": 100.0},
    ]
    
    inserted, skipped = insert_transactions(txs, trigger_fifo_recalc=False)
    assert skipped == 1, f"Expected 1 skipped for short timestamp end_date, got skipped={skipped}, inserted={inserted}"


def test_row_deletion_protection_clear_db_and_exchange(monkeypatch, tmp_path):
    """Stress test: clear_db and delete_transactions_by_exchange must preserve is_certified=1 rows."""
    test_db = str(tmp_path / "test_deletion_protection.db")
    monkeypatch.setattr("db_manager.DB_PATH", test_db)
    monkeypatch.setattr("fifo_engine.recalculate_fifo_costs_db", lambda: None)
    
    from db_manager import init_db, get_connection
    init_db()
    
    conn = get_connection()
    c = conn.cursor()
    
    # Insert certified and uncertified rows directly
    c.execute("""
        INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_compra_cripto, monto_ars, is_certified)
        VALUES ('hash1', '2025-01-10 10:00:00', 'Binance Spot', 'Compra', 'BTC', 1.0, 100.0, 1)
    """)
    c.execute("""
        INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_compra_cripto, monto_ars, is_certified)
        VALUES ('hash2', '2025-01-11 10:00:00', 'Binance Spot', 'Compra', 'BTC', 1.0, 100.0, 0)
    """)
    c.execute("""
        INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_compra_cripto, monto_ars, is_certified)
        VALUES ('hash3', '2025-01-12 10:00:00', 'Bitso Alpha', 'Compra', 'ETH', 2.0, 200.0, 1)
    """)
    c.execute("""
        INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_compra_cripto, monto_ars, is_certified)
        VALUES ('hash4', '2025-01-13 10:00:00', 'Bitso Alpha', 'Compra', 'ETH', 2.0, 200.0, 0)
    """)
    conn.commit()
    conn.close()
    
    # Test delete_transactions_by_exchange on Binance Spot
    deleted = delete_transactions_by_exchange("Binance Spot")
    assert deleted == 1, f"Expected 1 uncertified Binance Spot row deleted, got {deleted}"
    
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT tx_hash FROM transactions WHERE exchange='Binance Spot'")
    binance_rows = [r[0] for r in c.fetchall()]
    assert binance_rows == ['hash1'], f"Certified Binance row 'hash1' must be preserved, found: {binance_rows}"
    conn.close()
    
    # Test clear_db
    clear_db()
    
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT tx_hash FROM transactions ORDER BY tx_hash ASC")
    remaining_rows = [r[0] for r in c.fetchall()]
    conn.close()
    
    assert remaining_rows == ['hash1', 'hash3'], f"Only certified rows hash1 and hash3 should remain, found: {remaining_rows}"


def test_deduplicate_existing_database_preserves_certified(monkeypatch, tmp_path):
    """Stress test: deduplicate_existing_database keeps is_certified=1 when duplicate hashes exist."""
    test_db = str(tmp_path / "test_dedup.db")
    monkeypatch.setattr("db_manager.DB_PATH", test_db)
    
    from db_manager import init_db, get_connection
    init_db()
    
    conn = get_connection()
    c = conn.cursor()
    
    # Create two transactions that resolve to the SAME new canonical tx_hash
    # Row A: uncertified, legacy hash 'legacy_hash_a'
    c.execute("""
        INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_compra_cripto, monto_ars, is_certified)
        VALUES ('legacy_hash_a', '2025-05-10 14:30:00', 'Binance Spot', 'Compra', 'BTC', 1.0, 100.0, 0)
    """)
    # Row B: certified, legacy hash 'legacy_hash_b'
    c.execute("""
        INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_compra_cripto, monto_ars, is_certified)
        VALUES ('legacy_hash_b', '2025-05-10 14:30:00', 'Binance Spot', 'Compra', 'BTC', 1.0, 100.0, 1)
    """)
    conn.commit()
    
    removed = deduplicate_existing_database(conn)
    assert removed == 1, f"Expected 1 duplicate removed, got {removed}"
    
    c.execute("SELECT tx_hash, is_certified FROM transactions")
    remaining = c.fetchall()
    conn.close()
    
    assert len(remaining) == 1
    assert remaining[0][0] == 'legacy_hash_b', f"Certified row legacy_hash_b must be preserved, got {remaining[0]}"
    assert remaining[0][1] == 1


def test_fifo_immutability_preserves_certified_cotizacion_compra(monkeypatch, tmp_path):
    """Stress test: recalculate_fifo_costs_db must NOT overwrite certified cotizacion_compra."""
    test_db = str(tmp_path / "test_fifo_immutability.db")
    monkeypatch.setattr("db_manager.DB_PATH", test_db)
    
    from db_manager import init_db, get_connection
    init_db()
    
    conn = get_connection()
    c = conn.cursor()
    
    # 1. Buy row: 1 BTC for 1,000,000 ARS on 2025-01-01
    c.execute("""
        INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_compra_cripto, monto_ars, is_certified)
        VALUES ('buy1', '2025-01-01 10:00:00', 'Binance Spot', 'Compra', 'BTC', 1.0, 1000000.0, 1)
    """)
    # 2. Certified Venta row: 0.5 BTC on 2025-02-01 with CPA audit unit cost = 888888.88 and is_certified = 1
    c.execute("""
        INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_venta_cripto, cotizacion_compra, cotizacion_venta, monto_ars, is_certified)
        VALUES ('cert_sell1', '2025-02-01 10:00:00', 'Binance Spot', 'Venta', 'BTC', 0.5, 888888.88, 2000000.0, 1000000.0, 1)
    """)
    # 3. Uncertified Venta row: 0.5 BTC on 2025-03-01 with initial cotizacion_compra = 0.0 and is_certified = 0
    c.execute("""
        INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_venta_cripto, cotizacion_compra, cotizacion_venta, monto_ars, is_certified)
        VALUES ('uncert_sell2', '2025-03-01 10:00:00', 'Binance Spot', 'Venta', 'BTC', 0.5, 0.0, 2000000.0, 1000000.0, 0)
    """)
    conn.commit()
    conn.close()
    
    res = recalculate_fifo_costs_db()
    assert res["success"] is True
    
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT tx_hash, cotizacion_compra FROM transactions ORDER BY fecha ASC")
    rows = dict(c.fetchall())
    conn.close()
    
    # Certified Venta must remain untouched
    assert rows['cert_sell1'] == 888888.88, f"Certified Venta cotizacion_compra changed! Got {rows['cert_sell1']}"
    # Uncertified Venta must be recalculated from Buy lot (1,000,000 / 1.0 = 1,000,000.0)
    assert rows['uncert_sell2'] == 1000000.0, f"Uncertified Venta cost expected 1000000.0, got {rows['uncert_sell2']}"


# --- FEATURE 2 STRESS TESTS: TIMEZONE & CANONICAL HASH NORMALIZATION ---

def test_timezone_hash_stability():
    """Stress test: canonical hashes for naive UTC, ISO Z, and timezone offset inputs."""
    # Scenario A: Naive UTC string vs ISO Z string
    h1 = compute_canonical_tx_hash("2025-05-10 14:30:00", "Binance Spot", "Compra", "BTC", 1.0, 0.0, 100000.0, "order123")
    h2 = compute_canonical_tx_hash("2025-05-10T14:30:00Z", "Binance Spot", "Compra", "BTC", 1.0, 0.0, 100000.0, "order123")
    assert h1 == h2, f"Hash mismatch between naive UTC ({h1}) and ISO Z ({h2})"
    
    # Scenario B: Explicit timezone offset equivalent to UTC 14:30:00 (ART is UTC-3, so 11:30:00-03:00 == 14:30:00 UTC)
    h3 = compute_canonical_tx_hash("2025-05-10T11:30:00-03:00", "Binance Spot", "Compra", "BTC", 1.0, 0.0, 100000.0, "order123")
    assert h1 == h3, f"Hash mismatch between UTC ({h1}) and ART UTC-3 offset ({h3})"

    # Scenario C: Sub-second precision truncation
    h4 = compute_canonical_tx_hash("2025-05-10T14:30:00.123456Z", "Binance Spot", "Compra", "BTC", 1.0, 0.0, 100000.0, "order123")
    assert h1 == h4, f"Hash mismatch between exact second ({h1}) and fractional seconds ({h4})"


def test_order_id_regex_extraction():
    """Stress test: order ID extraction regex for labeled, tokenized, and noise strings."""
    base_args = ("2025-05-10 14:30:00", "Binance Spot", "Compra", "BTC", 1.0, 0.0, 100000.0)
    
    # Labeled variations
    h_label1 = compute_canonical_tx_hash(*base_args, unique_ref="ID: 987654321")
    h_label2 = compute_canonical_tx_hash(*base_args, unique_ref="Order #987654321")
    h_label3 = compute_canonical_tx_hash(*base_args, unique_ref="Ref: 987654321")
    h_label4 = compute_canonical_tx_hash(*base_args, unique_ref="txid: 987654321")
    
    assert h_label1 == h_label2 == h_label3 == h_label4, "Labeled order IDs did not normalize to identical order token"
    
    # Tokenized alphanumeric IDs
    h_token1 = compute_canonical_tx_hash(*base_args, unique_ref="Orden de compra b14a-99f8 realizada")
    h_token2 = compute_canonical_tx_hash(*base_args, unique_ref="b14a-99f8")
    assert h_token1 == h_token2, f"Alphanumeric token extraction failed! {h_token1} != {h_token2}"
    
    # Noise keyword suppression test
    h_noise = compute_canonical_tx_hash(*base_args, unique_ref="Binance Spot Order Compra")
    h_empty = compute_canonical_tx_hash(*base_args, unique_ref="")
    assert h_noise == h_empty, "Noise keywords were not suppressed in order ID extraction"


def test_canonical_exchange_root_resolution():
    """Stress test: exchange root resolution for standard, variant, and uppercase exchanges."""
    assert get_canonical_exchange_root("Binance Spot") == "BINANCE"
    assert get_canonical_exchange_root("binance_p2p") == "BINANCE"
    assert get_canonical_exchange_root("Bitso Alpha") == "BITSO"
    assert get_canonical_exchange_root("Ripio Trade") == "RIPIO"
    assert get_canonical_exchange_root("Fiwind") == "FIWIND"
    assert get_canonical_exchange_root("Lemon Cash") == "LEMON"
    assert get_canonical_exchange_root("KuCoin") == "KUCOIN"
    assert get_canonical_exchange_root("Coinbase Pro") == "COINBASE"
    assert get_canonical_exchange_root("Kraken") == "KRAKEN"
    assert get_canonical_exchange_root("BingX") == "BINGX"
    assert get_canonical_exchange_root("Gate.io") == "GATE"
    assert get_canonical_exchange_root("Belo App") == "BELO"
    assert get_canonical_exchange_root("SatoshiTango") == "SATOSHITANGO"
    assert get_canonical_exchange_root("Operaciones Manuales") == "MANUAL"
    assert get_canonical_exchange_root("Exchanges Manuales / Varios") == "MANUAL"
    assert get_canonical_exchange_root("Unknown Exchange XYZ") == "UNKNOWN EXCHANGE XYZ"
    assert get_canonical_exchange_root("") == "OTROS"
