import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db_manager
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

def test_binance_spot_real_fetch():
    print("=== PRUEBA REAL: FETCH DE OPERACIONES DE BINANCE SPOT ===")
    
    # 1. Estado de autenticación
    print("\n1. Estado de API Binance Spot:")
    status = run_async(api_manager.check_api_auth_single("binance"))
    print(f"  > Status: {status['status']} | Msg: {status['msg']}")
    if status['status'] != 'online':
        print("  > API no disponible, cancelando prueba de fetch.")
        return

    # 2. Fetch real de trades desde Binance
    print("\n2. Consultando operaciones reales desde la API de Binance Spot...")
    result = run_async(api_manager.fetch_binance_v2())
    
    success = result.get('success', False)
    data = result.get('data', [])
    error = result.get('error')
    anomalies = result.get('anomalies', [])
    
    print(f"  > Éxito: {success}")
    print(f"  > Total operaciones recibidas de la API: {len(data)}")
    print(f"  > Error (si aplica): {error}")
    print(f"  > Anomalías detectadas: {len(anomalies)}")
    
    if data:
        print(f"\n3. Muestra de las primeras 5 operaciones recibidas:")
        for i, trade in enumerate(data[:5]):
            d = trade.to_dict() if hasattr(trade, 'to_dict') else trade
            print(f"  [{i+1}] Fecha: {d.get('Fecha')} | Exchange: {d.get('Exchange')} | Tipo: {d.get('Tipo de Operación')} | Moneda: {d.get('Moneda')} | Monto ARS: {d.get('Monto ARS')}")
        
        # 4. Intentar insertar en DB
        print(f"\n4. Intentando guardar en la base de datos...")
        dict_list = [m.to_dict() if hasattr(m, 'to_dict') else m for m in data]
        inserted, skipped = db_manager.insert_transactions(dict_list, trigger_fifo_recalc=False)
        print(f"  > Insertadas: {inserted} | Duplicadas/Saltadas: {skipped}")
        
        # 5. Verificar que ahora existen en DB
        txs_in_db = db_manager.get_transactions(['Binance Spot'])
        print(f"\n5. Transacciones de Binance Spot ahora en DB: {len(txs_in_db)}")
        
        # 6. Intentar exportar el Excel con los datos de Binance Spot
        if txs_in_db:
            import processor_lib
            excel_io = processor_lib.generate_excel_bytes(txs_in_db)
            print(f"\n6. Excel generado para Binance Spot: {len(excel_io.getvalue())} bytes ✅")
        else:
            print("\n6. Sin datos para exportar (posiblemente todas fueron duplicadas).")
    else:
        print(f"\n  > La API no devolvió operaciones. Posibles causas:")
        print(f"     - Los pares configurados (ej. USDT/ARS, BTC/ARS) no tienen historial en esta cuenta.")
        print(f"     - Las operaciones ya fueron sincronizadas previamente (estado incremental).")
        print(f"     - Error en la llamada: {error}")
    
    print("\nPRUEBA COMPLETADA.")

if __name__ == "__main__":
    test_binance_spot_real_fetch()
