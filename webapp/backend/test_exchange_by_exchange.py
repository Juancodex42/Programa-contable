import os
import sys
import io

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db_manager
import processor_lib

def test_exchanges_individually():
    print("=== VERIFICACIÓN INDIVIDUAL EXCHANGE POR EXCHANGE ===")
    
    all_exchanges = db_manager.get_all_exchanges()
    ex_names = [e['name'] for e in all_exchanges]
    
    print(f"Exchanges configurados en el sistema: {ex_names}\n")
    
    results_summary = []
    
    for name in ex_names:
        print(f"--- Probando Exchange: '{name}' ---")
        
        # 1. Obtener transacciones individuales desde DB
        txs = db_manager.get_transactions([name])
        count = len(txs)
        print(f"  > Transacciones encontradas en DB: {count}")
        
        # 2. Probar generación de Excel para este exchange
        if count > 0:
            try:
                excel_io = processor_lib.generate_excel_bytes(txs)
                bytes_size = len(excel_io.getvalue())
                print(f"  > Excel generado OK: {bytes_size} bytes")
                assert bytes_size > 0, f"Excel de {name} dio 0 bytes"
                results_summary.append({
                    "exchange": name,
                    "count": count,
                    "excel_ok": True,
                    "size_bytes": bytes_size,
                    "status": "CON DATOS Y EXPORTA OK"
                })
            except Exception as e:
                print(f"  > ERROR al generar Excel para {name}: {e}")
                results_summary.append({
                    "exchange": name,
                    "count": count,
                    "excel_ok": False,
                    "error": str(e),
                    "status": "ERROR EN EXCEL"
                })
        else:
            # Probar que cuando no hay operaciones (0 registros), el generador de Excel no crashea
            try:
                excel_io = processor_lib.generate_excel_bytes([])
                print("  > Excel con 0 datos manejado correctamente (None/Empty return)")
                results_summary.append({
                    "exchange": name,
                    "count": 0,
                    "excel_ok": True,
                    "size_bytes": 0,
                    "status": "SIN REGISTROS (Esperando sincronización/carga)"
                })
            except Exception as e:
                print(f"  > ERROR inesperado en 0 registros para {name}: {e}")
                results_summary.append({
                    "exchange": name,
                    "count": 0,
                    "excel_ok": False,
                    "error": str(e),
                    "status": "ERROR EN 0 REGISTROS"
                })
        print()

    print("=== RESUMEN FINAL POR EXCHANGE ===")
    print(f"{'EXCHANGE':<22} | {'CANT. REGISTROS':<16} | {'EXPORTACIÓN EXCEL':<20} | ESTADO")
    print("-" * 75)
    for r in results_summary:
        print(f"{r['exchange']:<22} | {r['count']:<16} | {str(r['excel_ok']):<20} | {r['status']}")

if __name__ == "__main__":
    test_exchanges_individually()
