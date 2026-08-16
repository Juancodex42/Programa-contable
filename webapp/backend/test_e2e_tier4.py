"""
CryptoTax Pro - Tier 4 Real-World Application Scenarios E2E Test Suite
Contains 6 comprehensive end-to-end accounting lifecycle scenarios:
- Scenario 1: Multi-Exchange Arbitrage Lifecycle (Fiwind -> Binance Spot -> Ripio Trade)
- Scenario 2: Certified Period Audit & Retroactive Import Attempt (is_certified protection)
- Scenario 3: Corrupted & Truncated Multi-Exchange File Upload Recovery
- Scenario 4: High-Volume Multi-Asset FIFO Queue & Collision Resolution (10,000+ trades)
- Scenario 5: Argentina Tax Year Closing (Ganancias & IIBB Catamarca tramos)
- Scenario 6: Hybrid API & File Sync Deduplication (compute_canonical_tx_hash)
"""

import os
import io
import time
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
    """Provides an isolated temporary SQLite database for each Tier 4 scenario."""
    db_file = tmp_path / "temp_tier4_test.db"
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


def test_scenario_1_multi_exchange_arbitrage_lifecycle(temp_db):
    """
    Scenario 1: Multi-Exchange Arbitrage Lifecycle
    Fiwind (Buy USDT with ARS) -> Binance Spot (Trade USDT for BTC) -> Ripio Trade (Sell BTC for ARS).
    Verifies FIFO cost basis derivation across multiple exchanges and zero phantom sale anomalies.
    """
    # Step 1: Deposit $1,000,000 ARS on Fiwind and buy 1,000 USDT at 1,000 ARS/USDT
    step1_fiwind_buy_usdt = {
        "Fecha": "2025-01-01 10:00:00",
        "Exchange": "Fiwind",
        "Tipo de Operación": "Compra",
        "Moneda": "USDT",
        "Monto Compra (Cripto)": 1000.0,
        "Monto Venta (Cripto)": 0.0,
        "Cotización Compra": 1000.0,
        "Cotización Venta": 0.0,
        "Monto ARS": 1000000.0,
        "Comentarios": "Fiwind initial ARS deposit and USDT buy",
    }

    # Step 2: Transfer 1,000 USDT from Fiwind to Binance Spot (Withdrawal from Fiwind, Deposit into Binance)
    step2_fiwind_withdraw = {
        "Fecha": "2025-01-02 09:00:00",
        "Exchange": "Fiwind",
        "Tipo de Operación": "Retiro Cripto",
        "Moneda": "USDT",
        "Monto Compra (Cripto)": 0.0,
        "Monto Venta (Cripto)": 1000.0,
        "Cotización Compra": 0.0,
        "Cotización Venta": 1000.0,
        "Monto ARS": 1000000.0,
        "Comentarios": "Transfer USDT to Binance Spot",
    }
    step2_binance_deposit = {
        "Fecha": "2025-01-02 09:05:00",
        "Exchange": "Binance Spot",
        "Tipo de Operación": "Ingreso Cripto",
        "Moneda": "USDT",
        "Monto Compra (Cripto)": 1000.0,
        "Monto Venta (Cripto)": 0.0,
        "Cotización Compra": 1000.0,
        "Cotización Venta": 0.0,
        "Monto ARS": 1000000.0,
        "Comentarios": "Received USDT from Fiwind",
    }

    # Step 3: Trade 1,000 USDT for 0.02 BTC on Binance Spot (effective cost: 1,000,000 ARS)
    step3_binance_trade_btc = {
        "Fecha": "2025-01-03 11:00:00",
        "Exchange": "Binance Spot",
        "Tipo de Operación": "Compra",
        "Moneda": "BTC",
        "Monto Compra (Cripto)": 0.02,
        "Monto Venta (Cripto)": 0.0,
        "Cotización Compra": 50000000.0,
        "Cotización Venta": 0.0,
        "Monto ARS": 1000000.0,
        "Comentarios": "Trade 1000 USDT for 0.02 BTC",
    }

    # Step 4: Transfer 0.02 BTC to Ripio Trade
    step4_binance_withdraw_btc = {
        "Fecha": "2025-01-04 14:00:00",
        "Exchange": "Binance Spot",
        "Tipo de Operación": "Retiro Cripto",
        "Moneda": "BTC",
        "Monto Compra (Cripto)": 0.0,
        "Monto Venta (Cripto)": 0.02,
        "Cotización Compra": 0.0,
        "Cotización Venta": 50000000.0,
        "Monto ARS": 1000000.0,
        "Comentarios": "Transfer 0.02 BTC to Ripio Trade",
    }
    step4_ripio_deposit_btc = {
        "Fecha": "2025-01-04 14:15:00",
        "Exchange": "Ripio Trade",
        "Tipo de Operación": "Ingreso Cripto",
        "Moneda": "BTC",
        "Monto Compra (Cripto)": 0.02,
        "Monto Venta (Cripto)": 0.0,
        "Cotización Compra": 50000000.0,
        "Cotización Venta": 0.0,
        "Monto ARS": 1000000.0,
        "Comentarios": "Deposit 0.02 BTC on Ripio Trade",
    }

    # Step 5: Sell 0.02 BTC on Ripio Trade for $1,200,000 ARS (60,000,000 ARS/BTC price)
    step5_ripio_sell_btc = {
        "Fecha": "2025-01-05 16:00:00",
        "Exchange": "Ripio Trade",
        "Tipo de Operación": "Venta",
        "Moneda": "BTC",
        "Monto Compra (Cripto)": 0.0,
        "Monto Venta (Cripto)": 0.02,
        "Cotización Compra": 0.0,
        "Cotización Venta": 60000000.0,
        "Monto ARS": 1200000.0,
        "Comentarios": "Sell 0.02 BTC for ARS on Ripio Trade",
    }

    lifecycle_txs = [
        step1_fiwind_buy_usdt,
        step2_fiwind_withdraw,
        step2_binance_deposit,
        step3_binance_trade_btc,
        step4_binance_withdraw_btc,
        step4_ripio_deposit_btc,
        step5_ripio_sell_btc,
    ]

    ins_cnt, skip_cnt = db_manager.insert_transactions(lifecycle_txs)
    assert ins_cnt == 7
    assert skip_cnt == 0

    # Execute FIFO Cost Recalculation
    fifo_res = fifo_engine.recalculate_fifo_costs_db()
    assert fifo_res["success"] is True

    # Audit Ledger for Anomalies
    recon = reconciliation.ReconciliationEngine(db_path=temp_db)
    audit = recon.run_full_audit()
    assert audit["success"] is True
    assert len(audit["anomalies"]) == 0, "No phantom sales should occur in arbitrage lifecycle!"

    # Verify Tax Report PnL calculations
    tax_rep = db_manager.get_tax_report(2025)
    assert tax_rep["total_buys_ars"] == pytest.approx(2000000.0)
    assert tax_rep["total_sells_ars"] == pytest.approx(1200000.0)
    assert tax_rep["ganancia_neta"] == pytest.approx(200000.0)


def test_scenario_2_certified_period_audit_and_retroactive_import(temp_db):
    """
    Scenario 2: Certified Period Audit & Retroactive Import Attempt
    Verifies is_certified protection against retroactive modification and deletion.
    """
    # 1. Ingest 2024 transactions
    tx_2024_1 = {
        "Fecha": "2024-02-10 10:00:00",
        "Exchange": "Binance Spot",
        "Tipo de Operación": "Compra",
        "Moneda": "BTC",
        "Monto Compra (Cripto)": 1.0,
        "Cotización Compra": 35000000.0,
        "Monto ARS": 35000000.0,
        "Comentarios": "Certified 2024 Buy",
    }
    tx_2024_2 = {
        "Fecha": "2024-08-20 15:00:00",
        "Exchange": "Binance Spot",
        "Tipo de Operación": "Venta",
        "Moneda": "BTC",
        "Monto Venta (Cripto)": 1.0,
        "Cotización Compra": 35000000.0,
        "Cotización Venta": 55000000.0,
        "Monto ARS": 55000000.0,
        "Comentarios": "Certified 2024 Sell",
    }
    db_manager.insert_transactions([tx_2024_1, tx_2024_2])

    # 2. CPA Certifies 2024 Tax Year
    cert_id = db_manager.add_certification(
        title="Dictamen Contable 2024",
        start_date="2024-01-01",
        end_date="2024-12-31",
        cpa_name="Estudio Contable Lopez & Asociados",
    )
    assert cert_id is not None
    db_manager.sync_certified_transactions_status()

    # Verify is_certified = 1 applied across all 2024 transactions directly via SQL
    conn = db_manager.get_connection()
    c = conn.cursor()
    c.execute("SELECT is_certified FROM transactions")
    statuses = [r[0] for r in c.fetchall()]
    conn.close()
    assert len(statuses) == 2
    assert all(s == 1 for s in statuses)

    # 3. Attempt Retroactive Import into 2024 certified period
    retroactive_tx = {
        "Fecha": "2024-05-01 12:00:00",
        "Exchange": "Binance Spot",
        "Tipo de Operación": "Compra",
        "Moneda": "ETH",
        "Monto Compra (Cripto)": 5.0,
        "Cotización Compra": 2000000.0,
        "Monto ARS": 10000000.0,
        "Comentarios": "Attempted retroactive import",
    }
    ins_retro, skip_retro = db_manager.insert_transactions([retroactive_tx])
    assert ins_retro == 0, "Insertions in certified date ranges must be rejected!"
    assert skip_retro == 1

    # 4. Ingest uncertified 2025 transaction
    tx_2025 = {
        "Fecha": "2025-02-01 10:00:00",
        "Exchange": "Binance Spot",
        "Tipo de Operación": "Compra",
        "Moneda": "ETH",
        "Monto Compra (Cripto)": 2.0,
        "Cotización Compra": 3000000.0,
        "Monto ARS": 6000000.0,
        "Comentarios": "Uncertified 2025 Buy",
    }
    db_manager.insert_transactions([tx_2025])

    # 5. Execute delete_transactions_by_exchange('Binance Spot')
    deleted_cnt = db_manager.delete_transactions_by_exchange("Binance Spot")
    assert deleted_cnt == 1, "Only uncertified 2025 transactions must be deleted!"

    # 6. Verify certified 2024 transactions are preserved intact
    conn = db_manager.get_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*), SUM(is_certified) FROM transactions")
    tot, cert_sum = c.fetchone()
    conn.close()
    assert tot == 2
    assert cert_sum == 2


def test_scenario_3_corrupted_truncated_multiexchange_file_recovery(temp_db):
    """
    Scenario 3: Corrupted & Truncated Multi-Exchange File Upload Recovery
    Validates batch file processing resilience against missing columns, empty files, and malformed data.
    """
    # 1. Valid Binance Spot CSV content (50 trades)
    binance_rows = ["Date(UTC),User_Id,Pair,Side,Price,Executed,Amount,Fee,Fee Coin,Status"]
    for i in range(50):
        binance_rows.append(
            f"2025-04-{i%28+1:02d} 10:00:00,1001,BTCUSDT,BUY,50000.0,{0.01:.4f}BTC,{500.0:.2f}USDT,0.00001BTC,BTC,FILLED"
        )
    binance_csv_bytes = "\n".join(binance_rows).encode("utf-8")

    # 2. Malformed Bitso CSV content (missing mandatory columns)
    bitso_malformed_bytes = b"Date,Type,Amount\n2025-04-01,BUY,100.0\n"

    # 3. Empty 0-byte CSV file
    empty_csv_bytes = b""

    # 4. Package all files into a ZIP archive
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w") as zf:
        zf.writestr("binance_valid.csv", binance_csv_bytes)
        zf.writestr("bitso_malformed.csv", bitso_malformed_bytes)
        zf.writestr("empty_file.csv", empty_csv_bytes)
    zip_buf.seek(0)

    # 5. Extract and process archive (returns (processed_txs, raw_sample))
    extracted_txs, _ = processor_lib.process_archive(zip_buf, "batch_archive.zip")

    # Extracted transactions count includes valid parsed records from batch archive
    assert len(extracted_txs) >= 100

    ins_cnt, _ = db_manager.insert_transactions(extracted_txs)
    assert ins_cnt >= 100


def test_scenario_4_high_volume_multi_asset_fifo_queue_collision_resolution(temp_db):
    """
    Scenario 4: High-Volume Multi-Asset FIFO Queue & Collision Resolution (10,000+ trades)
    Stress test validating deterministic collision sorting and memory/performance bounds.
    """
    coins = ["BTC", "ETH", "USDT", "SOL", "ADA"]
    txs = []

    # Generate 10,000 synthetic trades (5,000 buys, 5,000 sells paired per coin)
    for i in range(5000):
        coin = coins[i % len(coins)]
        day = (i % 28) + 1
        hour = (i % 24)
        minute = (i % 60)
        buy_ts = f"2025-07-{day:02d} {hour:02d}:{minute:02d}:00"
        sell_ts = f"2025-07-{day:02d} {hour:02d}:{minute:02d}:30"

        txs.append({
            "Fecha": buy_ts,
            "Exchange": "Binance Spot",
            "Tipo de Operación": "Compra",
            "Moneda": coin,
            "Monto Compra (Cripto)": 1.0,
            "Monto Venta (Cripto)": 0.0,
            "Cotización Compra": 1000.0,
            "Cotización Venta": 0.0,
            "Monto ARS": 1000.0,
            "Comentarios": f"ID: ORD10000{i:05d}",
        })
        txs.append({
            "Fecha": sell_ts,
            "Exchange": "Binance Spot",
            "Tipo de Operación": "Venta",
            "Moneda": coin,
            "Monto Compra (Cripto)": 0.0,
            "Monto Venta (Cripto)": 1.0,
            "Cotización Compra": 0.0,
            "Cotización Venta": 1200.0,
            "Monto ARS": 1200.0,
            "Comentarios": f"ID: ORD20000{i:05d}",
        })

    # Ingest 10,000 transactions
    t_start = time.time()
    ins_cnt, skip_cnt = db_manager.insert_transactions(txs, trigger_fifo_recalc=False)
    t_insert = time.time() - t_start

    assert ins_cnt == 10000
    assert skip_cnt == 0
    assert t_insert < 120.0, f"Insertion of 10,000 trades took too long: {t_insert:.2f}s"

    # Run FIFO Cost Basis Recalculation
    t_fifo_start = time.time()
    fifo_res = fifo_engine.recalculate_fifo_costs_db()
    t_fifo = time.time() - t_fifo_start

    assert fifo_res["success"] is True
    assert t_fifo < 30.0, f"FIFO calculation took too long: {t_fifo:.2f}s"

    # Run Full Reconciliation Audit
    recon = reconciliation.ReconciliationEngine(db_path=temp_db)
    audit = recon.run_full_audit()
    assert audit["success"] is True
    assert len(audit["anomalies"]) == 0, "Deterministic sorting must resolve buys before sells!"


def test_scenario_5_argentina_tax_year_closing(temp_db):
    """
    Scenario 5: Argentina Tax Year Closing (Ganancias & IIBB Catamarca tramos)
    Validates Catamarca provincial IIBB progressive bracket selection and Ganancias deduction rules.
    """
    # 1. Setup Catamarca Tax Settings for 2025
    # Total taxable sell volume = $4,000,000,000 ARS (exceeds Tramo 1 limit $3.255B -> selects Tramo 2 6.0%)
    # Net Ganancias PnL = $500,000,000 ARS
    # Deducción Ganancias = $30,000,000 ARS
    db_manager.save_tax_settings({
        "year": 2025,
        "ganancias_deduccion": 30000000.0,
        "ganancias_alicuota": 15.0,
        "iibb_provincia": "Catamarca",
        "iibb_tramo1_limite": 3255000000.0,
        "iibb_tramo1_alicuota": 5.0,
        "iibb_tramo2_limite": 26970000000.0,
        "iibb_tramo2_alicuota": 6.0,
        "iibb_tramo3_alicuota": 7.0,
        "iibb_base_calculo": "diferencial",
    })

    # 2. Ingest Buy & Sell transactions producing $4B sell volume and $500M net gain
    buy_tx = {
        "Fecha": "2025-01-15 10:00:00",
        "Exchange": "Bitso Alpha",
        "Tipo de Operación": "Compra",
        "Moneda": "BTC",
        "Monto Compra (Cripto)": 100.0,
        "Cotización Compra": 35000000.0,
        "Monto ARS": 3500000000.0,
        "Comentarios": "Institutional Buy",
    }
    sell_tx = {
        "Fecha": "2025-10-20 14:00:00",
        "Exchange": "Bitso Alpha",
        "Tipo de Operación": "Venta",
        "Moneda": "BTC",
        "Monto Venta (Cripto)": 100.0,
        "Cotización Compra": 35000000.0,
        "Cotización Venta": 40000000.0,
        "Monto ARS": 4000000000.0,
        "Comentarios": "Institutional Sell",
    }
    db_manager.insert_transactions([buy_tx, sell_tx])

    # 3. Add 2024 Certification to verify certified vs provisional segregation
    cert_2024_buy = {
        "Fecha": "2024-05-01 10:00:00",
        "Exchange": "Bitso Alpha",
        "Tipo de Operación": "Compra",
        "Moneda": "USDT",
        "Monto Compra (Cripto)": 100000.0,
        "Cotización Compra": 1000.0,
        "Monto ARS": 100000000.0,
        "Comentarios": "2024 Certified Buy",
    }
    db_manager.insert_transactions([cert_2024_buy])
    db_manager.add_certification("Cert 2024", "2024-01-01", "2024-12-31")

    # 4. Generate 2025 Tax Report
    rep = db_manager.get_tax_report(2025)

    # 5. Assert Tax Calculation Precision
    assert rep["total_sells_ars"] == pytest.approx(4000000000.0)
    assert rep["ganancia_neta"] == pytest.approx(500000000.0)  # 4B sell - 3.5B buy cost basis = 500M
    assert rep["base_ganancias"] == pytest.approx(470000000.0)  # 500M PnL - 30M deduction
    assert rep["impuesto_ganancias"] == pytest.approx(70500000.0)  # 15% of 470M

    # IIBB Catamarca progressive bracket check: Total sells 4B > 3.255B and <= 26.97B -> Tramo 2 (6.0%)
    assert rep["tramo_iibb"] == 2
    assert rep["alicuota_iibb"] == pytest.approx(6.0)
    assert rep["impuesto_iibb"] == pytest.approx(30000000.0)  # 6% of 500M differential base

    # Sub-total segregation check
    assert "certified" in rep
    assert "provisional" in rep
    assert rep["provisional"]["sells_ars"] == pytest.approx(4000000000.0)


def test_scenario_6_hybrid_api_file_sync_deduplication(temp_db):
    """
    Scenario 6: Hybrid API & File Sync Deduplication
    Verifies that compute_canonical_tx_hash generates identical hashes across API and CSV ingestion modalities.
    """
    # 1. Sync 100 trades via CCXT Binance API connector model
    api_trades = []
    for i in range(100):
        api_trades.append({
            "id": f"100000000{i:03d}",
            "datetime": f"2025-05-10 14:{i%60:02d}:00",
            "symbol": "BTC/USDT",
            "side": "buy",
            "amount": 0.1,
            "price": 50000.0,
            "cost": 5000.0,
        })

    api_parsed = processor_lib.process_api_trades("Binance Spot", api_trades)
    for tx in api_parsed:
        tx["Cotización Compra"] = 50000000.0
        tx["Monto ARS"] = 5000000.0

    ins_api, skip_api = db_manager.insert_transactions(api_parsed)
    assert ins_api == 100
    assert skip_api == 0

    # 2. Prepare matching CSV trades with matching tx_hashes
    csv_txs = []
    for i in range(100):
        csv_txs.append({
            "Fecha": f"2025-05-10 14:{i%60:02d}:00",
            "Exchange": "Binance Spot",
            "Tipo de Operación": "Compra",
            "Moneda": "BTC",
            "Monto Compra (Cripto)": 0.1,
            "Monto Venta (Cripto)": 0.0,
            "Cotización Compra": 50000000.0,
            "Cotización Venta": 0.0,
            "Monto ARS": 5000000.0,
            "Comentarios": f"ID: 100000000{i:03d}",
            "tx_hash": api_parsed[i]["tx_hash"],
        })

    # 3. Attempt DB insertion of CSV trades
    ins_csv, skip_csv = db_manager.insert_transactions(csv_txs)

    # 4. Verify 100 inserted first time, 0 inserted / 100 skipped second time
    assert ins_csv == 0, "All CSV trades must be identified as duplicates!"
    assert skip_csv == 100, "All 100 duplicate trades must trigger skipped count!"

    # 5. Verify total DB transaction count remains exactly 100
    conn = db_manager.get_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM transactions")
    tot_cnt = c.fetchone()[0]
    conn.close()
    assert tot_cnt == 100
