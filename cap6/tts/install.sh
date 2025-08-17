#!/usr/bin/env sh
set -euo pipefail

SPEACHES_BASE="${SPEACHES_BASE:-http://speaches:8000}"
ALIASES_PATH="${ALIASES_PATH:-/aliases/model_aliases.json}"
CURL_OPTS="${CURL_OPTS:--fsS}"

echo "Leyendo aliases desde: ${ALIASES_PATH}"
test -r "${ALIASES_PATH}" || { echo "No se puede leer ${ALIASES_PATH}"; exit 1; }

# Obtener una lista de modelos instalados
echo "Consultando modelos instalados en ${SPEACHES_BASE}/v1/models"
INSTALLED_IDS="$(curl ${CURL_OPTS} "${SPEACHES_BASE}/v1/models" | jq -r '.data[].id')"

MISSING=0
TOTAL=0

# Recorre alias -> id y decide si hace falta instalar
jq -r 'to_entries[] | "\(.key) \(.value)"' "${ALIASES_PATH}" | while read -r ALIAS ID; do
  TOTAL=$((TOTAL+1))
  if printf "%s\n" "$INSTALLED_IDS" | grep -qx -- "$ID"; then
    echo "Ya instalado: ${ALIAS} - ${ID}"
    continue
  fi

  echo "Instalando por alias: ${ALIAS} - ${ID}"
  # Instalación por alias
  curl ${CURL_OPTS} -X POST "${SPEACHES_BASE}/v1/models/${ALIAS}" >/dev/null \
    && echo "   OK" \
    || { echo "   ERROR instalando ${ALIAS}"; exit 1; }

  MISSING=$((MISSING+1))
done

echo "Instalación COMPLETADA; Nuevos instalados: ${MISSING}"
echo "Modelos instalados:"
curl ${CURL_OPTS} "${SPEACHES_BASE}/v1/models" | jq '.data | map({id, task})'
