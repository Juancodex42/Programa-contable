@echo off
echo ===================================================
echo           CRYPTOTAX PRO - INICIANDO...
echo ===================================================
echo.

rem Check node_modules inside webapp/frontend
if not exist "webapp\frontend\node_modules" (
    echo [1/2] Instalando dependencias del Frontend (Solo la primera vez)...
    pushd webapp\frontend
    call npm install
    call npm install lucide-react framer-motion axios
    popd
) else (
    echo [1/2] Dependencias del Frontend ya instaladas. Omitiendo.
)

echo.
echo [2/2] Iniciando Sistema Contable...
python start_system.py

echo.
echo ===================================================
echo ¡Proceso de inicio completado!
echo ===================================================
timeout /t 3

