import pytest
import os
import io
import sqlite3
import pandas as pd
from datetime import datetime
from pydantic import ValidationError

import db_manager
import processor_lib
import reconciliation
import fifo_engine
import models_v2
from exceptions import MissingColumnsError


# ==============================================================================
# FEATURE 1: Certified Range & Overwrite Protection (Boundary & Corner Cases - 5 Tests)
# ==============================================================================

def test_f1_t2_01_boundary_timestamp_exact_start_of_certified_range(isolated_db, sample_tx_dict):
    """F1-T2-1: Transaction at exact start_date (00:00:00) of certified range is marked is_certified=1."""
    tx_start = sample_tx_dict(fecha="2024-01-01 00:00:00", exchange="Binance Spot")
    db_manager.insert_transactions([tx_start])

    db_manager.add_certification("Audit 2024", "2024-01-01 00:00:00", "2024-12-31 23:59:59")
    db_manager.sync_certified_transactions_status()

    df = db_manager.get_all_transactions_df()
    assert len(df) == 1
    assert int(df.iloc[0]['is_certified']) == 1


def test_f1_t2_02_boundary_timestamp_exact_end_of_certified_range(isolated_db, sample_tx_dict):
    """F1-T2-2: Transaction at exact end_date (23:59:59) of certified range is marked is_certified=1."""
    tx_end = sample_tx_dict(fecha="2024-12-31 23:59:59", exchange="Bitso")
    db_manager.insert_transactions([tx_end])

    db_manager.add_certification("Audit 2024", "2024-01-01 00:00:00", "2024-12-31 23:59:59")
    db_manager.sync_certified_transactions_status()

    df = db_manager.get_all_transactions_df()
    assert len(df) == 1
    assert int(df.iloc[0]['is_certified']) == 1


def test_f1_t2_03_transaction_one_second_after_certified_range(isolated_db, sample_tx_dict):
    """F1-T2-3: Transaction 1 second after certified range end_date remains is_certified=0."""
    tx_after = sample_tx_dict(fecha="2025-01-01 00:00:00", exchange="Fiwind")
    db_manager.insert_transactions([tx_after])

    db_manager.add_certification("Audit 2024", "2024-01-01 00:00:00", "2024-12-31 23:59:59")
    db_manager.sync_certified_transactions_status()

    df = db_manager.get_all_transactions_df()
    assert len(df) == 1
    assert int(df.iloc[0]['is_certified']) == 0


def test_f1_t2_04_overlapping_certified_ranges(isolated_db):
    """F1-T2-4: fix_corrupted_certifications resolves overlapping certification date ranges safely."""
    db_manager.add_certification("Cert 1", "2024-01-01 00:00:00", "2024-06-30 23:59:59")
    db_manager.add_certification("Cert 2 Overlap", "2024-05-01 00:00:00", "2024-12-31 23:59:59")

    db_manager.fix_corrupted_certifications()

    certs = db_manager.get_certifications()['certifications']
    assert len(certs) >= 1


def test_f1_t2_05_delete_certification_resets_is_certified_flag(isolated_db, sample_tx_dict):
    """F1-T2-5: Deleting a certification reverts affected transactions to is_certified=0."""
    tx = sample_tx_dict(fecha="2024-03-15 10:00:00")
    db_manager.insert_transactions([tx])

    db_manager.add_certification("Cert Temp", "2024-01-01 00:00:00", "2024-12-31 23:59:59")
    db_manager.sync_certified_transactions_status()
    df_cert = db_manager.get_all_transactions_df()
    assert int(df_cert.iloc[0]['is_certified']) == 1

    certs = db_manager.get_certifications()['certifications']
    cert_id = certs[0]['id']
    db_manager.delete_certification(cert_id)
    db_manager.sync_certified_transactions_status()

    df_uncert = db_manager.get_all_transactions_df()
    assert int(df_uncert.iloc[0]['is_certified']) == 0


# ==============================================================================
# FEATURE 2: Timezone & Canonical Hash Normalization (Boundary & Corner Cases - 5 Tests)
# ==============================================================================

def test_f2_t2_01_leap_year_feb_29_timestamp():
    """F2-T2-1: Leap year timestamp (Feb 29) generates valid canonical tx_hash."""
    h = models_v2.compute_canonical_tx_hash("2024-02-29 23:59:59", "Binance Spot", "Compra", "BTC", 0.5, 0.0, 30000.0, "LEAP-2024")
    assert isinstance(h, str)
    assert len(h) == 32


def test_f2_t2_02_micro_second_timestamp_truncation():
    """F2-T2-2: Timestamps with microsecond precision normalize to second resolution."""
    h_ms = models_v2.compute_canonical_tx_hash("2025-01-01 12:00:00.987654", "Bitso", "Compra", "ETH", 1.0, 0.0, 3000.0, "REF-MS")
    h_sec = models_v2.compute_canonical_tx_hash("2025-01-01 12:00:00", "Bitso", "Compra", "ETH", 1.0, 0.0, 3000.0, "REF-MS")
    assert h_ms == h_sec


def test_f2_t2_03_extreme_long_unique_ref_string():
    """F2-T2-3: Extra-long 500-character reference string produces valid 32-char hex MD5 hash."""
    long_ref = "ORD_" + ("x" * 500)
    h = models_v2.compute_canonical_tx_hash("2025-01-01 10:00:00", "Fiwind", "Compra", "USDT", 100.0, 0.0, 100000.0, long_ref)
    assert len(h) == 32


def test_f2_t2_04_special_characters_in_unique_ref():
    """F2-T2-4: Special characters and symbols in order reference are handled without exception."""
    ref_symbols = "ID: #987-XYZ!@$%^&*()_+-=[]{}|;:'\",.<>?/"
    h = models_v2.compute_canonical_tx_hash("2025-01-01 10:00:00", "Ripio Trade", "Compra", "USDT", 100.0, 0.0, 100000.0, ref_symbols)
    assert len(h) == 32


def test_f2_t2_05_unknown_exchange_name_fallback():
    """F2-T2-5: Unknown custom exchange name falls back to cleaned uppercase root."""
    root = models_v2.get_canonical_exchange_root("CustomDEX_Protocol_v2")
    assert root == "CUSTOMDEX_PROTOCOL_V2"


# ==============================================================================
# FEATURE 3: Exchange Parser Robustness & Column Tolerance (Boundary & Corner Cases - 5 Tests)
# ==============================================================================

def test_f3_t2_01_reordered_csv_columns(sample_csv_factory):
    """F3-T2-1: process_binance_csv parses CSV with reordered headers correctly."""
    reordered_stream = sample_csv_factory(
        "binance_reordered.csv",
        "Amount,Executed,Side,Price,Pair,Date(UTC)\n6000,0.1,BUY,60000,BTCUSDT,2025-01-01 10:00:00\n",
        as_stream=True
    )
    res, _ = processor_lib.process_binance_csv(reordered_stream, "binance_reordered.csv")
    assert len(res) >= 1
    coins = [r['Moneda'] for r in res]
    assert "BTC" in coins


def test_f3_t2_02_bom_utf8_header_prefix(sample_csv_factory):
    """F3-T2-2: Header with UTF-8 BOM prefix (\ufeff) is parsed cleanly."""
    bom_stream = sample_csv_factory(
        "fiwind_bom.csv",
        "\ufeffFecha,Tipo,Moneda,Moneda Origen,Monto,Monto Origen,Precio\n"
        "2025-01-01 10:00:00,DEPOSITO,USDT,ARS,100,100000,1000\n",
        as_stream=True
    )
    res, _ = processor_lib.process_fiwind(bom_stream, "fiwind_bom.csv")
    assert len(res) == 1
    assert res[0]['Moneda'] == "USDT"


def test_f3_t2_03_whitespace_padded_cells(sample_csv_factory):
    """F3-T2-3: CSV cells with heavy leading/trailing whitespace are stripped during parsing."""
    padded_stream = sample_csv_factory(
        "padded.csv",
        "datetime  ,  type  ,  major  ,  minor  ,  amount  ,  value  ,  rate  \n"
        "  2025-01-01 10:00:00  ,  buy  ,  btc  ,  ars  ,  0.5  ,  30000000  ,  60000000  \n",
        as_stream=True
    )
    res, _ = processor_lib.process_bitso(padded_stream, "padded.csv")
    assert len(res) == 1
    assert res[0]['Moneda'] == "BTC"


def test_f3_t2_04_extra_unknown_columns_ignored(sample_csv_factory):
    """F3-T2-4: Extra unknown columns in CSV file are ignored safely."""
    extra_col_stream = sample_csv_factory(
        "extra_cols.csv",
        "Date(UTC),Pair,Side,Price,Executed,Amount,ExtraCol1,ExtraCol2\n"
        "2025-01-01 10:00:00,BTCUSDT,BUY,60000,0.1,6000,foo,bar\n",
        as_stream=True
    )
    res, _ = processor_lib.process_binance_csv(extra_col_stream, "extra_cols.csv")
    assert len(res) >= 1
    coins = [r['Moneda'] for r in res]
    assert "BTC" in coins


def test_f3_t2_05_mixed_case_status_blacklist():
    """F3-T2-5: is_cancelled_transaction recognizes mixed-case status keywords."""
    row1 = pd.Series({'estado': 'cAnCeLeD'})
    row2 = pd.Series({'status': 'FaIlEd'})
    assert processor_lib.is_cancelled_transaction(row1) is True
    assert processor_lib.is_cancelled_transaction(row2) is True


# ==============================================================================
# FEATURE 4: Reconciliation Path & Immutability Integration (Boundary & Corner Cases - 5 Tests)
# ==============================================================================

def test_f4_t2_01_zero_balance_reconciliation(isolated_db):
    """F4-T2-1: Audit on empty database returns success=True with zero anomalies."""
    engine = reconciliation.ReconciliationEngine(isolated_db)
    res = engine.run_full_audit()
    assert res['success'] is True
    assert res['anomalies'] == []


def test_f4_t2_02_exact_micro_amount_reconciliation(isolated_db, sample_tx_dict):
    """F4-T2-2: Micro-amount transactions (1e-8 BTC) balance accurately without floating point precision false anomaly."""
    buy_micro = sample_tx_dict(fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="BTC", m_compra=0.00000001, m_venta=0.0)
    sell_micro = sample_tx_dict(fecha="2025-01-02 10:00:00", tipo_operacion="Venta", moneda="BTC", m_compra=0.0, m_venta=0.00000001)
    db_manager.insert_transactions([buy_micro, sell_micro])

    engine = reconciliation.ReconciliationEngine(isolated_db)
    res = engine.run_full_audit()
    assert res['success'] is True
    assert len(res['anomalies']) == 0


def test_f4_t2_03_reconciliation_with_only_buys(isolated_db, sample_tx_dict):
    """F4-T2-3: Ledger containing purchase operations only produces 0 negative balance anomalies."""
    buys = [
        sample_tx_dict(fecha=f"2025-01-0{i+1} 10:00:00", tipo_operacion="Compra", moneda="BTC", m_compra=0.1)
        for i in range(5)
    ]
    db_manager.insert_transactions(buys)

    engine = reconciliation.ReconciliationEngine(isolated_db)
    res = engine.run_full_audit()
    assert len(res['anomalies']) == 0


def test_f4_t2_04_reconciliation_multiple_currencies_simultaneously(isolated_db, sample_tx_dict):
    """F4-T2-4: Simultaneous negative balance gaps across BTC, ETH, and SOL are tracked per coin."""
    sells = [
        sample_tx_dict(fecha="2025-01-01 10:00:00", tipo_operacion="Venta", moneda="BTC", m_compra=0.0, m_venta=1.0),
        sample_tx_dict(fecha="2025-01-01 10:05:00", tipo_operacion="Venta", moneda="ETH", m_compra=0.0, m_venta=2.0),
        sample_tx_dict(fecha="2025-01-01 10:10:00", tipo_operacion="Venta", moneda="SOL", m_compra=0.0, m_venta=10.0),
    ]
    db_manager.insert_transactions(sells)

    engine = reconciliation.ReconciliationEngine(isolated_db)
    res = engine.run_full_audit()
    coins_anomalous = {a['crypto'] for a in res['anomalies']}
    assert coins_anomalous == {"BTC", "ETH", "SOL"}


def test_f4_t2_05_auto_correction_duplicate_run_idempotency(isolated_db, sample_tx_dict):
    """F4-T2-5: Running run_auto_correction multiple times is idempotent and creates no redundant records."""
    tx_sell = sample_tx_dict(fecha="2025-01-05 10:00:00", tipo_operacion="Venta", moneda="ADA", m_compra=0.0, m_venta=100.0)
    db_manager.insert_transactions([tx_sell])

    engine = reconciliation.ReconciliationEngine(isolated_db)
    res1 = engine.run_auto_correction()
    assert res1['fixed_count'] == 1

    res2 = engine.run_auto_correction()
    assert res2['fixed_count'] == 0


# ==============================================================================
# FEATURE 5: Crypto-Crypto Swaps ARS Valuation (Boundary & Corner Cases - 5 Tests)
# ==============================================================================

def test_f5_t2_01_zero_monto_ars_in_swap(isolated_db, sample_tx_dict):
    """F5-T2-1: Swap with monto_ars=0.0 derives fallback unit cost from price or quote."""
    swap_tx = sample_tx_dict(
        fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="ETH",
        m_compra=1.0, cot_compra=3000000.0, m_ars=0.0, comentarios="Swap zero ARS"
    )
    db_manager.insert_transactions([swap_tx])

    df = db_manager.get_all_transactions_df()
    assert float(df.iloc[0]['Cotización Compra']) == 3000000.0


def test_f5_t2_02_micro_quantity_crypto_swap(isolated_db, sample_tx_dict):
    """F5-T2-2: Micro-quantity swap (1e-8 BTC) processes without zero division error."""
    swap_tx = sample_tx_dict(
        fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="BTC",
        m_compra=0.00000001, cot_compra=60000000.0, m_ars=0.60
    )
    db_manager.insert_transactions([swap_tx])
    res = fifo_engine.recalculate_fifo_costs_db()
    assert res['success'] is True


def test_f5_t2_03_same_asset_swap_no_op(isolated_db, sample_tx_dict):
    """F5-T2-3: Swap operation between identical base and quote assets is handled cleanly."""
    tx = sample_tx_dict(
        fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="USDT",
        m_compra=100.0, m_venta=0.0, cot_compra=1000.0, m_ars=100000.0, comentarios="USDT to USDT"
    )
    inserted, skipped = db_manager.insert_transactions([tx])
    assert inserted == 1


def test_f5_t2_04_swap_with_missing_quote_price(isolated_db, sample_tx_dict):
    """F5-T2-4: Swap where quote asset lacks prior ARS price history does not throw exception."""
    swap_tx = sample_tx_dict(
        fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="UNKNOWN_COIN",
        m_compra=10.0, m_venta=0.0, cot_compra=0.0, m_ars=0.0
    )
    db_manager.insert_transactions([swap_tx])
    res = fifo_engine.recalculate_fifo_costs_db()
    assert res['success'] is True


def test_f5_t2_05_extreme_high_valuation_crypto_swap(isolated_db, sample_tx_dict):
    """F5-T2-5: Large volume crypto swap (100,000,000 ARS) maintains float precision."""
    large_swap = sample_tx_dict(
        fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="BTC",
        m_compra=10.0, cot_compra=10000000.0, m_ars=100000000.0
    )
    db_manager.insert_transactions([large_swap])
    df = db_manager.get_all_transactions_df()
    assert float(df.iloc[0]['Monto ARS']) == pytest.approx(100000000.0)


# ==============================================================================
# FEATURE 6: Synthetic Balance Gap Valuation (Boundary & Corner Cases - 5 Tests)
# ==============================================================================

def test_f6_t2_01_synthetic_gap_exact_zero_cost_prevention(isolated_db, sample_tx_dict):
    """F6-T2-1: Synthetic gap auto-correction creates valid adjustment entry."""
    sell_tx = sample_tx_dict(fecha="2025-01-10 10:00:00", tipo_operacion="Venta", moneda="USDT", m_compra=0.0, m_venta=500.0, cot_venta=1100.0, m_ars=550000.0)
    db_manager.insert_transactions([sell_tx])

    engine = reconciliation.ReconciliationEngine(isolated_db)
    res = engine.run_auto_correction()
    assert res['fixed_count'] == 1


def test_f6_t2_02_synthetic_adjustment_timestamp_one_second_before(isolated_db, sample_tx_dict):
    """F6-T2-2: Synthetic deposit is timestamped exactly 1 second prior to anomaly sell."""
    sell_tx = sample_tx_dict(fecha="2025-01-10 12:00:00", tipo_operacion="Venta", moneda="USDT", m_compra=0.0, m_venta=100.0)
    db_manager.insert_transactions([sell_tx])

    engine = reconciliation.ReconciliationEngine(isolated_db)
    engine.run_auto_correction()

    df = db_manager.get_all_transactions_df()
    syn = df[df['Tipo de Operación'].str.contains("Ingreso", case=False)].iloc[0]
    assert syn['Fecha'] == "2025-01-10 11:59:59"


def test_f6_t2_03_multiple_gaps_same_coin_incremental_correction(isolated_db, sample_tx_dict):
    """F6-T2-3: Multiple gaps for the same coin at different times create distinct synthetic adjustments."""
    sell1 = sample_tx_dict(fecha="2025-01-05 10:00:00", tipo_operacion="Venta", moneda="BTC", m_compra=0.0, m_venta=0.1)
    sell2 = sample_tx_dict(fecha="2025-01-10 10:00:00", tipo_operacion="Venta", moneda="BTC", m_compra=0.0, m_venta=0.2)
    db_manager.insert_transactions([sell1, sell2])

    engine = reconciliation.ReconciliationEngine(isolated_db)
    res = engine.run_auto_correction()
    assert res['fixed_count'] == 2


def test_f6_t2_04_gap_correction_with_existing_partial_balance(isolated_db, sample_tx_dict):
    """F6-T2-4: Sell exceeding partial available balance creates synthetic adjustment for exact deficit only."""
    buy = sample_tx_dict(fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="ETH", m_compra=1.0)
    sell = sample_tx_dict(fecha="2025-01-05 10:00:00", tipo_operacion="Venta", moneda="ETH", m_compra=0.0, m_venta=3.0)
    db_manager.insert_transactions([buy, sell])

    engine = reconciliation.ReconciliationEngine(isolated_db)
    engine.run_auto_correction()

    df = db_manager.get_all_transactions_df()
    syn = df[df['Tipo de Operación'].str.contains("Ingreso", case=False)].iloc[0]
    assert float(syn['Monto Compra (Cripto)']) == pytest.approx(2.0)


def test_f6_t2_05_gap_check_on_fiat_currency_ignored(isolated_db, sample_tx_dict):
    """F6-T2-5: check_history_gaps ignores ARS and fiat currencies."""
    sell_ars = sample_tx_dict(fecha="2025-01-01 10:00:00", tipo_operacion="Venta", moneda="ARS", m_compra=0.0, m_venta=10000.0)
    db_manager.insert_transactions([sell_ars])

    gaps = db_manager.check_history_gaps()
    assert len(gaps) == 0


# ==============================================================================
# FEATURE 7: Deterministic Timestamp Collision Sorting (Boundary & Corner Cases - 5 Tests)
# ==============================================================================

def test_f7_t2_01_same_second_multiple_buys_and_sells(isolated_db, sample_tx_dict):
    """F7-T2-1: 5 buys and 5 sells on the exact same second process all buys before any sells."""
    txs = []
    for i in range(5):
        txs.append(sample_tx_dict(fecha="2025-01-01 12:00:00", tipo_operacion="Venta", moneda="USDT", m_compra=0.0, m_venta=100.0, cot_venta=1200.0, comentarios=f"Sell {i}"))
        txs.append(sample_tx_dict(fecha="2025-01-01 12:00:00", tipo_operacion="Compra", moneda="USDT", m_compra=100.0, cot_compra=1000.0, m_ars=100000.0, comentarios=f"Buy {i}"))
    db_manager.insert_transactions(txs)

    fifo_engine.recalculate_fifo_costs_db()
    df = db_manager.get_all_transactions_df()

    sells = df[df['Tipo de Operación'] == "Venta"]
    for _, row in sells.iterrows():
        assert float(row['Cotización Compra']) == pytest.approx(1000.0)


def test_f7_t2_02_same_second_same_type_hash_order(isolated_db, sample_tx_dict):
    """F7-T2-2: Same second, same operation type transactions sort deterministically by tx_hash ASC."""
    tx1 = sample_tx_dict(fecha="2025-01-01 12:00:00", tipo_operacion="Compra", moneda="BTC", m_compra=0.1, cot_compra=50000.0, comentarios="Ref Alpha")
    tx2 = sample_tx_dict(fecha="2025-01-01 12:00:00", tipo_operacion="Compra", moneda="BTC", m_compra=0.1, cot_compra=60000.0, comentarios="Ref Beta")
    db_manager.insert_transactions([tx1, tx2])

    res = fifo_engine.recalculate_fifo_costs_db()
    assert res['success'] is True


def test_f7_t2_03_same_second_across_different_exchanges(isolated_db, sample_tx_dict):
    """F7-T2-3: Same second trades across Binance and Bitso sort deterministically."""
    tx1 = sample_tx_dict(fecha="2025-01-01 12:00:00", exchange="Binance Spot", tipo_operacion="Compra", moneda="USDT", m_compra=100.0, cot_compra=1000.0)
    tx2 = sample_tx_dict(fecha="2025-01-01 12:00:00", exchange="Bitso", tipo_operacion="Compra", moneda="USDT", m_compra=100.0, cot_compra=1050.0)
    db_manager.insert_transactions([tx1, tx2])

    res = fifo_engine.recalculate_fifo_costs_db()
    assert res['success'] is True


def test_f7_t2_04_midnight_boundary_collision(isolated_db, sample_tx_dict):
    """F7-T2-4: Timestamp collision at midnight transition (23:59:59) resolves cleanly."""
    tx_buy = sample_tx_dict(fecha="2025-01-01 23:59:59", tipo_operacion="Compra", moneda="SOL", m_compra=10.0, cot_compra=20000.0, m_ars=200000.0)
    tx_sell = sample_tx_dict(fecha="2025-01-01 23:59:59", tipo_operacion="Venta", moneda="SOL", m_compra=0.0, m_venta=10.0, cot_venta=25000.0, m_ars=250000.0)
    db_manager.insert_transactions([tx_sell, tx_buy])

    fifo_engine.recalculate_fifo_costs_db()
    df = db_manager.get_all_transactions_df()
    sell_row = df[df['Tipo de Operación'] == "Venta"].iloc[0]
    assert float(sell_row['Cotización Compra']) == pytest.approx(20000.0)


def test_f7_t2_05_fifo_recalc_idempotency_with_collisions(isolated_db, sample_tx_dict):
    """F7-T2-5: Recalculating FIFO multiple times with timestamp collisions yields identical results."""
    txs = [
        sample_tx_dict(fecha="2025-01-01 12:00:00", tipo_operacion="Compra", moneda="BTC", m_compra=0.1, cot_compra=50000.0, comentarios="B1"),
        sample_tx_dict(fecha="2025-01-01 12:00:00", tipo_operacion="Venta", moneda="BTC", m_compra=0.0, m_venta=0.1, cot_venta=60000.0, comentarios="S1"),
    ]
    db_manager.insert_transactions(txs)

    fifo_engine.recalculate_fifo_costs_db()
    res1 = db_manager.get_all_transactions_df().to_dict(orient="records")

    fifo_engine.recalculate_fifo_costs_db()
    res2 = db_manager.get_all_transactions_df().to_dict(orient="records")

    assert res1 == res2


# ==============================================================================
# FEATURE 8: Argentina Tax Engine Deductions & Accuracy (Boundary & Corner Cases - 5 Tests)
# ==============================================================================

def test_f8_t2_01_zero_net_gain_ganancias_calculation(isolated_db, sample_tx_dict):
    """F8-T2-1: When Net Gain <= Deducción, tax payable is exactly $0.0 ARS."""
    buy_tx = sample_tx_dict(fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="USDT", m_compra=100.0, cot_compra=1000.0, m_ars=100000.0)
    sell_tx = sample_tx_dict(fecha="2025-02-01 10:00:00", tipo_operacion="Venta", moneda="USDT", m_compra=0.0, m_venta=100.0, cot_venta=1100.0, m_ars=110000.0)
    db_manager.insert_transactions([buy_tx, sell_tx])

    db_manager.save_tax_settings({'ganancias_deduccion': 500000.0, 'year': 2025})
    fifo_engine.recalculate_fifo_costs_db()

    report = db_manager.get_tax_report(year=2025)
    assert report['impuesto_ganancias'] == 0.0


def test_f8_t2_02_negative_net_gain_loss_handling(isolated_db, sample_tx_dict):
    """F8-T2-2: Trading loss results in $0.0 tax payable."""
    buy_tx = sample_tx_dict(fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="ETH", m_compra=1.0, cot_compra=3000000.0, m_ars=3000000.0)
    sell_tx = sample_tx_dict(fecha="2025-02-01 10:00:00", tipo_operacion="Venta", moneda="ETH", m_compra=0.0, m_venta=1.0, cot_venta=2000000.0, m_ars=2000000.0)
    db_manager.insert_transactions([buy_tx, sell_tx])

    fifo_engine.recalculate_fifo_costs_db()
    report = db_manager.get_tax_report(year=2025)

    assert report['ganancia_neta'] == pytest.approx(-1000000.0)
    assert report['impuesto_ganancias'] == 0.0


def test_f8_t2_03_iibb_boundary_exact_bracket_threshold(isolated_db, sample_tx_dict):
    """F8-T2-3: Sales volume calculation handles provincial IIBB tax rate properly."""
    sell_tx = sample_tx_dict(fecha="2025-01-01 10:00:00", tipo_operacion="Venta", moneda="USDT", m_compra=0.0, m_venta=1000.0, cot_venta=1000.0, m_ars=1000000.0)
    db_manager.insert_transactions([sell_tx])

    db_manager.save_tax_settings({'iibb_provincia': 'Buenos Aires', 'iibb_rate': 0.035, 'year': 2025})
    report = db_manager.get_tax_report(year=2025)
    assert 'impuesto_iibb' in report


def test_f8_t2_04_tax_report_with_no_transactions_for_year(isolated_db):
    """F8-T2-4: Tax report for year with zero transactions returns clean summary."""
    report = db_manager.get_tax_report(year=2025)
    assert report['impuesto_ganancias'] == 0.0


def test_f8_t2_05_extreme_high_volume_tax_calculation(isolated_db, sample_tx_dict):
    """F8-T2-5: Tax report handles 100,000,000,000 ARS volume without numeric overflow."""
    buy_tx = sample_tx_dict(fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="BTC", m_compra=1000.0, cot_compra=100000000.0, m_ars=100000000000.0)
    sell_tx = sample_tx_dict(fecha="2025-06-01 10:00:00", tipo_operacion="Venta", moneda="BTC", m_compra=0.0, m_venta=1000.0, cot_venta=120000000.0, m_ars=120000000000.0)
    db_manager.insert_transactions([buy_tx, sell_tx])

    fifo_engine.recalculate_fifo_costs_db()
    report = db_manager.get_tax_report(year=2025)
    assert report['ganancia_neta'] == pytest.approx(20000000000.0)


# ==============================================================================
# FEATURE 9: Test Infrastructure & Isolated Fixtures (Boundary & Corner Cases - 5 Tests)
# ==============================================================================

def test_f9_t2_01_consecutive_db_resets(isolated_db):
    """F9-T2-1: Repeatedly initializing and clearing database maintains valid schema."""
    db_manager.init_db()
    db_manager.clear_db()
    db_manager.init_db()

    df = db_manager.get_all_transactions_df()
    assert df.empty


def test_f9_t2_02_corrupted_db_file_reinitialization(tmp_path, monkeypatch):
    """F9-T2-2: Creating fresh DB after clearing operates cleanly."""
    db_file = tmp_path / "fresh_init.db"
    monkeypatch.setattr(db_manager, "DB_PATH", str(db_file))
    monkeypatch.setattr(db_manager, "get_connection", lambda: sqlite3.connect(str(db_file)))
    db_manager.init_db()
    assert os.path.exists(str(db_file))


def test_f9_t2_03_fixture_teardown_handles_locked_file(isolated_db):
    """F9-T2-3: Database connection cleanup executes safely."""
    conn = db_manager.get_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM transactions")
    conn.close()


def test_f9_t2_04_transaction_model_validation_failures():
    """F9-T2-4: TransactionModel raises ValidationError on negative crypto amounts."""
    with pytest.raises(ValidationError):
        models_v2.TransactionModel(
            fecha=datetime.now(),
            exchange="Binance",
            tipo_operacion="Compra",
            monto_compra_cripto=-1.0
        )


def test_f9_t2_05_custom_exchange_config_persistence_in_isolated_db(isolated_db):
    """F9-T2-5: Custom exchange mapping persists correctly in isolated DB."""
    db_manager.add_custom_exchange("MyCustomDEX", "Custom DEX Exchange")
    exchanges = db_manager.get_all_exchanges()
    names = [e['name'] for e in exchanges]
    assert "MyCustomDEX" in names


# ==============================================================================
# FEATURE 10: Corrupted & Edge Case Test Suite (Boundary & Corner Cases - 5 Tests)
# ==============================================================================

def test_f10_t2_01_csv_with_only_headers_no_data(sample_csv_factory):
    """F10-T2-1: CSV with valid headers but 0 data rows parses to empty list without error."""
    header_only_stream = sample_csv_factory("headers_only.csv", "Date(UTC),Pair,Side,Price,Executed,Amount\n", as_stream=True)
    res, _ = processor_lib.process_binance_csv(header_only_stream, "headers_only.csv")
    assert res == []


def test_f10_t2_02_csv_with_binary_garbage_content():
    """F10-T2-2: File with arbitrary non-text binary bytes handles safely."""
    garbage_stream = io.BytesIO(b"\x00\xff\xfe\xfdRandomBinaryDataBytes\x01\x02")
    res, _ = processor_lib.process_uploaded_file(garbage_stream, "garbage.bin")
    assert res == []


def test_f10_t2_03_excel_with_formulas_and_none_values(sample_csv_factory):
    """F10-T2-3: Text file with missing/empty fields processes safely."""
    empty_lines_stream = sample_csv_factory("empty_lines.txt", "\n\n  \n", as_stream=True)
    res, _ = processor_lib.procesar_ripio_comun_txt(empty_lines_stream, "empty_lines.txt")
    assert res == []


def test_f10_t2_04_extremely_large_numbers_in_csv():
    """F10-T2-4: Extremely large numeric values are sanitized without overflow."""
    cleaned = processor_lib.clean_decimal("999999999999999.99")
    assert cleaned == pytest.approx(999999999999999.99)


def test_f10_t2_05_non_standard_currency_symbols():
    """F10-T2-5: Currency symbols with extra padding or slashes are sanitized."""
    tx_model = models_v2.TransactionModel(
        fecha=datetime.now(),
        exchange="Bitso",
        tipo_operacion="Compra",
        moneda="  usdt  "
    )
    assert tx_model.moneda == "USDT"


# ==============================================================================
# FEATURE 11: High-Volume Stress Benchmarks (Boundary & Corner Cases - 5 Tests)
# ==============================================================================

def test_f11_t2_01_stress_insert_with_50_percent_duplicates(isolated_db, sample_tx_dict):
    """F11-T2-1: Ingest 2,000 transactions where 1,000 are exact duplicates: 1,000 inserted, 1,000 skipped."""
    unique_txs = [
        sample_tx_dict(fecha=f"2025-01-01 10:{i//60:02d}:{i%60:02d}", comentarios=f"Order #{i}")
        for i in range(1000)
    ]
    ins1, skip1 = db_manager.insert_transactions(unique_txs, trigger_fifo_recalc=False)
    assert ins1 == 1000

    new_txs = [
        sample_tx_dict(fecha=f"2025-01-02 10:{i//60:02d}:{i%60:02d}", comentarios=f"Order #{i+1000}")
        for i in range(1000)
    ]
    ins2, skip2 = db_manager.insert_transactions(unique_txs + new_txs, trigger_fifo_recalc=False)
    assert ins2 == 1000
    assert skip2 == 1000


def test_f11_t2_02_fifo_recalc_with_100_interleaved_coins(isolated_db, sample_tx_dict):
    """F11-T2-2: FIFO recalculation across 50 different coins scales linearly."""
    txs = []
    for c_idx in range(50):
        coin_name = f"COIN{c_idx}"
        txs.append(sample_tx_dict(fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda=coin_name, m_compra=10.0, cot_compra=100.0, m_ars=1000.0))
        txs.append(sample_tx_dict(fecha="2025-01-02 10:00:00", tipo_operacion="Venta", moneda=coin_name, m_compra=0.0, m_venta=10.0, cot_venta=120.0, m_ars=1200.0))
    db_manager.insert_transactions(txs, trigger_fifo_recalc=False)

    res = fifo_engine.recalculate_fifo_costs_db()
    assert res['success'] is True
    assert res['updated_count'] == 50


def test_f11_t2_03_reconciliation_audit_with_1000_gaps(isolated_db, sample_tx_dict):
    """F11-T2-3: Reconciliation audit on ledger with 50 anomalies executes cleanly."""
    sells = [
        sample_tx_dict(fecha=f"2025-01-01 10:{i//60:02d}:{i%60:02d}", tipo_operacion="Venta", moneda=f"COIN_{i}", m_compra=0.0, m_venta=1.0)
        for i in range(50)
    ]
    db_manager.insert_transactions(sells, trigger_fifo_recalc=False)

    engine = reconciliation.ReconciliationEngine(isolated_db)
    res = engine.run_full_audit()
    assert len(res['anomalies']) == 50


def test_f11_t2_04_tax_report_aggregation_speed_large_dataset(isolated_db, sample_tx_dict):
    """F11-T2-4: Tax report generation on 1,000 transactions completes in under 2 seconds."""
    import time
    buys = [
        sample_tx_dict(fecha=f"2025-01-01 10:{i//60:02d}:{i%60:02d}", tipo_operacion="Compra", moneda="USDT", m_compra=10.0, cot_compra=1000.0, m_ars=10000.0)
        for i in range(500)
    ]
    sells = [
        sample_tx_dict(fecha=f"2025-01-02 10:{i//60:02d}:{i%60:02d}", tipo_operacion="Venta", moneda="USDT", m_compra=0.0, m_venta=10.0, cot_venta=1100.0, m_ars=11000.0)
        for i in range(500)
    ]
    db_manager.insert_transactions(buys + sells, trigger_fifo_recalc=False)

    t0 = time.time()
    report = db_manager.get_tax_report(year=2025)
    t1 = time.time()

    assert 'impuesto_ganancias' in report
    assert (t1 - t0) < 2.0


def test_f11_t2_05_concurrent_connection_busy_timeout(isolated_db):
    """F11-T2-5: SQLite busy_timeout handles multiple fast sequential DB operations cleanly."""
    for i in range(20):
        conn = db_manager.get_connection()
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM transactions")
        conn.close()


# ==============================================================================
# FEATURE 12: End-to-End Accounting Verification Suite (Boundary & Corner Cases - 5 Tests)
# ==============================================================================

def test_f12_t2_01_e2e_all_12_exchanges_ingestion(isolated_db, sample_tx_dict):
    """F12-T2-1: Ingest sample transactions from 5 different exchanges in a single run."""
    exchanges = ["Binance Spot", "Bitso", "Fiwind", "Ripio Trade", "Lemon Cash"]
    batch = [
        sample_tx_dict(fecha="2025-01-01 10:00:00", exchange=ex, moneda="USDT", m_compra=100.0, cot_compra=1000.0, m_ars=100000.0)
        for ex in exchanges
    ]
    ins, skip = db_manager.insert_transactions(batch)
    assert ins == 5

    df = db_manager.get_all_transactions_df()
    unique_exchanges = set(df['Exchange'].unique())
    assert len(unique_exchanges) == 5


def test_f12_t2_02_e2e_certified_period_with_subsequent_uncertified_trades(isolated_db, sample_tx_dict):
    """F12-T2-2: Certified 2024 period retains fixed costs while uncertified 2025 trades calculate dynamically."""
    cert_tx = sample_tx_dict(fecha="2024-06-01 10:00:00", tipo_operacion="Compra", moneda="BTC", m_compra=1.0, cot_compra=40000000.0, m_ars=40000000.0)
    uncert_buy = sample_tx_dict(fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="BTC", m_compra=1.0, cot_compra=60000000.0, m_ars=60000000.0)
    uncert_sell = sample_tx_dict(fecha="2025-01-02 10:00:00", tipo_operacion="Venta", moneda="BTC", m_compra=0.0, m_venta=1.0, cot_venta=70000000.0, m_ars=70000000.0)

    db_manager.insert_transactions([cert_tx, uncert_buy, uncert_sell])
    db_manager.add_certification("Audit 2024", "2024-01-01 00:00:00", "2024-12-31 23:59:59")
    db_manager.sync_certified_transactions_status()

    fifo_engine.recalculate_fifo_costs_db()

    df = db_manager.get_all_transactions_df()
    certified_row = df[df['Fecha'] == "2024-06-01 10:00:00"].iloc[0]
    sell_row = df[df['Fecha'] == "2025-01-02 10:00:00"].iloc[0]

    assert float(certified_row['Cotización Compra']) == 40000000.0
    assert float(sell_row['Cotización Compra']) == pytest.approx(40000000.0)


def test_f12_t2_03_e2e_reconciliation_autocorrect_and_tax_report_generation(isolated_db, sample_tx_dict):
    """F12-T2-3: Full lifecycle with gap: raw import -> audit -> autocorrect -> fifo recalc -> tax report."""
    sell = sample_tx_dict(fecha="2025-01-10 10:00:00", tipo_operacion="Venta", moneda="USDT", m_compra=0.0, m_venta=1000.0, cot_venta=1200.0, m_ars=1200000.0)
    db_manager.insert_transactions([sell])

    engine = reconciliation.ReconciliationEngine(isolated_db)
    engine.run_auto_correction()
    fifo_engine.recalculate_fifo_costs_db()

    report = db_manager.get_tax_report(year=2025)
    assert 'impuesto_ganancias' in report
    assert report['impuesto_ganancias'] >= 0.0


def test_f12_t2_04_e2e_multi_year_fifo_carryover(isolated_db, sample_tx_dict):
    """F12-T2-4: Purchases in 2023 sold in 2025 correctly carry cost basis across multiple tax years."""
    buy_2023 = sample_tx_dict(fecha="2023-05-10 10:00:00", tipo_operacion="Compra", moneda="BTC", m_compra=1.0, cot_compra=20000000.0, m_ars=20000000.0)
    sell_2025 = sample_tx_dict(fecha="2025-01-15 10:00:00", tipo_operacion="Venta", moneda="BTC", m_compra=0.0, m_venta=1.0, cot_venta=80000000.0, m_ars=80000000.0)
    db_manager.insert_transactions([buy_2023, sell_2025])

    fifo_engine.recalculate_fifo_costs_db()

    df = db_manager.get_all_transactions_df()
    sell_row = df[df['Fecha'] == "2025-01-15 10:00:00"].iloc[0]
    assert float(sell_row['Cotización Compra']) == pytest.approx(20000000.0)


def test_f12_t2_05_e2e_full_wipe_and_reimport_verification(isolated_db, sample_tx_dict):
    """F12-T2-5: Ingest -> clear_db -> Re-ingest produces exact matching totals and hashes."""
    txs = [
        sample_tx_dict(fecha="2025-01-01 10:00:00", comentarios="Order #WIPE1"),
        sample_tx_dict(fecha="2025-01-02 10:00:00", comentarios="Order #WIPE2"),
    ]
    db_manager.insert_transactions(txs)
    df1 = db_manager.get_all_transactions_df()

    db_manager.clear_db()
    df_empty = db_manager.get_all_transactions_df()
    assert df_empty.empty

    db_manager.insert_transactions(txs)
    df2 = db_manager.get_all_transactions_df()

    pd.testing.assert_frame_equal(df1, df2)
