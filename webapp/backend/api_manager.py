import os
import time
import hmac
import hashlib
import json
import re
import asyncio
import aiohttp
import ccxt.async_support as ccxt_async
from datetime import datetime
from dotenv import load_dotenv
from pydantic import ValidationError
from models_v2 import TransactionModel

ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
load_dotenv(dotenv_path=ENV_FILE, override=True)

def get_exchange_pairs(exchange_id, default_pairs):
    try:
        import db_manager
        exchanges = db_manager.get_all_exchanges()
        for ex in exchanges:
            if ex['id'] == exchange_id:
                pairs = ex.get('mapping', {}).get('pairs')
                if pairs and isinstance(pairs, list):
                    return pairs
    except Exception as e:
        print(f"Error fetching dynamic pairs for {exchange_id}: {e}")
    return default_pairs

from functools import lru_cache

@lru_cache(maxsize=32)
def get_exchange_rate_for_date(year):
    try:
        import db_manager
        settings = db_manager.get_tax_settings(year)
        return settings.get('usd_ars_exchange_rate', 1000.0)
    except Exception:
        return 1000.0

def get_exchange_rate_from_obj(date_obj):
    year = date_obj.year if hasattr(date_obj, 'year') else 2026
    return get_exchange_rate_for_date(year)

def convert_cost_to_ars(cost, pair, date_obj):
    pair_upper = str(pair).upper()
    if pair_upper.endswith('/ARS') or pair_upper.endswith('_ARS') or pair_upper.endswith('ARS'):
        return cost
    rate = get_exchange_rate_from_obj(date_obj)
    return cost * rate

def decompose_api_trade(t, pair, exchange_name):
    """
    Decomposes a CCXT trade into one or two TransactionModel objects.
    If the trade is a swap between stablecoins/USD (e.g. USDT/USDC), 
    it splits it into a Compra and Venta in ARS with [INTERCAMBIO: ...] comment.
    """
    is_buy = t['side'] == 'buy'
    monto = float(t['amount'])
    precio = float(t['price'])
    cost = float(t.get('cost', monto * precio))
    tx_date = datetime.fromtimestamp(t['timestamp'] / 1000.0)
    
    parts = pair.upper().split('/')
    if len(parts) == 2:
        base_coin, quote_coin = parts[0], parts[1]
        stablecoins = ('USD', 'USDT', 'USDC', 'DAI', 'ARS')
        
        # Check if both are stablecoins/USD but neither is ARS
        if base_coin in stablecoins and quote_coin in stablecoins and base_coin != 'ARS' and quote_coin != 'ARS':
            rate = get_exchange_rate_from_obj(tx_date)
            ars_total = cost * rate
            
            comment = f"[INTERCAMBIO: {quote_coin}->{base_coin}]" if is_buy else f"[INTERCAMBIO: {base_coin}->{quote_coin}]"
            
            models = []
            if is_buy:
                cot_c = ars_total / monto if monto > 0 else 0.0
                models.append(TransactionModel(
                    fecha=tx_date, exchange=exchange_name,
                    tipo_operacion="Compra", moneda=base_coin,
                    monto_compra_cripto=monto, monto_venta_cripto=0.0,
                    cotizacion_compra=cot_c, cotizacion_venta=0.0,
                    monto_ars=ars_total, comentarios=f"{comment} | ID: {t.get('id', '')}"
                ))
                cot_v = ars_total / cost if cost > 0 else 0.0
                models.append(TransactionModel(
                    fecha=tx_date, exchange=exchange_name,
                    tipo_operacion="Venta", moneda=quote_coin,
                    monto_compra_cripto=0.0, monto_venta_cripto=cost,
                    cotizacion_compra=0.0, cotizacion_venta=cot_v,
                    monto_ars=ars_total, comentarios=f"{comment} | ID: {t.get('id', '')}"
                ))
            else:
                cot_v = ars_total / monto if monto > 0 else 0.0
                models.append(TransactionModel(
                    fecha=tx_date, exchange=exchange_name,
                    tipo_operacion="Venta", moneda=base_coin,
                    monto_compra_cripto=0.0, monto_venta_cripto=monto,
                    cotizacion_compra=0.0, cotizacion_venta=cot_v,
                    monto_ars=ars_total, comentarios=f"{comment} | ID: {t.get('id', '')}"
                ))
                cot_c = ars_total / cost if cost > 0 else 0.0
                models.append(TransactionModel(
                    fecha=tx_date, exchange=exchange_name,
                    tipo_operacion="Compra", moneda=quote_coin,
                    monto_compra_cripto=cost, monto_venta_cripto=0.0,
                    cotizacion_compra=cot_c, cotizacion_venta=0.0,
                    monto_ars=ars_total, comentarios=f"{comment} | ID: {t.get('id', '')}"
                ))
            return models

    # Fallback to single standard transaction
    crypto = parts[0] if len(parts) > 0 else pair
    ars_total = convert_cost_to_ars(cost, pair, tx_date)
    
    # Calculate exchange rate factor if converted
    rate_factor = ars_total / cost if cost > 0 else 1.0
    cot_compra = precio * rate_factor if is_buy else 0.0
    cot_venta = precio * rate_factor if not is_buy else 0.0
    
    model = TransactionModel(
        fecha=tx_date, exchange=exchange_name,
        tipo_operacion="Compra" if is_buy else "Venta", moneda=crypto,
        monto_compra_cripto=monto if is_buy else 0.0, monto_venta_cripto=monto if not is_buy else 0.0,
        cotizacion_compra=cot_compra, cotizacion_venta=cot_venta,
        monto_ars=ars_total, comentarios=f"{exchange_name}: {t.get('id', '')}"
    )
    return [model]

async def fetch_binance_v2():
    api_key = os.getenv("BINANCE_API_KEY")
    api_secret = os.getenv("BINANCE_API_SECRET")
    
    if not api_key or not api_secret:
        return {"success": False, "error": "Binance API Keys not configured.", "data": []}
        
    exchange = ccxt_async.binance({
        'apiKey': api_key,
        'secret': api_secret,
        'enableRateLimit': True,
        'options': {
            'adjustForTimeDifference': True,
        }
    })
    
    validated_trades = []
    anomalies = []
    import db_manager
    last_error = None
    try:
        pairs = get_exchange_pairs('binance', ['USDT/ARS', 'BTC/ARS', 'ETH/ARS'])
        
        for pair in pairs:
            try:
                crypto = pair.split('/')[0] if '/' in pair else pair
                since = db_manager.get_latest_transaction_timestamp("Binance Spot", crypto)
                if since:
                    since += 1
                limit = 100
                while True:
                    trades = await exchange.fetch_my_trades(symbol=pair, since=since, limit=limit)
                    if not trades:
                        break
                    for t in trades:
                        try:
                            # Map to TransactionModel
                            models = decompose_api_trade(t, pair, "Binance Spot")
                            validated_trades.extend(models)
                        except ValidationError as ve:
                            anomalies.append({"exchange": "Binance Spot", "row": t, "error": str(ve)})
                            continue
                    since = trades[-1]['timestamp'] + 1
                    if len(trades) < limit:
                        break
            except ccxt_async.AuthenticationError as ae:
                return {"success": False, "error": f"Error de autenticación en Binance: {ae}", "data": [], "anomalies": []}
            except Exception as e:
                last_error = e
                print(f"Skipping Binance {pair}: {e}")
                
        if not validated_trades and last_error:
            return {"success": False, "error": f"Fallo al consultar pares de Binance. Último error: {last_error}", "data": [], "anomalies": []}
            
        return {"success": True, "error": None, "data": validated_trades, "anomalies": anomalies}
    except Exception as e:
        return {"success": False, "error": f"Binance V2 Sync Error: {str(e)}", "data": [], "anomalies": []}
    finally:
        await exchange.close()

async def fetch_bitso_v2():
    api_key = os.getenv("BITSO_API_KEY")
    api_secret = os.getenv("BITSO_API_SECRET")
    
    if not api_key or not api_secret:
        return {"success": False, "error": "Bitso API Keys not configured.", "data": []}
        
    exchange = ccxt_async.bitso({
        'apiKey': api_key,
        'secret': api_secret,
        'enableRateLimit': True,
        'options': {
            'adjustForTimeDifference': True,
        }
    })
    
    validated_trades = []
    anomalies = []
    try:
        pairs = get_exchange_pairs('bitso', ['btc_ars', 'eth_ars', 'usd_ars', 'usdt_ars'])
        for pair in pairs:
            try:
                symbol = pair.lower().replace('/', '_')
                display_symbol = symbol.upper().replace('_', '/')
                limit = 100
                marker = None
                while True:
                    params = {}
                    if marker:
                        params['marker'] = marker
                    trades = await exchange.fetch_my_trades(symbol=symbol, limit=limit, params=params)
                    if not trades:
                        break
                    for t in trades:
                        try:
                            models = decompose_api_trade(t, display_symbol, "Bitso Alpha")
                            validated_trades.extend(models)
                        except ValidationError as ve:
                            anomalies.append({"exchange": "Bitso Alpha", "row": t, "error": str(ve)})
                            continue
                    new_marker = trades[-1].get('id')
                    if len(trades) < limit or not new_marker or new_marker == marker:
                        break
                    marker = new_marker
            except ccxt_async.AuthenticationError as ae:
                return {"success": False, "error": f"Error de autenticación en Bitso: {ae}", "data": [], "anomalies": []}
            except Exception as e:
                print(f"Skipping Bitso {pair}: {e}")
                 
        return {"success": True, "error": None, "data": validated_trades, "anomalies": anomalies}
    except Exception as e:
        return {"success": False, "error": f"Bitso V2 Sync Error: {str(e)}", "data": [], "anomalies": []}
    finally:
        await exchange.close()

async def fetch_ripio_trade_v2():
    api_key = os.getenv("RIPIO_API_KEY")
    api_secret = os.getenv("RIPIO_API_SECRET")
    
    if not api_key or not api_secret:
        return {"success": False, "error": "Ripio Trade API Keys not configured.", "data": []}
        
    base_url = "https://api.ripiotrade.co/v4"
    endpoint = "/user/trades"
    
    timestamp = str(int(time.time()))
    api_secret_bytes = api_secret.encode('utf-8')
    message = timestamp + endpoint
    message_bytes = message.encode('utf-8')
    signature = hmac.new(api_secret_bytes, message_bytes, hashlib.sha256).hexdigest()
    
    headers = {
        'Authorization': f'Bearer {api_key}',
        'X-Cor-Auth-Timestamp': timestamp,
        'X-Cor-Auth-Signature': signature
    }
    
    validated_trades = []
    anomalies = []
    
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(base_url + endpoint, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    trades = data.get('data', [])
                    for t in trades:
                        try:
                            # Ripio trade decoding logic
                            pair = t.get('pair', '')
                            is_buy = t.get('side') == 'buy'
                            moneda = t.get('base_currency', pair.replace('ARS', ''))
                            
                            monto = float(t.get('amount', 0))
                            precio = float(t.get('price', 0))
                            monto_ars = monto * precio
                            
                            monto_c = monto if is_buy else 0.0
                            monto_v = monto if not is_buy else 0.0
                            
                            model = TransactionModel(
                                fecha=datetime.fromisoformat(t['created_at'].replace('Z', '+00:00')),
                                exchange="Ripio Trade",
                                tipo_operacion="Compra" if is_buy else "Venta",
                                moneda=moneda.upper(),
                                monto_compra_cripto=monto_c,
                                monto_venta_cripto=monto_v,
                                cotizacion_compra=precio if is_buy else 0.0,
                                cotizacion_venta=precio if not is_buy else 0.0,
                                monto_ars=monto_ars,
                                comentarios=f"Ripio ID: {t.get('id', '')}"
                            )
                            validated_trades.append(model)
                        except ValidationError as ve:
                             anomalies.append({"exchange": "Ripio Trade", "row": t, "error": str(ve)})
                             continue
                else:
                    return {"success": False, "error": f"Ripio Trade HTTP {response.status}", "data": [], "anomalies": []}
                    
            return {"success": True, "error": None, "data": validated_trades, "anomalies": anomalies}
        except Exception as e:
            return {"success": False, "error": f"Ripio Trade Async Error: {str(e)}", "data": [], "anomalies": []}

async def fetch_okx_v2():
    api_key = os.getenv("OKX_API_KEY")
    api_secret = os.getenv("OKX_API_SECRET")
    api_password = os.getenv("OKX_API_PASSWORD")
    if not api_key or not api_secret: return {"success": False, "error": "OKX auth missing", "data": []}
    exchange = ccxt_async.okx({
        'apiKey': api_key,
        'secret': api_secret,
        'password': api_password,
        'enableRateLimit': True,
        'options': {
            'adjustForTimeDifference': True,
        }
    })
    
    validated_trades = []
    anomalies = []
    import db_manager
    last_error = None
    try:
        pairs = get_exchange_pairs('okx', ['USDC/USDT', 'BTC/USDT', 'ETH/USDT'])
        for pair in pairs:
            try:
                crypto = pair.split('/')[0] if '/' in pair else pair
                since = db_manager.get_latest_transaction_timestamp("OKX", crypto)
                if since:
                    since += 1
                limit = 100
                while True:
                    trades = await exchange.fetch_my_trades(symbol=pair, since=since, limit=limit)
                    if not trades:
                        break
                    for t in trades:
                        try:
                            models = decompose_api_trade(t, pair, "OKX")
                            validated_trades.extend(models)
                        except ValidationError as ve:
                            anomalies.append({"exchange": "OKX", "row": t, "error": str(ve)})
                            continue
                    since = trades[-1]['timestamp'] + 1
                    if len(trades) < limit:
                        break
            except ccxt_async.AuthenticationError as ae:
                return {"success": False, "error": f"Error de autenticación en OKX: {ae}", "data": [], "anomalies": []}
            except Exception as e:
                print(f"Skipping OKX {pair}: {e}")
                
        return {"success": True, "error": None, "data": validated_trades, "anomalies": anomalies}
    except Exception as e: return {"success": False, "error": str(e), "data": [], "anomalies": []}
    finally: await exchange.close()

async def fetch_bybit_v2():
    api_key = os.getenv("BYBIT_API_KEY")
    api_secret = os.getenv("BYBIT_API_SECRET")
    if not api_key or not api_secret: return {"success": False, "error": "Bybit auth missing", "data": []}
    exchange = ccxt_async.bybit({
        'apiKey': api_key,
        'secret': api_secret,
        'enableRateLimit': True,
        'options': {
            'adjustForTimeDifference': True,
            'recvWindow': 30000,
        }
    })
    try:
        await exchange.load_time_difference()
    except Exception:
        pass
    
    validated_trades = []
    anomalies = []
    import db_manager
    try:
        pairs = get_exchange_pairs('bybit', ['USDC/USDT', 'BTC/USDT', 'ETH/USDT'])
        for pair in pairs:
            try:
                crypto = pair.split('/')[0] if '/' in pair else pair
                since = db_manager.get_latest_transaction_timestamp("Bybit", crypto)
                if since:
                    since += 1
                limit = 100
                while True:
                    trades = await exchange.fetch_my_trades(symbol=pair, since=since, limit=limit)
                    if not trades:
                        break
                    for t in trades:
                        try:
                            models = decompose_api_trade(t, pair, "Bybit")
                            validated_trades.extend(models)
                        except ValidationError as ve:
                            anomalies.append({"exchange": "Bybit", "row": t, "error": str(ve)})
                            continue
                    since = trades[-1]['timestamp'] + 1
                    if len(trades) < limit:
                        break
            except ccxt_async.AuthenticationError as ae:
                return {"success": False, "error": f"Error de autenticación en Bybit: {ae}", "data": [], "anomalies": []}
            except Exception as e:
                print(f"Skipping Bybit {pair}: {e}")
                
        return {"success": True, "error": None, "data": validated_trades, "anomalies": anomalies}
    except Exception as e: return {"success": False, "error": str(e), "data": [], "anomalies": []}
    finally: await exchange.close()

async def fetch_bitget_v2():
    api_key = os.getenv("BITGET_API_KEY")
    api_secret = os.getenv("BITGET_API_SECRET")
    api_password = os.getenv("BITGET_API_PASSWORD")
    if not api_key or not api_secret: return {"success": False, "error": "Bitget auth missing", "data": []}
    exchange = ccxt_async.bitget({
        'apiKey': api_key,
        'secret': api_secret,
        'password': api_password,
        'enableRateLimit': True,
        'options': {
            'adjustForTimeDifference': True,
        }
    })
    
    validated_trades = []
    anomalies = []
    import db_manager
    try:
        pairs = get_exchange_pairs('bitget', ['USDC/USDT', 'BTC/USDT', 'ETH/USDT'])
        for pair in pairs:
            try:
                crypto = pair.split('/')[0] if '/' in pair else pair
                since = db_manager.get_latest_transaction_timestamp("Bitget", crypto)
                if since:
                    since += 1
                limit = 100
                while True:
                    trades = await exchange.fetch_my_trades(symbol=pair, since=since, limit=limit)
                    if not trades:
                        break
                    for t in trades:
                        try:
                            models = decompose_api_trade(t, pair, "Bitget")
                            validated_trades.extend(models)
                        except ValidationError as ve:
                            anomalies.append({"exchange": "Bitget", "row": t, "error": str(ve)})
                            continue
                    since = trades[-1]['timestamp'] + 1
                    if len(trades) < limit:
                        break
            except ccxt_async.AuthenticationError as ae:
                return {"success": False, "error": f"Error de autenticación en Bitget: {ae}", "data": [], "anomalies": []}
            except Exception as e:
                print(f"Skipping Bitget {pair}: {e}")
                
        return {"success": True, "error": None, "data": validated_trades, "anomalies": anomalies}
    except Exception as e: return {"success": False, "error": str(e), "data": [], "anomalies": []}
    finally: await exchange.close()

async def fetch_binance_p2p_v2():
    api_key = os.getenv("BINANCE_API_KEY")
    api_secret = os.getenv("BINANCE_API_SECRET")
    if not api_key or not api_secret:
        return {"success": False, "error": "Binance API Keys not configured.", "data": []}
    exchange = ccxt_async.binance({
        'apiKey': api_key, 'secret': api_secret,
        'enableRateLimit': True,
        'options': {'adjustForTimeDifference': True}
    })
    validated_trades = []
    anomalies = []
    seen_order_numbers = set()
    try:
        if not hasattr(exchange, 'sapiGetC2cOrderMatchListUserOrderHistory'):
            return {"success": True, "error": None, "data": [], "anomalies": []}
        
        now_ms = int(time.time() * 1000)
        thirty_days_ms = 30 * 24 * 60 * 60 * 1000
        
        # Binance API limits C2C history queries to a max interval of 30 days per call,
        # and a maximum depth of 6 months (180 days) from current date.
        for i in range(6):
            end_ts = now_ms - (i * thirty_days_ms)
            start_ts = now_ms - ((i + 1) * thirty_days_ms)
            
            for trade_type in ['BUY', 'SELL']:
                try:
                    res = await exchange.sapiGetC2cOrderMatchListUserOrderHistory({
                        'tradeType': trade_type,
                        'startTimestamp': start_ts,
                        'endTimestamp': end_ts
                    })
                    orders = res.get('data', []) if isinstance(res, dict) else []
                    for o in orders:
                        if o.get('orderStatus') != 'COMPLETED':
                            continue
                        order_num = o.get('orderNumber')
                        if order_num in seen_order_numbers:
                            continue
                        seen_order_numbers.add(order_num)
                        try:
                            is_buy = o.get('tradeType', '').upper() == 'BUY'
                            monto = float(o.get('amount', 0))
                            precio = float(o.get('unitPrice', 0))
                            monto_ars = float(o.get('totalPrice', monto * precio))
                            crypto = o.get('asset', 'USDT').upper()
                            tx_date = datetime.fromtimestamp(int(o['createTime']) / 1000.0)
                            pay_method = o.get('payMethodName', '')
                            
                            model = TransactionModel(
                                fecha=tx_date,
                                exchange="Binance P2P",
                                tipo_operacion="Compra" if is_buy else "Venta",
                                moneda=crypto,
                                monto_compra_cripto=monto if is_buy else 0.0,
                                monto_venta_cripto=monto if not is_buy else 0.0,
                                cotizacion_compra=precio if is_buy else 0.0,
                                cotizacion_venta=precio if not is_buy else 0.0,
                                monto_ars=monto_ars,
                                comentarios=f"Binance P2P: {order_num} ({pay_method})"
                            )
                            validated_trades.append(model)
                        except ValidationError as ve:
                            anomalies.append({"exchange": "Binance P2P", "row": o, "error": str(ve)})
                            continue
                except Exception as range_err:
                    print(f"Skipping Binance P2P range {start_ts}-{end_ts}: {range_err}")
                    continue

        return {"success": True, "error": None, "data": validated_trades, "anomalies": anomalies}
    except Exception as e:
        return {"success": False, "error": f"Binance P2P Sync Error: {str(e)}", "data": [], "anomalies": []}
    finally:
        await exchange.close()

async def fetch_bitget_p2p_v2():
    api_key = os.getenv("BITGET_API_KEY")
    api_secret = os.getenv("BITGET_API_SECRET")
    api_password = os.getenv("BITGET_API_PASSWORD")
    if not api_key or not api_secret:
        return {"success": False, "error": "Bitget auth missing", "data": []}
    exchange = ccxt_async.bitget({
        'apiKey': api_key, 'secret': api_secret, 'password': api_password,
        'enableRateLimit': True,
        'options': {'adjustForTimeDifference': True}
    })
    validated_trades = []
    anomalies = []
    try:
        fn = None
        if hasattr(exchange, 'privateP2pGetV2P2pOrderList'):
            fn = exchange.privateP2pGetV2P2pOrderList
        elif hasattr(exchange, 'private_p2p_get_v2_p2p_orderlist'):
            fn = exchange.private_p2p_get_v2_p2p_orderlist
            
        if not fn:
            return {"success": True, "error": None, "data": [], "anomalies": []}
            
        res = await fn({'limit': '100'})
        data_obj = res.get('data', {}) if isinstance(res, dict) else {}
        orders = data_obj.get('orderList', []) if isinstance(data_obj, dict) else []
        
        for o in orders:
            if o.get('status') != 'completed':
                continue
            try:
                is_buy = o.get('side', '').lower() == 'buy'
                monto = float(o.get('count', 0))
                precio = float(o.get('price', 0))
                monto_ars = float(o.get('amount', monto * precio))
                crypto = o.get('coin', 'USDT').upper()
                tx_date = datetime.fromtimestamp(int(o['cTime']) / 1000.0)
                pay_method = o.get('paymentInfo', {}).get('paymethodName', '') if isinstance(o.get('paymentInfo'), dict) else ''
                
                model = TransactionModel(
                    fecha=tx_date,
                    exchange="Bitget P2P",
                    tipo_operacion="Compra" if is_buy else "Venta",
                    moneda=crypto,
                    monto_compra_cripto=monto if is_buy else 0.0,
                    monto_venta_cripto=monto if not is_buy else 0.0,
                    cotizacion_compra=precio if is_buy else 0.0,
                    cotizacion_venta=precio if not is_buy else 0.0,
                    monto_ars=monto_ars,
                    comentarios=f"Bitget P2P: {o.get('orderNo', '')} ({pay_method})"
                )
                validated_trades.append(model)
            except ValidationError as ve:
                anomalies.append({"exchange": "Bitget P2P", "row": o, "error": str(ve)})
                continue
        return {"success": True, "error": None, "data": validated_trades, "anomalies": anomalies}
    except Exception as e:
        return {"success": False, "error": f"Bitget P2P Sync Error: {str(e)}", "data": [], "anomalies": []}
    finally:
        await exchange.close()

async def fetch_all_v2():
    """
    Executes all exchange fetchers CONCURRENTLY (Phase 3 optimization)
    and returns a combined list of validated Pydantic models (Phase 1).
    """
    load_dotenv(override=True)  # Reload environment variables for newly updated keys
    
    results = await asyncio.gather(
        fetch_binance_v2(),
        fetch_binance_p2p_v2(),
        fetch_bitso_v2(),
        fetch_ripio_trade_v2(),
        fetch_okx_v2(),
        fetch_bybit_v2(),
        fetch_bitget_v2(),
        fetch_bitget_p2p_v2(),
        return_exceptions=True
    )
    
    all_validated = []
    errors = []
    anomalies = []
    
    for r in results:
        if isinstance(r, dict):
            if r.get('success'):
                all_validated.extend(r.get('data', []))
                anomalies.extend(r.get('anomalies', []))
            else:
                errors.append(r.get('error'))
        else:
             errors.append(str(r))
             
    return {
        "success": True,
        "data": all_validated,
        "errors": errors,
        "anomalies": anomalies
    }

def _is_placeholder_key(key, secret):
    if not key or not secret:
        return True
    k, s = str(key).lower().strip(), str(secret).lower().strip()
    placeholders = ['your_api_key_here', 'xxx', 'test', 'your_secret_here', 'your_key', '']
    return k in placeholders or s in placeholders or 'your_' in k or 'your_' in s

def _clean_api_error(err_str):
    """Clean ccxt/API error strings for user-friendly display, prioritizing error numbers."""
    s = str(err_str)
    
    # 1. Timeout
    if 'timeout' in s.lower() or 'timed out' in s.lower():
        return "Error (Timeout)"
        
    # 2. Extract JSON-like error codes (e.g., "code":-1022, "retCode":33004)
    code_match = re.search(r'"(?:code|retCode|status)"\s*:\s*(-?\d+)', s)
    if code_match:
        return f"Error {code_match.group(1)}"
        
    # 3. Extract HTTP status codes (e.g. "HTTP 401", "status 403")
    http_match = re.search(r'(?:http|status)\s*(\d{3})', s, re.IGNORECASE)
    if http_match:
        return f"Error {http_match.group(1)}"
        
    # 4. Extract any isolated number that could be a code (e.g., -1022, 33004, 401)
    num_match = re.search(r'\b(-?\d{3,6})\b', s)
    if num_match:
        return f"Error {num_match.group(1)}"
        
    # Fallback to general cleaning
    cleaned = re.sub(r'^[a-zA-Z]+ (GET|POST|PUT|DELETE|PATCH) https?://\S+\s*', '', s).strip()
    cleaned = re.sub(r'https?://\S+', '', cleaned).strip()
    cleaned = cleaned.strip('() ')
    if not cleaned:
        return "Error de conexión"
    return cleaned[:50]

async def check_api_auth_single(exchange_id):
    load_dotenv(dotenv_path=ENV_FILE, override=True)
    
    if exchange_id == "binance":
        key = os.getenv("BINANCE_API_KEY")
        secret = os.getenv("BINANCE_API_SECRET")
        if _is_placeholder_key(key, secret):
            return {"status": "unconfigured", "msg": "Llaves no ingresadas"}
        try:
            ex = ccxt_async.binance({
                'apiKey': key, 'secret': secret,
                'enableRateLimit': False, 'timeout': 15000,
                'options': {
                    'fetchMarkets': False,
                    'adjustForTimeDifference': True,
                    'recvWindow': 30000,
                }
            })
            try: await ex.load_time_difference()
            except Exception: pass
            await ex.fetch_balance({'type': 'spot'})
            await ex.close()
            return {"status": "online", "msg": "Autenticado OK"}
        except Exception as e:
            try: await ex.close()
            except Exception: pass
            err_str = str(e).lower()
            if any(term in err_str for term in ['auth', 'key', 'permission', '401', '403', 'signature', 'invalid', '-1022', '-2015', '-2014']) or ('expired' in err_str and 'request' not in err_str):
                return {"status": "expired", "msg": _clean_api_error(str(e))}
            return {"status": "offline", "msg": _clean_api_error(str(e))}

    elif exchange_id == "bitso":
        key = os.getenv("BITSO_API_KEY")
        secret = os.getenv("BITSO_API_SECRET")
        if _is_placeholder_key(key, secret):
            return {"status": "unconfigured", "msg": "Llaves no ingresadas"}
        try:
            ex = ccxt_async.bitso({
                'apiKey': key, 'secret': secret,
                'enableRateLimit': False, 'timeout': 15000,
                'options': {
                    'fetchMarkets': False,
                    'adjustForTimeDifference': True,
                }
            })
            await ex.fetch_balance()
            await ex.close()
            return {"status": "online", "msg": "Autenticado OK"}
        except Exception as e:
            try: await ex.close()
            except Exception: pass
            err_str = str(e).lower()
            if any(term in err_str for term in ['auth', 'key', 'permission', '401', '403', 'signature', 'invalid', 'expired']):
                return {"status": "expired", "msg": _clean_api_error(str(e))}
            return {"status": "offline", "msg": _clean_api_error(str(e))}

    elif exchange_id == "ripio_trade":
        res = await fetch_ripio_trade_v2()
        if res.get("success"):
            return {"status": "online", "msg": "Autenticado OK"}
        err = str(res.get("error", ""))
        if "not configured" in err.lower() or "missing" in err.lower():
            return {"status": "unconfigured", "msg": "Llaves no ingresadas"}
        if any(term in err.lower() for term in ['401', '403', 'signature', 'auth', 'expired']):
            return {"status": "expired", "msg": _clean_api_error(err)}
        return {"status": "offline", "msg": _clean_api_error(err)}

    elif exchange_id == "okx":
        key = os.getenv("OKX_API_KEY")
        secret = os.getenv("OKX_API_SECRET")
        if _is_placeholder_key(key, secret):
            return {"status": "unconfigured", "msg": "Llaves no ingresadas"}
        try:
            ex = ccxt_async.okx({
                'apiKey': key, 'secret': secret, 'password': os.getenv("OKX_API_PASSWORD"),
                'enableRateLimit': False, 'timeout': 15000,
                'options': {
                    'fetchMarkets': False,
                    'adjustForTimeDifference': True,
                }
            })
            await ex.fetch_balance()
            await ex.close()
            return {"status": "online", "msg": "Autenticado OK"}
        except Exception as e:
            try: await ex.close()
            except Exception: pass
            err_str = str(e).lower()
            if any(term in err_str for term in ['auth', 'key', 'permission', '401', '403', 'signature', 'invalid', 'expired']):
                return {"status": "expired", "msg": _clean_api_error(str(e))}
            return {"status": "offline", "msg": _clean_api_error(str(e))}

    elif exchange_id == "bybit":
        key = os.getenv("BYBIT_API_KEY")
        secret = os.getenv("BYBIT_API_SECRET")
        if _is_placeholder_key(key, secret):
            return {"status": "unconfigured", "msg": "Llaves no ingresadas"}
        try:
            ex = ccxt_async.bybit({
                'apiKey': key, 'secret': secret,
                'enableRateLimit': False, 'timeout': 15000,
                'options': {
                    'fetchMarkets': False,
                    'adjustForTimeDifference': True,
                    'recvWindow': 30000,
                }
            })
            try: await ex.load_time_difference()
            except Exception: pass
            await ex.fetch_balance()
            await ex.close()
            return {"status": "online", "msg": "Autenticado OK"}
        except Exception as e:
            try: await ex.close()
            except Exception: pass
            err_str = str(e).lower()
            if '10002' in err_str or 'request expired' in err_str:
                return {"status": "offline", "msg": "Error 10002 (Desfasaje de hora)"}
            if any(term in err_str for term in ['auth', 'key', 'permission', '401', '403', 'signature', 'invalid']) or ('expired' in err_str and 'request' not in err_str):
                return {"status": "expired", "msg": _clean_api_error(str(e))}
            return {"status": "offline", "msg": _clean_api_error(str(e))}

    elif exchange_id == "bitget":
        key = os.getenv("BITGET_API_KEY")
        secret = os.getenv("BITGET_API_SECRET")
        if _is_placeholder_key(key, secret):
            return {"status": "unconfigured", "msg": "Llaves no ingresadas"}
        try:
            ex = ccxt_async.bitget({
                'apiKey': key, 'secret': secret, 'password': os.getenv("BITGET_API_PASSWORD"),
                'enableRateLimit': False, 'timeout': 15000,
                'options': {
                    'fetchMarkets': False,
                    'adjustForTimeDifference': True,
                }
            })
            await ex.fetch_balance()
            await ex.close()
            return {"status": "online", "msg": "Autenticado OK"}
        except Exception as e:
            try: await ex.close()
            except Exception: pass
            err_str = str(e).lower()
            if any(term in err_str for term in ['auth', 'key', 'permission', '401', '403', 'signature', 'invalid', 'expired']):
                return {"status": "expired", "msg": _clean_api_error(str(e))}
            return {"status": "offline", "msg": _clean_api_error(str(e))}

    # Dynamic check for other CCXT exchanges
    if exchange_id in ccxt_async.exchanges:
        key = os.getenv(f"{exchange_id.upper()}_API_KEY")
        secret = os.getenv(f"{exchange_id.upper()}_API_SECRET")
        if not key or not secret or _is_placeholder_key(key, secret):
            return {"status": "unconfigured", "msg": "Llaves no ingresadas"}
        try:
            ex_class = getattr(ccxt_async, exchange_id)
            ex = ex_class({
                'apiKey': key,
                'secret': secret,
                'enableRateLimit': False,
                'timeout': 15000,
                'options': {
                    'fetchMarkets': False,
                    'adjustForTimeDifference': True,
                }
            })
            password = os.getenv(f"{exchange_id.upper()}_API_PASSWORD")
            if password:
                ex.password = password
                
            await ex.fetch_balance()
            await ex.close()
            return {"status": "online", "msg": "Autenticado OK"}
        except Exception as e:
            try: await ex.close()
            except Exception: pass
            err_str = str(e).lower()
            if any(term in err_str for term in ['auth', 'key', 'permission', '401', '403', 'signature', 'invalid', 'expired']):
                return {"status": "expired", "msg": _clean_api_error(str(e))}
            return {"status": "offline", "msg": _clean_api_error(str(e))}

    return {"status": "unconfigured", "msg": "Desconocido"}

async def check_api_auth_single_safe(exchange_id):
    try:
        return await asyncio.wait_for(check_api_auth_single(exchange_id), timeout=40.0)
    except asyncio.TimeoutError:
        return {"status": "offline", "msg": "Tiempo de espera agotado (Timeout)"}
    except Exception as e:
        return {"status": "offline", "msg": str(e)[:50]}

async def check_all_api_statuses_v2():
    load_dotenv(dotenv_path=ENV_FILE, override=True)  # Reload environment variables for newly updated keys
    import db_manager
    try:
        db_exchanges = db_manager.get_all_exchanges()
        # Find all exchange IDs that are native APIs or custom APIs
        exchanges = [ex['id'] for ex in db_exchanges if ex.get('type') in ('NATIVE_API', 'CUSTOM_API')]
    except Exception as e:
        print("Error fetching dynamic exchanges config, falling back to defaults:", e)
        exchanges = ["binance", "bitso", "ripio_trade", "okx", "bybit", "bitget"]

    # Deduplicate exchange list while preserving order
    exchanges = list(dict.fromkeys(exchanges))

    tasks = [check_api_auth_single_safe(ex) for ex in exchanges]
    results = await asyncio.gather(*tasks)
    
    status_map = {}
    for ex, res in zip(exchanges, results):
        status_map[ex] = {
            "status": res["status"],
            "lastUpdate": time.strftime('%d/%m/%Y %H:%M:%S'),
            "msg": res["msg"]
        }
    return status_map
