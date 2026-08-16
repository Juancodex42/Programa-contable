import pytest
import sqlite3
import os
import io
import sys
import pandas as pd
from datetime import datetime

# Ensure webapp/backend is on sys.path
sys.path.insert(0, os.path.dirname(__file__))

import db_manager
import processor_lib
import reconciliation
import fifo_engine
import models_v2


@pytest.fixture
def isolated_db(tmp_path, monkeypatch):
    """
    Pytest fixture that initializes a temporary isolated SQLite database
    in tmp_path and monkeypatches db_manager.get_connection and db_manager.DB_PATH.
    Guarantees 100% isolation from production transactions.db.
    """
    db_file = tmp_path / "test_isolated_transactions.db"
    db_path_str = str(db_file)

    def _get_test_connection():
        conn = sqlite3.connect(db_path_str, timeout=30.0)
        try:
            conn.execute("PRAGMA busy_timeout = 30000;")
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
        except Exception:
            pass
        return conn

    monkeypatch.setattr(db_manager, "DB_PATH", db_path_str)
    monkeypatch.setattr(db_manager, "get_connection", _get_test_connection)

    # Initialize tables and schema
    db_manager.init_db()

    yield db_path_str

    # Teardown: ensure DB file can be cleaned up
    try:
        if os.path.exists(db_path_str):
            conn = sqlite3.connect(db_path_str)
            conn.close()
    except Exception:
        pass


@pytest.fixture
def sample_tx_dict():
    """
    Factory fixture to build valid transaction dictionaries.
    """
    def _builder(
        fecha="2025-01-15 12:00:00",
        exchange="Binance Spot",
        tipo_operacion="Compra",
        moneda="BTC",
        m_compra=0.1,
        m_venta=0.0,
        cot_compra=60000.0,
        cot_venta=0.0,
        m_ars=6000.0,
        comentarios="Order #1001"
    ):
        return {
            'Fecha': fecha,
            'Exchange': exchange,
            'Tipo de Operación': tipo_operacion,
            'Moneda': moneda,
            'Monto Compra (Cripto)': float(m_compra),
            'Monto Venta (Cripto)': float(m_venta),
            'Cotización Compra': float(cot_compra),
            'Cotización Venta': float(cot_venta),
            'Monto ARS': float(m_ars),
            'Comentarios': comentarios
        }
    return _builder


@pytest.fixture
def sample_csv_factory(tmp_path):
    """
    Factory fixture to create sample CSV files or BytesIO streams for testing exchange parsers.
    """
    def _create_csv(filename, content, as_stream=False):
        file_path = tmp_path / filename
        file_path.write_text(content, encoding='utf-8')
        if as_stream:
            return io.BytesIO(content.encode('utf-8'))
        return str(file_path)
    return _create_csv


@pytest.fixture
def sample_certified_range(isolated_db):
    """
    Helper fixture to inject a certified period into the database.
    """
    def _add_certification(title="Audit 2024", start_date="2024-01-01 00:00:00", end_date="2024-12-31 23:59:59", cpa_name="CPA Test"):
        cert_id = db_manager.add_certification(
            title=title,
            start_date=start_date,
            end_date=end_date,
            cpa_name=cpa_name,
            notes="Certified for testing"
        )
        db_manager.sync_certified_transactions_status()
        return cert_id
    return _add_certification


@pytest.fixture
def mock_api_trades():
    """
    Fixture providing mock CCXT/Exchange API trade responses.
    """
    return [
        {
            'id': 'trade_api_001',
            'datetime': '2025-02-01T10:30:00Z',
            'symbol': 'BTC/USDT',
            'side': 'buy',
            'price': 50000.0,
            'amount': 0.5,
            'cost': 25000.0,
            'info': {'orderId': 'ord_api_001'}
        },
        {
            'id': 'trade_api_002',
            'datetime': '2025-02-02T15:45:00Z',
            'symbol': 'BTC/USDT',
            'side': 'sell',
            'price': 55000.0,
            'amount': 0.2,
            'cost': 11000.0,
            'info': {'orderId': 'ord_api_002'}
        }
    ]
