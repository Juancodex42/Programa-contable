from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import processor_lib
import api_manager
import db_manager
import config_manager
import pandas as pd
import io
import os

app = Flask(__name__)
CORS(app) # Enable CORS for generic localhost development

# Initialize DB on Startup
db_manager.init_db()

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})

import asyncio
import sys
import threading
import time as time_module

if sys.platform == 'win32':
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except Exception:
        pass

def run_async_safe(coro):
    """Executes a coroutine safely across operating systems and threads."""
    import sys
    if sys.platform == 'win32':
        try:
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        except Exception:
            pass
    try:
        return asyncio.run(coro)
    except Exception:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(coro)
        finally:
            try:
                loop.run_until_complete(loop.shutdown_asyncgens())
            except Exception:
                pass
            loop.close()

# --- STATUS CACHE (5-minute TTL) ---
_status_cache_data = {}
_status_cache_ts = 0
_status_cache_lock = threading.Lock()
_status_refreshing = False
_STATUS_TTL = 300

def _refresh_status_cache():
    global _status_cache_data, _status_cache_ts, _status_refreshing
    try:
        result = run_async_safe(api_manager.check_all_api_statuses_v2())
        with _status_cache_lock:
            _status_cache_data = result or {}
            _status_cache_ts = time_module.time()
    except Exception as e:
        print("Error refreshing status cache:", e)
    finally:
        with _status_cache_lock:
            _status_refreshing = False

@app.route('/api/status', methods=['GET'])
def get_api_status():
    global _status_refreshing
    from datetime import datetime
    now = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
    force = request.args.get('force', '').lower() in ('1', 'true')

    if force:
        # Forced refresh is always synchronous and bypasses the TTL check/lock
        _refresh_status_cache()
        with _status_cache_lock:
            cached = dict(_status_cache_data)
    else:
        with _status_cache_lock:
            age = time_module.time() - _status_cache_ts
            cached = dict(_status_cache_data)
            is_refreshing = _status_refreshing

        need_refresh = age > _STATUS_TTL or not cached

        if need_refresh and not is_refreshing:
            with _status_cache_lock:
                _status_refreshing = True
            if not cached:
                _refresh_status_cache()
                with _status_cache_lock:
                    cached = dict(_status_cache_data)
            else:
                # Stale cache — refresh in background, return stale data now
                threading.Thread(target=_refresh_status_cache, daemon=True).start()

    exchanges = db_manager.get_all_exchanges()
    res = {}
    for ex in exchanges:
        ex_id = ex['id']
        ex_name = ex['name']
        db_last_tx = db_manager.get_exchange_last_tx_date(ex_name)
        if ex_id in cached:
            res[ex_id] = {
                "status": cached[ex_id]["status"],
                "lastUpdate": cached[ex_id].get("lastUpdate") if (cached[ex_id].get("lastUpdate") and cached[ex_id].get("lastUpdate") != '-') else (db_last_tx if db_last_tx != '-' else '-'),
                "msg": cached[ex_id].get("msg", "")
            }
        else:
            last_up = db_last_tx if db_last_tx != '-' else (ex.get("lastUpdate") if ex.get("lastUpdate") != '-' else '-')
            res[ex_id] = {
                "status": ex.get("status", "online"),
                "lastUpdate": last_up,
                "msg": "CSV / Manual"
            }
    return jsonify(res)

@app.route('/api/exchanges', methods=['GET'])
def list_exchanges():
    return jsonify(db_manager.get_all_exchanges())

@app.route('/api/exchanges', methods=['POST'])
def create_exchange():
    data = request.json or {}
    name = data.get('name')
    if not name:
        return jsonify({"error": "El nombre del exchange es obligatorio"}), 400
    date_format = data.get('dateFormat', '%d/%m/%Y %H:%M:%S')
    mapping = data.get('mapping', {})
    res = db_manager.add_custom_exchange(name, date_format, mapping)
    return jsonify({"success": True, "exchange": res})

@app.route('/api/exchanges/<ex_id>/mapping', methods=['PUT'])
def update_exchange_mapping_route(ex_id):
    data = request.json or {}
    mapping = data.get('mapping', {})
    date_format = data.get('dateFormat', '%d/%m/%Y %H:%M:%S')
    db_manager.update_exchange_mapping(ex_id, mapping, date_format)
    return jsonify({"success": True})

@app.route('/api/exchanges/<ex_id>/apikeys', methods=['PUT'])
def update_exchange_apikeys_route(ex_id):
    data = request.json or {}
    api_keys = data.get('apiKeys', {})
    db_manager.update_exchange_apikeys(ex_id, api_keys)
    return jsonify({"success": True})

@app.route('/api/exchanges/<ex_id>', methods=['DELETE'])
def delete_exchange_route(ex_id):
    db_manager.delete_exchange(ex_id)
    return jsonify({"success": True})


import subprocess

@app.route('/api/scheduler/status', methods=['GET'])
def get_scheduler_status():
    try:
        cmd = ["schtasks", "/query", "/tn", "SistemaContable_AutoSync"]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0:
            output = res.stdout.lower()
            is_enabled = "deshabilitado" not in output and "disabled" not in output
            return jsonify({"exists": True, "enabled": is_enabled})
        return jsonify({"exists": False, "enabled": False})
    except Exception as e:
        return jsonify({"exists": False, "enabled": False, "error": str(e)})

@app.route('/api/scheduler/toggle', methods=['POST'])
def toggle_scheduler():
    data = request.json or {}
    enable = data.get('enabled', True)
    hour = data.get('hour', '20:00')
    frequency = data.get('frequency', 'daily')
    
    import re
    if not re.match(r'^\d{2}:\d{2}$', hour):
        hour = '20:00'
        
    if frequency not in ('daily', 'hourly', 'weekly'):
        frequency = 'daily'
        
    try:
        if enable:
            bg_script = os.path.join(os.path.dirname(__file__), "auto_sync_background.py")
            bg_log = os.path.join(os.path.dirname(__file__), "auto_sync.log")
            
            python_exe = sys.executable
            # Recreate task to overwrite parameters dynamically
            create_cmd = [
                "schtasks", "/create", "/sc", frequency, "/st", hour, 
                "/tn", "SistemaContable_AutoSync", 
                "/tr", f'"{python_exe}" "{bg_script}"', 
                "/f"
            ]
            res = subprocess.run(create_cmd, capture_output=True, text=True)
            if res.returncode != 0:
                err_text = res.stderr.lower()
                if any(k in err_text for k in ('denegado', 'denied', 'access', 'permis')):
                    return jsonify({"success": False, "error": "Acceso denegado. Ejecute la aplicación como Administrador en Windows para modificar el Programador de Tareas."}), 403
                return jsonify({"success": False, "error": f"Error schtasks ({res.returncode}): {res.stderr.strip()}"}), 400
            subprocess.run(["schtasks", "/change", "/tn", "SistemaContable_AutoSync", "/enable"], capture_output=True)
        else:
            cmd = ["schtasks", "/change", "/tn", "SistemaContable_AutoSync", "/disable"]
            res = subprocess.run(cmd, capture_output=True, text=True)
            
        return jsonify({"success": True, "enabled": enable, "hour": hour, "frequency": frequency})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500



from exceptions import MissingColumnsError

@app.route('/process', methods=['POST'])
def process_files():
    if 'files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400
        
    files = request.files.getlist('files')
    results = []
    warnings = []
    
    # Clear simulations if any
    
    total_tx = 0
    
    for file in files:
        filename = file.filename
        content = file.read() # Read once
        
        # Reset pointer for processing
        file_obj = io.BytesIO(content) 
        
        try:
            processed_data, raw_sample = processor_lib.process_uploaded_file(file_obj, filename)
            
            # Check for negative amounts or prices in parsed transactions
            for tx in processed_data:
                m_compra = float(tx.get('Monto Compra (Cripto)', 0.0) or 0.0)
                m_venta = float(tx.get('Monto Venta (Cripto)', 0.0) or 0.0)
                cot_compra = float(tx.get('Cotización Compra', 0.0) or 0.0)
                cot_venta = float(tx.get('Cotización Venta', 0.0) or 0.0)
                
                if m_compra < 0 or m_venta < 0 or cot_compra < 0 or cot_venta < 0:
                    warnings.append(f"El archivo {filename} contiene registros con montos o cotizaciones negativas. Esto generará inconsistencias.")
                    break
            
            # Save to DB (Defer FIFO recalculation during batch loop)
            inserted, skipped = db_manager.insert_transactions(processed_data, trigger_fifo_recalc=False)
            
            # [LOGIC FIX] Only count effectively inserted transactions
            total_tx += inserted
            
            results.append({
                'filename': filename,
                'count': len(processed_data),
                'inserted': inserted,
                'skipped': skipped,
                'processed_sample': processed_data[:5],
                'raw_sample': raw_sample
            })
        except MissingColumnsError as e:
            return jsonify({
                'error': 'missing_columns',
                'exchange': e.exchange,
                'missing': e.missing,
                'available': e.available,
                'filename': filename
            }), 400
        except Exception as e:
            print(f"Error processing {filename}: {e}")
            warnings.append(f"No se pudo procesar el archivo {filename}: {str(e)}")
            results.append({
                'filename': filename,
                'error': str(e),
                'count': 0
            })
            
    # Trigger single FIFO recalculation after batch upload completes
    if total_tx > 0:
        try:
            from fifo_engine import recalculate_fifo_costs_db
            recalculate_fifo_costs_db()
        except Exception as e:
            print(f"Error executing batch recalculate_fifo_costs_db: {e}")
            
    # Scan for database consistency gaps
    try:
        gaps = db_manager.check_history_gaps()
        if gaps:
            for gap in gaps:
                deficit_val = gap.get('deficit', gap.get('monto_deficit', 0.0))
                coin_val = gap.get('coin', gap.get('moneda', ''))
                date_val = gap.get('date', gap.get('fecha', ''))
                exch_val = gap.get('exchange', '')
                warnings.append(
                    f"Faltante detectado: Venta de {deficit_val:.4f} {coin_val} en {exch_val} el {date_val} sin compra previa registrada."
                )
    except Exception as e:
        print(f"Error checking gaps for warnings: {e}")
        
    return jsonify({
        'files': results, 
        'total_transactions': total_tx,
        'warnings': warnings
    })

@app.route('/download', methods=['POST'])
def download_excel():
    # New Logic: Download from DB based on filenames
    data = request.json or {}
    filenames = data.get('filenames', [])
    
    if not filenames:
        return jsonify({"error": "No filenames provided"}), 400
        
    # Fetch REAL data from DB
    all_tx_df = db_manager.get_all_transactions_df()
    
    if all_tx_df.empty:
        return jsonify({"error": "No processing history found for these files"}), 404
        
    # Filter by exchange if single exchange history is requested
    exchanges_to_keep = []
    for fname in filenames:
        if fname and fname.startswith("Historial_") and fname.endswith(".xlsx"):
            ex_name = fname[10:-5].replace("_", " ")
            exchanges_to_keep.append(ex_name)
    if exchanges_to_keep:
        # Note: in all_tx_df the column is renamed to 'Exchange'
        all_tx_df = all_tx_df[all_tx_df['Exchange'].isin(exchanges_to_keep)]
        
    if all_tx_df.empty:
        return jsonify({"error": "No data found for the selected exchange"}), 404

    excel_io = processor_lib.generate_excel_bytes(all_tx_df.to_dict(orient='records'))
    if not excel_io:
        return jsonify({"error": "No valid data to generate Excel"}), 400
        
    from datetime import datetime
    year = data.get('year', datetime.now().year)
    
    return send_file(
        excel_io, 
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=f'Certificacion_Ingresos_{year}_Completo.xlsx'
    )

@app.route('/api/reports/batch-generate', methods=['POST'])
def batch_generate():
    data = request.json
    exchanges = data.get('exchanges', [])
    date_start = data.get('dateStart')
    date_end = data.get('dateEnd')
    
    # FETCH REAL DATA FROM DB
    real_transactions = db_manager.get_transactions(exchanges, date_start, date_end)
    gaps = db_manager.check_history_gaps(exchanges, date_start, date_end)
            
    return jsonify({
        "status": "success",
        "count": len(real_transactions),
        "transactions": real_transactions,
        "gaps": gaps
    })

@app.route('/api/reports/gaps', methods=['GET'])
def get_all_gaps():
    gaps = db_manager.check_history_gaps()
    return jsonify({
        "status": "success",
        "gaps": gaps
    })

@app.route('/api/reports/preview-mapping', methods=['POST'])
def preview_mapping():
    data = request.json or {}
    exchanges_names = data.get('exchanges', [])
    date_start = data.get('dateStart')
    date_end = data.get('dateEnd')
    
    # Fetch connection statuses
    cached = dict(_status_cache_data)
    from datetime import datetime
    now = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
    
    all_ex = db_manager.get_all_exchanges()
    res = []
    
    import config_manager
    mappings = config_manager.load_config()
    
    for ex in all_ex:
        if ex['name'] not in exchanges_names:
            continue
            
        ex_id = ex['id']
        ex_name = ex['name']
        ex_type = ex['type']
        is_api = (ex_type == 'NATIVE_API')
        
        db_last_tx = db_manager.get_exchange_last_tx_date(ex_name)
        
        # Get status, lastUpdate, msg
        if ex_id in cached:
            status = cached[ex_id]["status"]
            last_update = cached[ex_id].get("lastUpdate") if (cached[ex_id].get("lastUpdate") and cached[ex_id].get("lastUpdate") != '-') else (db_last_tx if db_last_tx != '-' else '-')
            msg = cached[ex_id].get("msg", "")
        else:
            status = ex.get("status", "online")
            last_update = db_last_tx if db_last_tx != '-' else (ex.get("lastUpdate") if ex.get("lastUpdate") != '-' else '-')
            msg = "CSV / Manual"
            
        # Get transaction count in range
        txs = db_manager.get_transactions([ex_name], date_start, date_end)
        tx_count = len(txs)
        
        # Determine staleness relative to date_end
        is_stale = False
        if date_end and last_update != '-':
            try:
                date_part = last_update.split(' ')[0] # DD/MM/YYYY or YYYY-MM-DD
                parts = date_part.split('/')
                if len(parts) == 3:
                    iso_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
                else:
                    iso_date = date_part
                
                clean_date_end = str(date_end).split(' ')[0]
                if iso_date < clean_date_end:
                    is_stale = True
            except Exception:
                pass

        # Determine mapping schema
        mapping_schema = {}
        if ex_type == 'CUSTOM_CSV':
            mapping_schema = ex.get('mapping', {})
        elif ex_id in mappings:
            mapping_schema = mappings[ex_id].get('columns', {})
            
        # Calculate isReady
        if is_api:
            is_ready = (status == 'online')
        else:
            is_ready = (tx_count > 0 and not is_stale)
            
        res.append({
            "id": ex_id,
            "name": ex_name,
            "type": ex_type,
            "status": status,
            "lastUpdate": last_update,
            "msg": msg,
            "transactionCount": tx_count,
            "mapping": mapping_schema,
            "isApi": is_api,
            "isReady": is_ready,
            "isStale": is_stale
        })
        
    return jsonify(res)

@app.route('/api/history', methods=['GET'])
def get_history():
    history = db_manager.get_processing_history()
    
    def format_db_date(date_str):
        if not date_str or date_str == '-':
            return '-'
        try:
            dt_part = date_str.split(' ')[0]
            parts = dt_part.split('-')
            if len(parts) == 3:
                return f"{parts[2]}/{parts[1]}/{parts[0]}"
        except Exception:
            pass
        return date_str

    res = []
    for r in history:
        first = format_db_date(r.get('first_tx'))
        last = format_db_date(r.get('last_tx'))
        date_range = f"{first} a {last}" if first != '-' else "-"
        
        clean_name = r.get('exchange', 'Exchange').replace(' ', '_')
        filename = f"Historial_{clean_name}.xlsx"
        
        res.append({
            'exchange': r.get('exchange'),
            'count': r.get('count', 0),
            'filename': filename,
            'date_range': date_range
        })
    return jsonify(res)

@app.route('/api/sync', methods=['POST'])
def sync_apis():
    """
    Triggers fetching trades from configured APIs concurrently using api_manager (V2).
    Normalizes the data, saves to DB, and returns a summary.
    """
    result = run_async_safe(api_manager.fetch_all_v2()) or {}
        
    if not result.get("success") and not result.get("data"):
        return jsonify({"error": "All APIs failed", "details": result.get("errors")}), 500
        
    models = result.get("data", [])
    dict_list = [m.to_dict() for m in models]
    
    inserted, skipped = 0, 0
    if dict_list:
        inserted, skipped = db_manager.insert_transactions(dict_list)
        
    # Build details in the format expected by the frontend:
    # [{"exchange": "Binance", "count": X, "message": "Success"}]
    details_map = {}
    for m in models:
        ex_name = m.exchange
        details_map[ex_name] = details_map.get(ex_name, 0) + 1
        
    db_exchanges = db_manager.get_all_exchanges()
    exchange_display_names = {
        "Binance Spot": "Binance",
        "Bitso Alpha": "Bitso",
        "Ripio Trade": "Ripio Trade",
        "OKX": "OKX",
        "Bybit": "Bybit",
        "Bitget": "Bitget"
    }
    for ex in db_exchanges:
        ex_name = ex.get('name')
        if ex_name and ex_name not in exchange_display_names:
            exchange_display_names[ex_name] = ex_name
    
    results = []
    errors = result.get("errors", [])
    
    for internal_name, display_name in exchange_display_names.items():
        count = details_map.get(internal_name, 0)
        ex_err = ""
        for err in errors:
            if err and display_name.lower() in err.lower():
                ex_err = err
                break
        
        message = "Success" if count > 0 or not ex_err else api_manager._clean_api_error(ex_err)
        results.append({
            "exchange": display_name,
            "count": count,
            "message": message
        })
        
    return jsonify({
        "status": "success",
        "details": results,
        "total_inserted": inserted,
        "total_skipped": skipped
    })

@app.route('/api/reports/batch-download', methods=['POST'])
def batch_download():
    data = request.json or {}
    exchanges = data.get('exchanges', [])
    date_start = data.get('dateStart')
    date_end = data.get('dateEnd')
    export_format = data.get('format', 'consolidated')
    
    # FETCH REAL DATA FROM DB
    real_transactions = db_manager.get_transactions(exchanges, date_start, date_end)
    
    if not real_transactions:
         return jsonify({"error": "No valid data found for selected criteria"}), 404
         
    year = "Batch"
    if date_start and len(date_start) >= 4:
        year = date_start[:4]
        
    if export_format == 'separated':
        import zipfile
        import re
        
        # Group transactions by exchange
        by_exchange = {}
        for tx in real_transactions:
            ex = tx.get('Exchange', 'Generic')
            if ex not in by_exchange:
                by_exchange[ex] = []
            by_exchange[ex].append(tx)
            
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for ex_name, ex_txs in by_exchange.items():
                clean_name = re.sub(r'[^a-zA-Z0-9_]', '_', ex_name.replace(' ', '_'))
                excel_io = processor_lib.generate_master_excel(ex_txs)
                if excel_io:
                    zip_file.writestr(f"{clean_name}_Reporte_{year}.xlsx", excel_io.getvalue())
                    
        zip_buffer.seek(0)
        return send_file(
            zip_buffer, 
            mimetype='application/zip',
            as_attachment=True,
            download_name=f'Reporte_Consolidado_{year}.zip'
        )
    else:
        excel_io = processor_lib.generate_master_excel(real_transactions)
        
        if not excel_io:
             return jsonify({"error": "No valid data found for selected criteria"}), 404
             
        return send_file(
            excel_io, 
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'Reporte_Consolidado_{year}.xlsx'
        )

@app.route('/api/settings', methods=['GET'])
def get_settings():
    try:
        config = config_manager.load_config()
        return jsonify(config)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/settings', methods=['POST'])
def update_settings():
    try:
        data = request.json
        exchange = data.get('exchange')
        field = data.get('field')
        value = data.get('value')
        
        if config_manager.update_mapping(exchange, field, value):
            return jsonify({"status": "success"})
        else:
            return jsonify({"error": "Failed to update"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/env', methods=['GET'])
def get_env():
    keys = config_manager.get_env_keys()
    import copy
    masked_keys = copy.deepcopy(keys)
    # Mask secrets, passwords, passphrases and API keys for safety
    sensitive_words = ('SECRET', 'PASSWORD', 'PASSPHRASE', 'KEY')
    for k, v in masked_keys.items():
        if v and any(w in k.upper() for w in sensitive_words):
            if len(v) > 6:
                masked_keys[k] = v[:3] + "***" + v[-3:]
            else:
                masked_keys[k] = "***"
    return jsonify(masked_keys)

@app.route('/api/env', methods=['POST'])
def save_env():
    data = request.json
    try:
        # data should be dict like {"RIPIO_API_KEY": "xxx", "BINANCE_API_KEY": "yyy"}
        config_manager.set_env_keys(data)
        
        # Reload dotenv in api_manager 
        import api_manager
        from config_manager import ENV_FILE
        from dotenv import load_dotenv
        load_dotenv(dotenv_path=ENV_FILE, override=True)
        
        # Invalidate the status cache so subsequent status checks get fresh data
        with _status_cache_lock:
            global _status_cache_ts, _status_cache_data
            _status_cache_ts = 0
            _status_cache_data = {}
        
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- DASHBOARD STATS ENDPOINTS ---

@app.route('/api/stats/kpi', methods=['GET'])
def stats_kpi():
    start = request.args.get('start')
    end = request.args.get('end')
    exchanges = request.args.get('exchanges')
    return jsonify(db_manager.get_kpis(start, end, exchanges))

@app.route('/api/stats/daily_volume', methods=['GET'])
def stats_daily():
    start = request.args.get('start')
    end = request.args.get('end')
    exchanges = request.args.get('exchanges')
    return jsonify(db_manager.get_daily_volume(start, end, exchanges))

@app.route('/api/stats/exchange_distribution', methods=['GET'])
def stats_exchange():
    start = request.args.get('start')
    end = request.args.get('end')
    exchanges = request.args.get('exchanges')
    return jsonify(db_manager.get_exchange_distribution(start, end, exchanges))

@app.route('/api/stats/equity', methods=['GET'])
def stats_equity():
    start = request.args.get('start')
    end = request.args.get('end')
    exchanges = request.args.get('exchanges')
    interval = request.args.get('interval', 'daily')
    return jsonify(db_manager.get_equity_curve(start, end, exchanges, interval))

@app.route('/api/stats/spread', methods=['GET'])
def stats_spread():
    start = request.args.get('start')
    end = request.args.get('end')
    exchanges = request.args.get('exchanges')
    return jsonify(db_manager.get_modal_spread(start, end, exchanges))

@app.route('/api/stats/recalculate', methods=['POST'])
def stats_recalculate():
    try:
        from fifo_engine import recalculate_fifo_costs_db
        res = recalculate_fifo_costs_db()
        return jsonify(res)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/stats/available_exchanges', methods=['GET'])
def stats_available_exchanges():
    configured = [ex['name'] for ex in db_manager.get_all_exchanges()]
    history = db_manager.get_processing_history()
    from_history = [h['exchange'] for h in history if h.get('exchange')]
    all_exchanges = list(dict.fromkeys(configured + from_history))
    return jsonify(all_exchanges)

@app.route('/api/audit/classify_anomaly', methods=['POST'])
def classify_anomaly():
    data = request.json or {}
    date_str = data.get('date')
    exchange_str = data.get('exchange')
    crypto_str = data.get('crypto')
    missing_amount = data.get('missing')
    origin_type = data.get('origin_type', 'Capital Inicial / Años Anteriores')
    
    from reconciliation import ReconciliationEngine
    engine = ReconciliationEngine()
    result = engine.classify_single_anomaly(date_str, exchange_str, crypto_str, missing_amount, origin_type)
    return jsonify(result)

@app.route('/api/audit/reconciliation', methods=['GET'])
def get_reconciliation():
    try:
        from reconciliation import ReconciliationEngine
        engine = ReconciliationEngine()
        result = engine.run_full_audit()
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "anomalies": []}), 500


# --- TAX (IMP) ENDPOINTS ---

@app.route('/api/taxes/settings', methods=['GET'])
def get_tax_settings():
    from datetime import datetime
    year = request.args.get('year', datetime.now().year, type=int)
    return jsonify(db_manager.get_tax_settings(year))

@app.route('/api/taxes/settings', methods=['POST'])
def save_tax_settings():
    data = request.json or {}
    try:
        db_manager.save_tax_settings(data)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/taxes/report', methods=['GET'])
def get_tax_report():
    from datetime import datetime
    year = request.args.get('year', datetime.now().year, type=int)
    try:
        report = db_manager.get_tax_report(year)
        return jsonify(report)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- CERTIFICATIONS (CALENDARIO) ENDPOINTS ---

@app.route('/api/certifications', methods=['GET'])
def get_certifications_route():
    try:
        data = db_manager.get_certifications()
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/certifications', methods=['POST'])
def add_certification_route():
    try:
        title = request.form.get('title')
        start_date = request.form.get('start_date')
        end_date = request.form.get('end_date')
        issue_date = request.form.get('issue_date')
        cpa_name = request.form.get('cpa_name')
        notes = request.form.get('notes')

        if not title or not start_date or not end_date:
            json_body = request.get_json(silent=True) or {}
            title = title or json_body.get('title')
            start_date = start_date or json_body.get('start_date')
            end_date = end_date or json_body.get('end_date')
            issue_date = issue_date or json_body.get('issue_date')
            cpa_name = cpa_name or json_body.get('cpa_name')
            notes = notes or json_body.get('notes')

        if not title or not start_date or not end_date:
            return jsonify({"error": "Faltan campos obligatorios (título, fecha de inicio y fecha de fin)."}), 400

        file_path = None
        if 'file' in request.files:
            file = request.files['file']
            if file and file.filename != '':
                upload_dir = os.path.join(os.path.dirname(__file__), 'uploads', 'certifications')
                os.makedirs(upload_dir, exist_ok=True)
                file_filename = f"{int(time_module.time())}_{file.filename}"
                saved_path = os.path.join(upload_dir, file_filename)
                file.save(saved_path)
                file_path = f"uploads/certifications/{file_filename}"

        cert_id = db_manager.add_certification(
            title=title,
            start_date=start_date,
            end_date=end_date,
            issue_date=issue_date,
            cpa_name=cpa_name,
            notes=notes,
            file_path=file_path
        )

        cert = db_manager.get_certification_by_id(cert_id)
        return jsonify({"success": True, "certification": cert})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/certifications/<int:cert_id>', methods=['DELETE'])
def delete_certification_route(cert_id):
    try:
        cert = db_manager.get_certification_by_id(cert_id)
        if not cert:
            return jsonify({"error": "Certificado no encontrado."}), 404
        
        if cert.get('file_path'):
            full_path = os.path.join(os.path.dirname(__file__), cert['file_path'])
            if os.path.exists(full_path):
                try:
                    os.remove(full_path)
                except Exception:
                    pass

        db_manager.delete_certification(cert_id)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/certifications/download/<int:cert_id>', methods=['GET'])
def download_certification_file(cert_id):
    try:
        cert = db_manager.get_certification_by_id(cert_id)
        if not cert or not cert.get('file_path'):
            return jsonify({"error": "Archivo no encontrado"}), 404
        
        full_path = os.path.join(os.path.dirname(__file__), cert['file_path'])
        if not os.path.exists(full_path):
            return jsonify({"error": "El archivo adjunto no existe en el servidor."}), 404

        return send_file(full_path, as_attachment=True)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/certifications/parse_pdf', methods=['POST'])
def parse_certification_pdf():
    """Auto-detect start_date, end_date and CPA info from uploaded PDF/image file."""
    if 'file' not in request.files:
        return jsonify({"error": "No se envió ningún archivo."}), 400

    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({"error": "Archivo vacío o no válido."}), 400

    try:
        file_bytes = file.read()
        fname = request.form.get('filename') or file.filename
        extracted = extract_info_from_pdf_stream(file_bytes, filename=fname)
        return jsonify({"success": True, "extracted": extracted})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500




def _pdf_ocr_process_worker(args):
    file_bytes, p_idx = args
    try:
        import importlib
        fitz = importlib.import_module("fitz")
        rapid_mod = importlib.import_module("rapidocr_onnxruntime")
        import numpy as np

        if not hasattr(_pdf_ocr_process_worker, "engine"):
            _pdf_ocr_process_worker.engine = rapid_mod.RapidOCR(use_angle_cls=False, max_side_len=960)

        t_doc = fitz.open(stream=file_bytes, filetype="pdf")
        page = t_doc[p_idx]
        pix = page.get_pixmap(dpi=110, colorspace=fitz.csGRAY)
        img_np = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 1)

        res, _ = _pdf_ocr_process_worker.engine(img_np)
        p_lines = []
        if res:
            p_lines = [str(line[1]) for line in res if line and len(line) > 1 and line[1]]

        if not p_lines and (pix.width > pix.height):
            import PIL.Image as pil_img
            for angle in [90, 270]:
                try:
                    img_obj = pil_img.frombytes("L", (pix.width, pix.height), pix.samples).rotate(angle, expand=True)
                    rot_np = np.array(img_obj)
                    res_rot, _ = _pdf_ocr_process_worker.engine(rot_np)
                    if res_rot:
                        rot_lines = [str(l[1]) for l in res_rot if l and len(l) > 1 and l[1]]
                        if len(rot_lines) > len(p_lines):
                            p_lines = rot_lines
                            break
                except Exception:
                    pass

        t_doc.close()
        return (p_idx, "\n".join(p_lines) if p_lines else "")
    except Exception:
        return (p_idx, "")


def extract_info_from_pdf_stream(file_bytes, filename=None, progress_callback=None):
    import io, re, importlib
    from datetime import datetime

    pdf_text = ""

    if isinstance(file_bytes, bytes):
        if file_bytes.startswith(b'%PDF'):
            scanned_pages = []
            try:
                fitz_mod = importlib.import_module("fitz")
                doc = fitz_mod.open(stream=file_bytes, filetype="pdf")
                total_pages = len(doc)
                
                # Instant Vector Text Extraction
                for p_idx in range(total_pages):
                    page = doc[p_idx]
                    t = page.get_text()
                    if t and t.strip():
                        pdf_text += t + "\n"
                    else:
                        scanned_pages.append(p_idx)

                doc.close()

                # ONLY run OCR if vector text is missing or extremely sparse (< 50 chars)
                if len(pdf_text.strip()) < 50 and scanned_pages:
                    try:
                        import numpy as np
                        import PIL.Image as pil_img
                        import importlib
                        rapid_mod = importlib.import_module("rapidocr_onnxruntime")
                        
                        engine = rapid_mod.RapidOCR(use_angle_cls=True, max_side_len=1024)
                        
                        # Process key pages (first 6 and last 3) for fast 3-5s response time
                        target_pages = sorted(list(set(scanned_pages[:6] + scanned_pages[-3:])))
                        total_ocr = len(target_pages)

                        doc_ocr = fitz_mod.open(stream=file_bytes, filetype="pdf")
                        for idx_p, p_idx in enumerate(target_pages):
                            if progress_callback and total_ocr > 0:
                                try:
                                    progress_callback(idx_p + 1, total_ocr)
                                except Exception:
                                    pass
                            try:
                                p = doc_ocr[p_idx]
                                pix = p.get_pixmap(dpi=110, colorspace=fitz_mod.csGRAY)
                                img_np = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 1)
                                res, _ = engine(img_np)
                                p_lines = [str(line[1]) for line in res if line and len(line) > 1 and line[1]] if res else []
                                
                                # Horizontal / Landscape rotation fallback (90° and 270°)
                                if len(p_lines) < 2 and (pix.width > pix.height):
                                    img_obj = pil_img.frombytes("L", (pix.width, pix.height), pix.samples)
                                    for angle in [90, 270]:
                                        try:
                                            rot_np = np.array(img_obj.rotate(angle, expand=True))
                                            res_rot, _ = engine(rot_np)
                                            if res_rot:
                                                rot_lines = [str(l[1]) for l in res_rot if l and len(l) > 1 and l[1]]
                                                if len(rot_lines) > len(p_lines):
                                                    p_lines = rot_lines
                                                    break
                                        except Exception:
                                            pass
                                
                                if p_lines:
                                    pdf_text += "\n".join(p_lines) + "\n"
                            except Exception:
                                pass
                        doc_ocr.close()
                    except Exception as e:
                        print("Lightweight OCR fallback skipped:", e)
            except Exception as e:
                print("PyMuPDF (fitz) import/read skipped:", e)

            # Fallback 1: Try pypdf / PyPDF2 if available
            if not pdf_text.strip():
                try:
                    pypdf_mod = importlib.import_module("pypdf")
                    reader = pypdf_mod.PdfReader(io.BytesIO(file_bytes))
                    for p in reader.pages:
                        t = p.extract_text()
                        if t:
                            pdf_text += t + "\n"
                except Exception:
                    pass

            # Fallback 2: Pure Python raw PDF stream decompression & text literal extraction
            if not pdf_text.strip():
                try:
                    import zlib
                    for stream_match in re.finditer(b'stream\r?\n(.*?)\r?\nendstream', file_bytes, re.DOTALL):
                        sdata = stream_match.group(1)
                        try:
                            decomp = zlib.decompress(sdata)
                        except Exception:
                            decomp = sdata
                        txt_matches = re.findall(b'\(([^()\\]{2,})\)', decomp)
                        for tm in txt_matches:
                            try:
                                s = tm.decode('latin1', errors='ignore')
                                if len(s.strip()) > 2:
                                    pdf_text += s + " "
                            except Exception:
                                pass
                except Exception:
                    pass

        else:
            try:
                decoded = file_bytes.decode('utf-8', errors='ignore')
                if len(decoded.strip()) > 10:
                    pdf_text += decoded
            except Exception:
                pass
    elif isinstance(file_bytes, str):
        pdf_text += file_bytes

    text = pdf_text
    raw_text_for_cpa = text
    
    # Store filename text separately for fallback ONLY (do NOT mix into primary body text)
    filename_text = f"{filename}" if filename else ""

    extracted = {
        "start_date": None,
        "end_date": None,
        "issue_date": None,
        "cpa_name": None,
        "title": None,
        "detected_periods": [],
        "detection_source": "Sin datos detectados",
        "latest_tx_info": db_manager.get_latest_transaction_info(),
        "raw_snippet": text[:250] if text else ""
    }

    if not text and not filename_text:
        return extracted

    # US / LATAM Date Format Auto-Disambiguation Safeguard
    # Scans document for dates where second token > 12 (e.g. 11/26/2024 -> US MM/DD/YYYY)
    is_us_format = False
    full_scan_target = text + "\n" + filename_text
    for num_m in re.finditer(r'\b(\d{1,2})[/\-.](\d{1,2})[/\-.](20\d\d)\b', full_scan_target):
        p1, p2, yr = int(num_m.group(1)), int(num_m.group(2)), num_m.group(3)
        if p2 > 12 and p1 <= 12:
            is_us_format = True
            break

    def normalize_date_str(raw, is_start=True):
        if not raw:
            return None
        parts = re.split(r'[\s/\-.]+', raw.strip())
        if len(parts) >= 3:
            raw_p1, raw_p2, year = parts[0], parts[1], parts[2]
            if len(raw_p1) == 4 and len(year) <= 2:
                year, raw_p1 = raw_p1, year

            if is_us_format and int(raw_p1) <= 12 and int(raw_p2) <= 31:
                month, day = raw_p1.zfill(2), raw_p2.zfill(2)
            else:
                day, month = raw_p1.zfill(2), raw_p2.zfill(2)

            time_part = "00:00:00" if is_start else datetime.now().strftime('%H:%M:%S')
            if len(parts) >= 4:
                time_part = ":".join([p.zfill(2) for p in parts[3:]])
                if len(parts) == 4:
                    time_part += ":00"
            return f"{year}-{month}-{day} {time_part}"
        return None

    def normalize_full_timestamp(raw):
        if not raw:
            return None
        parts = raw.strip().split()
        if len(parts) != 2:
            return None
        d_part, t_part = parts[0], parts[1]
        d_sub = re.split(r'[/\-.]', d_part)
        if len(d_sub) == 3:
            if len(d_sub[0]) == 4:
                y, m, d = d_sub[0], d_sub[1].zfill(2), d_sub[2].zfill(2)
            else:
                raw_p1, raw_p2, y = d_sub[0], d_sub[1], d_sub[2]
                if is_us_format and int(raw_p1) <= 12 and int(raw_p2) <= 31:
                    m, d = raw_p1.zfill(2), raw_p2.zfill(2)
                else:
                    d, m = raw_p1.zfill(2), raw_p2.zfill(2)
            t_sub = t_part.split(':')
            hh = t_sub[0].zfill(2)
            mm = t_sub[1].zfill(2) if len(t_sub) > 1 else "00"
            ss = t_sub[2].zfill(2) if len(t_sub) > 2 else "00"
            return f"{y}-{m}-{d} {hh}:{mm}:{ss}"
        return None

    months_map = {
        'enero': '01', 'ener': '01',
        'febrero': '02', 'febrer': '02',
        'marzo': '03', 'marz': '03',
        'abril': '04',
        'mayo': '05',
        'junio': '06', 'juni': '06',
        'julio': '07', 'juli': '07',
        'agosto': '08', 'agost': '08',
        'septiembre': '09', 'setiembre': '09', 'septiembr': '09', 'setiembr': '09',
        'octubre': '10', 'octubr': '10',
        'noviembre': '11', 'ncviembre': '11', 'nociembre': '11', 'noviembr': '11',
        'diciembre': '12', 'diciembr': '12'
    }

    candidates = []

    # Process text sources separately to eliminate filename bias
    sources = [
        ("body", text.replace('_', ' ')),
        ("filename", filename_text.replace('_', ' '))
    ]

    for src_type, text_normalized in sources:
        if not text_normalized.strip():
            continue

        global_yr_match = re.search(r'\b(20\d\d)[\s_\-–]+(20\d\d)\b', text_normalized)
        g_yr1, g_yr2 = global_yr_match.groups() if global_yr_match else (None, None)

        # 1. Flexible Text Date Pattern (matches "1 DE NOVIEMBRE DEL 2024 AL 26 DE ABRIL DEL 2025", etc.)
        flex_pattern = r'(?:del\s+)?([0-3]?\d)\s*(?:de|del)?\s*([a-zA-Z]+)(?:\s*(?:de|del)?\s*(20\d\d))?\s*(?:al|hasta|y|a|-)\s*([0-3]?\d)\s*(?:de|del)?\s*([a-zA-Z]+)(?:\s*(?:de|del)?\s*(20\d\d))?'
        for m in re.finditer(flex_pattern, text_normalized, re.IGNORECASE):
            d1, m1_str, y1, d2, m2_str, y2 = m.groups()
            m1 = months_map.get(m1_str.lower())
            m2 = months_map.get(m2_str.lower())
            if m1 and m2:
                if y1 and y2:
                    sy, ey = y1, y2
                elif g_yr1 and g_yr2:
                    sy, ey = g_yr1, g_yr2
                elif y2 and not y1:
                    ey = y2
                    sy = y2 if int(m1) <= int(m2) else str(int(y2) - 1)
                elif y1 and not y2:
                    sy = y1
                    ey = y1 if int(m1) <= int(m2) else str(int(y1) + 1)
                else:
                    now_yr = datetime.now().year
                    cur_yr_str = str(now_yr - 1 if datetime.now().month < int(m2) else now_yr)
                    sy = cur_yr_str
                    ey = cur_yr_str if int(m1) <= int(m2) else str(int(cur_yr_str) + 1)

                s_date = f"{sy}-{m1}-{d1.zfill(2)} 00:00:00"
                e_date = f"{ey}-{m2}-{d2.zfill(2)} {datetime.now().strftime('%H:%M:%S')}"
                context_start = max(0, m.start() - 100)
                context_end = min(len(text_normalized), m.end() + 100)
                snippet = text_normalized[context_start:context_end].lower()
                candidates.append({
                    "start": s_date,
                    "end": e_date,
                    "snippet": snippet,
                    "raw": m.group(0),
                    "is_filename": (src_type == "filename"),
                    "source": "Nombre del archivo" if src_type == "filename" else "Cuerpo del Documento PDF"
                })

        # 2. Numeric Date Pattern
        num_date_pattern = r'([0-3]?\d[/\-.][0-1]?\d[/\-.]20\d\d(?:\s+[0-2]?\d:[0-5]?\d(?::[0-5]?\d)?)?)[\s_\-.]*(?:al|hasta|a|y|-)?[\s_\-.]*([0-3]?\d[/\-.][0-1]?\d[/\-.]20\d\d(?:\s+[0-2]?\d:[0-5]?\d(?::[0-5]?\d)?)?)'
        for m in re.finditer(num_date_pattern, text_normalized, re.IGNORECASE):
            s_date = normalize_date_str(m.group(1), is_start=True)
            e_date = normalize_date_str(m.group(2), is_start=False)
            if s_date and e_date:
                context_start = max(0, m.start() - 100)
                context_end = min(len(text_normalized), m.end() + 100)
                snippet = text_normalized[context_start:context_end].lower()
                candidates.append({
                    "start": s_date,
                    "end": e_date,
                    "snippet": snippet,
                    "raw": m.group(0),
                    "is_filename": (src_type == "filename"),
                    "source": "Nombre del archivo" if src_type == "filename" else "Cuerpo del Documento PDF"
                })

    # 3. CPCE Official Legalization Stamp Pattern
    cpce_pattern = r'(?:correspondiente\s+al\s+período|correspondiente\s+al\s+periodo)\s+([0-3]?\d[/\-.][0-1]?\d[/\-.]20\d\d)\s+(?:al|hasta)\s+([0-3]?\d[/\-.][0-1]?\d[/\-.]20\d\d)'
    cpce_match = re.search(cpce_pattern, text, re.IGNORECASE)
    if cpce_match:
        s_date = normalize_date_str(cpce_match.group(1), is_start=True)
        e_date = normalize_date_str(cpce_match.group(2), is_start=False)
        if s_date and e_date:
            candidates.append({
                "start": s_date,
                "end": e_date,
                "snippet": "cpce legalizacion correspondiente al periodo",
                "raw": cpce_match.group(0),
                "is_cpce_stamp": True,
                "source": "Sello Oficial CPCE"
            })

    # 4. Annex Trade Table Timestamp Inspector (Extracts exact MIN and MAX trade timestamps from table body)
    annex_timestamps = []
    trade_ts_pattern = r'\b(20\d\d[/\-.][0-1]?\d[/\-.][0-3]?\d\s+[0-2]?\d:[0-5]?\d(?::[0-5]?\d)?|[0-3]?\d[/\-.][0-1]?\d[/\-.]20\d\d\s+[0-2]?\d:[0-5]?\d(?::[0-5]?\d)?)\b'
    for m in re.finditer(trade_ts_pattern, text):
        raw_ts = m.group(1).strip()
        norm_ts = normalize_full_timestamp(raw_ts)
        if norm_ts:
            annex_timestamps.append(norm_ts)

    if len(annex_timestamps) >= 2:
        annex_timestamps.sort()
        min_ts = annex_timestamps[0]
        max_ts = annex_timestamps[-1]
        candidates.append({
            "start": min_ts,
            "end": max_ts,
            "snippet": f"anexo tabla de operaciones timestamps exactos ({min_ts} al {max_ts})",
            "raw": f"{min_ts} al {max_ts}",
            "is_annex_trade_table": True,
            "source": "Anexo de Operaciones PDF (Timestamps)"
        })

    # Scoring Candidates based on Accounting Certificate Heuristics (NO FILENAME CHEATING)
    high_priority_words = ['certifico', 'dictamen', 'estados contables', 'estado de situacion', 'periodo comprendido', 'período comprendido', 'ejercicio comprendido', 'cobertura', 'auditoria', 'auditoría']
    low_priority_words = ['tenencia actual', 'saldo a la fecha', 'fecha de impresion', 'fecha de emisión', 'constancia', 'cuit', 'vencimiento']

    scored_periods = []
    for cand in candidates:
        s_d = cand['start']
        e_d = cand['end']
        snippet = cand['snippet']

        if cand.get('is_filename'):
            score = 10  # LOWEST PRIORITY for filename: document text always wins!
        elif cand.get('is_annex_trade_table'):
            score = 350 # HIGHEST PRIORITY for real audited trade timestamps
        elif cand.get('is_cpce_stamp'):
            score = 250 # VERY HIGH PRIORITY for CPCE stamp
        else:
            score = 100 # Base score for document body OCR/text

        if any(w in snippet for w in high_priority_words):
            score += 40

        if any(w in snippet for w in low_priority_words):
            score -= 40

        if not cand.get('is_filename'):
            try:
                now_str = datetime.now().strftime("%Y-%m-%d")
                if e_d.split(' ')[0] > now_str:
                    score -= 80
            except Exception:
                pass

        try:
            s_d_clean = s_d.split(' ')[0]
            e_d_clean = e_d.split(' ')[0]
            d1_obj = datetime.strptime(s_d_clean, "%Y-%m-%d")
            d2_obj = datetime.strptime(e_d_clean, "%Y-%m-%d")
            if d1_obj <= d2_obj:
                days = (d2_obj - d1_obj).days
                if 25 <= days <= 375:
                    score += 30
                elif days < 20:
                    score -= 35
        except Exception:
            pass

        scored_periods.append({
            "start_date": s_d,
            "end_date": e_d,
            "score": score,
            "source": cand.get("source", "PDF"),
            "snippet": snippet[:80]
        })

    # Sort scored periods by highest score descending
    scored_periods.sort(key=lambda x: x['score'], reverse=True)

    # Filter unique periods
    unique_periods = []
    seen = set()
    for p in scored_periods:
        pair = (p['start_date'], p['end_date'])
        if pair not in seen and p['start_date'] <= p['end_date']:
            seen.add(pair)
            unique_periods.append(p)

    if unique_periods:
        best = unique_periods[0]
        extracted["start_date"] = best["start_date"]
        extracted["end_date"] = best["end_date"]
        extracted["detection_source"] = best["source"]
        extracted["detected_periods"] = unique_periods[:3]

    # Enhanced CPA / Accountant Name & Registration Detection (Multi-line & Spaceless robust)
    cpa_text_flat = raw_text_for_cpa
    cpa_text_flat = re.sub(r'CONTADORPUSLICO', 'CONTADOR PUBLICO', cpa_text_flat, flags=re.IGNORECASE)
    cpa_text_flat = re.sub(r'CONTADORPUBLICO', 'CONTADOR PUBLICO', cpa_text_flat, flags=re.IGNORECASE)
    cpa_text_flat = re.sub(r'CORRESPONDEAC\.?\s*PN:?', 'CORRESPONDE A C.P.N. ', cpa_text_flat, flags=re.IGNORECASE)
    cpa_text_flat = re.sub(r'CORRESPONDEACPN:?', 'CORRESPONDE A C.P.N. ', cpa_text_flat, flags=re.IGNORECASE)
    cpa_text_flat = re.sub(r'MATRICULAN\.?', 'MATRICULA N° ', cpa_text_flat, flags=re.IGNORECASE)
    cpa_text_flat = re.sub(r'M,P', 'M.P.', cpa_text_flat)
    cpa_text_flat = re.sub(r'([A-Za-zÁÉÍÓÚáéíóúñÑ])(\d)', r'\1 \2', cpa_text_flat)
    cpa_text_flat = re.sub(r'(\d)([A-Za-zÁÉÍÓÚáéíóúñÑ])', r'\1 \2', cpa_text_flat)
    cpa_text_flat = re.sub(r'([a-zñáéíóú])([A-ZÁÉÍÓÚ])', r'\1 \2', cpa_text_flat)
    cpa_text_flat = re.sub(r'(CPN|C\.P\.N\.|M\.P\.|MP)([A-ZÁÉÍÓÚa-z])', r'\1 \2', cpa_text_flat, flags=re.IGNORECASE)
    cpa_text_flat = re.sub(r'[\r\n]+', ' ', cpa_text_flat)

    invalid_cpa_words = [
        'no representan', 'la emisión', 'la emision', 'un juicio', 'opinión', 'opinion', 
        'dictamen', 'periodo', 'período', 'manifestaciones', 'estados contables', 
        'normas unificadas', 'ejercicio', 'presente certificación', 'auditoría', 'auditoria',
        'responsabilidad', 'mi responsabilidad', 'miresponsabilidad', 'consiste', 'consiste en',
        'tarea del', 'función del', 'informe del', 'dictamen del', 'al cliente', 'declaracion', 'declaración',
        'certificacion', 'certificación', 'certificacionde', 'certificaciónde', 'identificacion', 'identificación'
    ]

    def is_valid_cpa_name(name):
        if not name or len(name) < 3 or len(name) > 50:
            return False
        n_lower = name.lower()
        if any(w in n_lower for w in invalid_cpa_words):
            return False
        if n_lower in ['contador publico', 'contador público', 'contadora publica', 'contadora pública', 'c.p.n.', 'cpn', 'contador publico nacional', 'contadora publica nacional']:
            return False
        return bool(re.search(r'[A-Za-zÁÉÍÓÚáéíóúñÑ]', name))

    # 1. CPCE Digital Signature Certificate & Legalization Stamp
    cpce_cpa1 = re.search(
        r'(?:FIRMA DIGITAL|CERTIFICAMOS QUE LA FIRMA|FIRMANTE|LEGALIZACI[ÓO]N).*?'
        r'(?:CORRESPONDE CON LA DE|PERTENECE A|CORRESPONDE A|FIRMADO POR|NOMBRE Y APELLIDO):?\s*'
        r'(?:C\.?\s*P\.?\s*N\.?|CONTADOR\s*P[ÚU]BLICO|CONTADORA\s*P[ÚU]BLICA|Cr\.|Cra\.|Dr\.|Dra\.)?:?\s*_?\s*'
        r'([A-Za-zÁÉÍÓÚáéíóúñÑ\s,\.]+?)'
        r'(?:\s+(?:Matr[íi]cula\s*Profesional|Matr[íi]cula|Mat\.|M\.P\.|T°|F°|CPCE|N°|Nº|DE|CUIT):?\s*([\d\.\-A-Z/]+)?)',
        cpa_text_flat, re.IGNORECASE
    )
    if cpce_cpa1:
        name_clean = cpce_cpa1.group(1).strip()
        mat_clean = cpce_cpa1.group(2).strip() if (len(cpce_cpa1.groups()) >= 2 and cpce_cpa1.group(2)) else ""
        name_clean = re.sub(r'\s+(?:MATRICULA|MATRíCULA|M\.P|DE|CUIT).*$', '', name_clean, flags=re.IGNORECASE).strip()
        if is_valid_cpa_name(name_clean):
            mat_str = f" (M.P. {mat_clean})" if mat_clean else ""
            extracted["cpa_name"] = f"C.P.N. {name_clean.title()}{mat_str}"

    # 2. CPCE Stamp Corresponde a... / Pertenece a...
    if not extracted["cpa_name"]:
        cpce_cpa2 = re.search(
            r'(?:CORRESPONDE A|PERTENECE A|FIRMA INSERTA.*PERTENECE A|FIRMADO POR)\s*'
            r'(?:C\.?\s*P\.?\s*N\.?|CONTADOR\s*P[ÚU]BLICO|CONTADORA\s*P[ÚU]BLICA|Cr\.|Cra\.|Dr\.|Dra\.)?:?\s*_?\s*'
            r'([A-Za-zÁÉÍÓÚáéíóúñÑ\s,\.]+?)'
            r'(?:\s+(?:MATRICULA|MATRíCULA|M\.P|N°|Nº|DE|CUIT))',
            cpa_text_flat, re.IGNORECASE
        )
        if cpce_cpa2:
            name_raw = cpce_cpa2.group(1).strip()
            name_clean = re.sub(r'\s+(?:MATRICULA|MATRíCULA|M\.P|DE|CUIT).*$', '', name_raw, flags=re.IGNORECASE).strip()
            if is_valid_cpa_name(name_clean):
                extracted["cpa_name"] = f"C.P.N. {name_clean.title()}"


    # 3. Flexible CPN / Contador Publico / Matrícula Matcher (Spaceless-tolerant & Name-first)
    if not extracted["cpa_name"]:
        cpa_patterns = [
            r'(?:C\.?\s*P\.?\s*N\.?|Contador\s*PÚblico|Contadora\s*PÚblica|Contador\s*Publico|Contadora\s*Publica|Cr\.|Cra\.|Dr\.|Dra\.|Lic\.)\s*:?\s*([A-Za-zÁÉÍÓÚáéíóúñÑ\s\.,]+?)(?:\s*[\(\[]?\s*(?:Matr[íi]cula\s*Profesional|Matr[íi]cula|Mat\.|M\.P\.|T°|F°)\s*(?:N°|Nº)?\s*([\d\.\-A-Z/]+)[\)\]]?)',
            r'([A-Za-zÁÉÍÓÚáéíóúñÑ\s,]+)\s*(?:-|\n)?\s*(?:Contador\s*PÚblico|Contadora\s*PÚblica|Contador\s*Publico|Contadora\s*Publica|C\.?\s*P\.?\s*N\.?)',
            r'(?:Firma|Por|Firmado por)\s*:?\s*(?:el|la)?\s*(?:Contador|Contadora|C\.?\s*P\.?\s*N\.?|Cr\.|Dra?\.)?\s*([A-Za-zÁÉÍÓÚáéíóúñÑ\s\.]+)'
        ]
        for pat in cpa_patterns:
            for cpa_m in re.finditer(pat, cpa_text_flat, re.IGNORECASE):
                c_name = cpa_m.group(1).strip()
                c_name = re.sub(r'^(?:Público|Pública|Publico|Publica|Nacional)\s*', '', c_name, flags=re.IGNORECASE).strip()
                c_name = re.sub(r'\s+(?:Contador|Contadora|Publico|Público|Publica|Pública|Nacional).*$', '', c_name, flags=re.IGNORECASE).strip()
                c_name = re.sub(r'\s+(?:M\.P\.|Matr[íi]cula|Mat\.|T°|F°)\.?$', '', c_name, flags=re.IGNORECASE).strip()
                c_name = re.sub(r'\s+(?:en|del|de|por|para|cuit|mat|fecha|cpce).*$', '', c_name, flags=re.IGNORECASE).strip()
                
                if is_valid_cpa_name(c_name):
                    c_mat = cpa_m.group(2).strip() if (len(cpa_m.groups()) >= 2 and cpa_m.group(2)) else ""
                    if not c_mat:
                        mat_m = re.search(re.escape(c_name) + r'.*?(?:Matr[íi]cula\s*Profesional|Matr[íi]cula|M\.P\.|Mat\.|T°|F°)\s*(?:N°|Nº)?\s*([\d\.\-A-Z/]+)', cpa_text_flat, re.IGNORECASE)
                        if mat_m:
                            c_mat = mat_m.group(1).strip()

                    mat_str = f" (M.P. {c_mat})" if c_mat else ""
                    extracted["cpa_name"] = f"C.P.N. {c_name.title()}{mat_str}"
                    break
            if extracted["cpa_name"]:
                break

    # 4. Direct Matrícula search fallback
    if not extracted["cpa_name"]:
        mat_search = re.search(r'([A-Za-zÁÉÍÓÚáéíóúñÑ\s,]{4,40})\s*(?:Matr[íi]cula\s*Profesional|Matr[íi]cula|M\.P\.|Mat\.|T°\s*\d+[\s,]*F°|Tomo\s*\d+[\s,]*Folio)\s*(?:N°|Nº)?\s*([\d\.\-A-Z/]+)', cpa_text_flat, re.IGNORECASE)
        if mat_search:
            c_name = mat_search.group(1).strip()
            c_mat = mat_search.group(2).strip()
            c_name = re.sub(r'^.*?(?:Contador|Contadora|CPN|Lic|Dr|Dra|Público|Pública|Publico|Publica)\s*', '', c_name, flags=re.IGNORECASE).strip()
            c_name = re.sub(r'\s+(?:Contador|Contadora|Publico|Público|Publica|Pública|Nacional).*$', '', c_name, flags=re.IGNORECASE).strip()
            if is_valid_cpa_name(c_name):
                extracted["cpa_name"] = f"C.P.N. {c_name.title()} (M.P. {c_mat})"

    # Clean up empty or generic CPA strings
    if extracted["cpa_name"]:
        cpa_lower = extracted["cpa_name"].lower().strip()
        if cpa_lower in ["contador publico", "contador público", "contadora publica", "contadora pública", "c.p.n.", "cpn", "c.p.n. contador publico", "c.p.n. contador público"]:
            extracted["cpa_name"] = None



    # Issue Date / Certification Legalization Date detection
    issue_m = re.search(r'(?:legalizad[oa]|emitid[oa]|fecha de legalización|fecha de emisión)\s*(?:el|con fecha)?\s*([0-3]?\d[/\-.][0-1]?\d[/\-.]20\d\d)', cpa_text_flat, re.IGNORECASE)
    if issue_m:
        extracted["issue_date"] = normalize_date_str(issue_m.group(1), is_start=True)

    # Document Title Generation based on audited content rather than raw filename
    if extracted["start_date"] and extracted["end_date"]:
        s_display = extracted["start_date"].split(' ')[0]
        e_display = extracted["end_date"].split(' ')[0]
        extracted["title"] = f"Certificación Contable ({s_display} al {e_display})"

    print(f"[DEBUG PARSE_PDF] Extracted cpa_name: '{extracted.get('cpa_name')}' | dates: {extracted.get('start_date')} to {extracted.get('end_date')}")
    print(f"[DEBUG PARSE_PDF] CPA raw text flat snippet: '{cpa_text_flat[:400]}...'")

    return extracted


def normalize_date_str(date_raw, is_start=True):
    from datetime import datetime
    date_parts_str = date_raw.strip()
    time_part = "00:00:00" if is_start else datetime.now().strftime('%H:%M:%S')

    if ' ' in date_parts_str:
        spl = date_parts_str.split(' ', 1)
        date_parts_str = spl[0]
        if len(spl[1].strip()) >= 4:
            time_part = spl[1].strip()
            if len(time_part.split(':')) == 2:
                time_part += ":00"

    clean = date_parts_str.replace('.', '/').replace('-', '/')
    parts = clean.split('/')
    if len(parts) == 3:
        day, month, year = parts[0].zfill(2), parts[1].zfill(2), parts[2]
        try:
            dt = datetime.strptime(f"{year}-{month}-{day}", "%Y-%m-%d")
            return f"{dt.strftime('%Y-%m-%d')} {time_part}"
        except Exception:
            pass
    return None

def normalize_full_timestamp(raw):
    from datetime import datetime
    raw = raw.strip()
    parts = raw.split(' ')
    if len(parts) != 2:
        return None
    d_part, t_part = parts[0], parts[1]

    t_tokens = t_part.split(':')
    if len(t_tokens) == 2:
        t_part = f"{t_tokens[0].zfill(2)}:{t_tokens[1].zfill(2)}:00"
    elif len(t_tokens) == 3:
        t_part = f"{t_tokens[0].zfill(2)}:{t_tokens[1].zfill(2)}:{t_tokens[2].zfill(2)}"
    else:
        return None

    clean_d = d_part.replace('.', '/').replace('-', '/')
    d_tokens = clean_d.split('/')
    if len(d_tokens) != 3:
        return None

    if len(d_tokens[0]) == 4:
        y, m, d = d_tokens[0], d_tokens[1].zfill(2), d_tokens[2].zfill(2)
    elif len(d_tokens[2]) == 4:
        d, m, y = d_tokens[0].zfill(2), d_tokens[1].zfill(2), d_tokens[2]
    else:
        return None

    try:
        dt = datetime.strptime(f"{y}-{m}-{d} {t_part}", "%Y-%m-%d %H:%M:%S")
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return None






if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False, threaded=True)
