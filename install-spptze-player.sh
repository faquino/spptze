#!/bin/bash

# Script de instalación del nodo de visualización SPPTZE
INSTALL_DIR="${1:-$HOME/spptze-player}"
CURRENT_DIR="$(dirname "$0")"

echo "============================================"
echo "Instalador del Nodo de Visualización SPPTZE"
echo "============================================"
echo "Directorio de instalación: $INSTALL_DIR"
echo ""

# Verificar directorio correcto
if [ ! -d "$CURRENT_DIR/cap6/player" ]; then
    echo "Error: No se encuentra cap6/player."
    exit 1
fi

# Crear directorio de instalación
echo "Creando directorio de instalación..."
mkdir -p "$INSTALL_DIR"

# Copiar archivos necesarios
echo "Copiando archivos para spptze-player..."
cp -r "$CURRENT_DIR/cap6/player/." "$INSTALL_DIR/"
cp "$CURRENT_DIR/LICENSE" "$INSTALL_DIR/"

echo ""
echo "Archivos de nodo de visualización SPPTZE copiados en $INSTALL_DIR"
echo ""
echo "Próximos pasos:"
echo "1. cd $INSTALL_DIR"
echo "2. cp .env-sample .env"
echo "3. nano .env  # Configurar variables de entorno"
echo "4. npm install"
echo "5. npm start"