# Guía Técnica de Integraciones API y Carga Manual de Exchanges

> ⚠️ **AVISO IMPORTANTISIMO DE MANTENIMIENTO DE APIS**
> Las APIs públicas y privadas de los exchanges (encabezados de autenticación, firmas HMAC, parámetros y nombres de endpoints) pueden evolucionar y cambiar con el tiempo. Al realizar actualizaciones o mantenimiento, se recomienda verificar las especificaciones vigentes en la documentación oficial de cada plataforma.

---

## 1. Mapa Resumen de Métodos de Extracción

| Exchange | Método Principal | Soporte Spot | Soporte P2P / C2C | Notas y Requerimientos |
| :--- | :---: | :---: | :---: | :--- |
| **Binance** | ⚡ **API Automática** |  Sí (CCXT) |  Sí (`sapiGetC2c...`) | API Key con permisos de Lectura. |
| **Bitget** | ⚡ **API Automática** |  Sí (CCXT) |  Sí (`privateP2p...`) | Requiere API Key, Secret y Passphrase. |
| **Bitso** | ⚡ **API Automática** |  Sí (V3 CCXT) | N/A | Paginación mediante parámetro `marker`. Símbolos en minúsculas (`btc_ars`). |
| **Ripio Trade** | ⚡ **API Automática / Manual** |  Sí (V4 API) | N/A | Firma HMAC Base64. *Nota: Requiere cuenta activa sin restricciones de Compliance/KYC en Ripio.* |
| **OKX** | ⚡ **API (Spot) / Manual (P2P)** |  Sí (CCXT) | ⚠️ Solo Merchant | La API de P2P requiere perfil de *Comerciante (Merchant)*. Usuarios estándar cargan P2P vía CSV/Excel manual. |
| **Bybit** | ⚡ **API (Spot) / Manual (P2P)** |  Sí (CCXT) | ⚠️ Solo Merchant | La API de P2P requiere perfil de *Comerciante (Merchant)*. Usuarios estándar cargan P2P vía CSV/Excel manual. |
| **Fiwind** | 📄 **Carga Manual (CSV)** | N/A | N/A | Fiwind no posee API pública de historial de operaciones. Se importa por reporte CSV/Excel. |
| **Lemon / Buenbit / SatoshiTango** | 📄 **Carga Manual (CSV)** | N/A | N/A | Importación mediante los procesadores de archivos en `processor_lib.py`. |

---

## 2. Detalle de Autenticación y Endpoints por Exchange

### 🟡 Binance
* **Librería:** CCXT Async (`ccxt.async_support.binance`).
* **Endpoint Spot:** `exchange.fetch_my_trades(symbol=pair, since=since, limit=limit)`.
* **Endpoint P2P:** `sapiGetC2cOrderMatchListUserOrderHistory` (GET `/sapi/v1/c2c/orderMatch/listUserOrderHistory`).
* **Parámetros P2P:** `tradeType` (`'BUY'` / `'SELL'`).

### 🟦 Bitget
* **Librería:** CCXT Async (`ccxt.async_support.bitget`).
* **Credenciales requeridas:** `BITGET_API_KEY`, `BITGET_API_SECRET`, `BITGET_API_PASSWORD`.
* **Endpoint Spot:** `exchange.fetch_my_trades(symbol=pair, since=since, limit=limit)` (Pares tipo `USDC/USDT`, `BTC/USDT`, `ETH/USDT`).
* **Endpoint P2P:** `privateP2pGetV2P2pOrderList` (GET `/api/v2/p2p/orderList`).
* **Parámetros P2P:** `limit: '100'`. Filtro por `status == 'completed'`.

### 🟢 Bitso Alpha
* **Librería:** CCXT Async (`ccxt.async_support.bitso`).
* **Símbolos:** Minúsculas separadas por guion bajo (`btc_ars`, `eth_ars`, `usd_ars`, `usdt_ars`).
* **Paginación:** Utiliza parámetro `params={'marker': last_trade_id}` en lugar de `since`.

### 💜 Ripio Trade (API V4)
* **Base URL:** `https://api.ripiotrade.co`
* **Endpoint Trades:** `/v4/user/trades?pair={PAIR}` (Pares requeridos: `USDT_ARS`, `BTC_ARS`, `ETH_ARS`, `USDC_ARS`, `BTC_USDC`, `ETH_USDC`).
* **Formato de Encabezados (Headers):**
  ```python
  headers = {
      'Authorization': api_token,         # Token sin prefijo 'Bearer'
      'Timestamp': timestamp_in_ms,       # Timestamp en milisegundos str(int(time.time() * 1000))
      'Signature': signature_base64,      # Firma HMAC SHA256 codificada en Base64
      'Content-Type': 'application/json'
  }
  ```
* **Fórmula de Firma (HMAC-SHA256):**
  ```python
  message = f"{timestamp_ms}{METHOD.upper()}{path}" # Ej: "1784828534124GET/v4/user/trades"
  signature_bytes = hmac.new(secret_key.encode('utf-8'), message.encode('utf-8'), hashlib.sha256).digest()
  signature_base64 = base64.b64encode(signature_bytes).decode('utf-8')
  ```

---

## 3. Guía Rápida para el Usuario

1. **¿Qué exchanges se sincronizan automáticamente con un solo clic?**
   * **Binance**, **Bitget**, **Bitso** y **Ripio Trade** (si la cuenta está activa).
2. **¿Qué hacer si operas P2P en OKX o Bybit sin ser comerciante?**
   * Descargar el reporte CSV/Excel de P2P desde el panel web de OKX o Bybit e importarlo en la pestaña de **Cargar Archivos**.
3. **¿Qué hacer con exchanges sin API como Fiwind, Lemon, etc.?**
   * Descargar el resumen de movimientos en CSV/Excel y subirlo en **Cargar Archivos**.
