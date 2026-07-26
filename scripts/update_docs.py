import os
import re

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
README_PATH = os.path.join(ROOT_DIR, "README.md")
BACKEND_DIR = os.path.join(ROOT_DIR, "webapp", "backend")
FRONTEND_DIR = os.path.join(ROOT_DIR, "webapp", "frontend")

def get_backend_modules():
    modules = []
    if not os.path.exists(BACKEND_DIR):
        return modules
    for f in os.listdir(BACKEND_DIR):
        if f.endswith('.py') and not f.startswith('test_') and not f.startswith('verify_'):
            modules.append(f[:-3])
    return modules

def analyze_imports(modules):
    dependencies = []
    for module in modules:
        filepath = os.path.join(BACKEND_DIR, f"{module}.py")
        if not os.path.exists(filepath):
            continue
        
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
        # Regex to find imports
        # matches: import module, import module1, module2, from module import ...
        lines = content.split('\n')
        for line in lines:
            line = line.strip()
            if line.startswith('import '):
                # import x, y, z
                parts = line[7:].split(',')
                for p in parts:
                    sub_mod = p.strip().split(' ')[0].split('.')[0]
                    if sub_mod in modules and sub_mod != module:
                        dependencies.append((module, sub_mod))
            elif line.startswith('from ') and ' import ' in line:
                # from x import y
                parts = line.split(' ')
                if len(parts) >= 2:
                    sub_mod = parts[1].split('.')[0]
                    if sub_mod in modules and sub_mod != module:
                        dependencies.append((module, sub_mod))
                        
    return sorted(list(set(dependencies)))

def build_mermaid_diagram(dependencies, modules):
    lines = ["```mermaid", "graph TD", "    %% Entidades Externas y Frontend", "    User((Usuario))", "    Browser[Navegador Web<br/>Frontend React/Vite]"]
    
    # Add backend components
    lines.append("")
    lines.append("    subgraph \"Backend (Flask)\"")
    for m in modules:
        # Give a readable label
        label = f"{m}.py"
        if m == "app":
            label = "app.py<br/>(API Principal)"
        elif m == "processor_lib":
            label = "processor_lib.py<br/>(Motor Contable)"
        elif m == "db_manager":
            label = "db_manager.py<br/>(Base de Datos)"
        elif m == "config_manager":
            label = "config_manager.py<br/>(Configuraciones)"
        elif m == "api_manager" or m == "api_manager_v2":
            label = f"{m}.py<br/>(Exchanges API)"
            
        lines.append(f"        {m}[\"{label}\"]")
    
    # SQLite DB
    lines.append("        DB[(transactions.db<br/>SQLite)]")
    lines.append("    end")
    lines.append("")
    
    # Connect Frontend to backend endpoints
    lines.append("    User -- \"Interacciona\" --> Browser")
    if "app" in modules:
        lines.append("    Browser -- \"Llamadas HTTP API\" --> app")
        
    # Connect db_manager to SQLite
    if "db_manager" in modules:
        lines.append("    db_manager --> DB")
        
    # Connect modules relationships
    lines.append("    %% Relaciones Dinámicas de Código")
    for src, dst in dependencies:
        lines.append(f"    {src} -.-> {dst}")
        
    lines.append("```")
    return "\n".join(lines)

def update_readme():
    if not os.path.exists(README_PATH):
        print("README.md no encontrado.")
        return
        
    with open(README_PATH, 'r', encoding='utf-8') as f:
        readme_content = f.read()
        
    anchor = "## 🏗️ Arquitectura y Flujo del Sistema"
    if anchor not in readme_content:
        # If not there, append it
        readme_content += f"\n\n{anchor}\n"
        
    parts = readme_content.split(anchor)
    static_part = parts[0]
    
    # Generate dynamic content
    modules = get_backend_modules()
    dependencies = analyze_imports(modules)
    mermaid_diagram = build_mermaid_diagram(dependencies, modules)
    
    # List files in scripts and webapp
    webapp_structure = ""
    if os.path.exists(FRONTEND_DIR):
        webapp_structure += "- `webapp/frontend/`: React application (Vite + TypeScript)\n"
    if os.path.exists(BACKEND_DIR):
        webapp_structure += "- `webapp/backend/`: Python API (Flask)\n"
        
    dynamic_content = f"""{anchor}

El sistema está diseñado bajo una arquitectura cliente-servidor clásica (Frontend-Backend). Esta sección se genera **dinámicamente** analizando la estructura de archivos y las dependencias de importación reales del código fuente.

### 📊 Diagrama de Dependencias y Flujo de Control

{mermaid_diagram}

> [!NOTE]
> Las líneas punteadas `-.->` indican dependencias directas de importación (`import`) detectadas estáticamente en el código backend.

### 📁 Estructura Detectada del Proyecto

#### Aplicación Web (`webapp/`)
{webapp_structure}
#### Módulos de Backend Detectados (`webapp/backend/`)
"""
    for m in modules:
        desc = ""
        if m == "app":
            desc = " - Servidor Flask principal y definición de endpoints API."
        elif m == "processor_lib":
            desc = " - Motor contable que unifica formatos de CSVs/Excel/APIs e impide duplicados."
        elif m == "db_manager":
            desc = " - Gestión de base de datos SQLite y cálculos de KPIs / Impuestos."
        elif m == "config_manager":
            desc = " - Manejo de archivos de configuración (.json) y variables .env."
        elif m == "reconciliation":
            desc = " - Motor de conciliación contable y clasificación de anomalías."
        elif m.startswith("api_manager"):
            desc = " - Conectores con las APIs de Exchanges (Binance, Bitso, Bybit, etc.)."
            
        dynamic_content += f"- `{m}.py`{desc}\n"
        
    # Write back
    new_readme = static_part + dynamic_content
    with open(README_PATH, 'w', encoding='utf-8') as f:
        f.write(new_readme)
    print("README.md actualizado dinámicamente con éxito.")

if __name__ == "__main__":
    update_readme()
