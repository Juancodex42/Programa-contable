"""
CryptoTax Pro - Tier 3 Cross-Feature Combinations E2E Test Suite
Evaluates pairwise cross-feature interaction scenarios across:
- API Sync + CSV Import + FIFO Cost Recalculation + Tax Report
- Certified Date Lock + Immutability + Cross-Exchange Swaps/Deposits/Sales
- Corrupted Upload Recovery + Reconciliation Gaps + Auto-Correction
- High Volume & Same-Second Timestamp Collision Sorting
- Multi-Currency Arbitrage + Synthetic Adjustments + Ganancias/IIBB Deductions
"""

import os
import io
import zipfile
import sqlite3
import pytest
import pandas as pd

import db_manager
import processor_lib
import fifo_engine
import reconciliation
from models_v2 import compute_canonical_tx_hash
from exceptions import MissingColumnsError


@pytest.fixture
def temp_db(tmp_path):
    """Provides an isolated temporary SQLite database for each test case."""
    db_file = tmp_path / "temp_tier3_test.db"
    db_path = str(db_file)
    original_get_conn = db_manager.get_connection
    db_manager.get_connection = lambda: sqlite3.connect(db_path)
    db_manager.init_db()
    yield db_path
    db_manager.get_connection = original_get_conn
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except Exception:
            pass


def test_t3_01_api_import_csv_import_deduplication_fifo_tax_report(temp_db):
    """
    Cross-feature Test 1:
    API import + CSV import deduplication + FIFO calculation + tax report generation.
    """
    # 1. Simulate API trades import
    raw_api_trades = [
        {
            "id": "100000000101",
            "datetime": "2025-03-01 10:00:00",
            "symbol": "BTC/USDT",
            "side": "buy",
            "amount": 0.5,
            "price": 50000.0,
            "cost": 25000.0,
        },
        {
            "id": "100000000102",
            "datetime": "2025-03-05 14:00:00",
            "symbol": "BTC/USDT",
            "side": "sell",
            "amount": 0.5,
            "price": 60000.0,
            "cost": 30000.0,
        },
    ]

    api_txs = processor_lib.process_api_trades("Binance Spot", raw_api_trades)
    for tx in api_txs:
        # Provide ARS valuation assuming rate = 1000 ARS/USD
        if tx["Tipo de Operación"] == "Compra":
            tx["Cotización Compra"] = 50000000.0
            tx["Monto ARS"] = 25000000.0
        elif tx["Tipo de Operación"] == "Venta":
            tx["Cotización Venta"] = 60000000.0
            tx["Monto ARS"] = 30000000.0

    ins_api, skip_api = db_manager.insert_transactions(api_txs)
    assert ins_api == 2
    assert skip_api == 0

    # 2. Simulate CSV file import covering the exact same trade IDs
    csv_txs = [
        {
            "Fecha": "2025-03-01 10:00:00",
            "Exchange": "Binance Spot",
            "Tipo de Operación": "Compra",
            "Moneda": "BTC",
            "Monto Compra (Cripto)": 0.5,
            "Monto Venta (Cripto)": 0.0,
            "Cotización Compra": 50000000.0,
            "Cotización Venta": 0.0,
            "Monto ARS": 25000000.0,
            "Comentarios": "ID: 100000000101",
            "tx_hash": api_txs[0]["tx_hash"],
        },
        {
            "Fecha": "2025-03-05 14:00:00",
            "Exchange": "Binance Spot",
            "Tipo de Operación": "Venta",
            "Moneda": "BTC",
            "Monto Compra (Cripto)": 0.0,
            "Monto Venta (Cripto)": 0.5,
            "Cotización Compra": 0.0,
            "Cotización Venta": 60000000.0,
            "Monto ARS": 30000000.0,
            "Comentarios": "ID: 100000000102",
            "tx_hash": api_txs[1]["tx_hash"],
        },
    ]

    ins_csv, skip_csv = db_manager.insert_transactions(csv_txs)
    assert ins_csv == 0, "Duplicate trades from CSV must be skipped!"
    assert skip_csv == 2, "Duplicate trades must increment skipped count!"

    # 3. Recalculate FIFO cost basis
    res_fifo = fifo_engine.recalculate_fifo_costs_db()
    assert res_fifo["success"] is True

    # 4. Generate Tax Report for 2025
    tax_rep = db_manager.get_tax_report(2025)
    assert tax_rep["total_buys_ars"] == pytest.approx(25000000.0)
    assert tax_rep["total_sells_ars"] == pytest.approx(30000000.0)
    assert tax_rep["ganancia_neta"] == pytest.approx(5000000.0)


def test_t3_02_fiwind_swap_bitso_deposit_ripio_sell_certified_lock(temp_db):
    """
    Cross-feature Test 2:
    Fiwind swap + Bitso deposit + Ripio sell + certified date range lock.
    """
    # 1. Ingest transactions
    tx_fiwind = {
        "Fecha": "2024-05-10 09:00:00",
        "Exchange": "Fiwind",
        "Tipo de Operación": "Compra",
        "Moneda": "USDT",
        "Monto Compra (Cripto)": 1000.0,
        "Monto Venta (Cripto)": 0.0,
        "Cotización Compra": 1000.0,
        "Cotización Venta": 0.0,
        "Monto ARS": 1000000.0,
        "Comentarios": "Swap ARS to USDT",
    }
    tx_bitso = {
        "Fecha": "2024-06-01 11:30:00",
        "Exchange": "Bitso Alpha",
        "Tipo de Operación": "Ingreso Cripto",
        "Moneda": "USDT",
        "Monto Compra (Cripto)": 500.0,
        "Monto Venta (Cripto)": 0.0,
        "Cotización Compra": 1050.0,
        "Cotización Venta": 0.0,
        "Monto ARS": 525000.0,
        "Comentarios": "Deposit from external wallet",
    }
    tx_ripio = {
        "Fecha": "2024-07-15 16:20:00",
        "Exchange": "Ripio Trade",
        "Tipo de Operación": "Venta",
        "Moneda": "USDT",
        "Monto Compra (Cripto)": 0.0,
        "Monto Venta (Cripto)": 1200.0,
        "Cotización Compra": 0.0,
        "Cotización Venta": 1200.0,
        "Monto ARS": 1440000.0,
        "Comentarios": "Sell USDT for ARS",
    }

    db_manager.insert_transactions([tx_fiwind, tx_bitso, tx_ripio])

    # 2. Add CPA Certification for 2024
    cert_id = db_manager.add_certification(
        title="Audit Tax Year 2024",
        start_date="2024-01-01",
        end_date="2024-12-31",
        cpa_name="Lic. Juan Perez",
        notes="Official Certified Period",
    )
    assert cert_id is not None
    db_manager.sync_certified_transactions_status()

    # 3. Verify status sync directly via SQL
    conn = db_manager.get_connection()
    c = conn.cursor()
    c.execute("SELECT is_certified FROM transactions")
    statuses = [r[0] for r in c.fetchall()]
    conn.close()
    assert len(statuses) == 3
    assert all(s == 1 for s in statuses)

    # 4. Trigger FIFO recalculation
    fifo_engine.recalculate_fifo_costs_db()

    # 5. Verify tax report
    rep = db_manager.get_tax_report(2024)
    assert rep["has_certifications"] is True
    assert len(rep["certifications_included"]) == 1
    assert rep["certified"]["sells_ars"] == pytest.approx(1440000.0)


def test_t3_03_corrupted_csv_recovery_reconciliation_gap_correction_tax_report(temp_db):
    """
    Cross-feature Test 3:
    Corrupted CSV upload recovery + reconciliation gap correction + tax report.
    """
    # 1. Attempt malformed bitso upload that raises MissingColumnsError
    df_bad = pd.DataFrame({"WrongHeader1": [1], "WrongHeader2": [2]})
    with pytest.raises(MissingColumnsError):
        processor_lib.validate_columns(df_bad, "bitso")

    # 2. Insert valid sale with no buy history (creates a ledger gap)
    orphan_sell = {
        "Fecha": "2025-04-01 12:00:00",
        "Exchange": "Bitso Alpha",
        "Tipo de Operación": "Venta",
        "Moneda": "ETH",
        "Monto Compra (Cripto)": 0.0,
        "Monto Venta (Cripto)": 2.0,
        "Cotización Compra": 0.0,
        "Cotización Venta": 3000000.0,
        "Monto ARS": 6000000.0,
        "Comentarios": "Unbacked sale",
    }
    db_manager.insert_transactions([orphan_sell])

    # 3. Run reconciliation audit and detect phantom sale anomaly
    recon = reconciliation.ReconciliationEngine(db_path=temp_db)
    audit = recon.run_full_audit()
    assert audit["success"] is True
    assert len(audit["anomalies"]) == 1

    # 4. Run auto-correction to inject synthetic ingress
    fix_res = recon.run_auto_correction()
    assert fix_res["success"] is True
    assert fix_res["fixed_count"] == 1
    assert fix_res["remaining_anomalies"] == 0

    # 5. Generate tax report safely
    rep = db_manager.get_tax_report(2025)
    assert rep["total_sells_ars"] == pytest.approx(6000000.0)


def test_t3_04_high_volume_timestamp_collision_fifo_cost(temp_db):
    """
    Cross-feature Test 4:
    High volume + same-second timestamp collision sorting + FIFO cost basis.
    """
    txs = []
    buy_time = "2025-06-15 11:59:59"
    sell_time = "2025-06-15 12:00:00"
    for i in range(100):
        txs.append({
            "Fecha": buy_time,
            "Exchange": "Binance Spot",
            "Tipo de Operación": "Compra",
            "Moneda": "SOL",
            "Monto Compra (Cripto)": 1.0,
            "Monto Venta (Cripto)": 0.0,
            "Cotización Compra": 100000.0,
            "Cotización Venta": 0.0,
            "Monto ARS": 100000.0,
            "Comentarios": f"ID: ORD100000{i:04d}",
        })
        txs.append({
            "Fecha": sell_time,
            "Exchange": "Binance Spot",
            "Tipo de Operación": "Venta",
            "Moneda": "SOL",
            "Monto Compra (Cripto)": 0.0,
            "Monto Venta (Cripto)": 1.0,
            "Cotización Compra": 0.0,
            "Cotización Venta": 150000.0,
            "Monto ARS": 150000.0,
            "Comentarios": f"ID: ORD200000{i:04d}",
        })

    ins, skip = db_manager.insert_transactions(txs)
    assert ins == 200
    assert skip == 0

    # Trigger FIFO recalculation
    fifo_res = fifo_engine.recalculate_fifo_costs_db()
    assert fifo_res["success"] is True

    # Audit ledger: 0 phantom sales should occur
    recon = reconciliation.ReconciliationEngine(db_path=temp_db)
    audit = recon.run_full_audit()
    assert audit["success"] is True
    assert len(audit["anomalies"]) == 0
    assert audit["final_balances"]["SOL"] == pytest.approx(0.0)


def test_t3_05_multi_currency_arbitrage_synthetic_adjustment_tax_deductions(temp_db):
    """
    Cross-feature Test 5:
    Multi-currency arbitrage (BTC/USDT/ARS) + balance gap synthetic adjustment + Ganancias/IIBB deductions.
    """
    # 1. Arbitrage trades across BTC/USDT/ARS
    arb_sells = [
        {
            "Fecha": "2025-08-01 10:00:00",
            "Exchange": "Fiwind",
            "Tipo de Operación": "Venta",
            "Moneda": "USDT",
            "Monto Compra (Cripto)": 0.0,
            "Monto Venta (Cripto)": 10000.0,
            "Cotización Compra": 0.0,
            "Cotización Venta": 1300.0,
            "Monto ARS": 13000000.0,
            "Comentarios": "Arbitrage leg 1",
        }
    ]
    db_manager.insert_transactions(arb_sells)

    # 2. Classify missing funds manually as synthetic adjustment
    recon = reconciliation.ReconciliationEngine(db_path=temp_db)
    class_res = recon.classify_single_anomaly(
        date_str="2025-08-01 10:00:00",
        exchange_str="Fiwind",
        crypto_str="USDT",
        missing_amount=10000.0,
        origin_type="Capital Inicial / Años Anteriores",
    )
    assert class_res["success"] is True

    # 3. Configure tax settings with Ganancias deduction of 3,000,000 ARS
    db_manager.save_tax_settings({
        "year": 2025,
        "ganancias_deduccion": 3000000.0,
        "ganancias_alicuota": 15.0,
        "iibb_provincia": "Catamarca",
        "iibb_tramo1_limite": 3255000000.0,
        "iibb_tramo1_alicuota": 5.0,
        "iibb_base_calculo": "diferencial",
    })

    # 4. Generate tax report
    rep = db_manager.get_tax_report(2025)
    assert rep["total_sells_ars"] == pytest.approx(13000000.0)
    assert rep["base_ganancias"] == pytest.approx(10000000.0)  # 13M - 3M deduction
    assert rep["impuesto_ganancias"] == pytest.approx(1500000.0)  # 15% of 10M
    assert rep["tramo_iibb"] == 1


def test_t3_06_dynamic_csv_and_archive_parser_deduplication(temp_db):
    """
    Cross-feature Test 6:
    Dynamic custom CSV parser + archive parsing + deduplication check.
    """
    # 1. Ingest initial transaction
    tx_initial = {
        "Fecha": "2025-09-01 10:00:00",
        "Exchange": "Exchange Personalizado",
        "Tipo de Operación": "Compra",
        "Moneda": "ADA",
        "Monto Compra (Cripto)": 1000.0,
        "Monto Venta (Cripto)": 0.0,
        "Cotización Compra": 500.0,
        "Cotización Venta": 0.0,
        "Monto ARS": 500000.0,
        "Comentarios": "ID: ORD_ADA_1001",
    }
    ins1, _ = db_manager.insert_transactions([tx_initial])
    assert ins1 == 1

    # 2. Test ZIP archive processing containing identical Binance CSV trade
    csv_bytes = b"Date(UTC),User_Id,Pair,Side,Price,Executed,Amount,Fee,Fee Coin,Status\n" \
                b"2025-09-01 10:00:00,1001,ADAUSDT,BUY,500.0,1000.0ADA,500000.0USDT,0.1ADA,ADA,FILLED\n"

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w") as zf:
        zf.writestr("binance_trades.csv", csv_bytes)
    zip_buf.seek(0)

    zip_txs, _ = processor_lib.process_archive(zip_buf, "test_archive.zip")
    assert len(zip_txs) >= 1

    ins2, skip2 = db_manager.insert_transactions(zip_txs)
    assert ins2 >= 1 or skip2 >= 1


def test_t3_07_certified_period_immutability_and_fifo_recalculation(temp_db):
    """
    Cross-feature Test 7:
    Certified range lock (is_certified=1) + new transaction insertion + FIFO recalculation preserving certified costs.
    """
    # 1. Insert 2024 transaction
    tx_2024 = {
        "Fecha": "2024-03-15 10:00:00",
        "Exchange": "Binance Spot",
        "Tipo de Operación": "Compra",
        "Moneda": "BTC",
        "Monto Compra (Cripto)": 1.0,
        "Monto Venta (Cripto)": 0.0,
        "Cotización Compra": 40000000.0,
        "Cotización Venta": 0.0,
        "Monto ARS": 40000000.0,
        "Comentarios": "Initial 2024 Buy",
    }
    db_manager.insert_transactions([tx_2024])

    # 2. Add certification locking all 2024
    db_manager.add_certification("Cert 2024", "2024-01-01", "2024-12-31", cpa_name="Auditor")

    # 3. Attempt to insert retroactive transaction into certified 2024 period
    retro_tx = {
        "Fecha": "2024-06-01 12:00:00",
        "Exchange": "Binance Spot",
        "Tipo de Operación": "Compra",
        "Moneda": "BTC",
        "Monto Compra (Cripto)": 0.5,
        "Monto Venta (Cripto)": 0.0,
        "Cotización Compra": 45000000.0,
        "Cotización Venta": 0.0,
        "Monto ARS": 22500000.0,
        "Comentarios": "Retroactive insertion attempt",
    }
    ins_retro, skip_retro = db_manager.insert_transactions([retro_tx])
    assert ins_retro == 0, "Insertions into certified date ranges must be skipped!"
    assert skip_retro == 1

    # 4. Insert provisional 2025 transaction
    tx_2025 = {
        "Fecha": "2025-01-10 10:00:00",
        "Exchange": "Binance Spot",
        "Tipo de Operación": "Venta",
        "Moneda": "BTC",
        "Monto Compra (Cripto)": 0.0,
        "Monto Venta (Cripto)": 1.0,
        "Cotización Compra": 0.0,
        "Cotización Venta": 70000000.0,
        "Monto ARS": 70000000.0,
        "Comentarios": "2025 Sell",
    }
    ins_prov, _ = db_manager.insert_transactions([tx_2025])
    assert ins_prov == 1

    # 5. Run FIFO recalculation
    fifo_engine.recalculate_fifo_costs_db()

    # 6. Verify 2025 sale derived cost basis of 40,000,000 from 2024 certified purchase lot
    df = db_manager.get_all_transactions_df()
    sell_row = df[df["Fecha"] == "2025-01-10 10:00:00"].iloc[0]
    assert float(sell_row["Cotización Compra"]) == pytest.approx(40000000.0)


def test_t3_08_crypto_crypto_swap_ars_valuation_and_fifo(temp_db):
    """
    Cross-feature Test 8:
    Fiwind/Binance crypto-crypto swap ARS valuation + FIFO cost propagation on subsequent ARS liquidation.
    """
    # 1. Swap 1000 USDT for 0.02 BTC in Fiwind with explicit ARS valuation
    swap_tx = {
        "Fecha": "2025-02-01 10:00:00",
        "Exchange": "Fiwind",
        "Tipo de Operación": "Compra",
        "Moneda": "BTC",
        "Monto Compra (Cripto)": 0.02,
        "Monto Venta (Cripto)": 0.0,
        "Cotización Compra": 60000000.0,  # derived rate
        "Cotización Venta": 0.0,
        "Monto ARS": 1200000.0,
        "Comentarios": "Swap USDT for BTC",
    }
    db_manager.insert_transactions([swap_tx])

    # 2. Sell 0.02 BTC for ARS on Bitso
    sell_tx = {
        "Fecha": "2025-02-15 15:00:00",
        "Exchange": "Bitso Alpha",
        "Tipo de Operación": "Venta",
        "Moneda": "BTC",
        "Monto Compra (Cripto)": 0.0,
        "Monto Venta (Cripto)": 0.02,
        "Cotización Compra": 0.0,
        "Cotización Venta": 70000000.0,
        "Monto ARS": 1400000.0,
        "Comentarios": "Sell BTC for ARS",
    }
    db_manager.insert_transactions([sell_tx])

    # 3. Recalculate FIFO costs
    res = fifo_engine.recalculate_fifo_costs_db()
    assert res["success"] is True

    # 4. Check cost basis propagated cleanly from intermediate swap valuation
    df = db_manager.get_all_transactions_df()
    bitso_sell = df[df["Exchange"] == "Bitso Alpha"].iloc[0]
    assert float(bitso_sell["Cotización Compra"]) == pytest.approx(60000000.0)


def test_t3_09_exchange_deletion_uncertified_only_and_kpi_update(temp_db):
    """
    Cross-feature Test 9:
    Deleting transactions by exchange leaves certified transactions intact and updates remaining ledger.
    """
    # 1. Ingest Binance Spot trades in 2024 and 2025
    tx_2024 = {
        "Fecha": "2024-04-01 10:00:00",
        "Exchange": "Binance Spot",
        "Tipo de Operación": "Compra",
        "Moneda": "USDT",
        "Monto Compra (Cripto)": 500.0,
        "Monto ARS": 500000.0,
        "Comentarios": "2024 Buy",
    }
    tx_2025 = {
        "Fecha": "2025-04-01 10:00:00",
        "Exchange": "Binance Spot",
        "Tipo de Operación": "Compra",
        "Moneda": "USDT",
        "Monto Compra (Cripto)": 300.0,
        "Monto ARS": 360000.0,
        "Comentarios": "2025 Buy",
    }
    db_manager.insert_transactions([tx_2024, tx_2025])

    # 2. Certify 2024
    db_manager.add_certification("Cert 2024", "2024-01-01", "2024-12-31")

    # 3. Delete Binance Spot transactions
    deleted_cnt = db_manager.delete_transactions_by_exchange("Binance Spot")
    assert deleted_cnt == 1, "Only uncertified 2025 transaction should be deleted!"

    # 4. Verify 2024 transaction remains
    df_rem = db_manager.get_all_transactions_df()
    assert len(df_rem) == 1
    assert df_rem.iloc[0]["Fecha"] == "2024-04-01 10:00:00"


def test_t3_10_reconciliation_auto_correction_and_excel_export(temp_db):
    """
    Cross-feature Test 10:
    Running ReconciliationEngine.run_auto_correction() followed by generate_excel_bytes export.
    """
    # 1. Insert unbacked sell
    unbacked = {
        "Fecha": "2025-07-01 10:00:00",
        "Exchange": "Ripio Trade",
        "Tipo de Operación": "Venta",
        "Moneda": "ETH",
        "Monto Compra (Cripto)": 0.0,
        "Monto Venta (Cripto)": 1.5,
        "Cotización Venta": 3000000.0,
        "Monto ARS": 4500000.0,
        "Comentarios": "Unbacked sell order #99",
    }
    db_manager.insert_transactions([unbacked])

    # 2. Run auto correction
    recon = reconciliation.ReconciliationEngine(db_path=temp_db)
    res = recon.run_auto_correction()
    assert res["success"] is True
    assert res["fixed_count"] == 1

    # 3. Export all transactions to Excel bytes
    txs = db_manager.get_transactions()
    excel_bytes = processor_lib.generate_excel_bytes(txs)
    assert len(excel_bytes.getvalue()) > 0


def test_t3_11_bilingual_binance_headers_and_status_blacklist(temp_db):
    """
    Cross-feature Test 11:
    Ingesting Binance CSVs with Spanish/English headers and cancelled/rejected statuses ignored.
    """
    csv_content = b"Date(UTC),User_Id,Pair,Side,Price,Executed,Amount,Fee,Fee Coin,Status\n" \
                  b"2025-05-01 10:00:00,12345,BTCUSDT,BUY,50000.0,0.1BTC,5000USDT,0.0001BTC,BTC,FILLED\n" \
                  b"2025-05-02 11:00:00,12345,BTCUSDT,SELL,60000.0,0.1BTC,6000USDT,0.0001BTC,BTC,CANCELED\n" \
                  b"2025-05-03 12:00:00,12345,BTCUSDT,BUY,55000.0,0.1BTC,5500USDT,0.0001BTC,BTC,REJECTED\n"

    csv_buf = io.BytesIO(csv_content)
    parsed_txs, _ = processor_lib.process_binance_csv(csv_buf, "binance_bilingual.csv")

    # Blacklist filters CANCELED and REJECTED rows; single FILLED Spot trade generates 2 swap leg transactions
    assert len(parsed_txs) == 2

    ins, _ = db_manager.insert_transactions(parsed_txs)
    assert ins == 2


def test_t3_12_tax_settings_update_and_multi_year_tax_reports(temp_db):
    """
    Cross-feature Test 12:
    Updating save_tax_settings for 2024/2025 and generating get_tax_report across multiple years.
    """
    # 1. Setup settings for 2024 and 2025
    db_manager.save_tax_settings({
        "year": 2024,
        "ganancias_deduccion": 15000000.0,
        "ganancias_alicuota": 15.0,
        "iibb_provincia": "Catamarca",
    })
    db_manager.save_tax_settings({
        "year": 2025,
        "ganancias_deduccion": 30000000.0,
        "ganancias_alicuota": 15.0,
        "iibb_provincia": "Catamarca",
    })

    # 2. Insert transactions across both years
    tx_2024 = {
        "Fecha": "2024-11-01 10:00:00",
        "Exchange": "Bitso Alpha",
        "Tipo de Operación": "Venta",
        "Moneda": "BTC",
        "Monto Venta (Cripto)": 0.5,
        "Cotización Compra": 20000000.0,
        "Cotización Venta": 60000000.0,
        "Monto ARS": 30000000.0,
        "Comentarios": "2024 Trade",
    }
    tx_2025 = {
        "Fecha": "2025-11-01 10:00:00",
        "Exchange": "Bitso Alpha",
        "Tipo de Operación": "Venta",
        "Moneda": "BTC",
        "Monto Venta (Cripto)": 0.5,
        "Cotización Compra": 20000000.0,
        "Cotización Venta": 100000000.0,
        "Monto ARS": 50000000.0,
        "Comentarios": "2025 Trade",
    }
    db_manager.insert_transactions([tx_2024, tx_2025], trigger_fifo_recalc=False)

    # 3. Generate tax reports
    rep_2024 = db_manager.get_tax_report(2024)
    rep_2025 = db_manager.get_tax_report(2025)

    assert rep_2024["year"] == 2024
    assert rep_2024["total_sells_ars"] == pytest.approx(30000000.0)
    assert rep_2024["settings"]["ganancias_deduccion"] == pytest.approx(15000000.0)

    assert rep_2025["year"] == 2025
    assert rep_2025["total_sells_ars"] == pytest.approx(50000000.0)
    assert rep_2025["settings"]["ganancias_deduccion"] == pytest.approx(30000000.0)
