import sqlite3
import pandas as pd
import os
import re
import time

DB_PATH = os.path.join(os.path.dirname(__file__), 'transactions.db')

def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    try:
        conn.execute("PRAGMA busy_timeout = 30000;")
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
    except Exception as e:
        print(f"Error setting SQLite PRAGMAs: {e}")
    return conn

def deduplicate_existing_database(conn=None):
    """
    Scans the database and removes duplicate transactions created prior to the canonical hash fix.
    Recalculates canonical hashes and keeps 1 unique record per transaction.
    """
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True
        
    try:
        df = pd.read_sql_query("SELECT * FROM transactions", conn)
        if df.empty:
            return 0
            
        from models_v2 import compute_canonical_tx_hash
        df['new_tx_hash'] = df.apply(
            lambda r: compute_canonical_tx_hash(
                r['fecha'], r['exchange'], r['tipo_operacion'], r['moneda'],
                r['monto_compra_cripto'], r['monto_venta_cripto'], r['monto_ars'], r['comentarios']
            ), axis=1
        )
        
        # Sort so certified rows (is_certified=1) take precedence over uncertified rows
        if 'is_certified' in df.columns:
            df['is_certified_temp'] = df['is_certified'].fillna(0).astype(int)
            df = df.sort_values(by=['is_certified_temp'], ascending=False)

        # Identify rows to delete (keep the first row for each new_tx_hash)
        duplicates = df[df.duplicated(subset=['new_tx_hash'], keep='first')]
        if duplicates.empty:
            return 0
            
        hashes_to_delete = duplicates['tx_hash'].tolist()
        c = conn.cursor()
        
        # Batch delete in chunks of 500
        for i in range(0, len(hashes_to_delete), 500):
            chunk = hashes_to_delete[i:i+500]
            placeholders = ','.join(['?'] * len(chunk))
            c.execute(f"DELETE FROM transactions WHERE tx_hash IN ({placeholders})", chunk)
            
        conn.commit()
        print(f"Purged {len(hashes_to_delete)} historical duplicate transactions from database.")
        return len(hashes_to_delete)
    except Exception as e:
        print(f"Error deduplicating database: {e}")
        return 0
    finally:
        if should_close:
            conn.close()

def init_db():
    conn = get_connection()
    try:
        c = conn.cursor()
        c.execute('''
            CREATE TABLE IF NOT EXISTS transactions (
                tx_hash TEXT PRIMARY KEY,
                fecha TEXT,
                exchange TEXT,
                tipo_operacion TEXT,
                moneda TEXT,
                monto_compra_cripto REAL,
                monto_venta_cripto REAL,
                cotizacion_compra REAL,
                cotizacion_venta REAL,
                monto_ars REAL,
                comentarios TEXT
            )
        ''')
        
        try:
            c.execute("ALTER TABLE transactions ADD COLUMN is_certified INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass
        try:
            c.execute("ALTER TABLE transactions ADD COLUMN certification_id INTEGER DEFAULT NULL")
        except sqlite3.OperationalError:
            pass
        try:
            c.execute("ALTER TABLE transactions ADD COLUMN source TEXT DEFAULT 'EXCHANGE_API'")
        except sqlite3.OperationalError:
            pass
            
        try:
            deduplicate_existing_database(conn)
        except Exception as e:
            print(f"Notice: Auto-deduplication check on init_db: {e}")

        
        c.execute('''
            CREATE TABLE IF NOT EXISTS tax_settings (
                year INTEGER PRIMARY KEY,
                ganancias_deduccion REAL,
                ganancias_alicuota REAL,
                iibb_tramo1_limite REAL,
                iibb_tramo1_alicuota REAL,
                iibb_tramo2_limite REAL,
                iibb_tramo2_alicuota REAL,
                iibb_tramo3_alicuota REAL,
                iibb_base_calculo TEXT
            )
        ''')
        
        # Ensure all columns exist for tax_settings (dynamic migration)
        try:
            c.execute("ALTER TABLE tax_settings ADD COLUMN iibb_provincia TEXT DEFAULT 'Catamarca'")
        except sqlite3.OperationalError:
            pass
        try:
            c.execute("ALTER TABLE tax_settings ADD COLUMN ganancias_estimadas_fallback_pct REAL DEFAULT 15.0")
        except sqlite3.OperationalError:
            pass
        try:
            c.execute("ALTER TABLE tax_settings ADD COLUMN usd_ars_exchange_rate REAL DEFAULT 1000.0")
        except sqlite3.OperationalError:
            pass
        
        # Insert default values for 2025 if not existing
        c.execute("SELECT COUNT(*) FROM tax_settings WHERE year=2025")
        if c.fetchone()[0] == 0:
            c.execute('''
                INSERT INTO tax_settings VALUES (
                    2025,
                    0.0,
                    15.0,
                    3255000000.0,
                    5.0,
                    26970000000.0,
                    6.0,
                    7.0,
                    'diferencial',
                    'Catamarca',
                    15.0,
                    1000.0
                )
            ''')
        c.execute('''
            CREATE TABLE IF NOT EXISTS exchanges_config (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                status TEXT DEFAULT 'online',
                last_update TEXT DEFAULT '-',
                date_format TEXT DEFAULT '%d/%m/%Y %H:%M:%S',
                mapping_json TEXT DEFAULT '{}',
                api_keys_json TEXT DEFAULT '{}',
                is_active INTEGER DEFAULT 1
            )
        ''')

        c.execute('''
            CREATE TABLE IF NOT EXISTS certifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                issue_date TEXT,
                cpa_name TEXT,
                notes TEXT,
                file_path TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')


        # Seed default exchanges if empty or missing
        defaults = [
            ('binance', 'Binance Spot', 'NATIVE_API', 'online', '-', '%d/%m/%Y %H:%M:%S', '{}', '{}', 1),
            ('binance_p2p', 'Binance P2P', 'NATIVE_CSV', 'online', '-', '%d/%m/%Y %H:%M:%S', '{}', '{}', 1),
            ('bitso', 'Bitso Alpha', 'NATIVE_API', 'online', '-', '%d/%m/%Y %H:%M:%S', '{}', '{}', 1),
            ('fiwind', 'Fiwind', 'NATIVE_CSV', 'online', '-', '%d/%m/%Y %H:%M:%S', '{}', '{}', 1),
            ('ripio_trade', 'Ripio Trade', 'NATIVE_CSV', 'online', '-', '%d/%m/%Y %H:%M:%S', '{}', '{}', 1),
            ('ripio_classic', 'Ripio Classic', 'NATIVE_CSV', 'online', '-', '%d/%m/%Y %H:%M:%S', '{}', '{}', 1),
            ('okx', 'OKX', 'NATIVE_API', 'online', '-', '%d/%m/%Y %H:%M:%S', '{}', '{}', 1),
            ('bybit', 'Bybit', 'NATIVE_API', 'online', '-', '%d/%m/%Y %H:%M:%S', '{}', '{}', 1),
            ('bitget', 'Bitget', 'NATIVE_API', 'online', '-', '%d/%m/%Y %H:%M:%S', '{}', '{}', 1),
            ('manual', 'Operaciones Manuales', 'MANUAL', 'online', '-', '%d/%m/%Y %H:%M:%S', '{"fecha":"Fecha","tipo_operacion":"Tipo","moneda":"Moneda","monto_compra_cripto":"Cantidad Compra","monto_venta_cripto":"Cantidad Venta","cotizacion_compra":"Cotizacion Compra","cotizacion_venta":"Cotizacion Venta","monto_ars":"Monto ARS","comentarios":"Notas"}', '{}', 1),
            ('varios', 'Exchanges Manuales / Varios', 'MANUAL', 'online', '-', '%d/%m/%Y %H:%M:%S', '{"fecha":"Fecha","exchange":"Exchange","tipo_operacion":"Tipo","moneda":"Moneda","monto_compra_cripto":"Cantidad Compra","monto_venta_cripto":"Cantidad Venta","cotizacion_compra":"Cotizacion Compra","cotizacion_venta":"Cotizacion Venta","monto_ars":"Monto ARS","comentarios":"Notas"}', '{}', 1),
        ]
        for d in defaults:
            c.execute("INSERT OR IGNORE INTO exchanges_config VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", d)


        # Retroactive date sanitization for existing transactions table
        try:
            c.execute("SELECT tx_hash, fecha FROM transactions WHERE fecha LIKE '%/%'")
            rows_to_fix = c.fetchall()
            if rows_to_fix:
                updates = []
                for tx_h, raw_f in rows_to_fix:
                    try:
                        dt = pd.to_datetime(raw_f, dayfirst=True, errors='coerce')
                        if not pd.isna(dt):
                            updates.append((dt.strftime('%Y-%m-%d %H:%M:%S'), tx_h))
                    except Exception:
                        pass
                if updates:
                    c.executemany("UPDATE transactions SET fecha = ? WHERE tx_hash = ?", updates)
                    print(f"Sanitized {len(updates)} legacy dates to ISO format.")
        except Exception as e:
            print(f"Error in date sanitization migration: {e}")

        # Retroactive migration & cleanup for exchange names and empty rows
        try:
            c.execute("DELETE FROM transactions WHERE exchange IS NULL OR TRIM(exchange) = '' OR fecha IS NULL OR TRIM(fecha) = '' OR moneda IS NULL OR TRIM(moneda) = '';")
            c.execute("UPDATE transactions SET exchange = 'Bitso Alpha' WHERE exchange = 'Bitso';")
            c.execute("UPDATE transactions SET exchange = 'Ripio Trade' WHERE exchange = 'Ripio';")
        except Exception as e:
            print(f"Error in exchange migration & cleanup: {e}")

        # Repair any corrupted certification records where start_date > end_date or start_date != title start date
        try:
            fix_corrupted_certifications(conn=conn)
            sync_certified_transactions_status(conn=conn)
        except Exception as e:
            print(f"Error in fix_corrupted_certifications / sync migration: {e}")

        conn.commit()
    finally:
        conn.close()

def _normalize_cert_boundary(dt_val, is_end=False):
    """
    Normalizes certification boundary date strings to standard 'YYYY-MM-DD HH:MM:SS'.
    Handles ISO 'T' separators, short timestamps without seconds (16 chars),
    date-only strings (10 chars), sub-second precision, and trailing timezone indicators.
    """
    if not dt_val:
        return ""
    s = str(dt_val).strip().replace('T', ' ')
    if s.endswith('Z'):
        s = s[:-1]
    if '.' in s:
        s = s.split('.')[0]
    
    if len(s) == 10:
        s += " 23:59:59" if is_end else " 00:00:00"
    elif len(s) == 16:
        s += ":59" if is_end else ":00"
    elif len(s) > 19:
        s = s[:19]
    return s

def sync_certified_transactions_status(conn=None):
    """
    Synchronizes the `is_certified` and `certification_id` fields in `transactions`
    with the active date ranges defined in `certifications`.
    """
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    c = conn.cursor()
    try:
        # Reset all non-CERTIFICATION source transactions to uncertified first
        c.execute("UPDATE transactions SET is_certified = 0, certification_id = NULL WHERE source != 'CERTIFICATION' OR source IS NULL")
        
        # Fetch active certifications ordered by start_date ASC
        c.execute("SELECT id, start_date, end_date FROM certifications ORDER BY start_date ASC")
        certs = c.fetchall()

        for cert_id, s_date, e_date in certs:
            if not s_date or not e_date:
                continue
            s_s = _normalize_cert_boundary(s_date, is_end=False)
            e_s = _normalize_cert_boundary(e_date, is_end=True)
            c.execute("""
                UPDATE transactions 
                SET is_certified = 1, certification_id = ? 
                WHERE fecha >= ? AND fecha <= ?
            """, (cert_id, s_s, e_s))
            
        # Ensure source = 'CERTIFICATION' rows are always marked is_certified = 1
        c.execute("UPDATE transactions SET is_certified = 1 WHERE source = 'CERTIFICATION'")

        conn.commit()
    except Exception as e:
        print(f"[SYNC CERT STATUS] Error syncing certification status: {e}")
    finally:
        if should_close:
            conn.close()

def fix_corrupted_certifications(conn=None):
    """
    Enforces consecutive certification ordering.
    Sorts certifications by end_date ASC, then adjusts each start_date to be
    exactly 1 second after the previous certification's end_date.
    This eliminates overlaps (repaso periods) and gaps automatically.
    """
    from datetime import datetime, timedelta

    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    c = conn.cursor()
    try:
        c.execute("SELECT id, title, start_date, end_date FROM certifications ORDER BY end_date ASC")
        rows = c.fetchall()

        if not rows:
            return

        prev_end_dt = None
        for cert_id, title, s_date, e_date in rows:
            # Parse end_date
            end_dt = _parse_cert_datetime(e_date)
            if not end_dt:
                continue

            if prev_end_dt is None:
                # First cert: keep its original start_date, just ensure it's valid
                start_dt = _parse_cert_datetime(s_date)
                if not start_dt or start_dt > end_dt:
                    # Fallback: use end_date - reasonable period
                    start_dt = end_dt
            else:
                # Consecutive: start = previous end + 1 second
                start_dt = prev_end_dt + timedelta(seconds=1)

            new_start = start_dt.strftime('%Y-%m-%d %H:%M:%S')
            new_end = end_dt.strftime('%Y-%m-%d %H:%M:%S')

            # Update title to reflect corrected dates
            s_display = new_start.split(' ')[0]
            e_display = new_end.split(' ')[0]
            new_title = f"Certificación Contable ({s_display} al {e_display})"

            if str(s_date) != new_start or str(title) != new_title:
                c.execute(
                    "UPDATE certifications SET start_date = ?, title = ? WHERE id = ?",
                    (new_start, new_title, cert_id)
                )
                print(f"[REPAIR CERT] Consecutive fix ID {cert_id}: {new_start} -> {new_end}")

            prev_end_dt = end_dt

        conn.commit()
    except Exception as e:
        print(f"[REPAIR CERT] Error repairing certifications: {e}")
    finally:
        if should_close:
            conn.close()


def _parse_cert_datetime(raw):
    """Parse a datetime string from certification dates, returning a datetime object."""
    from datetime import datetime
    if not raw:
        return None
    s = str(raw).strip()
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d'):
        try:
            return datetime.strptime(s[:len(fmt.replace('%Y','0000').replace('%m','00').replace('%d','00').replace('%H','00').replace('%M','00').replace('%S','00'))], fmt)
        except (ValueError, IndexError):
            continue
    return None

import json

def get_all_exchanges():
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id, name, type, status, last_update, date_format, mapping_json, api_keys_json, is_active FROM exchanges_config WHERE is_active=1")
    rows = c.fetchall()
    conn.close()
    result = []
    for r in rows:
        result.append({
            "id": r[0],
            "name": r[1],
            "type": r[2],
            "status": r[3],
            "lastUpdate": r[4],
            "dateFormat": r[5],
            "mapping": json.loads(r[6]) if r[6] else {},
            "apiKeys": json.loads(r[7]) if r[7] else {},
            "isActive": bool(r[8])
        })
    return result

def add_custom_exchange(name, date_format='%d/%m/%Y %H:%M:%S', mapping=None):
    if mapping is None:
        mapping = {}
    conn = get_connection()
    c = conn.cursor()
    ex_id = re.sub(r'[^a-z0-9_]', '', name.lower().replace(' ', '_'))
    if not ex_id:
        ex_id = f"custom_{int(time.time())}"
    c.execute('''
        INSERT OR REPLACE INTO exchanges_config (id, name, type, status, last_update, date_format, mapping_json, api_keys_json, is_active)
        VALUES (?, ?, 'CUSTOM_CSV', 'online', '-', ?, ?, '{}', 1)
    ''', (ex_id, name, date_format, json.dumps(mapping)))
    conn.commit()
    conn.close()
    return {"id": ex_id, "name": name}

def update_exchange_mapping(ex_id, mapping, date_format='%d/%m/%Y %H:%M:%S'):
    conn = get_connection()
    c = conn.cursor()
    c.execute('''
        UPDATE exchanges_config 
        SET mapping_json = ?, date_format = ?
        WHERE id = ?
    ''', (json.dumps(mapping), date_format, ex_id))
    conn.commit()
    conn.close()
    return True

def update_exchange_apikeys(ex_id, api_keys):
    conn = get_connection()
    c = conn.cursor()
    c.execute('''
        UPDATE exchanges_config 
        SET api_keys_json = ?
        WHERE id = ?
    ''', (json.dumps(api_keys), ex_id))
    conn.commit()
    conn.close()

    # Sync keys to .env file for api_manager
    try:
        import config_manager
        env_dict = {}
        prefix = ex_id.upper()
        if isinstance(api_keys, dict):
            for k, v in api_keys.items():
                k_upper = str(k).upper()
                if 'KEY' in k_upper or k_upper == 'APIKEY':
                    env_dict[f"{prefix}_API_KEY"] = v
                elif 'SECRET' in k_upper or k_upper == 'APISECRET':
                    env_dict[f"{prefix}_API_SECRET"] = v
                elif 'PASSPHRASE' in k_upper or 'PASSWORD' in k_upper:
                    env_dict[f"{prefix}_API_PASSWORD"] = v
                else:
                    env_dict[k] = v
        if env_dict:
            config_manager.set_env_keys(env_dict)
            from dotenv import load_dotenv
            load_dotenv(override=True)
    except Exception as e:
        print(f"Error syncing API keys to .env for {ex_id}: {e}")

    return True

def delete_exchange(ex_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE exchanges_config SET is_active = 0 WHERE id = ?", (ex_id,))
    conn.commit()
    conn.close()
    return True


def get_tax_settings(year=2025):
    conn = get_connection()
    c = conn.cursor()
    # Explicit column selection to prevent order issues
    c.execute("""
        SELECT year, ganancias_deduccion, ganancias_alicuota,
               iibb_tramo1_limite, iibb_tramo1_alicuota,
               iibb_tramo2_limite, iibb_tramo2_alicuota,
               iibb_tramo3_alicuota, iibb_base_calculo,
               iibb_provincia, ganancias_estimadas_fallback_pct, usd_ars_exchange_rate
        FROM tax_settings WHERE year=?
    """, (year,))
    row = c.fetchone()
    conn.close()
    if row:
        return {
            "year": row[0],
            "ganancias_deduccion": row[1],
            "ganancias_alicuota": row[2],
            "iibb_tramo1_limite": row[3],
            "iibb_tramo1_alicuota": row[4],
            "iibb_tramo2_limite": row[5],
            "iibb_tramo2_alicuota": row[6],
            "iibb_tramo3_alicuota": row[7],
            "iibb_base_calculo": row[8],
            "iibb_provincia": row[9] if row[9] is not None else 'Catamarca',
            "ganancias_estimadas_fallback_pct": row[10] if row[10] is not None else 15.0,
            "usd_ars_exchange_rate": row[11] if row[11] is not None else 1000.0
        }
    # Return defaults for new year
    return {
        "year": year,
        "ganancias_deduccion": 0.0,
        "ganancias_alicuota": 15.0,
        "iibb_tramo1_limite": 3255000000.0,
        "iibb_tramo1_alicuota": 5.0,
        "iibb_tramo2_limite": 26970000000.0,
        "iibb_tramo2_alicuota": 6.0,
        "iibb_tramo3_alicuota": 7.0,
        "iibb_base_calculo": "diferencial",
        "iibb_provincia": "Catamarca",
        "ganancias_estimadas_fallback_pct": 15.0,
        "usd_ars_exchange_rate": 1000.0
    }

def save_tax_settings(data):
    conn = get_connection()
    c = conn.cursor()
    year = int(data.get('year', 2025))
    c.execute('''
        INSERT OR REPLACE INTO tax_settings (
            year, ganancias_deduccion, ganancias_alicuota,
            iibb_tramo1_limite, iibb_tramo1_alicuota,
            iibb_tramo2_limite, iibb_tramo2_alicuota,
            iibb_tramo3_alicuota, iibb_base_calculo,
            iibb_provincia, ganancias_estimadas_fallback_pct, usd_ars_exchange_rate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        year,
        float(data.get('ganancias_deduccion', 0.0)),
        float(data.get('ganancias_alicuota', 15.0)),
        float(data.get('iibb_tramo1_limite', 3255000000.0)),
        float(data.get('iibb_tramo1_alicuota', 5.0)),
        float(data.get('iibb_tramo2_limite', 26970000000.0)),
        float(data.get('iibb_tramo2_alicuota', 6.0)),
        float(data.get('iibb_tramo3_alicuota', 7.0)),
        str(data.get('iibb_base_calculo', 'diferencial')),
        str(data.get('iibb_provincia', 'Catamarca')),
        float(data.get('ganancias_estimadas_fallback_pct', 15.0)),
        max(float(data.get('usd_ars_exchange_rate', 1000.0)), 1.0)  # enforce > 0 to avoid FIFO/tax calc breakdown
    ))
    conn.commit()
    conn.close()
    return True

def get_tax_report(year=2025):
    try:
        from fifo_engine import recalculate_fifo_costs_db
        recalculate_fifo_costs_db()
    except Exception as e:
        print(f"Error triggering FIFO recalculation before tax report: {e}")
        
    conn = get_connection()
    c = conn.cursor()
    year_str = str(year)
    settings = get_tax_settings(year)

    certifications_included = []
    has_certifications = False

    # Fetch certifications overlapping `year`
    c.execute("""
        SELECT id, title, start_date, end_date, cpa_name, file_path 
        FROM certifications 
        WHERE start_date LIKE ? OR end_date LIKE ? OR (start_date <= ? AND end_date >= ?)
        ORDER BY start_date ASC
    """, (f"{year_str}%", f"{year_str}%", f"{year_str}-12-31", f"{year_str}-01-01"))
    cert_rows = c.fetchall()

    if cert_rows:
        has_certifications = True
        for cr in cert_rows:
            certifications_included.append({
                "id": cr[0],
                "title": cr[1],
                "start_date": cr[2],
                "end_date": cr[3],
                "cpa_name": cr[4],
                "file_path": cr[5]
            })

    # Query all transactions for `year`
    query = "SELECT * FROM transactions WHERE fecha LIKE ? ORDER BY fecha ASC"
    df_all = pd.read_sql_query(query, conn, params=[f"{year_str}%"])
    conn.close()

    if df_all.empty:
        df_certified = pd.DataFrame()
        df_provisional = pd.DataFrame()
    else:
        df_certified = df_all[df_all['is_certified'] == 1]
        df_provisional = df_all[(df_all['is_certified'].isna()) | (df_all['is_certified'] == 0)]

    def calc_df_totals(df):
        if df.empty:
            return 0.0, 0.0, 0.0
        buys = df[df['tipo_operacion'].str.lower().str.contains('compra', na=False)]
        sells = df[df['tipo_operacion'].str.lower().str.contains('venta', na=False)]
        t_buys = float(buys['monto_ars'].sum()) if not buys.empty else 0.0
        t_sells = float(sells['monto_ars'].sum()) if not sells.empty else 0.0
        if not sells.empty:
            s_calc = sells.copy()
            s_calc['pnl'] = s_calc.apply(
                lambda r: r['monto_ars'] - (float(r['cotizacion_compra'] or 0.0) * float(r['monto_venta_cripto'] or 0.0)),
                axis=1
            )
            g_neta = float(s_calc['pnl'].sum())
        else:
            g_neta = 0.0
        return t_buys, t_sells, g_neta

    total_buys, total_sells, ganancia_neta = calc_df_totals(df_all)
    cert_buys, cert_sells, cert_ganancia_neta = calc_df_totals(df_certified)
    prov_buys, prov_sells, prov_ganancia_neta = calc_df_totals(df_provisional)

    # Monthly breakdown for df_all
    monthly_data = []
    if not df_all.empty:
        df_all_copy = df_all.copy()
        df_all_copy['month'] = df_all_copy['fecha'].str.slice(0, 7)
        monthly_groups = df_all_copy.groupby('month')
        for month, group in monthly_groups:
            m_sells = group[group['tipo_operacion'].str.lower().str.contains('venta', na=False)]
            m_buys = group[group['tipo_operacion'].str.lower().str.contains('compra', na=False)]
            m_sells_val = float(m_sells['monto_ars'].sum()) if not m_sells.empty else 0.0
            m_buys_val = float(m_buys['monto_ars'].sum()) if not m_buys.empty else 0.0
            m_pnl = float(m_sells.apply(
                lambda r: r['monto_ars'] - (float(r['cotizacion_compra'] or 0.0) * float(r['monto_venta_cripto'] or 0.0)), axis=1
            ).sum()) if not m_sells.empty else 0.0
            
            monthly_data.append({
                "month": month,
                "buys_ars": round(m_buys_val, 2),
                "sells_ars": round(m_sells_val, 2),
                "pnl_ars": round(m_pnl, 2)
            })

    # Tax Calculations
    deduccion = settings['ganancias_deduccion']
    alicuota_ganancias = settings['ganancias_alicuota']
    
    base_ganancias = max(0.0, ganancia_neta - deduccion)
    impuesto_ganancias = base_ganancias * (alicuota_ganancias / 100.0)

    base_ganancias_certified = max(0.0, cert_ganancia_neta - deduccion)
    impuesto_ganancias_certified = base_ganancias_certified * (alicuota_ganancias / 100.0)

    base_ganancias_provisional = max(0.0, prov_ganancia_neta)
    impuesto_ganancias_provisional = base_ganancias_provisional * (alicuota_ganancias / 100.0)

    # IIBB calculation
    provincia = settings.get('iibb_provincia', 'Catamarca')
    t1_limit = settings['iibb_tramo1_limite']
    t1_rate = settings['iibb_tramo1_alicuota']
    t2_limit = settings['iibb_tramo2_limite']
    t2_rate = settings['iibb_tramo2_alicuota']
    t3_rate = settings['iibb_tramo3_alicuota']
    
    if provincia == 'Catamarca':
        if total_sells <= t1_limit:
            tramo = 1
            alicuota_iibb = t1_rate
        elif total_sells <= t2_limit:
            tramo = 2
            alicuota_iibb = t2_rate
        else:
            tramo = 3
            alicuota_iibb = t3_rate
    else:
        tramo = 1
        alicuota_iibb = t1_rate
        
    base_iibb = ganancia_neta if settings['iibb_base_calculo'] == 'diferencial' else total_sells
    impuesto_iibb = base_iibb * (alicuota_iibb / 100.0)

    return {
        "success": True,
        "year": year,
        "has_certifications": has_certifications,
        "certifications_included": certifications_included,
        "settings": settings,
        "total_buys_ars": round(total_buys, 2),
        "total_sells_ars": round(total_sells, 2),
        "ganancia_neta": round(ganancia_neta, 2),
        "base_ganancias": round(base_ganancias, 2),
        "impuesto_ganancias": round(impuesto_ganancias, 2),
        "certified": {
            "buys_ars": round(cert_buys, 2),
            "sells_ars": round(cert_sells, 2),
            "ganancia_neta": round(cert_ganancia_neta, 2),
            "impuesto_ganancias": round(impuesto_ganancias_certified, 2)
        },
        "provisional": {
            "buys_ars": round(prov_buys, 2),
            "sells_ars": round(prov_sells, 2),
            "ganancia_neta": round(prov_ganancia_neta, 2),
            "impuesto_ganancias": round(impuesto_ganancias_provisional, 2)
        },
        "tramo_iibb": tramo,
        "alicuota_iibb": alicuota_iibb,
        "base_iibb": round(base_iibb, 2),
        "impuesto_iibb": round(impuesto_iibb, 2),
        "monthly_data": monthly_data
    }

def insert_transactions(transactions_list, trigger_fifo_recalc=True):
    """
    Inserts a list of dictionary transactions into SQLite database.
    Catches IntegrityError to safely skip duplicates (based on tx_hash).
    Prevents insertions that fall within certified date ranges.
    Returns (inserted_count, skipped_count)
    """
    if not transactions_list:
        return 0, 0
    
    conn = get_connection()
    c = conn.cursor()
    
    # Pre-fetch active certified date ranges to enforce immutability
    c.execute("SELECT start_date, end_date FROM certifications")
    certified_ranges = c.fetchall()
    
    inserted = 0
    skipped = 0
    
    for tx in transactions_list:
        try:
            raw_fecha = str(tx.get('Fecha', tx.get('fecha', ''))).strip()
            tx_exchange = str(tx.get('Exchange', tx.get('exchange', ''))).strip()
            tx_moneda = str(tx.get('Moneda', tx.get('moneda', ''))).strip()
            tx_tipo = str(tx.get('Tipo de Operación', tx.get('tipo_operacion', ''))).strip()
            tx_m_compra = float(tx.get('Monto Compra (Cripto)', tx.get('monto_compra_cripto', 0)) or 0)
            tx_m_venta = float(tx.get('Monto Venta (Cripto)', tx.get('monto_venta_cripto', 0)) or 0)
            tx_c_compra = float(tx.get('Cotización Compra', tx.get('cotizacion_compra', 0)) or 0)
            tx_c_venta = float(tx.get('Cotización Venta', tx.get('cotizacion_venta', 0)) or 0)
            tx_m_ars = float(tx.get('Monto ARS', tx.get('monto_ars', 0)) or 0)
            tx_comentarios = str(tx.get('Comentarios', tx.get('comentarios', ''))).strip()

            if not raw_fecha or not tx_exchange or not tx_moneda:
                skipped += 1
                continue

            # Robust date normalization to strict YYYY-MM-DD HH:mm:ss
            tx_fecha = raw_fecha
            try:
                import pandas as pd
                clean_s = raw_fecha[:19].replace('T', ' ')
                if len(clean_s) >= 10 and clean_s[:4].isdigit() and clean_s[4] in ('-', '/'):
                    _parsed_dt = pd.to_datetime(clean_s, errors='coerce', utc=True)
                else:
                    _parsed_dt = pd.to_datetime(raw_fecha, dayfirst=True, errors='coerce', utc=True)

                if _parsed_dt is not None and not pd.isna(_parsed_dt):
                    tx_fecha = _parsed_dt.strftime('%Y-%m-%d %H:%M:%S')
                else:
                    tx_fecha = clean_s
            except Exception:
                tx_fecha = raw_fecha[:19].replace('T', ' ')

            if len(tx_fecha) == 10:
                tx_fecha += " 00:00:00"

            # Check if transaction falls within any certified date range
            if certified_ranges:
                is_certified_range = False
                for c_start, c_end in certified_ranges:
                    if not c_start or not c_end:
                        continue
                    c_s = _normalize_cert_boundary(c_start, is_end=False)
                    c_e = _normalize_cert_boundary(c_end, is_end=True)
                    if c_s <= tx_fecha <= c_e:
                        is_certified_range = True
                        break
                        
                if is_certified_range:
                    skipped += 1
                    continue

            tx_hash = tx.get('tx_hash', '')
            if not tx_hash:
                from models_v2 import compute_canonical_tx_hash
                tx_hash = compute_canonical_tx_hash(
                    tx_fecha, tx_exchange, tx_tipo, tx_moneda,
                    tx_m_compra, tx_m_venta, tx_m_ars, tx_comentarios
                )

            c.execute('''
                INSERT INTO transactions (
                    tx_hash, fecha, exchange, tipo_operacion, moneda,
                    monto_compra_cripto, monto_venta_cripto,
                    cotizacion_compra, cotizacion_venta,
                    monto_ars, comentarios
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                tx_hash,
                tx_fecha,
                tx_exchange,
                tx_tipo,
                tx_moneda,
                tx_m_compra,
                tx_m_venta,
                tx_c_compra,
                tx_c_venta,
                tx_m_ars,
                tx_comentarios
            ))
            inserted += 1
        except sqlite3.IntegrityError:
            skipped += 1
            
    conn.commit()
    conn.close()
    
    if inserted > 0 and trigger_fifo_recalc:
        try:
            from fifo_engine import recalculate_fifo_costs_db
            recalculate_fifo_costs_db()
        except Exception as e:
            print(f"Error executing recalculate_fifo_costs_db after insert: {e}")
            
    return inserted, skipped

def get_all_transactions_df():
    """Returns all transactions as a Pandas DataFrame formatted for the Master Excel generator."""
    conn = get_connection()
    df = pd.read_sql_query("SELECT * FROM transactions ORDER BY fecha ASC", conn)
    conn.close()
    
    if df.empty:
        return pd.DataFrame()
        
    # Remap internal column names to the Spanish presentation headers expected by processor_lib & app.py
    df = df.rename(columns={
        'fecha': 'Fecha',
        'exchange': 'Exchange',
        'tipo_operacion': 'Tipo de Operación',
        'moneda': 'Moneda',
        'monto_compra_cripto': 'Monto Compra (Cripto)',
        'monto_venta_cripto': 'Monto Venta (Cripto)',
        'cotizacion_compra': 'Cotización Compra',
        'cotizacion_venta': 'Cotización Venta',
        'monto_ars': 'Monto ARS',
        'comentarios': 'Comentarios'
    })
    
    cols = [
        'Fecha', 'Exchange', 'Tipo de Operación', 'Moneda', 
        'Monto Compra (Cripto)', 'Monto Venta (Cripto)', 
        'Cotización Compra', 'Cotización Venta', 'Monto ARS', 'Comentarios', 'tx_hash',
        'is_certified', 'certification_id', 'source'
    ]
    
    real_cols = [c for c in cols if c in df.columns]
    return df[real_cols]

get_all_transactions = get_all_transactions_df

def get_transactions_by_filenames(filenames):
    """Filter transactions where comentarios contains any of the filenames."""
    if not filenames:
        return pd.DataFrame()
        
    conn = get_connection()
    conditions = []
    params = []
    for f in filenames:
        conditions.append("comentarios LIKE ?")
        params.append(f"%{f}%")
        
    query = f"SELECT * FROM transactions WHERE {' OR '.join(conditions)} ORDER BY fecha ASC"
    df = pd.read_sql_query(query, conn, params=params)
    conn.close()
    
    if df.empty:
        return pd.DataFrame()
        
    # Remap internal column names to the Spanish presentation headers expected by processor_lib & app.py
    df = df.rename(columns={
        'fecha': 'Fecha',
        'exchange': 'Exchange',
        'tipo_operacion': 'Tipo de Operación',
        'moneda': 'Moneda',
        'monto_compra_cripto': 'Monto Compra (Cripto)',
        'monto_venta_cripto': 'Monto Venta (Cripto)',
        'cotizacion_compra': 'Cotización Compra',
        'cotizacion_venta': 'Cotización Venta',
        'monto_ars': 'Monto ARS',
        'comentarios': 'Comentarios'
    })
    
    cols = [
        'Fecha', 'Exchange', 'Tipo de Operación', 'Moneda', 
        'Monto Compra (Cripto)', 'Monto Venta (Cripto)', 
        'Cotización Compra', 'Cotización Venta', 'Monto ARS', 'Comentarios', 'tx_hash'
    ]
    
    real_cols = [c for c in cols if c in df.columns]
    return df[real_cols]

def clear_db():
    """Deletes all uncertified transactions while preserving certified records."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM transactions WHERE (is_certified IS NULL OR is_certified = 0)")
    conn.commit()
    conn.close()

def delete_transactions_by_exchange(exchange_name):
    """Deletes uncertified transactions belonging to a specific exchange name and triggers FIFO recalculation."""
    if not exchange_name:
        return 0
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM transactions WHERE exchange = ? AND (is_certified IS NULL OR is_certified = 0)", (exchange_name,))
    deleted_count = c.rowcount
    conn.commit()
    conn.close()
    
    if deleted_count > 0:
        try:
            from fifo_engine import recalculate_fifo_costs_db
            recalculate_fifo_costs_db()
        except Exception as e:
            print(f"Error recalculating FIFO costs after deleting exchange {exchange_name}: {e}")
            
    return deleted_count


from datetime import datetime
def get_latest_transaction_timestamp(exchange_name, currency):
    conn = get_connection()
    c = conn.cursor()
    exchanges = [exchange_name]
    if exchange_name == 'Bitso Alpha':
        exchanges.append('Bitso')
    elif exchange_name == 'Ripio Trade':
        exchanges.append('Ripio')
    placeholders = ','.join(['?'] * len(exchanges))
    c.execute(f"""
        SELECT MAX(fecha) FROM transactions 
        WHERE exchange IN ({placeholders}) AND moneda = ?
    """, (*exchanges, currency))
    row = c.fetchone()
    conn.close()
    if row and row[0]:
        try:
            dt = datetime.strptime(row[0], '%Y-%m-%d %H:%M:%S')
            return int(dt.timestamp() * 1000)
        except Exception:
            return None
    return None

def get_exchange_last_tx_date(exchange_name):
    """Returns the maximum transaction date string for an exchange in DB, formatted as DD/MM/YYYY HH:MM:SS or '-'."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT MAX(fecha) FROM transactions WHERE exchange = ?", (exchange_name,))
    row = c.fetchone()
    conn.close()
    if row and row[0]:
        val = str(row[0])
        try:
            parts = val.split(' ')
            d_parts = parts[0].split('-')
            if len(d_parts) == 3:
                formatted_date = f"{d_parts[2]}/{d_parts[1]}/{d_parts[0]}"
                if len(parts) > 1:
                    t_str = parts[1].strip()
                    if len(t_str) == 5:
                        t_str += ":00"
                    formatted_date += f" {t_str[:8]}"
                return formatted_date
        except Exception:
            return val
    return '-'



# --- ANALYTICAL QUERIES FOR DASHBOARD ---

def _build_filter_sql(date_start=None, date_end=None, exchanges=None, prefix="WHERE", status_filter=None):
    conditions = []
    params = []
    if date_start and str(date_start).strip():
        conditions.append("fecha >= ?")
        if len(str(date_start)) > 10:
            params.append(str(date_start))
        else:
            params.append(str(date_start)[:10] + " 00:00:00")
    if date_end and str(date_end).strip():
        conditions.append("fecha <= ?")
        if len(str(date_end)) > 10:
            params.append(str(date_end))
        else:
            params.append(str(date_end)[:10] + " 23:59:59")
    if exchanges:
        if isinstance(exchanges, str):
            exchanges = [e.strip() for e in exchanges.split(',') if e.strip()]
        if isinstance(exchanges, list) and len(exchanges) > 0:
            placeholders = ','.join(['?'] * len(exchanges))
            conditions.append(f"exchange IN ({placeholders})")
            params.extend(exchanges)
            
    if status_filter == 'certified':
        conditions.append("is_certified = 1")
    elif status_filter == 'uncertified':
        conditions.append("(is_certified IS NULL OR is_certified = 0)")
    
    if conditions:
        return f" {prefix} " + " AND ".join(conditions), params
    return "", []

def get_kpis(date_start=None, date_end=None, exchanges=None, status_filter=None):
    """Calculates high-level KPIs for the overview dashboard, including certified vs provisional breakdown."""
    conn = get_connection()
    c = conn.cursor()
    
    # Exclude swap legs ([INTERCAMBIO:]) to avoid double-counting both legs of a crypto swap.
    swap_exclude = "AND (comentarios NOT LIKE '%[INTERCAMBIO:%' OR comentarios IS NULL)"

    # 1. Total Volume ARS (excluding swap legs to prevent double-count)
    c.execute(f"SELECT SUM(monto_ars) FROM transactions {filter_sql} {swap_exclude if 'WHERE' in filter_sql else 'WHERE ' + swap_exclude[4:]}", params)
    total_volume_ars = c.fetchone()[0] or 0.0
    
    # 2. Total Buys vs Sells ARS (excluding swap legs)
    buys_filter, buys_params = _build_filter_sql(date_start, date_end, exchanges, "AND", status_filter)
    c.execute(f"SELECT SUM(monto_ars) FROM transactions WHERE tipo_operacion='Compra' AND (comentarios NOT LIKE '%[INTERCAMBIO:%' OR comentarios IS NULL){buys_filter}", buys_params)
    total_buys_ars = c.fetchone()[0] or 0.0
    
    c.execute(f"SELECT SUM(monto_ars) FROM transactions WHERE tipo_operacion='Venta' AND (comentarios NOT LIKE '%[INTERCAMBIO:%' OR comentarios IS NULL){buys_filter}", buys_params)
    total_sells_ars = c.fetchone()[0] or 0.0
    
    # 3. Operations Count
    c.execute(f"SELECT COUNT(*) FROM transactions {filter_sql}", params)
    tx_count = c.fetchone()[0] or 0

    # 4. Certified vs Provisional Breakdown
    cert_filter, cert_params = _build_filter_sql(date_start, date_end, exchanges, "AND", "certified")
    c.execute(f"SELECT SUM(monto_ars), COUNT(*) FROM transactions WHERE is_certified=1{cert_filter}", cert_params)
    c_row = c.fetchone()
    certified_volume = c_row[0] or 0.0
    certified_count = c_row[1] or 0

    uncert_filter, uncert_params = _build_filter_sql(date_start, date_end, exchanges, "AND", "uncertified")
    c.execute(f"SELECT SUM(monto_ars), COUNT(*) FROM transactions WHERE (is_certified IS NULL OR is_certified=0){uncert_filter}", uncert_params)
    u_row = c.fetchone()
    provisional_volume = u_row[0] or 0.0
    provisional_count = u_row[1] or 0

    # 5. Latest Certification End Date
    c.execute("SELECT MAX(end_date) FROM certifications")
    last_cert_end = c.fetchone()[0]

    conn.close()
    
    certified_pct = round((certified_volume / total_volume_ars * 100.0), 1) if total_volume_ars > 0 else 0.0

    return {
        "total_volume_ars": round(total_volume_ars, 2),
        "total_buys_ars": round(total_buys_ars, 2),
        "total_sells_ars": round(total_sells_ars, 2),
        "tx_count": tx_count,
        "certified_volume_ars": round(certified_volume, 2),
        "provisional_volume_ars": round(provisional_volume, 2),
        "certified_count": certified_count,
        "provisional_count": provisional_count,
        "certified_pct": certified_pct,
        "last_certified_end": last_cert_end
    }

def get_daily_volume(date_start=None, date_end=None, exchanges=None, status_filter=None):
    """Aggregates buy/sell volume by day for charting."""
    conn = get_connection()
    filter_sql, params = _build_filter_sql(date_start, date_end, exchanges, "WHERE", status_filter)
    
    query = f"""
        SELECT 
            SUBSTR(fecha, 1, 10) as day,
            SUM(CASE WHEN tipo_operacion='Compra' THEN monto_ars ELSE 0 END) as buys,
            SUM(CASE WHEN tipo_operacion='Venta' THEN monto_ars ELSE 0 END) as sells
        FROM transactions
        {filter_sql}
        GROUP BY day
        ORDER BY day ASC
    """
    
    df = pd.read_sql_query(query, conn, params=params)
    conn.close()
    
    return _clean_df_for_json(df)

def _clean_df_for_json(df):
    """Converts NaNs to None so jsonify produces valid JSON nulls instead of invalid NaN tokens."""
    if df is None or df.empty:
        return []
    return df.astype(object).where(pd.notnull(df), None).to_dict(orient='records')

def get_exchange_distribution(date_start=None, date_end=None, exchanges=None, status_filter=None):
    """Calculates operation volume distribution by exchange."""
    conn = get_connection()
    filter_sql, params = _build_filter_sql(date_start, date_end, exchanges, "WHERE", status_filter)
    
    query = f"""
        SELECT 
            exchange as name,
            SUM(monto_ars) as value
        FROM transactions
        {filter_sql}
        GROUP BY exchange
        ORDER BY value DESC
    """
    
    df = pd.read_sql_query(query, conn, params=params)
    conn.close()
    
    return _clean_df_for_json(df)

def get_equity_curve(date_start=None, date_end=None, exchanges=None, interval='daily', status_filter=None):
    """Calculates cumulative net cashflow / profit equity curve."""
    conn = get_connection()
    
    # Normalize empty strings to None
    if date_start is not None and not str(date_start).strip():
        date_start = None
    if date_end is not None and not str(date_end).strip():
        date_end = None

    # Calculate default range if no dates are provided
    if date_start is None and date_end is None:
        c = conn.cursor()
        c.execute("SELECT MAX(fecha) FROM transactions")
        row = c.fetchone()
        if row and row[0]:
            latest_date_str = row[0]
            latest_date = pd.to_datetime(latest_date_str)
            
            if interval == 'daily':
                # Last 24 hours
                date_end = latest_date.strftime('%Y-%m-%d %H:%M:%S')
                date_start = (latest_date - pd.Timedelta(hours=24)).strftime('%Y-%m-%d %H:%M:%S')
            elif interval == 'weekly':
                # Last 7 days
                date_end = latest_date.strftime('%Y-%m-%d 23:59:59')
                date_start = (latest_date - pd.Timedelta(days=7)).strftime('%Y-%m-%d 00:00:00')
            elif interval == 'monthly':
                # Last 30 days
                date_end = latest_date.strftime('%Y-%m-%d 23:59:59')
                date_start = (latest_date - pd.Timedelta(days=30)).strftime('%Y-%m-%d 00:00:00')
            elif interval == 'yearly':
                # Last 365 days
                date_end = latest_date.strftime('%Y-%m-%d 23:59:59')
                date_start = (latest_date - pd.Timedelta(days=365)).strftime('%Y-%m-%d 00:00:00')

    # Calculate initial equity before date_start
    initial_equity = 0.0
    if date_start:
        prior_filter, prior_params = _build_filter_sql(None, (pd.to_datetime(date_start) - pd.Timedelta(seconds=1)).strftime('%Y-%m-%d %H:%M:%S'), exchanges, "WHERE", status_filter)
        prior_query = f"SELECT tipo_operacion, monto_ars, cotizacion_compra, monto_venta_cripto FROM transactions {prior_filter}"
        
        prior_df = pd.read_sql_query(prior_query, conn, params=prior_params)
        if not prior_df.empty:
            prior_df['net_flow'] = prior_df.apply(
                lambda r: (float(r['monto_ars'] or 0.0) - (float(r['cotizacion_compra'] or 0.0) * float(r['monto_venta_cripto'] or 0.0))) if 'VENTA' in str(r['tipo_operacion']).upper() else 0.0, 
                axis=1
            )
            initial_equity = prior_df['net_flow'].sum()

    filter_sql, params = _build_filter_sql(date_start, date_end, exchanges, "WHERE", status_filter)
    query = f"SELECT fecha, tipo_operacion, monto_ars, cotizacion_compra, monto_venta_cripto FROM transactions {filter_sql} ORDER BY fecha ASC"
    df = pd.read_sql_query(query, conn, params=params)
    conn.close()
    
    # Process net realized PNL flows
    if not df.empty:
        df['fecha'] = pd.to_datetime(df['fecha'])
        df['net_flow'] = df.apply(
            lambda r: (float(r['monto_ars'] or 0.0) - (float(r['cotizacion_compra'] or 0.0) * float(r['monto_venta_cripto'] or 0.0))) if 'VENTA' in str(r['tipo_operacion']).upper() else 0.0, 
            axis=1
        )
    else:
        df = pd.DataFrame(columns=['fecha', 'net_flow'])

        
    # Append dummy boundary rows to force full resampling range
    if date_start and date_end:
        start_dt = pd.to_datetime(date_start)
        end_dt = pd.to_datetime(date_end)
        dummy_df = pd.DataFrame([
            {'fecha': start_dt, 'net_flow': 0.0},
            {'fecha': end_dt, 'net_flow': 0.0}
        ])
        df = pd.concat([df[['fecha', 'net_flow']], dummy_df], ignore_index=True)
        
    if df.empty:
        return []
        
    df = df.sort_values('fecha')
    
    freq_map = {
        'daily': 'D',
        'weekly': 'D',
        'monthly': 'D',
        'yearly': 'M'
    }
    freq = freq_map.get(interval, 'D')
    
    grouped = df.set_index('fecha').resample(freq)['net_flow'].sum().reset_index()
    grouped['equity'] = grouped['net_flow'].cumsum() + initial_equity
    
    if freq == 'h':
        grouped['period'] = grouped['fecha'].dt.strftime('%H:%M')
    elif freq == 'M':
        grouped['period'] = grouped['fecha'].dt.strftime('%Y-%m')
    else:
        grouped['period'] = grouped['fecha'].dt.strftime('%Y-%m-%d')
    
    result = []
    for _, row in grouped.iterrows():
        result.append({
            "period": row['period'],
            "equity": round(row['equity'], 2),
            "net_flow": round(row['net_flow'], 2)
        })
    return result

def get_modal_spread(date_start=None, date_end=None, exchanges=None, status_filter=None):
    """Calculates the most frequent (modal) percentage spread in trade operations using FIFO costs."""
    if date_start is not None and not str(date_start).strip():
        date_start = None
    if date_end is not None and not str(date_end).strip():
        date_end = None

    conn = get_connection()
    filter_sql, params = _build_filter_sql(date_start, date_end, exchanges, "AND", status_filter)
    
    query = f"SELECT cotizacion_compra, cotizacion_venta FROM transactions WHERE tipo_operacion='Venta' AND cotizacion_venta > 0 AND cotizacion_compra > 0{filter_sql}"
    
    df_sales = pd.read_sql_query(query, conn, params=params)
    conn.close()
    
    if df_sales.empty:
        return {"modal_spread": 0.0, "sample_count": 0}
        
    spreads = []
    for _, row in df_sales.iterrows():
        buy_price = float(row['cotizacion_compra'])
        sell_price = float(row['cotizacion_venta'])
        if buy_price > 0:
            spread = ((sell_price / buy_price) - 1.0) * 100.0
            # Exclude fallback/unmatched values (approx 17.65% spread)
            if abs(spread - 17.647) < 0.1:
                continue
            # Keep reasonable spreads (e.g. between -30% and 50%)
            if -30.0 < spread < 50.0:
                spreads.append(round(spread, 1))
                
    if not spreads:
        return {"modal_spread": 0.0, "sample_count": 0}
        
    df_spreads = pd.Series(spreads)
    mode_val = df_spreads.mode()
    modal_spread = float(mode_val.iloc[0]) if not mode_val.empty else 0.0
    return {"modal_spread": max(0.0, modal_spread), "sample_count": len(spreads)}



def get_transactions(exchanges=None, date_start=None, date_end=None, status_filter=None):
    """Fetches transactions filtered by exchange, date range, and certification status."""
    conn = get_connection()
    query = "SELECT * FROM transactions WHERE 1=1"
    params = []
    
    if exchanges and isinstance(exchanges, list) and len(exchanges) > 0:
        expanded = set()
        for ex in exchanges:
            expanded.add(ex)
            if ex == 'Bitso Alpha':
                expanded.add('Bitso')
            elif ex == 'Ripio Trade':
                expanded.add('Ripio')
        ex_list = list(expanded)
        placeholders = ','.join(['?'] * len(ex_list))
        query += f" AND exchange IN ({placeholders})"
        params.extend(ex_list)
        
    if date_start and str(date_start).strip():
        query += " AND fecha >= ?"
        params.append(str(date_start)[:10] + " 00:00:00")
        
    if date_end and str(date_end).strip():
        query += " AND fecha <= ?"
        params.append(str(date_end)[:10] + " 23:59:59")
        
    if status_filter == 'certified':
        query += " AND is_certified = 1"
    elif status_filter == 'uncertified':
        query += " AND (is_certified IS NULL OR is_certified = 0)"

    query += " ORDER BY fecha ASC"
    
    df = pd.read_sql_query(query, conn, params=params)
    conn.close()
    
    # Remap for UI/Excel
    df = df.rename(columns={
        'fecha': 'Fecha',
        'exchange': 'Exchange',
        'tipo_operacion': 'Tipo de Operación',
        'moneda': 'Moneda',
        'monto_compra_cripto': 'Monto Compra (Cripto)',
        'monto_venta_cripto': 'Monto Venta (Cripto)',
        'cotizacion_compra': 'Cotización Compra',
        'cotizacion_venta': 'Cotización Venta',
        'monto_ars': 'Monto ARS',
        'comentarios': 'Comentarios'
    })
    
    return _clean_df_for_json(df)

def get_processing_history():
    """Returns a simplified history of unique exchanges/dates in the DB."""
    conn = get_connection()
    query = """
        SELECT exchange, MIN(fecha) as first_tx, MAX(fecha) as last_tx, COUNT(*) as count 
        FROM transactions 
        GROUP BY exchange
    """
    try:
        df = pd.read_sql_query(query, conn)
        return _clean_df_for_json(df)
    except Exception as e:
        print(f"Error fetching history: {e}")
        return []
    finally:
        conn.close()

def check_history_gaps(exchanges=None, date_start=None, date_end=None):
    """
    Analyzes the chronological sequence of transactions to find dates where 
    the cumulative balance of any coin goes negative, indicating missing purchase history.
    """
    conn = get_connection()
    # Fetch all transactions up to date_end to have full historical context for balances
    query = "SELECT fecha, exchange, moneda, tipo_operacion, monto_compra_cripto, monto_venta_cripto FROM transactions WHERE UPPER(TRIM(moneda)) NOT IN ('ARS', 'USD', 'EUR', 'NONE', '')"
    params = []
    
    if exchanges and isinstance(exchanges, list) and len(exchanges) > 0:
        placeholders = ','.join(['?'] * len(exchanges))
        query += f" AND exchange IN ({placeholders})"
        params.extend(exchanges)
        
    if date_end:
        query += " AND fecha <= ?"
        params.append(str(date_end)[:10] + " 23:59:59")
        
    query += " ORDER BY fecha ASC"
    
    try:
        df = pd.read_sql_query(query, conn, params=params)
    except Exception as e:
        print(f"Error fetching data for gap check: {e}")
        return []
    # Query latest certified end date from certifications table
    max_cert_date = None
    try:
        c_cursor = conn.cursor()
        c_cursor.execute("SELECT MAX(end_date) FROM certifications")
        c_row = c_cursor.fetchone()
        if c_row and c_row[0]:
            max_cert_date = str(c_row[0])[:10] + " 23:59:59"
    except Exception as e:
        print(f"Notice: Certifications check in gaps engine: {e}")
    finally:
        conn.close()
        
    if df.empty:
        return []

    gaps = []
    from models_v2 import get_canonical_exchange_root
    df['exchange_root'] = df['exchange'].apply(get_canonical_exchange_root)
    # Group by canonical exchange root and coin to check running balance
    grouped = df.groupby(['exchange_root', 'moneda'])
    
    for (exch_root, coin), group in grouped:
        balance = 0.0
        # Sort chronologically to track history
        group_sorted = group.sort_values('fecha')
        
        for _, row in group_sorted.iterrows():
            tipo = str(row['tipo_operacion']).lower()
            m_compra = float(row['monto_compra_cripto'] or 0.0)
            m_venta = float(row['monto_venta_cripto'] or 0.0)
            
            is_buy = 'compra' in tipo or 'ingreso' in tipo or 'deposito' in tipo or 'ajuste' in tipo or (m_compra > 0 and m_venta == 0)
            is_sell = 'venta' in tipo or 'retiro' in tipo or 'envio' in tipo or (m_venta > 0 and m_compra == 0)
            
            if is_buy:
                balance += m_compra
            elif is_sell:
                new_balance = balance - m_venta
                if new_balance < -1e-9: # tolerance for floating point precision
                    # Check if this gap falls within the user's requested date range and AFTER latest certification
                    is_in_range = True
                    if date_start and row['fecha'] < str(date_start):
                        is_in_range = False
                    if max_cert_date and row['fecha'] <= max_cert_date:
                        is_in_range = False
                        
                    if is_in_range:
                        deficit = abs(new_balance)
                        # Record gap details
                        gaps.append({
                            "exchange": row['exchange'],
                            "coin": coin,
                            "date": row['fecha'],
                            "deficit": deficit,
                            "sold_qty": m_venta,
                            "available_qty": balance
                        })
                    # Reset balance to 0 for running calculations to avoid compounding warnings
                    balance = 0.0
                else:
                    balance = new_balance
    return gaps


# --- CERTIFICATIONS (CALENDARIO) FUNCTIONS ---

def get_certifications():
    from datetime import datetime, date
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT id, title, start_date, end_date, issue_date, cpa_name, notes, file_path, created_at
        FROM certifications
        ORDER BY start_date ASC
    """)
    rows = c.fetchall()
    conn.close()

    cert_list = []
    latest_end = None
    latest_end_str = None

    for r in rows:
        item = {
            "id": r[0],
            "title": r[1],
            "start_date": r[2],
            "end_date": r[3],
            "issue_date": r[4],
            "cpa_name": r[5],
            "notes": r[6],
            "file_path": r[7],
            "created_at": r[8]
        }
        cert_list.append(item)
        if r[3]:
            raw_end = str(r[3]).strip()
            date_part = raw_end.split(' ')[0]
            try:
                ed = datetime.strptime(date_part, "%Y-%m-%d").date()
                if latest_end is None or ed >= latest_end:
                    latest_end = ed
                    latest_end_str = raw_end
            except Exception:
                pass

    today = date.today()
    if latest_end is None:
        status = "pending"
        uncertified_days = None
        latest_end_str = None
    elif latest_end >= today:
        status = "up_to_date"
        uncertified_days = 0
    else:
        status = "pending"
        uncertified_days = (today - latest_end).days

    return {
        "certifications": cert_list,
        "summary": {
            "total_count": len(cert_list),
            "status": status,
            "latest_end_date": latest_end_str,
            "uncertified_days": uncertified_days,
            "today": today.strftime("%Y-%m-%d")
        }
    }

def get_last_certification_end_datetime():
    """
    Retorna el end_date exacto (objeto datetime) de la certificación más reciente.
    Retorna None si no hay certificaciones registradas.
    """
    from datetime import datetime
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT end_date FROM certifications
        ORDER BY end_date DESC
        LIMIT 1
    """)
    row = c.fetchone()
    conn.close()
    if row and row[0]:
        raw = str(row[0]).strip()
        for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%d'):
            try:
                return datetime.strptime(raw[:len(fmt.replace('%Y','0000').replace('%m','00').replace('%d','00').replace('%H','00').replace('%M','00').replace('%S','00'))], fmt)
            except ValueError:
                continue
        # Fallback: intentar parsear hasta 19 chars
        try:
            return datetime.strptime(raw[:19], '%Y-%m-%d %H:%M:%S')
        except Exception:
            try:
                return datetime.strptime(raw[:10], '%Y-%m-%d')
            except Exception:
                pass
    return None


def add_certification(title, start_date, end_date, issue_date=None, cpa_name=None, notes=None, file_path=None):
    from datetime import datetime

    current_time = datetime.now().strftime('%H:%M:%S')

    # Preserve full timestamps if already provided (H:M:S from PDF extraction)
    # Only add default times if only a date (10 chars) was provided
    if start_date:
        start_date = _normalize_cert_boundary(start_date, is_end=False)

    if end_date:
        end_date = _normalize_cert_boundary(end_date, is_end=True)

    if issue_date and len(str(issue_date).strip()) == 10:
        issue_date = str(issue_date).strip() + " " + current_time
    elif not issue_date:
        issue_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO certifications (title, start_date, end_date, issue_date, cpa_name, notes, file_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (title, start_date, end_date, issue_date, cpa_name, notes, file_path))
    cert_id = c.lastrowid
    conn.commit()

    # Enforce consecutive ordering and sync transaction statuses after insert
    try:
        fix_corrupted_certifications(conn=conn)
        sync_certified_transactions_status(conn=conn)
        conn.commit()
    except Exception as e:
        print(f"[ADD CERT] Error enforcing consecutive order/sync: {e}")

    conn.close()
    return cert_id


def get_certification_by_id(cert_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT id, title, start_date, end_date, issue_date, cpa_name, notes, file_path, created_at
        FROM certifications WHERE id = ?
    """, (cert_id,))
    r = c.fetchone()
    conn.close()
    if not r:
        return None
    return {
        "id": r[0],
        "title": r[1],
        "start_date": r[2],
        "end_date": r[3],
        "issue_date": r[4],
        "cpa_name": r[5],
        "notes": r[6],
        "file_path": r[7],
        "created_at": r[8]
    }

def delete_certification(cert_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM certifications WHERE id = ?", (cert_id,))
    conn.commit()
    conn.close()
    try:
        sync_certified_transactions_status()
    except Exception as e:
        print(f"[DELETE CERT] Error syncing after delete: {e}")
    return True

def get_latest_transaction_info():
    """Returns the earliest and latest transaction timestamps recorded in the database."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT MIN(fecha), MAX(fecha), COUNT(*) FROM transactions")
    row = c.fetchone()
    conn.close()
    if row and row[1]:
        return {
            "first_tx_date": row[0],
            "latest_tx_date": row[1],
            "total_transactions": row[2]
        }
def get_last_cpa_name():
    """Returns the most recently recorded accountant name from previous certifications."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT cpa_name FROM certifications WHERE cpa_name IS NOT NULL AND cpa_name != '' ORDER BY id DESC LIMIT 1")
    row = c.fetchone()
    conn.close()
    return row[0] if row else None




