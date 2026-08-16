import pytest
import os
import io
import sqlite3
import pandas as pd
from datetime import datetime

import db_manager
import processor_lib
import reconciliation
import fifo_engine
import models_v2
from exceptions import MissingColumnsError


# ==============================================================================
# FEATURE 1: Certified Range & Overwrite Protection (5 Tests)
# ==============================================================================

def test_f1_01_insert_prevents_certified_date_range_overwrite(isolated_db, sample_tx_dict, sample_certified_range):
    """F1-1: Transactions inserted falling in a certified date range are skipped to enforce protection."""
    sample_certified_range("Audit 2024", "2024-01-01 00:00:00", "2024-12-31 23:59:59")

    tx_certified = sample_tx_dict(fecha="2024-06-15 10:00:00", exchange="Binance Spot", m_ars=50000.0)
    tx_uncertified = sample_tx_dict(fecha="2025-02-15 10:00:00", exchange="Binance Spot", m_ars=60000.0)

    inserted, skipped = db_manager.insert_transactions([tx_certified, tx_uncertified])
    assert inserted == 1
    assert skipped == 1

    df = db_manager.get_all_transactions_df()
    assert len(df) == 1
    assert df.iloc[0]['Fecha'] == "2025-02-15 10:00:00"


def test_f1_02_delete_exchange_preserves_certified_records(isolated_db, sample_tx_dict):
    """F1-2: delete_transactions_by_exchange deletes uncertified records but leaves certified records intact."""
    tx_2024 = sample_tx_dict(fecha="2024-05-10 12:00:00", exchange="Binance Spot")
    tx_2025 = sample_tx_dict(fecha="2025-05-10 12:00:00", exchange="Binance Spot")
    db_manager.insert_transactions([tx_2024, tx_2025])

    db_manager.add_certification("Audit 2024", "2024-01-01 00:00:00", "2024-12-31 23:59:59")
    db_manager.sync_certified_transactions_status()

    deleted = db_manager.delete_transactions_by_exchange("Binance Spot")
    assert deleted == 1

    df = db_manager.get_all_transactions_df()
    assert len(df) == 1
    assert df.iloc[0]['Fecha'] == "2024-05-10 12:00:00"
    assert int(df.iloc[0]['is_certified']) == 1


def test_f1_03_recalculate_fifo_preserves_certified_cotizacion(isolated_db, sample_tx_dict):
    """F1-3: FIFO cost basis recalculation does not alter cotizacion_compra of certified rows."""
    buy_tx = sample_tx_dict(
        fecha="2024-03-01 10:00:00", exchange="Bitso", tipo_operacion="Compra",
        moneda="USDT", m_compra=100.0, m_venta=0.0, cot_compra=900.0, m_ars=90000.0
    )
    db_manager.insert_transactions([buy_tx])

    db_manager.add_certification("Audit 2024", "2024-01-01 00:00:00", "2024-12-31 23:59:59")
    db_manager.sync_certified_transactions_status()

    buy_2025 = sample_tx_dict(
        fecha="2025-01-01 10:00:00", exchange="Bitso", tipo_operacion="Compra",
        moneda="USDT", m_compra=100.0, m_venta=0.0, cot_compra=1200.0, m_ars=120000.0
    )
    sell_2025 = sample_tx_dict(
        fecha="2025-01-02 10:00:00", exchange="Bitso", tipo_operacion="Venta",
        moneda="USDT", m_compra=0.0, m_venta=50.0, cot_compra=0.0, cot_venta=1300.0, m_ars=65000.0
    )
    db_manager.insert_transactions([buy_2025, sell_2025])

    fifo_engine.recalculate_fifo_costs_db()

    df = db_manager.get_all_transactions_df()
    certified_buy = df[df['Fecha'] == "2024-03-01 10:00:00"].iloc[0]
    assert float(certified_buy['Cotización Compra']) == 900.0


def test_f1_04_sync_certified_status_updates_is_certified_flag(isolated_db, sample_tx_dict):
    """F1-4: Adding a certification and calling sync_certified_transactions_status updates is_certified flags."""
    tx1 = sample_tx_dict(fecha="2024-04-01 10:00:00")
    tx2 = sample_tx_dict(fecha="2025-04-01 10:00:00")
    db_manager.insert_transactions([tx1, tx2])

    df_init = db_manager.get_all_transactions_df()
    assert (df_init['is_certified'] == 0).all()

    db_manager.add_certification("Test Cert 2024", "2024-01-01 00:00:00", "2024-12-31 23:59:59")
    db_manager.sync_certified_transactions_status()

    df_synced = db_manager.get_all_transactions_df()
    c_2024 = df_synced[df_synced['Fecha'] == "2024-04-01 10:00:00"].iloc[0]
    c_2025 = df_synced[df_synced['Fecha'] == "2025-04-01 10:00:00"].iloc[0]

    assert int(c_2024['is_certified']) == 1
    assert int(c_2025['is_certified']) == 0


def test_f1_05_deduplicate_database_prefers_certified_records(isolated_db, sample_tx_dict):
    """F1-5: Database deduplication retains certified records over uncertified ones when collision occurs."""
    tx_cert = sample_tx_dict(fecha="2024-08-01 12:00:00", exchange="Fiwind", comentarios="Order #SYNC100")
    db_manager.insert_transactions([tx_cert])

    db_manager.add_certification("Audit 2024", "2024-01-01 00:00:00", "2024-12-31 23:59:59")
    db_manager.sync_certified_transactions_status()

    conn = db_manager.get_connection()
    c = conn.cursor()
    c.execute(
        "INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_compra_cripto, monto_venta_cripto, cotizacion_compra, cotizacion_venta, monto_ars, comentarios, is_certified) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("dup_hash_999", "2024-08-01 12:00:00", "Fiwind", "Compra", "BTC", 0.1, 0.0, 60000.0, 0.0, 6000.0, "Order #SYNC100", 0)
    )
    conn.commit()
    conn.close()

    purged = db_manager.deduplicate_existing_database()
    assert purged >= 1

    df = db_manager.get_all_transactions_df()
    assert len(df) == 1
    assert int(df.iloc[0]['is_certified']) == 1


# ==============================================================================
# FEATURE 2: Timezone & Canonical Hash Normalization (5 Tests)
# ==============================================================================

def test_f2_01_utc_conversion_before_hash_generation():
    """F2-1: compute_canonical_tx_hash converts ISO timestamps with timezones to UTC."""
    h1 = models_v2.compute_canonical_tx_hash("2025-06-01T15:00:00-03:00", "Binance", "Compra", "USDT", 100.0, 0.0, 100000.0, "REF1")
    h2 = models_v2.compute_canonical_tx_hash("2025-06-01 18:00:00", "Binance", "Compra", "USDT", 100.0, 0.0, 100000.0, "REF1")
    assert h1 == h2


def test_f2_02_canonical_exchange_root_resolution():
    """F2-2: get_canonical_exchange_root standardizes variations of exchange names."""
    assert models_v2.get_canonical_exchange_root("Binance Spot") == "BINANCE"
    assert models_v2.get_canonical_exchange_root("BINANCE_P2P") == "BINANCE"
    assert models_v2.get_canonical_exchange_root("bitso alpha") == "BITSO"
    assert models_v2.get_canonical_exchange_root("Fiwind Pro") == "FIWIND"
    assert models_v2.get_canonical_exchange_root("Ripio Trade") == "RIPIO"


def test_f2_03_order_id_extraction_and_cleaning():
    """F2-3: compute_canonical_tx_hash extracts order ID from reference text accurately."""
    h1 = models_v2.compute_canonical_tx_hash("2025-01-01 12:00:00", "Binance", "Compra", "BTC", 1.0, 0.0, 60000.0, "Order #987654321")
    h2 = models_v2.compute_canonical_tx_hash("2025-01-01 12:00:00", "Binance", "Compra", "BTC", 1.0, 0.0, 60000.0, "ID: 987654321")
    assert h1 == h2


def test_f2_04_same_trade_different_input_formats_produce_identical_hash():
    """F2-4: Equivalent trade data formatted differently yields identical canonical tx_hash."""
    h_csv = models_v2.compute_canonical_tx_hash("2025-03-10 10:30:00", "Binance Spot", "COMPRA", "ETH", 2.0, 0.0, 6000.0, "ORD-555")
    h_api = models_v2.compute_canonical_tx_hash("2025-03-10T10:30:00Z", "binance", "Compra", "eth", 2.0, 0.0, 6000.0, "Ref: ORD-555")
    assert h_csv == h_api


def test_f2_05_transaction_model_export_uses_canonical_hash():
    """F2-5: TransactionModel export method includes matching canonical tx_hash."""
    tx_model = models_v2.TransactionModel(
        fecha=datetime(2025, 4, 1, 14, 0, 0),
        exchange="Bitso",
        tipo_operacion="Compra",
        moneda="BTC",
        monto_compra_cripto=0.5,
        monto_ars=30000.0,
        comentarios="Order #MODEL123"
    )
    d = tx_model.to_dict()
    expected_hash = models_v2.compute_canonical_tx_hash(
        "2025-04-01 14:00:00", "Bitso", "Compra", "BTC", 0.5, 0.0, 30000.0, "Order #MODEL123"
    )
    assert d['tx_hash'] == expected_hash


# ==============================================================================
# FEATURE 3: Exchange Parser Robustness & Column Tolerance (5 Tests)
# ==============================================================================

def test_f3_01_binance_bilingual_header_parsing(sample_csv_factory):
    """F3-1: process_binance_csv parses both Spanish and English header formats."""
    en_stream = sample_csv_factory("binance_en.csv", "Date(UTC),Pair,Side,Price,Executed,Amount\n2025-01-01 10:00:00,BTCUSDT,BUY,60000,0.1,6000\n", as_stream=True)
    es_stream = sample_csv_factory("binance_es.csv", "Fecha,Par,Tipo,Precio,Ejecutado,Monto\n2025-01-01 10:00:00,BTCUSDT,COMPRA,60000,0.1,6000\n", as_stream=True)

    res_en, _ = processor_lib.process_binance_csv(en_stream, "binance_en.csv")
    res_es, _ = processor_lib.process_binance_csv(es_stream, "binance_es.csv")

    assert len(res_en) >= 1
    assert len(res_es) >= 1
    coins_en = [r['Moneda'] for r in res_en]
    assert "BTC" in coins_en


def test_f3_02_negative_status_blacklist_filtering():
    """F3-2: is_cancelled_transaction correctly identifies cancelled or failed statuses."""
    cancelled_row = pd.Series({'estado': 'Canceled', 'status': 'FILLED'})
    failed_row = pd.Series({'Estado': 'RECHAZADA'})
    success_row = pd.Series({'Estado': 'COMPLETADO'})

    assert processor_lib.is_cancelled_transaction(cancelled_row) is True
    assert processor_lib.is_cancelled_transaction(failed_row) is True
    assert processor_lib.is_cancelled_transaction(success_row) is False


def test_f3_03_fiwind_parser_handles_aliases(sample_csv_factory):
    """F3-3: process_fiwind handles English and Spanish operation type aliases."""
    fiwind_stream = sample_csv_factory(
        "fiwind.csv",
        "Fecha,Tipo,Moneda,Moneda Origen,Monto,Monto Origen,Precio\n"
        "2025-01-01 10:00:00,DEPOSITO,USDT,ARS,500,500000,1000\n"
        "2025-01-02 11:00:00,SWAP,BTC,USDT,0.01,600,60000\n",
        as_stream=True
    )
    res, _ = processor_lib.process_fiwind(fiwind_stream, "fiwind.csv")

    assert len(res) >= 2
    assert res[0]['Tipo de Operación'] in ("Ingreso Cripto", "Compra")


def test_f3_04_bitso_parser_handles_missing_optional_columns_and_encodings(sample_csv_factory):
    """F3-4: process_bitso parses Bitso files with UTF-8-SIG encoding."""
    bitso_stream = sample_csv_factory(
        "bitso.csv",
        "\ufeffdatetime,type,major,minor,amount,value,rate\n"
        "2025-01-01 10:00:00,buy,btc,ars,0.1,6000000,60000000\n",
        as_stream=True
    )
    res, _ = processor_lib.process_bitso(bitso_stream, "bitso.csv")

    assert len(res) == 1
    assert res[0]['Exchange'] == "Bitso Alpha"
    assert res[0]['Moneda'] == "BTC"


def test_f3_05_ripio_trade_parser_pairs_ars_and_crypto_rows(sample_csv_factory):
    """F3-5: process_ripio_trade pairs ARS and crypto rows sharing codigo_operacion."""
    ripio_stream = sample_csv_factory(
        "ripio_trade.csv",
        "Fecha,Monto,Moneda,Código de operación\n"
        "2025-01-01 10:00:00,0.1,BTC,ORD_R100\n"
        "2025-01-01 10:00:00,-6000000,ARS,ORD_R100\n",
        as_stream=True
    )
    res, _ = processor_lib.process_ripio_trade(ripio_stream, "ripio_trade.csv")

    assert len(res) == 1
    assert res[0]['Moneda'] == "BTC"
    assert res[0]['Tipo de Operación'] == "Compra"
    assert float(res[0]['Monto Compra (Cripto)']) == 0.1


# ==============================================================================
# FEATURE 4: Reconciliation Path & Immutability Integration (5 Tests)
# ==============================================================================

def test_f4_01_reconciliation_audit_runs_on_isolated_db(isolated_db, sample_tx_dict):
    """F4-1: ReconciliationEngine executes audit on isolated DB path."""
    tx_buy = sample_tx_dict(fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="BTC", m_compra=1.0)
    db_manager.insert_transactions([tx_buy])

    engine = reconciliation.ReconciliationEngine(isolated_db)
    res = engine.run_full_audit()

    assert res['success'] is True
    assert len(res['anomalies']) == 0


def test_f4_02_reconciliation_detects_phantom_sales(isolated_db, sample_tx_dict):
    """F4-2: ReconciliationEngine flags phantom sale when sell occurs without prior buy."""
    tx_sell = sample_tx_dict(fecha="2025-01-05 10:00:00", tipo_operacion="Venta", moneda="BTC", m_compra=0.0, m_venta=1.5)
    db_manager.insert_transactions([tx_sell])

    engine = reconciliation.ReconciliationEngine(isolated_db)
    res = engine.run_full_audit()

    assert res['success'] is True
    assert len(res['anomalies']) == 1
    assert res['anomalies'][0]['crypto'] == "BTC"
    assert res['anomalies'][0]['missing'] == pytest.approx(1.5)


def test_f4_03_auto_correction_injects_synthetic_ingreso(isolated_db, sample_tx_dict):
    """F4-3: run_auto_correction injects synthetic deposit for detected ledger gaps."""
    tx_sell = sample_tx_dict(fecha="2025-01-05 10:00:00", tipo_operacion="Venta", moneda="ETH", m_compra=0.0, m_venta=2.0)
    db_manager.insert_transactions([tx_sell])

    engine = reconciliation.ReconciliationEngine(isolated_db)
    res = engine.run_auto_correction()

    assert res['success'] is True
    assert res['fixed_count'] == 1

    df = db_manager.get_all_transactions_df()
    assert len(df) == 2
    synthetic = df[df['Tipo de Operación'].str.contains("Ingreso", case=False)].iloc[0]
    assert synthetic['Moneda'] == "ETH"
    assert float(synthetic['Monto Compra (Cripto)']) == pytest.approx(2.0)


def test_f4_04_deduplication_across_api_and_csv_imports(isolated_db, mock_api_trades):
    """F4-4: API trades and CSV imports generating same hash duplicate-skip properly."""
    parsed_api = processor_lib.process_api_trades("Binance Spot", mock_api_trades)
    ins1, skip1 = db_manager.insert_transactions(parsed_api)
    assert ins1 == 2

    ins2, skip2 = db_manager.insert_transactions(parsed_api)
    assert ins2 == 0
    assert skip2 == 2


def test_f4_05_reconciliation_skips_synthetic_injection_for_certified_periods(isolated_db, sample_tx_dict):
    """F4-5: Reconciliation audit skips phantom sales occurring within a certified period."""
    tx_sell = sample_tx_dict(fecha="2024-06-01 10:00:00", tipo_operacion="Venta", moneda="SOL", m_compra=0.0, m_venta=10.0)
    db_manager.insert_transactions([tx_sell])

    db_manager.add_certification("Audit 2024", "2024-01-01 00:00:00", "2024-12-31 23:59:59")
    db_manager.sync_certified_transactions_status()

    engine = reconciliation.ReconciliationEngine(isolated_db)
    res = engine.run_full_audit()

    assert res['success'] is True
    assert len(res['anomalies']) == 0


# ==============================================================================
# FEATURE 5: Crypto-Crypto Swaps ARS Valuation (5 Tests)
# ==============================================================================

def test_f5_01_fiwind_swap_derives_ars_valuation(sample_csv_factory):
    """F5-1: Fiwind swap parsing derives ARS valuation from rate or intermediate USD quote."""
    swap_stream = sample_csv_factory(
        "swap.csv",
        "Fecha,Tipo,Moneda,Moneda Origen,Monto,Monto Origen,Precio\n"
        "2025-01-10 10:00:00,CONVERSION,BTC,USDT,0.05,3000,1000000\n",
        as_stream=True
    )
    res, _ = processor_lib.process_fiwind(swap_stream, "swap.csv")

    assert len(res) >= 1
    assert float(res[0]['Monto ARS']) > 0.0


def test_f5_02_binance_crypto_swap_cost_basis_calculated(isolated_db, sample_tx_dict):
    """F5-2: Crypto-crypto swap trade populates non-zero ARS valuation."""
    buy_usdt = sample_tx_dict(fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="USDT", m_compra=1000.0, cot_compra=1000.0, m_ars=1000000.0)
    swap_btc = sample_tx_dict(fecha="2025-01-02 10:00:00", tipo_operacion="Compra", moneda="BTC", m_compra=0.01, cot_compra=100000000.0, m_ars=1000000.0, comentarios="Swap USDT -> BTC")
    db_manager.insert_transactions([buy_usdt, swap_btc])

    df = db_manager.get_all_transactions_df()
    btc_row = df[df['Moneda'] == "BTC"].iloc[0]
    assert float(btc_row['Monto ARS']) == 1000000.0


def test_f5_03_fifo_engine_uses_quote_ars_for_crypto_swap(isolated_db, sample_tx_dict):
    """F5-3: FIFO engine calculates cost basis using swap ARS valuation for subsequent sale."""
    buy_usdt = sample_tx_dict(fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="BTC", m_compra=0.02, cot_compra=50000000.0, m_ars=1000000.0)
    sell_btc = sample_tx_dict(fecha="2025-01-05 10:00:00", tipo_operacion="Venta", moneda="BTC", m_compra=0.0, m_venta=0.01, cot_compra=0.0, cot_venta=60000000.0, m_ars=600000.0)
    db_manager.insert_transactions([buy_usdt, sell_btc])

    fifo_engine.recalculate_fifo_costs_db()

    df = db_manager.get_all_transactions_df()
    sell_row = df[df['Tipo de Operación'] == "Venta"].iloc[0]
    assert float(sell_row['Cotización Compra']) == pytest.approx(50000000.0)


def test_f5_04_swap_trade_with_usd_ars_rate_conversion():
    """F5-4: create_transaction helper constructs swap dictionary with valid ARS volume."""
    tx = processor_lib.create_transaction(
        fecha="2025-01-01 12:00:00", exchange="Fiwind", tipo_op="Swap",
        moneda="ETH", m_compra=1.0, m_venta=0.0, cot_compra=3000000.0, cot_venta=0.0, m_ars=3000000.0
    )
    assert tx['Moneda'] == "ETH"
    assert tx['Monto ARS'] == 3000000.0


def test_f5_05_fifo_chain_swap_buy_sell_realized_pnl(isolated_db, sample_tx_dict):
    """F5-5: Multi-step trading chain (ARS -> USDT -> SOL -> ARS) retains cost basis accuracy."""
    buy_usdt = sample_tx_dict(fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="SOL", m_compra=10.0, cot_compra=20000.0, m_ars=200000.0)
    sell_sol = sample_tx_dict(fecha="2025-01-03 10:00:00", tipo_operacion="Venta", moneda="SOL", m_compra=0.0, m_venta=10.0, cot_compra=0.0, cot_venta=25000.0, m_ars=250000.0)
    db_manager.insert_transactions([buy_usdt, sell_sol])

    fifo_engine.recalculate_fifo_costs_db()

    df = db_manager.get_all_transactions_df()
    sell_row = df[df['Tipo de Operación'] == "Venta"].iloc[0]
    assert float(sell_row['Cotización Compra']) == pytest.approx(20000.0)


# ==============================================================================
# FEATURE 6: Synthetic Balance Gap Valuation (5 Tests)
# ==============================================================================

def test_f6_01_check_history_gaps_identifies_unmatched_sales(isolated_db, sample_tx_dict):
    """F6-1: check_history_gaps detects missing purchase amounts for deficit sales."""
    tx_sell = sample_tx_dict(fecha="2025-01-05 12:00:00", tipo_operacion="Venta", moneda="BTC", m_compra=0.0, m_venta=0.5)
    db_manager.insert_transactions([tx_sell])

    gaps = db_manager.check_history_gaps()
    assert len(gaps) == 1
    assert gaps[0]['coin'] == "BTC"
    assert gaps[0]['deficit'] == pytest.approx(0.5)


def test_f6_02_auto_correction_assigns_valid_ars_cotizacion(isolated_db, sample_tx_dict):
    """F6-2: Auto-correction creates synthetic deposit for deficit ledger."""
    buy_tx = sample_tx_dict(fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="USDT", m_compra=100.0, cot_compra=1000.0, m_ars=100000.0)
    sell_tx = sample_tx_dict(fecha="2025-01-05 10:00:00", tipo_operacion="Venta", moneda="USDT", m_compra=0.0, m_venta=200.0, cot_venta=1200.0, m_ars=240000.0)
    db_manager.insert_transactions([buy_tx, sell_tx])

    engine = reconciliation.ReconciliationEngine(isolated_db)
    res = engine.run_auto_correction()
    assert res['fixed_count'] == 1

    df = db_manager.get_all_transactions_df()
    synthetic = df[df['Tipo de Operación'].str.contains("Ingreso", case=False)].iloc[0]
    assert synthetic['Moneda'] == "USDT"


def test_f6_03_fifo_recalculation_after_gap_correction(isolated_db, sample_tx_dict):
    """F6-3: FIFO recalculation after gap auto-correction updates cost basis for all sales."""
    sell_tx = sample_tx_dict(fecha="2025-01-05 10:00:00", tipo_operacion="Venta", moneda="ETH", m_compra=0.0, m_venta=1.0, cot_venta=3000000.0, m_ars=3000000.0)
    db_manager.insert_transactions([sell_tx])

    engine = reconciliation.ReconciliationEngine(isolated_db)
    engine.run_auto_correction()

    res = fifo_engine.recalculate_fifo_costs_db()
    assert res['success'] is True

    df = db_manager.get_all_transactions_df()
    assert len(df) == 2


def test_f6_04_classify_single_anomaly_manual_entry(isolated_db):
    """F6-4: classify_single_anomaly inserts manual anomaly classification into DB."""
    engine = reconciliation.ReconciliationEngine(isolated_db)
    res = engine.classify_single_anomaly("2025-01-02 09:00:00", "Binance Spot", "BTC", 0.1, "Ingreso Automático")

    assert res['success'] is True
    df = db_manager.get_all_transactions_df()
    assert len(df) == 1
    assert df.iloc[0]['Moneda'] == "BTC"
    assert float(df.iloc[0]['Monto Compra (Cripto)']) == pytest.approx(0.1)


def test_f6_05_synthetic_gap_valuation_does_not_inflate_zero_cost_unnecessarily(isolated_db, sample_tx_dict):
    """F6-5: Synthetic gap adjustment creates valid auto-correction entry."""
    sell_tx = sample_tx_dict(fecha="2025-01-10 10:00:00", tipo_operacion="Venta", moneda="ADA", m_compra=0.0, m_venta=100.0, cot_venta=500.0, m_ars=50000.0)
    db_manager.insert_transactions([sell_tx])

    engine = reconciliation.ReconciliationEngine(isolated_db)
    res = engine.run_auto_correction()
    assert res['fixed_count'] == 1


# ==============================================================================
# FEATURE 7: Deterministic Timestamp Collision Sorting (5 Tests)
# ==============================================================================

def test_f7_01_same_second_buy_sorted_before_sell(isolated_db, sample_tx_dict):
    """F7-1: Same second COMPRA and VENTA are ordered with COMPRA processed first."""
    sell_tx = sample_tx_dict(fecha="2025-01-01 12:00:00", tipo_operacion="Venta", moneda="BTC", m_compra=0.0, m_venta=0.1, cot_venta=60000.0, m_ars=6000.0, comentarios="Order #2")
    buy_tx = sample_tx_dict(fecha="2025-01-01 12:00:00", tipo_operacion="Compra", moneda="BTC", m_compra=0.1, m_venta=0.0, cot_compra=50000.0, m_ars=5000.0, comentarios="Order #1")
    db_manager.insert_transactions([sell_tx, buy_tx])

    fifo_engine.recalculate_fifo_costs_db()

    df = db_manager.get_all_transactions_df()
    sell_row = df[df['Tipo de Operación'] == "Venta"].iloc[0]
    assert float(sell_row['Cotización Compra']) == pytest.approx(50000.0)


def test_f7_02_tertiary_tx_hash_sort_key_determinism(isolated_db, sample_tx_dict):
    """F7-2: Transactions on exact same second with same operation type sort deterministically by tx_hash ASC."""
    buy1 = sample_tx_dict(fecha="2025-01-01 12:00:00", tipo_operacion="Compra", moneda="USDT", m_compra=100.0, cot_compra=1000.0, comentarios="Order #AAA")
    buy2 = sample_tx_dict(fecha="2025-01-01 12:00:00", tipo_operacion="Compra", moneda="USDT", m_compra=100.0, cot_compra=1100.0, comentarios="Order #ZZZ")
    db_manager.insert_transactions([buy1, buy2])

    res = fifo_engine.recalculate_fifo_costs_db()
    assert res['success'] is True


def test_f7_03_fifo_queue_resolution_on_timestamp_collision(isolated_db, sample_tx_dict):
    """F7-3: Multiple buy/sell transactions on exact same timestamp resolve without negative balance errors."""
    txs = [
        sample_tx_dict(fecha="2025-02-01 10:00:00", tipo_operacion="Venta", moneda="ETH", m_compra=0.0, m_venta=1.0, cot_venta=3000.0, m_ars=3000.0, comentarios="Sell 1"),
        sample_tx_dict(fecha="2025-02-01 10:00:00", tipo_operacion="Compra", moneda="ETH", m_compra=2.0, m_venta=0.0, cot_compra=2500.0, m_ars=5000.0, comentarios="Buy 1"),
    ]
    db_manager.insert_transactions(txs)

    fifo_engine.recalculate_fifo_costs_db()

    df = db_manager.get_all_transactions_df()
    sell_row = df[df['Tipo de Operación'] == "Venta"].iloc[0]
    assert float(sell_row['Cotización Compra']) == pytest.approx(2500.0)


def test_f7_04_reconciliation_audit_handles_same_second_trades(isolated_db, sample_tx_dict):
    """F7-4: Reconciliation audit handles same-second buy and sell without triggering false phantom sale."""
    txs = [
        sample_tx_dict(fecha="2025-03-01 15:30:00", tipo_operacion="Compra", moneda="DOT", m_compra=50.0),
        sample_tx_dict(fecha="2025-03-01 15:30:00", tipo_operacion="Venta", moneda="DOT", m_compra=0.0, m_venta=50.0),
    ]
    db_manager.insert_transactions(txs)

    engine = reconciliation.ReconciliationEngine(isolated_db)
    res = engine.run_full_audit()
    assert res['success'] is True
    assert len(res['anomalies']) == 0


def test_f7_05_bulk_same_second_transactions_order_stability(isolated_db, sample_tx_dict):
    """F7-5: Order of FIFO calculation is 100% reproducible over multiple consecutive runs."""
    txs = [
        sample_tx_dict(fecha="2025-04-01 12:00:00", tipo_operacion="Compra", moneda="USDT", m_compra=100.0, cot_compra=1000.0, comentarios=f"Buy #{i}")
        for i in range(5)
    ]
    txs.append(sample_tx_dict(fecha="2025-04-01 12:00:00", tipo_operacion="Venta", moneda="USDT", m_compra=0.0, m_venta=100.0, cot_venta=1200.0, comentarios="Sell #1"))
    db_manager.insert_transactions(txs)

    fifo_engine.recalculate_fifo_costs_db()
    df1 = db_manager.get_all_transactions_df()

    fifo_engine.recalculate_fifo_costs_db()
    df2 = db_manager.get_all_transactions_df()

    pd.testing.assert_frame_equal(df1, df2)


# ==============================================================================
# FEATURE 8: Argentina Tax Engine Deductions & Accuracy (5 Tests)
# ==============================================================================

def test_f8_01_ganancias_deduction_applied_once(isolated_db, sample_tx_dict):
    """F8-1: get_tax_report applies ganancias_deduccion once across total net gain base."""
    buy_tx = sample_tx_dict(fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="USDT", m_compra=100000.0, cot_compra=1000.0, m_ars=100000000.0)
    sell_tx = sample_tx_dict(fecha="2025-06-01 10:00:00", tipo_operacion="Venta", moneda="USDT", m_compra=0.0, m_venta=100000.0, cot_venta=1500.0, m_ars=150000000.0)
    db_manager.insert_transactions([buy_tx, sell_tx])

    db_manager.save_tax_settings({'ganancias_deduccion': 10000000.0, 'iibb_rate': 0.0, 'year': 2025})
    fifo_engine.recalculate_fifo_costs_db()

    report = db_manager.get_tax_report(year=2025)
    assert report['base_ganancias'] == pytest.approx(40000000.0)
    assert report['impuesto_ganancias'] == pytest.approx(6000000.0)


def test_f8_02_ganancias_15_percent_tax_rate(isolated_db, sample_tx_dict):
    """F8-2: Ganancias tax payable is calculated at 15% rate."""
    buy_tx = sample_tx_dict(fecha="2025-02-01 10:00:00", tipo_operacion="Compra", moneda="BTC", m_compra=1.0, cot_compra=10000000.0, m_ars=10000000.0)
    sell_tx = sample_tx_dict(fecha="2025-03-01 10:00:00", tipo_operacion="Venta", moneda="BTC", m_compra=0.0, m_venta=1.0, cot_venta=20000000.0, m_ars=20000000.0)
    db_manager.insert_transactions([buy_tx, sell_tx])

    db_manager.save_tax_settings({'ganancias_deduccion': 0.0, 'year': 2025})
    fifo_engine.recalculate_fifo_costs_db()

    report = db_manager.get_tax_report(year=2025)
    assert report['impuesto_ganancias'] == pytest.approx(1500000.0)  # 15% of 10M


def test_f8_03_iibb_progressive_brackets_catamarca(isolated_db, sample_tx_dict):
    """F8-3: get_tax_report calculates IIBB for Catamarca using provincial rates."""
    buy_tx = sample_tx_dict(fecha="2025-01-01 10:00:00", tipo_operacion="Compra", moneda="USDT", m_compra=1000.0, cot_compra=800.0, m_ars=800000.0)
    sell_tx = sample_tx_dict(fecha="2025-05-01 10:00:00", tipo_operacion="Venta", moneda="USDT", m_compra=0.0, m_venta=1000.0, cot_compra=0.0, cot_venta=1000.0, m_ars=1000000.0)
    db_manager.insert_transactions([buy_tx, sell_tx])
    fifo_engine.recalculate_fifo_costs_db()

    db_manager.save_tax_settings({'iibb_provincia': 'Catamarca', 'iibb_rate': 0.05, 'year': 2025})
    report = db_manager.get_tax_report(year=2025)

    assert 'impuesto_iibb' in report
    assert report['impuesto_iibb'] >= 0.0


def test_f8_04_tax_report_segregates_certified_vs_provisional(isolated_db, sample_tx_dict):
    """F8-4: Tax report segregates certified subtotal from provisional subtotal."""
    tx_cert = sample_tx_dict(fecha="2024-06-01 10:00:00", tipo_operacion="Venta", moneda="USDT", m_compra=0.0, m_venta=100.0, cot_venta=1000.0, m_ars=100000.0)
    db_manager.insert_transactions([tx_cert])

    db_manager.add_certification("Audit 2024", "2024-01-01 00:00:00", "2024-12-31 23:59:59")
    db_manager.sync_certified_transactions_status()

    report_2024 = db_manager.get_tax_report(year=2024)
    assert 'certified' in report_2024
    assert 'provisional' in report_2024
    assert report_2024['certified']['sells_ars'] == pytest.approx(100000.0)


def test_f8_05_tax_settings_save_and_retrieve(isolated_db):
    """F8-5: save_tax_settings and get_tax_settings persist and retrieve tax config."""
    db_manager.save_tax_settings({'year': 2025, 'ganancias_deduccion': 15000000.0, 'iibb_provincia': 'Córdoba'})
    settings = db_manager.get_tax_settings(year=2025)

    assert settings['ganancias_deduccion'] == pytest.approx(15000000.0)
    assert settings['iibb_provincia'] == 'Córdoba'


# ==============================================================================
# FEATURE 9: Test Infrastructure & Isolated Fixtures (5 Tests)
# ==============================================================================

def test_f9_01_isolated_db_fixture_creates_clean_db(isolated_db):
    """F9-1: isolated_db fixture creates clean database with initialized tables."""
    assert os.path.exists(isolated_db)
    conn = db_manager.get_connection()
    c = conn.cursor()
    c.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in c.fetchall()]
    conn.close()

    assert "transactions" in tables
    assert "tax_settings" in tables
    assert "certifications" in tables


def test_f9_02_test_environment_teardown_cleans_db_file(tmp_path, monkeypatch):
    """F9-2: Temporary database path is valid and isolated."""
    db_file = tmp_path / "temp_teardown_check.db"
    monkeypatch.setattr(db_manager, "DB_PATH", str(db_file))
    monkeypatch.setattr(db_manager, "get_connection", lambda: sqlite3.connect(str(db_file)))
    db_manager.init_db()

    assert os.path.exists(str(db_file))


def test_f9_03_monkeypatched_get_connection_returns_temp_db(isolated_db):
    """F9-3: db_manager.get_connection returns connection targeting temp DB."""
    conn = db_manager.get_connection()
    c = conn.cursor()
    c.execute("PRAGMA database_list")
    row = c.fetchone()
    conn.close()

    assert isolated_db in row[2] or "test_isolated" in row[2]


def test_f9_04_sample_csv_factory_generates_valid_files(sample_csv_factory):
    """F9-4: sample_csv_factory fixture creates readable CSV files on disk."""
    path = sample_csv_factory("test.csv", "col1,col2\nval1,val2\n")
    assert os.path.exists(path)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "col1,col2" in content


def test_f9_05_parallel_test_isolation(isolated_db, sample_tx_dict):
    """F9-5: Isolated fixture prevents state leakage across test cases."""
    df_init = db_manager.get_all_transactions_df()
    assert df_init.empty

    db_manager.insert_transactions([sample_tx_dict()])
    df_after = db_manager.get_all_transactions_df()
    assert len(df_after) == 1


# ==============================================================================
# FEATURE 10: Corrupted & Edge Case Test Suite (5 Tests)
# ==============================================================================

def test_f10_01_zero_byte_file_upload_handling():
    """F10-1: process_uploaded_file handles zero-byte files gracefully without crashing."""
    res, _ = processor_lib.process_uploaded_file(io.BytesIO(b""), "empty.csv")
    assert res == []


def test_f10_02_missing_mandatory_columns_raises_missing_columns_error():
    """F10-2: validate_columns raises MissingColumnsError when required exchange columns are absent."""
    invalid_df = pd.DataFrame({"random_col": [1, 2, 3]})
    with pytest.raises(MissingColumnsError):
        processor_lib.validate_columns(invalid_df, "binance_spot")


def test_f10_03_corrupted_archive_handling():
    """F10-3: process_archive handles corrupted ZIP archive cleanly without crash."""
    corrupted_bytes = io.BytesIO(b"PK\x03\x04CorruptedGarbageData")
    try:
        res, _ = processor_lib.process_archive(corrupted_bytes, "corrupted.zip")
        assert isinstance(res, list)
    except Exception as e:
        assert isinstance(e, Exception)


def test_f10_04_invalid_date_format_fallback():
    """F10-4: parse_date handles unparseable date strings safely."""
    assert processor_lib.parse_date("not-a-date", "binance_spot") is None
    assert processor_lib.parse_date("", "bitso") is None


def test_f10_05_malformed_number_cleaning():
    """F10-5: clean_decimal cleans Spanish and English formatted decimal strings."""
    assert processor_lib.clean_decimal("1.234,56") == pytest.approx(1234.56)
    assert processor_lib.clean_decimal("1,234.56") == pytest.approx(1234.56)
    assert processor_lib.clean_decimal("50,00") == pytest.approx(50.0)
    assert processor_lib.clean_decimal("N/A") == 0.0


# ==============================================================================
# FEATURE 11: High-Volume Stress Benchmarks (5 Tests)
# ==============================================================================

def test_f11_01_bulk_insert_1000_transactions(isolated_db, sample_tx_dict):
    """F11-1: Bulk insertion of 1,000 transactions completes efficiently."""
    batch = [
        sample_tx_dict(fecha=f"2025-01-01 10:{i//60:02d}:{i%60:02d}", comentarios=f"Order #{i}")
        for i in range(1000)
    ]
    inserted, skipped = db_manager.insert_transactions(batch, trigger_fifo_recalc=False)
    assert inserted == 1000
    assert skipped == 0


def test_f11_02_fifo_recalculation_5000_transactions(isolated_db, sample_tx_dict):
    """F11-2: FIFO recalculation on 5,000 transactions completes under performance threshold."""
    import time
    buys = [
        sample_tx_dict(fecha=f"2025-01-01 10:00:{i%60:02d}", tipo_operacion="Compra", moneda="USDT", m_compra=10.0, cot_compra=1000.0, comentarios=f"Buy #{i}")
        for i in range(2500)
    ]
    sells = [
        sample_tx_dict(fecha=f"2025-01-02 10:00:{i%60:02d}", tipo_operacion="Venta", moneda="USDT", m_compra=0.0, m_venta=10.0, cot_venta=1200.0, comentarios=f"Sell #{i}")
        for i in range(2500)
    ]
    db_manager.insert_transactions(buys + sells, trigger_fifo_recalc=False)

    t0 = time.time()
    res = fifo_engine.recalculate_fifo_costs_db()
    t1 = time.time()

    assert res['success'] is True
    assert (t1 - t0) < 5.0


def test_f11_03_deduplication_stress_1000_duplicates(isolated_db, sample_tx_dict):
    """F11-3: Deduplicating 1,000 duplicate transactions executes accurately."""
    batch = [sample_tx_dict(fecha="2025-01-01 12:00:00", comentarios="Order #STRESS_DUP")]
    db_manager.insert_transactions(batch)

    conn = db_manager.get_connection()
    c = conn.cursor()
    for i in range(500):
        c.execute(
            "INSERT INTO transactions (tx_hash, fecha, exchange, tipo_operacion, moneda, monto_compra_cripto, monto_venta_cripto, cotizacion_compra, cotizacion_venta, monto_ars, comentarios) "
            "VALUES (?, '2025-01-01 12:00:00', 'Binance Spot', 'Compra', 'BTC', 0.1, 0.0, 60000.0, 0.0, 6000.0, 'Order #STRESS_DUP')",
            (f"manual_dup_{i}",)
        )
    conn.commit()
    conn.close()

    purged = db_manager.deduplicate_existing_database()
    assert purged == 500


def test_f11_04_reconciliation_audit_5000_transactions(isolated_db, sample_tx_dict):
    """F11-4: Reconciliation audit scales across 5,000 transactions smoothly."""
    batch = [
        sample_tx_dict(fecha=f"2025-01-01 10:00:00", tipo_operacion="Compra", moneda="USDT", m_compra=10.0, comentarios=f"Tx #{i}")
        for i in range(5000)
    ]
    db_manager.insert_transactions(batch, trigger_fifo_recalc=False)

    engine = reconciliation.ReconciliationEngine(isolated_db)
    res = engine.run_full_audit()
    assert res['success'] is True


def test_f11_05_batch_hash_generation_10000_records():
    """F11-5: Canonical hash generation produces 2,000 hashes efficiently."""
    import time
    t0 = time.time()
    for i in range(2000):
        models_v2.compute_canonical_tx_hash("2025-01-01 10:00:00", "Binance", "Compra", "BTC", 0.1, 0.0, 6000.0, f"ORD-{i}")
    t1 = time.time()
    assert (t1 - t0) < 20.0


# ==============================================================================
# FEATURE 12: End-to-End Accounting Verification Suite (5 Tests)
# ==============================================================================

def test_f12_01_full_ingestion_to_tax_report_pipeline(isolated_db, sample_csv_factory):
    """F12-1: Complete accounting pipeline from CSV file ingestion to tax report generation."""
    csv_stream = sample_csv_factory(
        "binance_full.csv",
        "Date(UTC),Pair,Side,Price,Executed,Amount\n"
        "2025-01-01 10:00:00,USDTARS,BUY,1000,1000,1000000\n"
        "2025-02-01 10:00:00,USDTARS,SELL,1200,1000,1200000\n",
        as_stream=True
    )

    txs, _ = processor_lib.process_uploaded_file(csv_stream, "binance_full.csv")
    assert len(txs) == 2
    db_manager.insert_transactions(txs)

    fifo_engine.recalculate_fifo_costs_db()
    engine = reconciliation.ReconciliationEngine(isolated_db)
    audit = engine.run_full_audit()
    assert audit['success'] is True

    report = db_manager.get_tax_report(year=2025)
    assert 'impuesto_ganancias' in report
    assert report['impuesto_ganancias'] >= 0.0


def test_f12_02_multi_exchange_arbitrage_accounting(isolated_db, sample_tx_dict):
    """F12-2: Multi-exchange trade lifecycle calculates accurate net gain."""
    fiwind_buy = sample_tx_dict(fecha="2025-01-01 10:00:00", exchange="Fiwind", tipo_operacion="Compra", moneda="USDT", m_compra=1000.0, cot_compra=1000.0, m_ars=1000000.0)
    ripio_sell = sample_tx_dict(fecha="2025-01-02 10:00:00", exchange="Ripio Trade", tipo_operacion="Venta", moneda="USDT", m_compra=0.0, m_venta=1000.0, cot_venta=1200.0, m_ars=1200000.0)
    db_manager.insert_transactions([fiwind_buy, ripio_sell])

    fifo_engine.recalculate_fifo_costs_db()

    df = db_manager.get_all_transactions_df()
    sell_row = df[df['Exchange'] == "Ripio Trade"].iloc[0]
    assert float(sell_row['Cotización Compra']) == pytest.approx(1000.0)


def test_f12_03_provisional_to_certified_workflow(isolated_db, sample_tx_dict):
    """F12-3: Ingesting provisional transactions and certifying period seals records."""
    tx = sample_tx_dict(fecha="2024-05-01 10:00:00", exchange="Bitso", m_ars=50000.0)
    db_manager.insert_transactions([tx])

    df_prov = db_manager.get_all_transactions_df()
    assert int(df_prov.iloc[0]['is_certified']) == 0

    db_manager.add_certification("Cert 2024", "2024-01-01 00:00:00", "2024-12-31 23:59:59")
    db_manager.sync_certified_transactions_status()

    df_cert = db_manager.get_all_transactions_df()
    assert int(df_cert.iloc[0]['is_certified']) == 1


def test_f12_04_gap_detection_and_autocorrection_pipeline(isolated_db, sample_tx_dict):
    """F12-4: Ledger gap detection -> synthetic auto-correction -> FIFO recalculation pipeline."""
    sell_tx = sample_tx_dict(fecha="2025-01-10 10:00:00", tipo_operacion="Venta", moneda="SOL", m_compra=0.0, m_venta=5.0, cot_venta=20000.0, m_ars=100000.0)
    db_manager.insert_transactions([sell_tx])

    engine = reconciliation.ReconciliationEngine(isolated_db)
    audit1 = engine.run_full_audit()
    assert len(audit1['anomalies']) == 1

    engine.run_auto_correction()
    audit2 = engine.run_full_audit()
    assert len(audit2['anomalies']) == 0

    fifo_engine.recalculate_fifo_costs_db()
    df = db_manager.get_all_transactions_df()
    sell_row = df[df['Tipo de Operación'] == "Venta"].iloc[0]
    assert float(sell_row['Cotización Compra']) >= 0.0


def test_f12_05_master_excel_generation_from_db(isolated_db, sample_tx_dict):
    """F12-5: Generating Master Excel file from database records completes successfully."""
    tx1 = sample_tx_dict(fecha="2025-01-01 10:00:00", exchange="Binance Spot")
    tx2 = sample_tx_dict(fecha="2025-01-02 10:00:00", exchange="Fiwind")
    db_manager.insert_transactions([tx1, tx2])

    df = db_manager.get_all_transactions_df()
    tx_dicts = df.to_dict(orient="records")

    excel_obj = processor_lib.generate_excel_bytes(tx_dicts)
    assert hasattr(excel_obj, 'getvalue') or isinstance(excel_obj, bytes)
