from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional

def compute_canonical_tx_hash(fecha_str: str, exchange: str, tipo_operacion: str, moneda: str, monto_compra: float = 0.0, monto_venta: float = 0.0, monto_ars: float = 0.0, unique_ref: str = "") -> str:
    """Canonical MD5 transaction hash algorithm used across CSV, API, and DB insertion."""
    import hashlib
    raw_str = f"{str(fecha_str).strip()}_{str(exchange).strip()}_{str(tipo_operacion).strip().capitalize()}_{str(moneda).strip().upper()}_{float(monto_compra or 0):.8f}_{float(monto_venta or 0):.8f}_{float(monto_ars or 0):.2f}_{str(unique_ref or '').strip()}"
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

