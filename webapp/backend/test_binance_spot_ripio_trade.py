import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db_manager
import processor_lib
import api_manager
import asyncio

def run_async(coro):
    try:
        return asyncio.run(coro)
    except Exception:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()

def test_binance_spot_and_ripio_trade():
    print("=== PRUEBA ESPECÍFICA: BINANCE SPOT Y RIPIO TRADE ===")
    
    selected = ['Binance Spot', 'Ripio Trade']
    
    # 1. Test API Auth / Sync for Binance Spot and Ripio Trade
    print("\n1. Verificando estado de conexión API:")
    binance_status = run_async(api_manager.check_api_auth_single("binance"))
    ripio_status = run_async(api_manager.check_api_auth_single("ripio_trade"))
    print(f"  > Binance Spot API Status: {binance_status}")
    print(f"  > Ripio Trade API Status: {ripio_status}")
    
    # 2. Consultar transacciones en DB para la combinación ['Binance Spot', 'Ripio Trade']
    print("\n2. Consultando transacciones acumuladas en DB para ['Binance Spot', 'Ripio Trade']:")
    txs = db_manager.get_transactions(selected)
    print(f"  > Total de registros encontrados: {len(txs)}")
    
    by_ex = {}
    for t in txs:
        ex = t.get('Exchange')
        by_ex[ex] = by_ex.get(ex, 0) + 1
    print(f"  > Desglose por exchange en el resultado: {by_ex}")
    
    # 3. Probar Generación del Libro Consolidado (Excel Maestro)
    print("\n3. Generando Libro Consolidado (Excel Maestro):")
    if txs:
        excel_io = processor_lib.generate_excel_bytes(txs)
        bytes_len = len(excel_io.getvalue())
        print(f"  > Libro Consolidado generado exitosamente: {bytes_len} bytes")
    else:
        print("  > No hay registros para esta combinación actualmente.")

    # 4. Probar Generación de Archivos Separados (ZIP)
    print("\n4. Generando Archivos Separados (ZIP):")
    import zipfile
    import io
    
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        by_exchange = {}
        for tx in txs:
            ex = tx.get('Exchange', 'Generic')
            if ex not in by_exchange:
                by_exchange[ex] = []
            by_exchange[ex].append(tx)
            
        for ex_name, ex_txs in by_exchange.items():
            clean_name = ex_name.replace(' ', '_')
            fname = f"Reporte_{clean_name}.xlsx"
            ex_excel = processor_lib.generate_excel_bytes(ex_txs)
            if ex_excel:
                zip_file.writestr(fname, ex_excel.getvalue())
                
    zip_size = len(zip_buffer.getvalue())
    print(f"  > Archivo ZIP generado exitosamente: {zip_size} bytes con {len(by_exchange)} planilla(s) adentro.")
    
    print("\nPRUEBA COMPLETADA EXITOSAMENTE!")

if __name__ == "__main__":
    test_binance_spot_and_ripio_trade()
