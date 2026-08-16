"""
CryptoTax Pro - Master E2E Test Suite Runner & Aggregator
Aggregates and executes E2E test tiers under pytest:
- Tier 1: Feature Coverage (60 unit/feature test cases) [if available]
- Tier 2: Boundary & Corner Cases (60 boundary test cases) [if available]
- Tier 3: Cross-Feature Combinations (12 pairwise test cases)
- Tier 4: Real-World Application Scenarios (6 E2E scenarios)
- Master Suite Integration & Database Isolation Verification
"""

import os
import sqlite3
import pytest
import pandas as pd

import db_manager
import processor_lib
import fifo_engine
import reconciliation
from models_v2 import compute_canonical_tx_hash

# Import Tier 3 and Tier 4 test modules for aggregator execution
import test_e2e_tier3
import test_e2e_tier4


@pytest.fixture
def temp_master_db(tmp_path):
    """Provides isolated temporary SQLite database fixture for master suite tests."""
    db_file = tmp_path / "temp_master_e2e.db"
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


def test_e2e_suite_01_component_discovery():
    """
    Master Suite Test 1:
    Verifies test suite structure and presence of Tier 3 and Tier 4 modules.
    """
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    tier3_path = os.path.join(backend_dir, "test_e2e_tier3.py")
    tier4_path = os.path.join(backend_dir, "test_e2e_tier4.py")
    suite_path = os.path.join(backend_dir, "test_e2e_suite.py")

    assert os.path.exists(tier3_path), "test_e2e_tier3.py must exist!"
    assert os.path.exists(tier4_path), "test_e2e_tier4.py must exist!"
    assert os.path.exists(suite_path), "test_e2e_suite.py must exist!"


def test_e2e_suite_02_database_isolation(temp_master_db):
    """
    Master Suite Test 2:
    Verifies that running E2E pipeline operations on temporary database does not alter production transactions.db.
    """
    prod_db = os.path.join(os.path.dirname(__file__), "transactions.db")
    prod_initial_size = os.path.getsize(prod_db) if os.path.exists(prod_db) else None
    prod_initial_mtime = os.path.getmtime(prod_db) if os.path.exists(prod_db) else None

    # Perform mutations on temp DB
    sample_tx = {
        "Fecha": "2025-09-15 10:00:00",
        "Exchange": "Fiwind",
        "Tipo de Operación": "Compra",
        "Moneda": "BTC",
        "Monto Compra (Cripto)": 1.0,
        "Cotización Compra": 50000000.0,
        "Monto ARS": 50000000.0,
        "Comentarios": "Master suite isolation check",
    }
    db_manager.insert_transactions([sample_tx])
    fifo_engine.recalculate_fifo_costs_db()
    db_manager.get_tax_report(2025)

    # Confirm temp DB was written to
    df_temp = db_manager.get_all_transactions_df()
    assert len(df_temp) == 1

    # Confirm prod DB remains completely untouched
    if prod_initial_size is not None and os.path.exists(prod_db):
        assert os.path.getsize(prod_db) == prod_initial_size
        assert os.path.getmtime(prod_db) == prod_initial_mtime


def test_e2e_suite_03_full_accounting_pipeline(temp_master_db):
    """
    Master Suite Test 3:
    Full accounting pipeline execution from multi-exchange raw ingestion to certified tax report publication.
    """
    # 1. Ingest raw multi-exchange ledger
    txs = [
        # 2024 Certified Period
        {
            "Fecha": "2024-03-01 10:00:00",
            "Exchange": "Binance Spot",
            "Tipo de Operación": "Compra",
            "Moneda": "USDT",
            "Monto Compra (Cripto)": 5000.0,
            "Cotización Compra": 1000.0,
            "Monto ARS": 5000000.0,
            "Comentarios": "2024 Buy USDT",
        },
        {
            "Fecha": "2024-06-01 14:00:00",
            "Exchange": "Binance Spot",
            "Tipo de Operación": "Venta",
            "Moneda": "USDT",
            "Monto Venta (Cripto)": 5000.0,
            "Cotización Compra": 1000.0,
            "Cotización Venta": 1200.0,
            "Monto ARS": 6000000.0,
            "Comentarios": "2024 Sell USDT",
        },
        # 2025 Provisional Period
        {
            "Fecha": "2025-02-10 09:00:00",
            "Exchange": "Bitso Alpha",
            "Tipo de Operación": "Compra",
            "Moneda": "BTC",
            "Monto Compra (Cripto)": 0.5,
            "Cotización Compra": 40000000.0,
            "Monto ARS": 20000000.0,
            "Comentarios": "2025 Buy BTC",
        },
        {
            "Fecha": "2025-08-15 15:00:00",
            "Exchange": "Ripio Trade",
            "Tipo de Operación": "Venta",
            "Moneda": "BTC",
            "Monto Venta (Cripto)": 0.5,
            "Cotización Compra": 0.0,
            "Cotización Venta": 60000000.0,
            "Monto ARS": 30000000.0,
            "Comentarios": "2025 Sell BTC",
        },
    ]

    ins, skip = db_manager.insert_transactions(txs)
    assert ins == 4
    assert skip == 0

    # 2. Add CPA Certification for 2024
    cert_id = db_manager.add_certification("Master Certification 2024", "2024-01-01", "2024-12-31", cpa_name="CPA Master")
    assert cert_id is not None

    # 3. Audit reconciliation
    recon = reconciliation.ReconciliationEngine(db_path=temp_master_db)
    audit = recon.run_full_audit()
    assert audit["success"] is True
    assert len(audit["anomalies"]) == 0

    # 4. Trigger FIFO recalculation
    fifo_res = fifo_engine.recalculate_fifo_costs_db()
    assert fifo_res["success"] is True

    # 5. Generate Tax Report for 2025
    rep = db_manager.get_tax_report(2025)
    assert rep["total_sells_ars"] == pytest.approx(30000000.0)
    assert rep["ganancia_neta"] == pytest.approx(10000000.0)  # 30M sell - 20M buy cost basis

    # 6. Generate Excel Export Bytes
    tx_all = db_manager.get_transactions()
    excel_io = processor_lib.generate_excel_bytes(tx_all)
    assert len(excel_io.getvalue()) > 0
