import re
import io
import os
import unicodedata
import pandas as pd
import config_manager
from exceptions import MissingColumnsError
import zipfile
import tarfile
import hashlib

def _normalize_text(s):
    """
    Lowercases, strips whitespace/BOM, and removes accents/diacritics so that
    column names and status/type values match consistently regardless of the
    source file's encoding or language (e.g. 'Número de Pedido' == 'numero de pedido',
    'Creación' == 'creacion'). Used everywhere we compare user-provided text
    against known keyword lists, so detection stays robust as new file variants
    (different encodings, locales, Binance UI text changes) show up.
    """
    if s is None:
        return ""
    s = str(s).replace('\ufeff', '').strip().lower()
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    return s.strip()

# Statuses that mean a P2P/order row should NEVER be counted, regardless of
# language or exact wording used by the exchange. This is a BLACKLIST (rather
# than a whitelist of "completed" words) on purpose: new/unseen "completed"
# wordings (any language, any future Binance UI change) are included by
# default, while anything clearly not-final is excluded. This is what actually
# drives is_cancelled_transaction() and the P2P status filter below.
_NEGATIVE_STATUS_KEYWORDS = (
    'cancel', 'rechaz', 'reject', 'fallid', 'fail', 'expir', 'incomplet',
    'incomplete', 'error', 'devuel', 'refund', 'pend', 'progres', 'progress',
    'esperando', 'waiting', 'apelaci', 'appeal', 'disput', 'en curso'
)

# Optional Imports for Extended Support
try:
    import py7zr
except ImportError:
    py7zr = None
    
try:
    import rarfile
except ImportError:
    rarfile = None

def validate_columns(df, exchange):
    """Checks if critical columns exist in the dataframe based on config."""
    config = config_manager.load_config()
    if exchange not in config: return # Skip if no config
    
    required_map = config[exchange]['columns']
    missing = []
    
    # Check only values that are not empty string (some configs might be optional)
    # But usually all are needed. Let's check all present in config.
    df_cols = [str(c).lower().strip() for c in df.columns]
    
    for key, col_name in required_map.items():
        if not col_name: continue # Skip empty config
        if str(col_name).lower().strip() not in df_cols:
            missing.append(f"{key} ('{col_name}')")
            
    if missing:
        # We only look at the first 50 chars of columns to avoid huge error messages
        available = [str(c)[:20] for c in df.columns]
        raise MissingColumnsError(exchange, missing, available)

# --- UTILS ---

def parse_date(date_str, exchange):
    """Parses date using configured format with resilient fallback."""
    fmt = config_manager.get_date_format(exchange)
    
    if fmt:
        try:
            parsed = pd.to_datetime(date_str, format=fmt)
            if not pd.isna(parsed):
                return parsed
        except Exception:
            try:
                # Resilient fallback if seconds or millisecond precision differs slightly
                parsed = pd.to_datetime(date_str, dayfirst=True, errors='coerce')
                if not pd.isna(parsed):
                    return parsed
            except Exception:
                pass
            print(f"Date Parse Warning: '{date_str}' did not match exact format '{fmt}' for {exchange}. Using fallback.")
            
    # Default to Argentina (Day First)
    try:
        parsed = pd.to_datetime(date_str, dayfirst=True, errors='coerce')
        if not pd.isna(parsed):
            return parsed
    except Exception:
        pass
    try:
        parsed = pd.to_datetime(date_str, errors='coerce')
        if not pd.isna(parsed):
            return parsed
    except Exception:
        pass
    return pd.to_datetime('today')

def clean_decimal(val):
    if isinstance(val, (int, float)): return float(val)
    if pd.isna(val): return 0.0
    s = str(val).strip()
    if not s: return 0.0
    
    # Robust handling for 1.234,56 (Spanish) vs 1,234.56 (English)
    if ',' in s and '.' in s:
        if s.rfind(',') > s.rfind('.'):
             # Spanish: 1.234,56 -> Remove dots, replace comma
             s = s.replace('.', '').replace(',', '.')
        else:
             # English: 1,234.56 -> Remove commas
             s = s.replace(',', '')
    elif ',' in s:
        s = s.replace(',', '.')
        
    try:
        return float(s)
    except Exception as e:
        # Final fallback: assume dots are thousand separators
        try:
            return float(s.replace('.', ''))
        except Exception as e2:
            print(f"Error parseando decimal '{val}': {e} / {e2}")
            return 0.0

def limpiar_numero_binance(valor):
    """Convierte '20USDT' -> 20.0 (float)"""
    if pd.isna(valor) or str(valor).strip() == '':
        return 0.0
    match = re.search(r"([\d\.]+)", str(valor))
    if match:
        return float(match.group(1))
    return 0.0

def is_cancelled_transaction(row):
    """
    Scans the row for any status/estado column and returns True if the
    transaction is cancelled, rejected, failed, expired, pending, or disputed.

    Uses substring matching against a normalized (accent/case-insensitive)
    value, not exact equality, so wordings like "System cancelled",
    "Cancelada por el vendedor", or "Apelación en curso" are all caught
    without needing to enumerate every possible phrase Binance/other
    exchanges might use.
    """
    status_keywords = {'estado', 'status', 'state'}
    
    cols = row.keys() if hasattr(row, 'keys') else getattr(row, 'index', [])
    for col in cols:
        col_clean = _normalize_text(col)
        if any(kw in col_clean for kw in status_keywords):
            val_str = _normalize_text(row[col])
            if not val_str:
                continue
            if any(kw in val_str for kw in _NEGATIVE_STATUS_KEYWORDS):
                return True
    return False

def create_transaction(fecha, exchange, tipo_op, moneda, m_compra, m_venta, cot_compra, cot_venta, m_ars, comentario="", unique_id=None):
    from models_v2 import compute_canonical_tx_hash
    if isinstance(fecha, pd.Timestamp):
        fecha_fmt = fecha.strftime('%Y-%m-%d %H:%M:%S')
    else:
        try:
            parsed_dt = pd.to_datetime(fecha, dayfirst=True, errors='coerce')
            if pd.isna(parsed_dt):
                parsed_dt = pd.to_datetime(fecha, errors='coerce')
            if not pd.isna(parsed_dt):
                fecha_fmt = parsed_dt.strftime('%Y-%m-%d %H:%M:%S')
            else:
                fecha_fmt = pd.to_datetime('today').strftime('%Y-%m-%d %H:%M:%S')
        except Exception:
            fecha_fmt = pd.to_datetime('today').strftime('%Y-%m-%d %H:%M:%S')
    
    ref = str(unique_id) if unique_id is not None else str(comentario)
    tx_hash = compute_canonical_tx_hash(fecha_fmt, exchange, tipo_op, moneda, m_compra, m_venta, m_ars, ref)

    return {
        'Fecha': fecha_fmt,
        'Exchange': exchange,
        'Tipo de Operación': tipo_op,
        'Moneda': moneda,
        'Monto Compra (Cripto)': float(round(m_compra, 8)) if m_compra > 0 else 0,
        'Monto Venta (Cripto)': float(round(m_venta, 8)) if m_venta > 0 else 0,
        'Cotización Compra': float(round(cot_compra, 2)) if cot_compra > 0 else 0,
        'Cotización Venta': float(round(cot_venta, 2)) if cot_venta > 0 else 0,
        'Monto ARS': float(round(abs(m_ars), 2)),
        'Comentarios': comentario,
        'tx_hash': tx_hash
    }

# --- API NORMALIZATION ---

def process_api_trades(exchange_name, trades):
    """
    Normalizes a list of ccxt trades (or Ripio generic trades) 
    into the standard internal transaction format.
    """
    processed = []
    
    for t in trades:
        try:
            # Check if this is a CCXT trade (has 'symbol' and 'side')
            if 'symbol' in t and 'side' in t:
                # CCXT Format
                dt_str = t.get('datetime', '')
                if dt_str.endswith('Z'): dt_str = dt_str[:-1]
                try:
                    fecha = pd.to_datetime(dt_str)
                except Exception as e:
                    print(f"Error parseando fecha CCXT '{dt_str}': {e}")
                    fecha = pd.to_datetime('today')
                    
                symbol = str(t.get('symbol', ''))
                crypto = symbol.split('/')[0] if '/' in symbol else symbol
                side = str(t.get('side', '')).lower()
                
                amount_crypto = float(t.get('amount', 0))
                price = float(t.get('price', 0))
                cost = float(t.get('cost', amount_crypto * price)) # Fiat amount
                
                if side == 'buy':
                    processed.append(create_transaction(
                        fecha, exchange_name, 'Compra', crypto,
                        amount_crypto, 0, price, 0, cost, f"ID: {t.get('id', '')}", unique_id=t.get('id')
                    ))
                elif side == 'sell':
                    processed.append(create_transaction(
                        fecha, exchange_name, 'Venta', crypto,
                        0, amount_crypto, 0, price, cost, f"ID: {t.get('id', '')}", unique_id=t.get('id')
                    ))

            # Ripio Format handling (from /v4/user/trades endpoint)
            elif 'pair' in t and ('total_value' in t or 'cost' in t):
                dt_str = t.get('date', t.get('created_at', ''))
                try: fecha = pd.to_datetime(dt_str)
                except Exception as e:
                    print(f"Error parseando fecha Ripio '{dt_str}': {e}")
                    fecha = pd.to_datetime('today')
                
                crypto = str(t['pair']).split('_')[0]
                amount_crypto = float(t.get('amount', t.get('executed_amount', 0)))
                price = float(t.get('price', 0))
                cost = float(t.get('total_value', t.get('cost', t.get('total', 0))))
                
                # Try to extract the side. Ripio sometimes provides 'side' or 'type' for user trades
                side = str(t.get('side', t.get('type', ''))).lower()
                
                if 'buy' in side or 'compra' in side:
                    processed.append(create_transaction(
                        fecha, exchange_name, 'Compra', crypto,
                        amount_crypto, 0, price, 0, cost, f"ID: {t.get('id', '')}", unique_id=t.get('id')
                    ))
                elif 'sell' in side or 'venta' in side:
                    processed.append(create_transaction(
                        fecha, exchange_name, 'Venta', crypto,
                        0, amount_crypto, 0, price, cost, f"ID: {t.get('id', '')}", unique_id=t.get('id')
                    ))
                else: # Fallback if API changed format unpredictably
                    processed.append(create_transaction(
                        fecha, exchange_name, 'Operacion Ripio', crypto,
                        amount_crypto, 0, price, 0, cost, f"ID: {t.get('id', '')} Side: {side}", unique_id=t.get('id')
                    ))
        except Exception as e:
            print(f"Error normalizing API trade: {e}")
            continue
            
    return processed

# --- GENERIC ARCHIVE PROCESSOR ---

def process_archive(file_obj, filename, depth=0, state=None):
    """
    Recursively process files inside an archive (ZIP/TAR/7z/RAR).
    Returns aggregated processed transactions and raw samples.
    """
    if state is None:
        state = {"extracted_size": 0}
    if depth > 3:
        raise ValueError("Excedida la profundidad máxima de descompresión permitida (límite: 3).")
        
    MAX_EXTRACT_SIZE = 100 * 1024 * 1024 # 100 MB
    print(f"Processing Archive: {filename} (depth={depth})")
    processed = []
    raw_sample = [] # We might only keep samples from the first few files to avoid bloat
    
    try:
        # ZIP Support
        if zipfile.is_zipfile(file_obj):
            # print("  > Is ZIP")
            with zipfile.ZipFile(file_obj, 'r') as z:
                for member_name in z.namelist():
                    # Skip directories and hidden files (MacOS)
                    if member_name.endswith('/') or '__MACOSX' in member_name or member_name.startswith('.'):
                        continue
                        
                    with z.open(member_name) as f:
                        remaining = MAX_EXTRACT_SIZE - state["extracted_size"]
                        if remaining <= 0:
                            raise ValueError("El archivo comprimido supera el tamaño límite de extracción de 100MB.")
                        content = f.read(remaining + 1)
                        state["extracted_size"] += len(content)
                        if state["extracted_size"] > MAX_EXTRACT_SIZE:
                            raise ValueError("El archivo de extracción excede el límite permitido de 100MB.")
                            
                        sub_file = io.BytesIO(content)
                        
                        p, r = process_uploaded_file(sub_file, member_name, depth + 1, state)
                        processed.extend(p)
                        if len(raw_sample) < 5: raw_sample.extend(r)

        # 7z Support
        elif py7zr and (py7zr.is_7zfile(file_obj) or filename.endswith('.7z')):
             file_obj.seek(0)
             try:
                  import tempfile
                  import shutil
                  with tempfile.TemporaryDirectory() as temp_dir:
                      with py7zr.SevenZipFile(file_obj, mode='r') as z:
                          z.extractall(path=temp_dir)
                          
                      for root, dirs, files in os.walk(temp_dir):
                          for fname in files:
                              if fname.startswith('.') or '__MACOSX' in fname: continue
                              file_path = os.path.realpath(os.path.join(root, fname))
                              if not file_path.startswith(os.path.realpath(temp_dir)):
                                  continue
                              with open(file_path, 'rb') as f:
                                  remaining = MAX_EXTRACT_SIZE - state["extracted_size"]
                                  if remaining <= 0:
                                      raise ValueError("El archivo comprimido supera el tamaño límite de extracción de 100MB.")
                                  content = f.read(remaining + 1)
                                  state["extracted_size"] += len(content)
                                  if state["extracted_size"] > MAX_EXTRACT_SIZE:
                                      raise ValueError("El archivo de extracción excede el límite permitido de 100MB.")
                                  sub_file = io.BytesIO(content)
                                  p, r = process_uploaded_file(sub_file, fname, depth + 1, state)
                                  processed.extend(p)
                                  if len(raw_sample) < 5: raw_sample.extend(r)
             except Exception as e:
                  print(f"7z Extraction Error: {e}")
                  raise e

        # RAR Support
        elif rarfile and (rarfile.is_rarfile(file_obj) or filename.endswith('.rar')):
             # print("  > Is RAR")
             file_obj.seek(0)
             with rarfile.RarFile(file_obj) as rf:
                  for f in rf.infolist():
                      if f.isdir(): continue
                      with rf.open(f) as rfo:
                          remaining = MAX_EXTRACT_SIZE - state["extracted_size"]
                          if remaining <= 0:
                              raise ValueError("El archivo comprimido supera el tamaño límite de extracción de 100MB.")
                          content = rfo.read(remaining + 1)
                          state["extracted_size"] += len(content)
                          if state["extracted_size"] > MAX_EXTRACT_SIZE:
                              raise ValueError("El archivo de extracción excede el límite permitido de 100MB.")
                          sub_file = io.BytesIO(content)
                          p, r = process_uploaded_file(sub_file, f.filename, depth + 1, state)
                          processed.extend(p)
                          if len(raw_sample) < 5: raw_sample.extend(r)

        # TAR Support
        elif tarfile.is_tarfile(file_obj):
            # print("  > Is TAR")
            file_obj.seek(0)
            with tarfile.open(fileobj=file_obj, mode='r:*') as t:
                for member in t.getmembers():
                    if not member.isfile(): continue
                    
                    f = t.extractfile(member)
                    if f:
                        remaining = MAX_EXTRACT_SIZE - state["extracted_size"]
                        if remaining <= 0:
                            raise ValueError("El archivo comprimido supera el tamaño límite de extracción de 100MB.")
                        content = f.read(remaining + 1)
                        state["extracted_size"] += len(content)
                        if state["extracted_size"] > MAX_EXTRACT_SIZE:
                            raise ValueError("El archivo de extracción excede el límite permitido de 100MB.")
                        sub_file = io.BytesIO(content)
                        p, r = process_uploaded_file(sub_file, member.name, depth + 1, state)
                        processed.extend(p)
                        if len(raw_sample) < 5: raw_sample.extend(r)
                            
    except Exception as e:
        print(f"Error processing archive {filename}: {e}")
        err_msg = str(e).lower()
        if "rar" in err_msg or "unrar" in err_msg:
            raise ValueError("Para procesar archivos .RAR se requiere instalar UnRAR en Windows. Por favor extrae los archivos o conviértelos a .ZIP antes de subirlos.")
        raise e

    return processed, raw_sample

# --- PROCESSORS ---

def process_fiwind(file_obj, filename):
    processed = []
    raw_sample = []
    try:
        df = pd.read_excel(file_obj)
        # Standardize columns to lowercase and stripped for robust case-insensitivity
        df.columns = [str(c).lower().strip() for c in df.columns]
        
        # Capture raw sample safely
        raw_sample = df.head(10).fillna('').astype(str).to_dict(orient='records')
        
        # Validation
        validate_columns(df, 'fiwind')

        # Load Config (lowercased and stripped to match df.columns)
        c_date = str(config_manager.get_column('fiwind', 'fecha')).lower().strip()
        c_type = str(config_manager.get_column('fiwind', 'tipo')).lower().strip()
        c_curr = str(config_manager.get_column('fiwind', 'moneda')).lower().strip()
        c_curr_orig = str(config_manager.get_column('fiwind', 'moneda_origen')).lower().strip()
        c_amt = str(config_manager.get_column('fiwind', 'monto')).lower().strip()
        c_amt_orig = str(config_manager.get_column('fiwind', 'monto_origen')).lower().strip()
        c_price = str(config_manager.get_column('fiwind', 'precio')).lower().strip()
        records = df.to_dict('records')
        for index, row in enumerate(records):
            if is_cancelled_transaction(row):
                continue
            try:
                # Basic parsing
                fecha = parse_date(row.get(c_date), 'fiwind')
                tipo_raw = str(row.get(c_type, '')).upper()
                moneda_destino = str(row.get(c_curr, '')).upper()
                moneda_origen = str(row.get(c_curr_orig, '')).upper()
                monto_destino = float(row.get(c_amt, 0))
                monto_origen = float(row.get(c_amt_orig, 0))
                cotizacion = float(row.get(c_price, 0))

                # Logic
                # Normalize text to handle accents (Conversión vs CONVERSION)
                import unicodedata
                def normalize(s):
                    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').upper()

                tipo_normalized = normalize(tipo_raw)

                if 'CONVERSION' in tipo_normalized:
                    if moneda_origen == 'ARS':
                        processed.append(create_transaction(
                            fecha, 'Fiwind', 'Compra', moneda_destino,
                            abs(monto_destino), 0, cotizacion, 0, abs(monto_origen), tipo_raw, unique_id=index
                        ))
                    elif moneda_destino == 'ARS':
                        processed.append(create_transaction(
                            fecha, 'Fiwind', 'Venta', moneda_origen,
                            0, abs(monto_origen), 0, cotizacion, abs(monto_destino), tipo_raw, unique_id=index
                        ))
                    else:
                        try:
                            import db_manager
                            if hasattr(fecha, 'year'):
                                year = fecha.year
                            else:
                                year = int(str(fecha)[:4])
                            settings = db_manager.get_tax_settings(year)
                            usd_ars_rate = float(settings.get('usd_ars_exchange_rate', 1000.0))
                        except Exception:
                            usd_ars_rate = 1000.0

                        if moneda_origen in ('USD', 'USDT', 'USDC', 'DAI'):
                            usd_value = abs(monto_origen)
                        elif moneda_destino in ('USD', 'USDT', 'USDC', 'DAI'):
                            usd_value = abs(monto_destino)
                        else:
                            usd_value = abs(monto_origen)

                        ars_value = usd_value * usd_ars_rate
                        comment = f"[INTERCAMBIO: {moneda_origen}->{moneda_destino}]"
                        
                        cot_v = ars_value / abs(monto_origen) if monto_origen > 0 else 0.0
                        processed.append(create_transaction(
                            fecha, 'Fiwind', 'Venta', moneda_origen,
                            0, abs(monto_origen), 0, cot_v, ars_value, comment, unique_id=f"{index}_v"
                        ))
                        
                        cot_c = ars_value / abs(monto_destino) if monto_destino > 0 else 0.0
                        processed.append(create_transaction(
                            fecha, 'Fiwind', 'Compra', moneda_destino,
                            abs(monto_destino), 0, cot_c, 0, ars_value, comment, unique_id=f"{index}_c"
                        ))
                # [MODIFIED] User requested to ignore Deposits/Withdrawals
                # elif 'DEPOSITO' in tipo_raw or 'INGRESO' in tipo_raw: ...
                # elif 'RETIRO' in tipo_raw or 'ENVIO' in tipo_raw: ...

            except Exception as e:
                print(f"Error procesando fila en Fiwind: {e}")
                continue
    except Exception as e:
        print(f"Error Fiwind: {e}")
        return [], []

    return processed, raw_sample

def process_ripio_trade(file_obj, filename):
    processed = []
    raw_sample = []
    try:
        df = pd.read_csv(file_obj)
        # Standardize columns to lowercase and stripped for robust case-insensitivity
        df.columns = [str(c).lower().strip() for c in df.columns]
        
        raw_sample = df.head(10).fillna('').astype(str).to_dict(orient='records')

        # Validation
        validate_columns(df, 'ripio_trade')

        # Load Config (lowercased and stripped to match df.columns)
        col_fecha = str(config_manager.get_column('ripio_trade', 'fecha')).lower().strip()
        col_monto = str(config_manager.get_column('ripio_trade', 'monto')).lower().strip()
        col_moneda = str(config_manager.get_column('ripio_trade', 'moneda')).lower().strip()
        col_cod = str(config_manager.get_column('ripio_trade', 'codigo_operacion')).lower().strip()
        
        # Fallback search if config fails? For now rely on config
        # Actually, let's just use what's in config
        
        if col_cod in df.columns:
            grupos = df.groupby(col_cod)
            for nombre, grupo in grupos:
                if any(is_cancelled_transaction(r) for _, r in grupo.iterrows()):
                    continue
                row_ars = grupo[grupo[col_moneda] == 'ARS']
                row_cripto = grupo[grupo[col_moneda] != 'ARS']
                
                if not row_ars.empty and not row_cripto.empty:
                    try:
                        m_ars = clean_decimal(row_ars.iloc[0][col_monto])
                        m_cripto = clean_decimal(row_cripto.iloc[0][col_monto])
                        mon_cripto = row_cripto.iloc[0][col_moneda]
                        fecha_str = row_ars.iloc[0][col_fecha]
                        
                        try: fecha = parse_date(fecha_str, 'ripio_trade')
                        except Exception as e:
                            print(f"Fallback parse_date Ripio Trade falló p/{fecha_str}: {e}")
                            fecha = pd.to_datetime(fecha_str)

                        if m_ars < 0: # Compra
                            cot = abs(m_ars) / abs(m_cripto) if m_cripto != 0 else 0
                            processed.append(create_transaction(
                                fecha, 'Ripio Trade', 'Compra', mon_cripto,
                                abs(m_cripto), 0, cot, 0, abs(m_ars), f"ID: {nombre}", unique_id=nombre
                            ))
                        else: # Venta
                            cot = abs(m_ars) / abs(m_cripto) if m_cripto != 0 else 0
                            processed.append(create_transaction(
                                fecha, 'Ripio Trade', 'Venta', mon_cripto,
                                0, abs(m_cripto), 0, cot, abs(m_ars), f"ID: {nombre}", unique_id=nombre
                            ))
                    except Exception as e:
                        print(f"Error procesando grupo de Ripio Trade ({nombre}): {e}")
                        continue
    except Exception as e:
        print(f"Error Ripio: {e}")
        return [], []
    return processed, raw_sample

def process_bitso(file_obj, filename):
    processed = []
    raw_sample = []
    try:
        df = pd.read_csv(file_obj)
        # Standardize columns to lowercase and stripped for robust case-insensitivity
        df.columns = [str(c).lower().strip() for c in df.columns]
        
        raw_sample = df.head(10).fillna('').astype(str).to_dict(orient='records')
        
        # Config (lowercased and stripped to match df.columns)
        c_date = str(config_manager.get_column('bitso', 'datetime')).lower().strip()
        c_date_fallback = str(config_manager.get_column('bitso', 'date_fallback')).lower().strip()
        c_type = str(config_manager.get_column('bitso', 'type')).lower().strip()
        c_major = str(config_manager.get_column('bitso', 'major')).lower().strip()
        c_minor = str(config_manager.get_column('bitso', 'minor')).lower().strip()
        c_amt = str(config_manager.get_column('bitso', 'amount')).lower().strip()
        c_val = str(config_manager.get_column('bitso', 'value')).lower().strip()
        c_rate = str(config_manager.get_column('bitso', 'rate')).lower().strip()
        
        for index, row in df.iterrows():
            if is_cancelled_transaction(row):
                continue
            try:
                fecha_str = row.get(c_date, row.get(c_date_fallback, ''))
                fecha = parse_date(fecha_str, 'bitso')
                
                tipo_raw = str(row.get(c_type, '')).lower()
                major = str(row.get(c_major, '')).upper()
                minor = str(row.get(c_minor, '')).upper()
                cant_cripto = abs(float(row.get(c_amt, 0)))
                monto_fiat = abs(float(row.get(c_val, 0)))
                rate = float(row.get(c_rate, 0))

                if minor == 'ARS':
                    if tipo_raw == 'buy':
                        processed.append(create_transaction(
                            fecha, 'Bitso', 'Compra', major,
                            cant_cripto, 0, rate, 0, monto_fiat, 'Bitso Trade', unique_id=index
                        ))
                    else:
                        processed.append(create_transaction(
                            fecha, 'Bitso', 'Venta', major,
                            0, cant_cripto, 0, rate, monto_fiat, 'Bitso Trade', unique_id=index
                        ))
            except Exception as e:
                print(f"Error procesando fila en Bitso: {e}")
                continue
    except Exception as e:
         print(f"Error Bitso: {e}")
         return [], []
    return processed, raw_sample

def find_binance_column(df, candidates):
    # Normalize (accents/case/BOM-insensitive) so headers work regardless of
    # the file's source encoding or exact locale spelling (e.g. "Número",
    # "Numero", "NÚMERO" and a mis-decoded "N��mero" all resolve the same).
    cols = [_normalize_text(c) for c in df.columns]
    cand_clean_list = [_normalize_text(c) for c in candidates]
    # Pass 1: Exact match
    for cand_clean in cand_clean_list:
        for idx, col in enumerate(cols):
            if col == cand_clean:
                return df.columns[idx]
    # Pass 2: Substring match
    for cand_clean in cand_clean_list:
        for idx, col in enumerate(cols):
            if cand_clean in col or (len(col) >= 4 and col in cand_clean):
                return df.columns[idx]
    return None

def get_binance_dataframes(file_obj, filename):
    file_obj.seek(0)
    ext = filename.lower()
    raw_dfs = []
    
    if ext.endswith('.xlsx') or ext.endswith('.xls'):
        try:
            sheets_dict = pd.read_excel(file_obj, sheet_name=None)
            if isinstance(sheets_dict, dict):
                for sheet_name, df_sheet in sheets_dict.items():
                    if df_sheet is not None and not df_sheet.empty:
                        raw_dfs.append(df_sheet)
            elif isinstance(sheets_dict, pd.DataFrame):
                raw_dfs.append(sheets_dict)
        except Exception as e:
            file_obj.seek(0)
            try:
                raw_dfs.append(pd.read_excel(file_obj))
            except Exception:
                pass
    else:
        # Try CSV with different encodings and separators or Excel fallback
        for enc in ['utf-8', 'utf-8-sig', 'latin1', 'cp1252', 'utf-16']:
            for sep in [None, ',', ';', '\t']:
                file_obj.seek(0)
                try:
                    kwargs = {'encoding': enc}
                    if sep is None:
                        kwargs['sep'] = None
                        kwargs['engine'] = 'python'
                    else:
                        kwargs['sep'] = sep
                    df_csv = pd.read_csv(file_obj, **kwargs)
                    if df_csv is not None and not df_csv.empty and len(df_csv.columns) > 1:
                        raw_dfs.append(df_csv)
                        break
                except Exception:
                    pass
            if raw_dfs:
                break
        if not raw_dfs:
            file_obj.seek(0)
            try:
                sheets_dict = pd.read_excel(file_obj, sheet_name=None)
                if isinstance(sheets_dict, dict):
                    raw_dfs.extend(sheets_dict.values())
                elif isinstance(sheets_dict, pd.DataFrame):
                    raw_dfs.append(sheets_dict)
            except Exception:
                pass

    final_dfs = []
    for df in raw_dfs:
        if df is None or df.empty:
            continue
        cols_str = " ".join([str(c).lower() for c in df.columns])
        is_known = any(k in cols_str for k in ['order', 'orden', 'fiat', 'asset', 'activo', 'side', 'executed', 'ejecutado', 'created', 'creación', 'status', 'estado', 'tipo', 'precio', 'monto', 'cantidad'])
        if is_known:
            final_dfs.append(df)
        else:
            # Check if header row is shifted down by up to 5 rows
            found_skip = False
            for skip in range(1, min(6, len(df))):
                try:
                    row_vals = " ".join([str(v).lower() for v in df.iloc[skip-1].values])
                    if any(k in row_vals for k in ['order', 'orden', 'fiat', 'asset', 'activo', 'side', 'executed', 'ejecutado', 'created', 'creación', 'status', 'estado', 'tipo', 'precio', 'monto', 'cantidad']):
                        new_cols = [str(v).strip() for v in df.iloc[skip-1].values]
                        new_df = df.iloc[skip:].copy()
                        new_df.columns = new_cols
                        final_dfs.append(new_df)
                        found_skip = True
                        break
                except Exception:
                    pass
            if not found_skip:
                final_dfs.append(df)
                
    return final_dfs

def process_binance_csv(file_obj, filename):
    """Parses a single Binance CSV or Excel (.xlsx/.xls) file (Spot or P2P) in Spanish or English."""
    processed = []
    raw_sample = []
    try:
        dfs = get_binance_dataframes(file_obj, filename)
        if not dfs:
            return [], []
            
        for df in dfs:
            if df is None or df.empty:
                continue
                
            # Standardize columns to lowercase and stripped
            df.columns = [str(c).lower().strip() for c in df.columns]
            if len(raw_sample) < 10:
                raw_sample.extend(df.head(10).fillna('').astype(str).to_dict(orient='records'))

            # Find columns for P2P (Bilingual Spanish / English + Account Statements)
            p2p_type = find_binance_column(df, ['tipo de orden', 'tipo de transacción', 'tipo de operación', 'tipo de operacion', 'order type', 'order_type', 'tipo', 'side', 'type', 'operación', 'operacion', 'operation', 'dirección', 'direccion'])
            p2p_fiat = find_binance_column(df, ['tipo de fiat', 'moneda fiduciaria', 'moneda fiat', 'fiat type', 'fiat_type', 'fiat currency', 'fiat', 'fiduciaria'])
            p2p_asset = find_binance_column(df, ['tipo de activo', 'activo cripto', 'criptomoneda', 'asset type', 'asset_type', 'activo', 'cripto', 'asset', 'crypto', 'moneda', 'coin', 'base asset'])
            p2p_status = find_binance_column(df, ['estado de la orden', 'order status', 'status', 'estado', 'state', 'situación', 'situacion'])
            p2p_created = find_binance_column(df, ['hora de creación', 'fecha de creación', 'fecha de la orden', 'created time', 'created_time', 'create time', 'fecha y hora', 'fecha/hora', 'fecha', 'hora', 'date', 'time', 'order time', 'utc_time', 'utc time', 'time(utc)'])
            p2p_qty = find_binance_column(df, ['monto cripto', 'cantidad cripto', 'quantity', 'cantidad', 'monto', 'amount', 'qty', 'crypto amount', 'change'])
            p2p_price = find_binance_column(df, ['precio unitario', 'unit price', 'price', 'precio', 'cotización', 'cotizacion', 'unit price (fiat)'])
            p2p_total = find_binance_column(df, ['precio total', 'monto total', 'total price', 'total_price', 'total (fiat)', 'monto (fiat)', 'importe total', 'total', 'monto fiat', 'monto total (fiat)'])

            # Find columns for Spot
            spot_side = find_binance_column(df, ['side', 'tipo', 'tipo de operación'])
            spot_exec = find_binance_column(df, ['executed', 'ejecutado', 'monto ejecutado'])
            spot_date = find_binance_column(df, ['date(utc)', 'date', 'fecha', 'time'])
            spot_pair = find_binance_column(df, ['pair', 'par', 'instrumento'])
            spot_price = find_binance_column(df, ['price', 'precio'])
            spot_amt = find_binance_column(df, ['amount', 'monto', 'total'])

            is_p2p = (p2p_type is not None or p2p_total is not None or p2p_asset is not None) and (p2p_qty is not None or p2p_created is not None or p2p_price is not None)
            is_spot = spot_side is not None and spot_exec is not None

            if is_p2p:
                for index, row in df.iterrows():
                    # Filter out cancelled/failed/expired/pending/disputed rows.
                    # is_cancelled_transaction() checks ANY status-like column
                    # against the shared, accent-insensitive negative-keyword
                    # list, so any Binance status text not in that blacklist
                    # (in any language/wording) is treated as valid by default
                    # instead of being silently dropped.
                    if is_cancelled_transaction(row):
                        continue
                    try:
                        fecha_raw = row.get(p2p_created, '') if p2p_created else ''
                        fecha = parse_date(fecha_raw, 'binance_p2p')
                        
                        tipo_raw = str(row.get(p2p_type, '')).lower().strip() if p2p_type else ''
                        is_buy = tipo_raw in ('buy', 'compra', 'comprar') or 'buy' in tipo_raw or 'compra' in tipo_raw
                        
                        fiat = str(row.get(p2p_fiat, 'ARS')).upper().strip() if p2p_fiat else 'ARS'
                        asset = str(row.get(p2p_asset, 'USDT')).upper().strip() if p2p_asset else 'USDT'
                        
                        qty = clean_decimal(row.get(p2p_qty, 0)) if p2p_qty else 0.0
                        price = clean_decimal(row.get(p2p_price, 0)) if p2p_price else 0.0
                        total = clean_decimal(row.get(p2p_total, qty * price)) if p2p_total else (qty * price)
                        
                        is_ars = any(k in fiat for k in ['ARS', 'PESO', 'ARGENTIN', '$']) or not fiat or fiat == ''
                        if is_ars:
                            if is_buy:
                                processed.append(create_transaction(
                                    fecha, 'Binance P2P', 'Compra', asset,
                                    qty, 0, price, 0, total, 'P2P', unique_id=index
                                ))
                            else:
                                processed.append(create_transaction(
                                    fecha, 'Binance P2P', 'Venta', asset,
                                    0, qty, 0, price, total, 'P2P', unique_id=index
                                ))
                    except Exception as e:
                        print(f"Error procesando fila Binance P2P: {e}")
                        pass
                
            elif is_spot:
                for index, row in df.iterrows():
                    if is_cancelled_transaction(row):
                        continue
                    try:
                        fecha = parse_date(row.get(spot_date), 'binance_spot')
                        side = str(row.get(spot_side)).upper().strip()
                        is_buy = 'BUY' in side or 'COMPRA' in side
                        pair = str(row.get(spot_pair, '')).upper().strip()
                        precio = clean_decimal(row.get(spot_price, 0))
                        cant = limpiar_numero_binance(row.get(spot_exec, 0))
                        total = limpiar_numero_binance(row.get(spot_amt, cant * precio))
                        
                        if 'ARS' in pair:
                            crypto = pair.replace('ARS', '').replace('/', '').replace('_', '')
                            m_ars = total
                            cot_compra = precio if is_buy else 0.0
                            cot_venta = precio if not is_buy else 0.0
                        else:
                            crypto = pair
                            for quote in ['USDT', 'USDC', 'BUSD', 'DAI', 'USD', 'EUR', 'BTC', 'ETH']:
                                if pair.endswith(quote):
                                    crypto = pair[:-len(quote)]
                                    break
                                    
                            import db_manager
                            try:
                                settings = db_manager.get_tax_settings(fecha.year)
                                rate = settings.get('usd_ars_exchange_rate', 1000.0)
                            except Exception:
                                rate = 1000.0
                                
                            m_ars = total * rate
                            cot_compra = (precio * rate) if is_buy else 0.0
                            cot_venta = (precio * rate) if not is_buy else 0.0

                        if is_buy:
                            processed.append(create_transaction(
                                fecha, 'Binance Spot', 'Compra', crypto,
                                cant, 0, cot_compra, 0, m_ars, 'Spot', unique_id=index
                            ))
                        else:
                            processed.append(create_transaction(
                                fecha, 'Binance Spot', 'Venta', crypto,
                                0, cant, 0, cot_venta, m_ars, 'Spot', unique_id=index
                            ))
                    except Exception as e:
                        print(f"Error procesando fila Binance Spot: {e}")
                        pass

    except MissingColumnsError:
        raise # Re-raise known error
    except Exception as e:
        print(f"Error Binance CSV: {e}")
        # [MODIFIED] Don't silence generic errors on Binance files during debugging
        if "binance" in filename.lower():
             raise Exception(f"Error critico procesando Binance: {str(e)}")
        return [], []
    return processed, raw_sample

def process_binance_zip(file_obj, filename):
    """Legacy wrapper for zip files, now delegated to generic archive processor."""
    return process_archive(file_obj, filename)

# --- DISPATCHER ---

def procesar_ripio_comun_txt(file_obj, filename):
    print(f"Procesando Ripio Común (TXT): {filename}")
    processed = []
    raw_sample = []
    
    try:
        content = file_obj.read()
        if isinstance(content, bytes):
            text = content.decode('utf-8')
        else:
            text = content
            
        lines = [line.strip() for line in text.replace('\r', '').split('\n') if line.strip()]
        
        # Sample for frontend
        for i in range(min(10, len(lines))):
            raw_sample.append({'Line': i+1, 'Content': lines[i]})

        i = 0
        while i < len(lines):
            line = lines[i]
            
            # Robust Date Regex (dd/mm/yyyy or yyyy-mm-dd)
            date_match = re.search(r"(\d{2}/\d{2}/\d{4})", line)
            
            if date_match:
                fecha_str = date_match.group(1)
                try:
                    fecha = pd.to_datetime(fecha_str, dayfirst=True)
                except Exception as e:
                    print(f"Error regex fecha TXT robusto '{fecha_str}': {e}")
                    i+=1; continue
                
                # Context Window: Look at previous 3 lines and next 10 lines
                # This helps identify the operation type even if formatting shifts specific lines
                prev_lines = lines[max(0, i-3):i]
                next_lines = lines[i+1:min(len(lines), i+12)]
                
                # Detect Operation Type from Context
                context_str = " ".join(prev_lines + [line] + next_lines).upper()
                
                if "CANCELAD" in context_str or "RECHAZAD" in context_str or "FALLID" in context_str or "ERROR" in context_str:
                    i += 1
                    continue
                
                tipo_bloque = "MOVIMIENTO"
                tipo_op = "MOVIMIENTO"
                
                if "COMPRA" in context_str:
                    tipo_op = "COMPRA"
                    tipo_bloque = "Compra Cripto"
                elif "VENTA" in context_str:
                    tipo_op = "VENTA"
                    tipo_bloque = "Venta Cripto"
                elif "CVU" in context_str or "TRANSFERENCIA" in context_str:
                    if "DEPÓSITO" in context_str or "RECIBIDA" in context_str:
                        tipo_op = "INGRESO FIAT"
                        tipo_bloque = "Depósito CVU"
                    else:
                        tipo_op = "RETIRO FIAT"
                        tipo_bloque = "Retiro CVU"
                elif "INTERCAMBIO" in context_str or "SWAP" in context_str:
                    tipo_op = "INTERCAMBIO"
                    tipo_bloque = "Swap Cripto"
                elif "INGRESO DE CRIPTO" in context_str:
                    tipo_op = "INGRESO CRIPTO"
                    tipo_bloque = "Depósito Cripto"
                elif "ENVÍO DE CRIPTO" in context_str or "ENVIO DE CRIPTO" in context_str:
                    tipo_op = "RETIRO CRIPTO"
                    tipo_bloque = "Retiro Cripto"
                
                # Money Extraction Logic
                # Look for patterns like "100.50 USDC" or "$ 5000 ARS" in the following lines
                montos = []
                monedas = []
                
                for sub in next_lines:
                    # Stop if we hit the next transaction (detected by date)
                    if re.search(r"\d{2}/\d{2}/\d{4}", sub):
                        break
                        
                    # Ignore Balance lines to prevent picking up "Saldo: 500000" as transaction amount
                    sub_upper = sub.upper()
                    if "SALDO" in sub_upper or "BALANCE" in sub_upper or "DISPONIBLE" in sub_upper:
                        continue
                        
                    # Regex for "1,234.50 CODE" or "$ 1.234,50"
                    # We normalize text removal of '$' first
                    clean_sub = sub.replace('$', '').strip()
                    
                    # Match Number + Space + Word (Coin)
                    # Use finditer to find ALL matches in the line (e.g. "0.00 ARS ... 25000.00 ARS")
                    matches = re.finditer(r"([\d\.,]+)\s+([A-Z]{3,5})", clean_sub)
                    
                    for match in matches:
                        val_str = match.group(1)
                        coin = match.group(2)
                        
                        # Anti-fragile float conversion
                        try:
                            val = clean_decimal(val_str)
                            if not isinstance(val, (int, float)):
                                val = float(val)
                        except Exception as e:
                            # print(f"DEBUG ERROR clean_decimal: {e}") 
                            val = 0.0
                            
                        if val > 0:
                            montos.append(val)
                            monedas.append(coin)
                            # print(f"DEBUG MATCH: {val} {coin}")
                        else:
                            pass
                            # print(f"DEBUG ZERO: {val_str} -> {val} {coin}")
                
                if len(montos) > 0:
                    exchange = "Ripio"

                    # Logic mapping based on detected type
                    if tipo_op == "COMPRA":
                        # Usually logic: First amount ARS (negative/spend), Second amount Crypto (positive/buy)
                        # Or checking currencies
                        idx_crypto = -1
                        max_ars = 0.0
                        
                        for idx, m in enumerate(monedas):
                            if m == 'ARS':
                                if montos[idx] > max_ars:
                                    max_ars = montos[idx]
                            else: 
                                # First non-ARS is likely the crypto
                                if idx_crypto == -1: idx_crypto = idx
                        
                        if idx_crypto != -1:
                            m_crypto = montos[idx_crypto]
                            cotizacion = max_ars / m_crypto if m_crypto > 0 else 0
                            
                            processed.append(create_transaction(
                                fecha, exchange, 'Compra', monedas[idx_crypto],
                                m_crypto, 0, cotizacion, 0, max_ars, tipo_bloque, unique_id=i
                            ))
                            
                    elif tipo_op == "VENTA":
                        idx_crypto = -1
                        max_ars = 0.0
                        
                        for idx, m in enumerate(monedas):
                            if m == 'ARS': 
                                if montos[idx] > max_ars:
                                    max_ars = montos[idx]
                            else: 
                                if idx_crypto == -1: idx_crypto = idx
                            
                        if idx_crypto != -1:
                            m_crypto = montos[idx_crypto]
                            cotizacion = max_ars / m_crypto if m_crypto > 0 else 0
                            
                            processed.append(create_transaction(
                                fecha, exchange, 'Venta', monedas[idx_crypto],
                                0, m_crypto, 0, cotizacion, max_ars, tipo_bloque, unique_id=i
                            ))
                    # [MODIFIED] User requested ONLY Buy/Sell. Ignoring everything else.
                    else:
                        pass 


            i += 1
            
    except Exception as e:
        print(f"Error parseando Ripio TXT Robust: {e}")
        return [], []
        
    return processed, raw_sample

def process_uploaded_file(file_obj, filename, depth=0, state=None):
    filename = filename.lower()
    
    # 1. Prioritize Known Data Extensions
    # If it looks like a data file, treat it as such to avoid false positive "tar" detection on text files
    known_extensions = ('.csv', '.xls', '.xlsx', '.txt')
    if not filename.endswith(known_extensions):
        # 2. Check for Archive support if not a known data extension
        # Or if it explicitly has an archive extension
        is_archive_ext = filename.endswith(('.zip', '.tar', '.tar.gz', '.tgz', '.7z', '.rar'))
        
        is_zip = False
        is_tar = False
        is_7z = False
        is_rar = False
        
        # Check Signatures
        # ZIP
        try:
            file_obj.seek(0)
            if zipfile.is_zipfile(file_obj):
                # print("Detected ZIP signature")
                file_obj.seek(0)
                return process_archive(file_obj, filename, depth, state)
        except Exception as e:
            # Not a zip file or corrupted
            pass
        
        # 7z (Check before TAR because TAR can be aggressive with "truncated header" errors on binaries)
        if py7zr:
            try:
                file_obj.seek(0)
                if py7zr.is_7zfile(file_obj) or filename.endswith('.7z'):
                    file_obj.seek(0)
                    return process_archive(file_obj, filename, depth, state)
            except Exception as e:
                # Not a 7z file
                pass

        # RAR
        if rarfile:
            try:
                file_obj.seek(0)
                if rarfile.is_rarfile(file_obj):
                    file_obj.seek(0)
                    return process_archive(file_obj, filename, depth, state)
            except Exception as e:
                # Not a rar file
                pass

        # TAR (Check last as it is most prone to false positives/errors on random binary data)
        try:
            file_obj.seek(0)
            if tarfile.is_tarfile(file_obj):
                file_obj.seek(0)
                return process_archive(file_obj, filename, depth, state)
        except Exception as e:
            # Not a tar file
            pass

        # Extensions Fallback
        if is_archive_ext:
             # print(f"Detected archive by extension: {filename}")
             file_obj.seek(0)
             return process_archive(file_obj, filename, depth, state)
    
    file_obj.seek(0) # Reset pointer
    
    # 1. Inspect header columns for content-based detection.
    # Tries multiple encodings/separators (same idea as get_binance_dataframes)
    # instead of a single utf-8 attempt, so BOM/latin1/cp1252-encoded CSVs
    # (common from Windows/Excel exports) don't silently fall through to an
    # empty cols_set and rely solely on "binance" being in the filename.
    cols_set = set()
    ext = filename.lower()
    if ext.endswith('.xlsx') or ext.endswith('.xls'):
        try:
            file_obj.seek(0)
            preview_df = pd.read_excel(file_obj, nrows=2)
            if preview_df is not None and not preview_df.empty:
                cols_set = {_normalize_text(c) for c in preview_df.columns}
        except Exception:
            pass
    else:
        for enc in ['utf-8-sig', 'utf-8', 'latin1', 'cp1252']:
            for sep in [None, ',', ';', '\t']:
                try:
                    file_obj.seek(0)
                    kwargs = {'encoding': enc, 'nrows': 2, 'on_bad_lines': 'skip'}
                    if sep is None:
                        kwargs['sep'] = None
                        kwargs['engine'] = 'python'
                    else:
                        kwargs['sep'] = sep
                    preview_df = pd.read_csv(file_obj, **kwargs)
                    if preview_df is not None and not preview_df.empty and len(preview_df.columns) > 1:
                        cols_set = {_normalize_text(c) for c in preview_df.columns}
                        break
                except Exception:
                    pass
            if cols_set:
                break
    file_obj.seek(0)

    is_binance_p2p_content = any(_normalize_text(k) in cols_set for k in [
        'tipo de orden', 'número de pedido', 'numero de pedido', 'tipo de fiat',
        'precio total', 'hora de creación', 'hora de creacion', 'tarifa de creador',
        'comisión de tomador', 'comision de tomador', 'order type', 'fiat type', 'asset type'
    ]) or "binance" in filename.lower()

    if is_binance_p2p_content:
        file_obj.seek(0)
        try:
            res = process_binance_csv(file_obj, filename)
            if res and res[0]:
                return res
        except MissingColumnsError:
            pass
        except Exception as e:
            print(f"Error checking Binance P2P: {e}")
            pass

    if "fiwind" in filename.lower() and (filename.endswith('.xls') or filename.endswith('.xlsx')):
        try:
            file_obj.seek(0)
            return process_fiwind(file_obj, filename)
        except MissingColumnsError:
            pass
    
    elif ("ripio trade" in filename.lower() or "ripio_trade" in filename.lower()) and filename.endswith('.csv'):
        try:
            file_obj.seek(0)
            return process_ripio_trade(file_obj, filename)
        except MissingColumnsError:
            pass
        
    elif ("ripio" in filename.lower() or "correcciones" in filename.lower()) and filename.endswith('.txt'):
        try:
            file_obj.seek(0)
            return procesar_ripio_comun_txt(file_obj, filename)
        except Exception:
            pass
        
    elif "bitso" in filename.lower() and filename.endswith('.csv'):
        try:
            file_obj.seek(0)
            return process_bitso(file_obj, filename)
        except MissingColumnsError:
            pass
    
    # Binance CSV or Excel (.xlsx / .xls)
    if (filename.lower().endswith('.csv') or filename.lower().endswith('.xlsx') or filename.lower().endswith('.xls')):
        try:
            file_obj.seek(0)
            res = process_binance_csv(file_obj, filename)
            if res and res[0]:
                return res
        except MissingColumnsError:
            pass
        except Exception:
            pass

    # GENERIC CONTENT-BASED & DYNAMIC CUSTOM EXCHANGE DETECTION
    try:
        import db_manager
        all_ex = db_manager.get_all_exchanges()
        for ex in all_ex:
            ex_name_clean = ex['name'].lower()
            ex_id_clean = ex['id'].lower()
            if (ex_name_clean in filename.lower() or ex_id_clean in filename.lower()) and (filename.lower().endswith('.csv') or filename.lower().endswith('.xlsx') or filename.lower().endswith('.xls')):
                file_obj.seek(0)
                df = pd.read_csv(file_obj) if filename.lower().endswith('.csv') else pd.read_excel(file_obj)
                res_df = process_dynamic_csv(df, ex['name'], ex.get('mapping', {}), ex.get('dateFormat', '%d/%m/%Y %H:%M:%S'))
                records = res_df.to_dict('records') if not res_df.empty else []
                sample = df.head(5).to_dict('records') if not df.empty else []
                return records, sample
    except Exception as e:
        print("Dynamic CSV check error:", e)

    return [], []

def generate_master_excel(transactions):
    if not transactions: return None
    
    output = io.BytesIO()
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "Consolidado"
    
    # Styles configuration
    STYLES = {
        'Binance Spot': {'fill': 'F3BA2F', 'font': '000000'},
        'Binance P2P': {'fill': 'F3BA2F', 'font': '000000'},
        'Binance': {'fill': 'F3BA2F', 'font': '000000'},
        'Bitso': {'fill': '29AC00', 'font': 'FFFFFF'},
        'Fiwind': {'fill': 'EFB41D', 'font': '000000'},
        'Ripio Trade': {'fill': '7A3CE3', 'font': 'FFFFFF'},
        'Ripio Classic': {'fill': '7A3CE3', 'font': 'FFFFFF'},
        'Ripio': {'fill': '7A3CE3', 'font': 'FFFFFF'},
        'OKX': {'fill': '111111', 'font': 'FFFFFF'},
        'Bybit': {'fill': 'F7A600', 'font': '000000'},
        'Bitget': {'fill': '00F0FF', 'font': '191F61'},
        'Generic': {'fill': '4B5563', 'font': 'FFFFFF'}
    }
    
    TYPE_STYLES = {
        'Compra': {'color': '2E7D32'}, # Dark Green
        'Venta': {'color': 'C62828'},  # Red
        'Otros': {'color': '1565C0'}   # Blue
    }
    
    cols_order = ['Fecha', 'Exchange', 'Tipo de Operación', 'Moneda', 
             'Monto Compra (Cripto)', 'Monto Venta (Cripto)', 
             'Cotización Compra', 'Cotización Venta', 'Monto ARS', 'Comentarios']
    
    # Convert list to DataFrame for easier grouping
    df_all = pd.DataFrame(transactions)
    
    # Ensure columns exist
    for c in cols_order:
        if c not in df_all.columns: df_all[c] = ''
            
    if 'Exchange' not in df_all.columns or df_all.empty:
        return None
        
    grouped_exchange = df_all.groupby('Exchange')
    current_row = 1
    
    for exchange_name, ex_group in grouped_exchange:
        # Get Exchange Style
        ex_style = STYLES.get(str(exchange_name).split(' ')[0], STYLES.get(exchange_name, STYLES['Generic']))
        if 'Binance' in str(exchange_name): ex_style = STYLES['Binance Spot']
        if 'Ripio' in str(exchange_name): ex_style = STYLES['Ripio Trade']
        if 'Bitso' in str(exchange_name): ex_style = STYLES['Bitso']
        if 'Fiwind' in str(exchange_name): ex_style = STYLES['Fiwind']
        if 'OKX' in str(exchange_name): ex_style = STYLES['OKX']
        if 'Bybit' in str(exchange_name): ex_style = STYLES['Bybit']
        if 'Bitget' in str(exchange_name): ex_style = STYLES['Bitget']
        
        # Write Title for Exchange Block
        ws.cell(row=current_row, column=1, value=f"REPORTE: {exchange_name.upper()}")
        ws.cell(row=current_row, column=1).font = Font(bold=True, size=16, color=ex_style['font'])
        ws.cell(row=current_row, column=1).fill = PatternFill(start_color=ex_style['fill'], end_color=ex_style['fill'], fill_type="solid")
        current_row += 2
        
        # Categorize Types (Compra, Venta, and Otros)
        def categorize_tipo(t):
            t_upper = str(t).upper()
            if 'COMPRA' in t_upper: return 'Compra'
            if 'VENTA' in t_upper: return 'Venta'
            return 'Otros'
            
        ex_group = ex_group.copy()
        ex_group['TipoCategoria'] = ex_group['Tipo de Operación'].apply(categorize_tipo)
        
        # We want to iterate in a specific order: Compra, Venta, Otros
        for cat in ['Compra', 'Venta', 'Otros']:
            cat_group = ex_group[ex_group['TipoCategoria'] == cat]
            if cat_group.empty: continue
            
            # Sort chronologically
            cat_group = cat_group.sort_values(by='Fecha')
            
            # Write Sub-Title for Type (e.g. COMPRAS)
            cat_color = TYPE_STYLES.get(cat, TYPE_STYLES['Otros'])['color']
            ws.cell(row=current_row, column=1, value=f"{cat.upper()}S")
            ws.cell(row=current_row, column=1).font = Font(bold=True, size=12, color=cat_color)
            current_row += 1
            
            # Write Headers
            for col_idx, col_name in enumerate(cols_order, 1):
                cell = ws.cell(row=current_row, column=col_idx, value=col_name)
                cell.font = Font(bold=True, color='FFFFFF')
                cell.fill = PatternFill(start_color='333333', end_color='333333', fill_type="solid")
                cell.alignment = Alignment(horizontal='center')
            current_row += 1
            
            start_data_row = current_row
            
            # Write Data
            for _, row_data in cat_group.iterrows():
                is_swap = '[INTERCAMBIO:' in str(row_data.get('Comentarios', ''))
                for col_idx, col_name in enumerate(cols_order, 1):
                    if col_name == 'Monto ARS' and is_swap:
                        val = ""
                    else:
                        val = row_data.get(col_name, '')
                    cell = ws.cell(row=current_row, column=col_idx, value=val)
                    cell.alignment = Alignment(horizontal='center')
                    # Format numbers
                    if isinstance(val, (int, float)):
                        if 'Monto' in col_name or 'Cotización' in col_name:
                             cell.number_format = '#,##0.00'
                current_row += 1
                
            end_data_row = current_row - 1
            
            # Add Summary Row
            ws.cell(row=current_row, column=8, value="TOTAL M. ARS:")
            ws.cell(row=current_row, column=8).font = Font(bold=True)
            ws.cell(row=current_row, column=8).alignment = Alignment(horizontal='right')
            
            # SUM Formula for 'Monto ARS' (Column 9 -> I)
            sum_cell = ws.cell(row=current_row, column=9)
            sum_cell.value = f"=SUM(I{start_data_row}:I{end_data_row})"
            sum_cell.font = Font(bold=True, color=cat_color)
            sum_cell.number_format = '#,##0.00'
            sum_cell.alignment = Alignment(horizontal='center')
            
            # Add thin border to summary
            border = Border(top=Side(style='thin', color='000000'), bottom=Side(style='double', color='000000'))
            sum_cell.border = border
            
            current_row += 3 # Space between Compras and Ventas
            
        current_row += 5 # Space between Exchanges

    # Auto-adjust column widths
    for col in ws.columns:
        max_length = 0
        column = col[0].column_letter
        for cell in col:
            try:
                # Don't use formulas for length calc
                if str(cell.value).startswith('='): continue 
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except Exception as e:
                pass
        adjusted_width = min(max_length + 2, 50) # Cap width to 50
        ws.column_dimensions[column].width = adjusted_width

    wb.save(output)
    output.seek(0)
    return output

# Alias for backward compatibility if needed, though we should update app.py
def generate_excel_bytes(transactions):
    return generate_master_excel(transactions)

def process_dynamic_csv(df, exchange_name, mapping, date_format="%d/%m/%Y %H:%M:%S"):
    """Generic CSV parser driven by user-configured mapping."""
    if df is None or df.empty:
        return pd.DataFrame()

    # Standardize columns to lowercase and stripped for robust case-insensitivity
    df = df.rename(columns=lambda c: str(c).lower().strip())
    
    # Standardize mapping to match lowercased columns
    clean_mapping = {k: str(v).lower().strip() for k, v in mapping.items() if v}

    records = []
    for idx, row in df.iterrows():
        if is_cancelled_transaction(row):
            continue
        raw_date = row.get(clean_mapping.get("fecha", ""), "")
        raw_tipo = row.get(clean_mapping.get("tipo_operacion", ""), "COMPRA")
        raw_moneda = row.get(clean_mapping.get("moneda", ""), "USDT")
        raw_compra = row.get(clean_mapping.get("monto_compra_cripto", ""), 0)
        raw_venta = row.get(clean_mapping.get("monto_venta_cripto", ""), 0)
        raw_cot_compra = row.get(clean_mapping.get("cotizacion_compra", ""), 0)
        raw_cot_venta = row.get(clean_mapping.get("cotizacion_venta", ""), 0)
        raw_ars = row.get(clean_mapping.get("monto_ars", ""), 0)
        raw_notes = row.get(clean_mapping.get("comentarios", ""), "")

        try:
            parsed_date = pd.to_datetime(raw_date, format=date_format) if date_format else pd.to_datetime(raw_date, dayfirst=True)
            formatted_date = parsed_date.strftime('%Y-%m-%d %H:%M:%S')
        except Exception:
            formatted_date = str(raw_date)

        def safe_float(val):
            try:
                val_str = str(val).replace('$', '').replace(',', '.').strip()
                return float(val_str)
            except Exception:
                return 0.0

        m_compra = safe_float(raw_compra)
        m_venta = safe_float(raw_venta)
        c_compra = safe_float(raw_cot_compra)
        c_venta = safe_float(raw_cot_venta)
        m_ars = safe_float(raw_ars)
        from models_v2 import compute_canonical_tx_hash
        ref = str(raw_notes) if raw_notes else str(idx)
        tx_hash = compute_canonical_tx_hash(formatted_date, exchange_name, raw_tipo, raw_moneda, m_compra, m_venta, m_ars, ref)

        records.append({
            "tx_hash": tx_hash,
            "fecha": formatted_date,
            "exchange": exchange_name,
            "tipo_operacion": str(raw_tipo).upper(),
            "moneda": str(raw_moneda).upper(),
            "monto_compra_cripto": m_compra,
            "monto_venta_cripto": m_venta,
            "cotizacion_compra": c_compra,
            "cotizacion_venta": c_venta,
            "monto_ars": m_ars,
            "comentarios": str(raw_notes)
        })

    return pd.DataFrame(records)