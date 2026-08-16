import os
import sys
import io
import pandas as pd
import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import processor_lib

def test_bitso_csv_detection_and_parsing():
    """Test Bitso CSV files are properly detected as Bitso and output Bitso as Exchange."""
    csv_data = (
        "datetime,type,major,minor,amount,value,rate\n"
        "2025-05-10 14:00:00,buy,btc,ars,0.01,500000.0,50000000.0\n"
        "2025-05-11 15:30:00,sell,usdt,ars,100.0,120000.0,1200.0\n"
    )
    file_obj = io.BytesIO(csv_data.encode('utf-8'))
    
    # Filename without 'bitso' in the name to verify header-based detection
    records, sample = processor_lib.process_uploaded_file(file_obj, "mis_movimientos.csv")
    
    assert len(records) == 2, f"Expected 2 records, got {len(records)}"
    for r in records:
        assert r['Exchange'] in ['Bitso', 'Bitso Alpha', 'Bitso Trade'], f"Expected Bitso exchange, got {r['Exchange']}"
    
    assert records[0]['Tipo de Operación'] == 'Compra'
    assert records[0]['Moneda'] == 'BTC'
    assert records[1]['Tipo de Operación'] == 'Venta'
    assert records[1]['Moneda'] == 'USDT'

def test_bitso_excel_detection_and_parsing():
    """Test Bitso Excel files are properly detected as Bitso and output Bitso as Exchange."""
    df = pd.DataFrame([
        {'datetime': '2025-06-01 10:00:00', 'type': 'buy', 'major': 'USDT', 'minor': 'ARS', 'amount': 200, 'value': 240000, 'rate': 1200},
        {'datetime': '2025-06-02 11:00:00', 'type': 'sell', 'major': 'BTC', 'minor': 'ARS', 'amount': 0.05, 'value': 2500000, 'rate': 50000000}
    ])
    
    excel_io = io.BytesIO()
    with pd.ExcelWriter(excel_io, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    excel_io.seek(0)
    
    records, sample = processor_lib.process_uploaded_file(excel_io, "reporte_bitso.xlsx")
    
    assert len(records) == 2, f"Expected 2 records, got {len(records)}"
    for r in records:
        assert r['Exchange'] in ['Bitso', 'Bitso Alpha', 'Bitso Trade'], f"Expected Bitso exchange, got {r['Exchange']}"

def test_explicit_exchange_column_preservation():
    """Test generic or consolidated CSV/Excel files with an Exchange column preserve individual exchange names."""
    df = pd.DataFrame([
        {
            'Fecha': '2025-07-01 10:00:00',
            'Exchange': 'Bitso',
            'Tipo de Operación': 'Compra',
            'Moneda': 'USDT',
            'Monto Compra (Cripto)': 500,
            'Cotización Compra': 1200,
            'Monto ARS': 600000,
            'Comentarios': 'Importado Bitso'
        },
        {
            'Fecha': '2025-07-02 12:00:00',
            'Exchange': 'Fiwind',
            'Tipo de Operación': 'Venta',
            'Moneda': 'USDT',
            'Monto Venta (Cripto)': 300,
            'Cotización Venta': 1250,
            'Monto ARS': 375000,
            'Comentarios': 'Importado Fiwind'
        },
        {
            'Fecha': '2025-07-03 14:00:00',
            'Exchange': 'Ripio Trade',
            'Tipo de Operación': 'Compra',
            'Moneda': 'BTC',
            'Monto Compra (Cripto)': 0.01,
            'Cotización Compra': 50000000,
            'Monto ARS': 500000,
            'Comentarios': 'Importado Ripio'
        }
    ])
    
    excel_io = io.BytesIO()
    with pd.ExcelWriter(excel_io, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    excel_io.seek(0)
    
    records, sample = processor_lib.process_uploaded_file(excel_io, "Consolidado_Contador.xlsx")
    
    assert len(records) == 3, f"Expected 3 records, got {len(records)}"
    assert records[0]['Exchange'] == 'Bitso', f"Expected 'Bitso', got '{records[0]['Exchange']}'"
    assert records[1]['Exchange'] == 'Fiwind', f"Expected 'Fiwind', got '{records[1]['Exchange']}'"
    assert records[2]['Exchange'] == 'Ripio Trade', f"Expected 'Ripio Trade', got '{records[2]['Exchange']}'"

def test_process_binance_csv_respects_explicit_exchange():
    """Test that process_uploaded_file respects explicit exchange column if present."""
    csv_data = (
        "Fecha,Exchange,Tipo de Operacion,Moneda,Monto,Precio,Total\n"
        "2025-08-01 10:00:00,Bitso,Compra,USDT,100,1200,120000\n"
    )
    file_obj = io.BytesIO(csv_data.encode('utf-8'))
    
    records, sample = processor_lib.process_uploaded_file(file_obj, "binance_test.csv")
    assert len(records) == 1
    assert records[0]['Exchange'] == 'Bitso', f"Expected 'Bitso', got '{records[0]['Exchange']}'"

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
