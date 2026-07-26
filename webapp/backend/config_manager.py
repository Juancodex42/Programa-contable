import json
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG_FILE = os.path.join(BASE_DIR, 'mappings.json')

# Default Mappings based on current processor_lib.py logic
DEFAULT_MAPPINGS = {
    "fiwind": {
        "detection_keywords": ["fiwind"],
        "columns": {
            "fecha": "Fecha",
            "tipo": "Tipo",
            "moneda": "Moneda",
            "moneda_origen": "Moneda Origen",
            "monto": "Monto",
            "monto_origen": "Monto Origen",
            "precio": "Precio"
        },
        "date_format": "%d/%m/%Y %H:%M:%S"
    },
    "ripio_trade": {
        "detection_keywords": ["ripio trade", "código de operación"],
        "columns": {
            "fecha": "Fecha",
            "monto": "Monto",
            "moneda": "Moneda",
            "codigo_operacion": "Código de operación"
        },
        "date_format": "%d/%m/%Y %H:%M:%S"
    },
    "bitso": {
        "detection_keywords": ["bitso", "major", "minor"],
        "columns": {
            "datetime": "datetime", # Sometimes it's Date
            "date_fallback": "Date",
            "type": "type",
            "major": "major",
            "minor": "minor",
            "amount": "amount",
            "value": "value",
            "rate": "rate"
        },
        "date_format": "%m/%d/%Y %H:%M:%S" # Verified from bitso-trade.csv (Item 745)
        
    },
    "binance_spot": {
        "detection_keywords": ["side", "executed", "amount"],
        "columns": {
            "date": "Date(UTC)",
            "side": "Side",
            "pair": "Pair",
            "price": "Price",
            "executed": "Executed",
            "amount": "Amount"
        },
        "date_format": "%Y-%m-%d %H:%M:%S"
    },
    "binance_p2p": {
        "detection_keywords": ["order type", "fiat type"],
        "columns": {
            "status": "Status",
            "created_time": "Created Time",
            "order_type": "Order Type",
            "fiat_type": "Fiat Type",
            "asset_type": "Asset Type",
            "quantity": "Quantity",
            "price": "Price",
            "total_price": "Total Price"
        },
        "date_format": "%Y-%m-%d %H:%M:%S"
    }
}

def load_config():
    """Load mappings from JSON or create with defaults."""
    if not os.path.exists(CONFIG_FILE):
        save_config(DEFAULT_MAPPINGS)
        return DEFAULT_MAPPINGS
    
    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error cargando config JSON. Creando defaults: {e}")
        return DEFAULT_MAPPINGS

def save_config(config):
    """Save mappings to JSON."""
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=4, ensure_ascii=False)

def get_column(exchange_key, field_key, config=None):
    """Get the mapped column name for a specific field."""
    if config is None:
        config = load_config()
    
    return config.get(exchange_key, {}).get('columns', {}).get(field_key, '')

def get_date_format(exchange_key, config=None):
    """Get the configured date format."""
    if config is None:
        config = load_config()
    return config.get(exchange_key, {}).get('date_format', '')

def update_mapping(exchange_key, field_key, new_value):
    """Update a specific mapping or setting."""
    config = load_config()
    if exchange_key in config:
        if field_key == 'date_format':
            config[exchange_key]['date_format'] = new_value
            save_config(config)
            return True
        elif 'columns' in config[exchange_key]:
            config[exchange_key]['columns'][field_key] = new_value
            save_config(config)
            return True
    return False

# Initialize on import
current_config = load_config()

# --- ENV CONFIGURATION ---

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(BACKEND_DIR, '.env')

def get_env_keys():
    """Retrieve API keys from .env without exposing secrets fully if needed (or expose for UI)."""
    from dotenv import dotenv_values
    return dotenv_values(ENV_FILE)

def set_env_keys(keys_dict):
    """Save API keys to .env file securely."""
    # Read existing
    from dotenv import dotenv_values
    existing = dotenv_values(ENV_FILE) if os.path.exists(ENV_FILE) else {}
    
    # Update with sanitization
    for k, v in keys_dict.items():
        if v is not None:
             clean_k = str(k).replace('\n', '').replace('\r', '').replace('=', '').strip()
             clean_v = str(v).replace('\n', '').replace('\r', '').replace("'", "").strip()
             
             # Avoid overwriting with empty inputs or masked values (placeholders)
             if clean_v == "" or "***" in clean_v or "•••" in clean_v:
                 continue
                 
             existing[clean_k] = clean_v
             
    # Write back
    with open(ENV_FILE, 'w', encoding='utf-8') as f:
        for k, v in existing.items():
             f.write(f"{k}='{v}'\n")
    return True

