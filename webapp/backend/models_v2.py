from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional

def get_canonical_exchange_root(ex_name: str) -> str:
    if not ex_name:
        return 'OTROS'
    ex_upper = str(ex_name).strip().upper()
    if 'BINANCE' in ex_upper:
        return 'BINANCE'
    if 'BITSO' in ex_upper:
        return 'BITSO'
    if 'RIPIO' in ex_upper:
        return 'RIPIO'
    if 'FIWIND' in ex_upper:
        return 'FIWIND'
    if 'LEMON' in ex_upper:
        return 'LEMON'
    if 'BYBIT' in ex_upper:
        return 'BYBIT'
    if 'OKX' in ex_upper:
        return 'OKX'
    if 'BITGET' in ex_upper:
        return 'BITGET'
    if 'KUCOIN' in ex_upper:
        return 'KUCOIN'
    if 'COINBASE' in ex_upper:
        return 'COINBASE'
    if 'KRAKEN' in ex_upper:
        return 'KRAKEN'
    if 'BINGX' in ex_upper:
        return 'BINGX'
    if 'GATE' in ex_upper:
        return 'GATE'
    if 'BELO' in ex_upper:
        return 'BELO'
    if 'SATOSHITANGO' in ex_upper:
        return 'SATOSHITANGO'
    if 'MANUAL' in ex_upper or 'VARIOS' in ex_upper:
        return 'MANUAL'
    return ex_upper

def compute_canonical_tx_hash(fecha_str: str, exchange: str, tipo_operacion: str, moneda: str, monto_compra: float = 0.0, monto_venta: float = 0.0, monto_ars: float = 0.0, unique_ref: str = "") -> str:
    """Canonical MD5 transaction hash algorithm used across CSV, API, and DB insertion."""
    import hashlib
    import re
    # 1. Normalize date to strict YYYY-MM-DD HH:mm:ss UTC
    try:
        import pandas as pd
        _parsed = pd.to_datetime(str(fecha_str).strip(), dayfirst=False, errors='coerce', utc=True)
        if _parsed is not None and not pd.isna(_parsed):
            if hasattr(_parsed, 'tz_convert') and _parsed.tzinfo is not None:
                _parsed = _parsed.tz_convert('UTC')
            clean_fecha = _parsed.strftime('%Y-%m-%d %H:%M:%S')
        else:
            clean_fecha = str(fecha_str).strip()[:19].replace('T', ' ')
    except Exception:
        clean_fecha = str(fecha_str).strip()[:19].replace('T', ' ')
        
    ex_root = get_canonical_exchange_root(exchange)
    
    tipo_upper = str(tipo_operacion).strip().upper()
    if 'COMPRA' in tipo_upper or 'INGRESO' in tipo_upper or 'DEPOSITO' in tipo_upper:
        clean_tipo = 'COMPRA'
    elif 'VENTA' in tipo_upper or 'RETIRO' in tipo_upper or 'ENVIO' in tipo_upper:
        clean_tipo = 'VENTA'
    else:
        clean_tipo = tipo_upper
        
    clean_moneda = str(moneda).strip().upper()
    
    # 2. Extract robust order ID reference
    clean_ref = ""
    if unique_ref:
        ref_str = str(unique_ref).strip()
        noise_keywords = {'binance', 'bitso', 'ripio', 'fiwind', 'lemon', 'bybit', 'okx', 'bitget', 'otros', 'spot', 'p2p', 'trade', 'compra', 'venta', 'ingreso', 'retiro', 'deposito', 'envio', 'conversion', 'swap', 'order', 'orden', 'manual'}
        
        # Pass 1: Labeled order IDs (e.g. "ID: 987654321", "Order #b14a-99f8", "Ref: ORD-1234")
        labeled_match = re.search(r'(?:id|order|orden|ref|txid|#)\s*[:#]?\s*([a-zA-Z0-9_\-]{3,}(?:_[a-z0-9]+)?)', ref_str, re.IGNORECASE)
        if labeled_match:
            t = labeled_match.group(1).lower()
            if t not in noise_keywords:
                clean_ref = t
                
        # Pass 2: Alphanumeric or numeric ID tokens (e.g. "987654321", "b14a-99f8", "12345_c")
        if not clean_ref:
            tokens = re.findall(r'\b([a-zA-Z0-9_\-]{4,}(?:_[a-z0-9]+)?)\b', ref_str)
            candidates = [t for t in tokens if t.lower() not in noise_keywords]
            digit_candidates = [t for t in candidates if re.search(r'\d', t)]
            if digit_candidates:
                clean_ref = digit_candidates[0].lower()
            elif candidates:
                clean_ref = candidates[0].lower()
                
        # Pass 3: Fallback for short numeric IDs or clean ref text free of noise keywords
        if not clean_ref:
            words = [w for w in re.split(r'[\s\-_/:\.,#]+', ref_str.lower()) if w]
            non_noise = [w for w in words if w not in noise_keywords and w not in ('0', '1', '2', '3', '4', '5', '6', '7', '8', '9')]
            if non_noise:
                clean_ref = "-".join(non_noise)
            
    raw_str = f"{clean_fecha}_{ex_root}_{clean_tipo}_{clean_moneda}_{float(monto_compra or 0):.8f}_{float(monto_venta or 0):.8f}_{float(monto_ars or 0):.2f}_{clean_ref}"
    return hashlib.md5(raw_str.encode('utf-8')).hexdigest()

class TransactionModel(BaseModel):
    """
    Standardized strict model for a single cryptocurrency operation.
    Every CSV row and API trade will be forced through this schema to guarantee integrity.
    """
    
    fecha: datetime = Field(..., description="Fecha exacta de la operación")
    exchange: str = Field(..., description="Nombre del Exchange (Ej: Binance, Fiwind, Ripio Trade)")
    tipo_operacion: str = Field(..., description="Compra, Venta, Ingreso Cripto, etc.")
    
    moneda: str = Field(default="", description="Símbolo de la criptomoneda principal")
    monto_compra_cripto: float = Field(default=0.0, ge=0, description="Cantidad adquirida (debe ser >= 0)")
    monto_venta_cripto: float = Field(default=0.0, ge=0, description="Cantidad entregada (debe ser >= 0)")
    
    cotizacion_compra: float = Field(default=0.0, ge=0, description="Precio unitario en ARS al comprar")
    cotizacion_venta: float = Field(default=0.0, ge=0, description="Precio unitario en ARS al vender")
    
    monto_ars: float = Field(default=0.0, description="Volumen total operado en pesos argentinos")
    comentarios: str = Field(default="", description="Referencia de origen o ID de operación")
    
    @field_validator('moneda')
    @classmethod
    def clean_moneda(cls, v: str) -> str:
        """Ensure currency symbol is always uppercase and sanitized."""
        return v.strip().upper() if v else ""
        
    @field_validator('tipo_operacion')
    @classmethod
    def standarize_tipo(cls, v: str) -> str:
        """Capitalize type for consistency across all inputs"""
        return v.capitalize() if v else ""

    def to_dict(self) -> dict:
        """
        Exports the validated model back into the dictionary format expected 
        by the legacy Master Excel generator, including a unique tx_hash.
        """
        fecha_str = self.fecha.strftime('%Y-%m-%d %H:%M:%S')
        tx_hash = compute_canonical_tx_hash(
            fecha_str, self.exchange, self.tipo_operacion, self.moneda,
            self.monto_compra_cripto, self.monto_venta_cripto, self.monto_ars, self.comentarios
        )
        
        return {
            "tx_hash": tx_hash,
            "Fecha": fecha_str,
            "Exchange": self.exchange,
            "Tipo de Operación": self.tipo_operacion,
            "Moneda": self.moneda,
            "Monto Compra (Cripto)": self.monto_compra_cripto,
            "Monto Venta (Cripto)": self.monto_venta_cripto,
            "Cotización Compra": self.cotizacion_compra,
            "Cotización Venta": self.cotizacion_venta,
            "Monto ARS": self.monto_ars,
            "Comentarios": self.comentarios
        }


