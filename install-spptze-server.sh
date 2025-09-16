#!/bin/bash

# Script de instalación del servidor central SPPTZE
INSTALL_DIR="${1:-/opt/spptze-server}"
CURRENT_DIR="$(dirname "$0")"

echo "==================================="
echo "Instalador del Servidor Central SPPTZE"
echo "==================================="
echo "Directorio de instalación: $INSTALL_DIR"
echo ""

# Verificar directorio correcto
if [ ! -d "$CURRENT_DIR/cap6/server" ]; then
    echo "Error: No se encuentra cap6/server."
    exit 1
fi

# Crear directorio de instalación
echo "Creando directorio de instalación..."
sudo mkdir -p "$INSTALL_DIR"

# Copiar archivos necesarios
echo "Copiando archivos para spptze-server..."
sudo cp -r "$CURRENT_DIR/cap6/server/"* "$INSTALL_DIR/"
sudo cp "$CURRENT_DIR/LICENSE" "$INSTALL_DIR/"

# Ajustar permisos
echo "Ajustando permisos..."
sudo chown -R $USER:$USER "$INSTALL_DIR"

echo ""
echo "Archivos de servidor SPPTZE copiados en $INSTALL_DIR"
echo ""
echo "Próximos pasos:"
echo "1. cd $INSTALL_DIR"
echo "2. cp .env-sample .env"
echo "3. npm run admin:gen-config"
echo "4. nano .env  # Configurar variables de entorno"
echo "5. npm install"
echo "6. npm run db:install-driver"
echo "7. npm run db:seed-db"
echo "8. npm start"
