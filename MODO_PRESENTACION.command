#!/bin/bash

# Determine project directory. If run from inside the folder, use dot.
PROJECT_DIR="$(dirname "$0")"
cd "$PROJECT_DIR"

echo "==================================================="
echo "   PREPARANDO DEMOSTRACIÓN - KONTIGO POS"
echo "   Modo: PRODUCCIÓN (Alto Rendimiento)"
echo "==================================================="
echo ""
echo "1. Optimizando aplicación (esto puede tomar 1 min)..."
# Check if node_modules exists, purely defensive
if [ ! -d "node_modules" ]; then
    echo "Instalando dependencias..."
    npm install
fi

npm run build

echo ""
echo "2. Iniciando Servidor..."
echo " > Abriendo navegador en 5 segundos..."
# Open browser after 5 seconds
(sleep 5 && open http://localhost:3000) &

npm start
