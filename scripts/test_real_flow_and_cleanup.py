import os
import sys
import io
import pandas as pd
import sqlite3

# Ensure webapp/backend is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "webapp", "backend"))
sys.path.insert(0, backend_dir)

import processor_lib
import db_manager
from fifo_engine import recalculate_fifo_costs_db

def run_real_flow_test():
    print("=" * 60)
    print("INICIANDO PRUEBA REAL DE FLUJO DE CARGA Y FILTRO DE DUPLICADOS")
    print("=" * 60)

    # 0. Contar estado inicial de la base de datos
    conn = db_manager.get_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM transactions")
    initial_count = c.fetchone()[0]
    conn.close()
    print(f"Transacciones iniciales en DB: {initial_count}")

    # 1. Crear Excel Sintetico 1 (2 operaciones)
    df_synthetic1 = pd.DataFrame([
        {
            "Fecha": "2026-08-01 10:00:00",
            "Exchange": "Binance Spot",
            "Tipo de Operacion": "COMPRA",
            "Moneda": "BTC",
            "Monto Compra (Cripto)": 0.1,
            "Monto Venta (Cripto)": 0.0,
            "Cotizacion Compra": 60000.0,
            "Cotizacion Venta": 0.0,
            "Monto ARS": 6000.0,
            "Comentarios": "SINTETICO_TEST_99_A"
        },
        {
            "Fecha": "2026-08-02 15:00:00",
            "Exchange": "Binance Spot",
            "Tipo de Operacion": "VENTA",
            "Moneda": "BTC",
            "Monto Compra (Cripto)": 0.0,
            "Monto Venta (Cripto)": 0.05,
            "Cotizacion Compra": 60000.0,
            "Cotizacion Venta": 65000.0,
            "Monto ARS": 3250.0,
            "Comentarios": "SINTETICO_TEST_99_B"
        }
    ])

    excel_buffer1 = io.BytesIO()
    with pd.ExcelWriter(excel_buffer1, engine='openpyxl') as writer:
        df_synthetic1.to_excel(writer, index=False)
    excel_bytes1 = excel_buffer1.getvalue()

    # --- PRUEBA 1: PRIMERA CARGA DE ARCHIVO ---
    print("\n[PRUEBA 1] Carga Inicial de Excel Sintetico (2 registros)...")
    file_obj1 = io.BytesIO(excel_bytes1)
    processed_data1, _ = processor_lib.process_uploaded_file(file_obj1, "Prueba_Sintetica_1.xlsx")
    inserted1, skipped1 = db_manager.insert_transactions(processed_data1, trigger_fifo_recalc=True)
    print(f"   Resultados -> Insertadas: {inserted1} | Omitidas (Duplicadas): {skipped1}")
    assert inserted1 == 2, f"Se esperaban 2 insertadas, se obtuvieron {inserted1}"
    assert skipped1 == 0, f"Se esperaban 0 omitidas, se obtuvieron {skipped1}"
    print("   [OK] PRIMERA CARGA EXITOSA.")

    # --- PRUEBA 2: REPETIR EL MISMO ARCHIVO (FILTRO ANTI-DUPLICADOS) ---
    print("\n[PRUEBA 2] Re-envio del MISMO Excel (Proceso de Filtro Anti-Duplicados)...")
    file_obj2 = io.BytesIO(excel_bytes1)
    processed_data2, _ = processor_lib.process_uploaded_file(file_obj2, "Prueba_Sintetica_1.xlsx")
    inserted2, skipped2 = db_manager.insert_transactions(processed_data2, trigger_fifo_recalc=False)
    print(f"   Resultados -> Insertadas: {inserted2} | Omitidas (Duplicadas): {skipped2}")
    assert inserted2 == 0, f"Se esperaban 0 insertadas en duplicado, se obtuvieron {inserted2}"
    assert skipped2 == 2, f"Se esperaban 2 omitidas en duplicado, se obtuvieron {skipped2}"
    print("   [OK] FILTRO DE DUPLICADOS COMPLETO EXITOSO (0 duplicadas ingresadas).")

    # --- PRUEBA 3: ARCHIVO ACTUALIZADO CON PARTE REPETIDA Y 1 NUEVA ---
    print("\n[PRUEBA 3] Enviar Excel Actualizado (2 viejas + 1 nueva operacion)...")
    df_synthetic2 = pd.concat([
        df_synthetic1,
        pd.DataFrame([{
            "Fecha": "2026-08-03 18:00:00",
            "Exchange": "Binance Spot",
            "Tipo de Operacion": "COMPRA",
            "Moneda": "ETH",
            "Monto Compra (Cripto)": 1.0,
            "Monto Venta (Cripto)": 0.0,
            "Cotizacion Compra": 3000.0,
            "Cotizacion Venta": 0.0,
            "Monto ARS": 3000.0,
            "Comentarios": "SINTETICO_TEST_99_C"
        }])
    ], ignore_index=True)

    excel_buffer2 = io.BytesIO()
    with pd.ExcelWriter(excel_buffer2, engine='openpyxl') as writer:
        df_synthetic2.to_excel(writer, index=False)
    excel_bytes2 = excel_buffer2.getvalue()

    file_obj3 = io.BytesIO(excel_bytes2)
    processed_data3, _ = processor_lib.process_uploaded_file(file_obj3, "Prueba_Sintetica_2.xlsx")
    inserted3, skipped3 = db_manager.insert_transactions(processed_data3, trigger_fifo_recalc=True)
    print(f"   Resultados -> Insertadas: {inserted3} | Omitidas (Duplicadas): {skipped3}")
    assert inserted3 == 1, f"Se esperaba 1 insertada (la nueva), se obtuvieron {inserted3}"
    assert skipped3 == 2, f"Se esperaban 2 omitidas (las viejas), se obtuvieron {skipped3}"
    print("   [OK] GESTION DE ARCHIVOS PARCIALES EXITOSA.")

    # --- PRUEBA 4: LIMPIEZA ABSOLUTA DE BASE DE DATOS (SEGURIDAD) ---
    print("\n[LIMPIEZA DE SEGURIDAD] Eliminando todos los datos sinteticos de prueba...")
    conn = db_manager.get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM transactions WHERE comentarios LIKE '%SINTETICO_TEST_99%'")
    deleted_count = c.rowcount
    conn.commit()

    c.execute("SELECT COUNT(*) FROM transactions")
    final_count = c.fetchone()[0]
    conn.close()

    recalculate_fifo_costs_db()

    print(f"   Filas de prueba eliminadas: {deleted_count}")
    print(f"   Transacciones finales en DB: {final_count} (Igual a inicial: {initial_count})")
    assert final_count == initial_count, "Error: La cantidad final de filas en la DB no coincide con la inicial."
    print("   [OK] LIMPIEZA TOTAL VERIFICADA. La base de datos quedo 100% limpia sin residuos.")
    print("=" * 60)
    print("TODAS LAS PRUEBAS DE FLUJO Y LIMPIEZA COMPLETADAS CON EXITO")
    print("=" * 60)

if __name__ == "__main__":
    run_real_flow_test()
