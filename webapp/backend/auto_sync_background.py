import os
import sys
import time
import asyncio
import psutil
from datetime import datetime

# Path adjustment for backend imports
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import db_manager
import api_manager

async def run_silent_background_sync():
    start_time = time.time()
    db_manager.init_db()
    
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Iniciando Sincronización Automática Silenciosa...")
    
    try:
        # Run concurrent exchange fetching
        result = await api_manager.fetch_all_v2()
        
        models = result.get("data", [])
        dict_list = [m.to_dict() for m in models]
        
        inserted, skipped = 0, 0
        if dict_list:
            inserted, skipped = db_manager.insert_transactions(dict_list)
            
        elapsed = time.time() - start_time
        process = psutil.Process(os.getpid())
        ram_usage_mb = process.memory_info().rss / (1024 * 1024)
        
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Sincronización finalizada exitosamente.")
        print(f" -> Transacciones Nuevas Insertadas: {inserted}")
        print(f" -> Transacciones Duplicadas Omitidas: {skipped}")
        print(f" -> Errores/Alertas de Llaves: {len(result.get('errors', []))}")
        print(f" -> Tiempo Total de Ejecución: {elapsed:.2f} segundos")
        print(f" -> Uso de Memoria RAM: {ram_usage_mb:.2f} MB")
        
        if result.get("errors"):
            print(" -> Detalle de Alertas:")
            for err in result.get("errors"):
                if err: print(f"    ⚠️ {err}")
                
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] ERROR crítico en sincronización: {e}")

if __name__ == "__main__":
    asyncio.run(run_silent_background_sync())
