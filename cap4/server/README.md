# SPPTZE
Sistema de Presentación para Pantallas de Turno en Zonas de Espera

## Capítulo 4 - Iteraciones 1 y 2: Requisitos y Arquitectura
Código resultante de las dos primeras iteraciones del desarrollo del sistema según la planificación inicial establecida en la memoria de trabajo

## Prototipo funcional del servidor central
Integra la API REST y el acceso a datos usando Sequelize ORM. Implementa el modelo de datos completo y permite validar los casos de uso principales del sistema.

### Estructura del proyecto
```
server/
├── config/
│   └── database.js         # Configuración BD según entorno (.env)
├── models/
│   ├── index.js            # Inicialización modelos + utilidades
│   └── definitions.js      # Definiciones Sequelize (copiado de orm/)
├── scripts/
│   ├── seed.js             # Setup BD + datos de ejemplo
│   └── test-integration.js # Pruebas integración API + BD
├── public/
│   ├── display.html        # UI nodo visualización
│   └── admin.html          # UI panel administración
├── server.js               # Servidor principal
├── package.json            # Dependencias + scripts
└── .env-sample             # Plantilla de archivo .env para la configuración de entorno
```

## Requisitos
- Node.js >= 22.0.0
- PostgreSQL / SQLite

Se incluye un *stack* mínimo para iniciar un gestor PostgreSQL mediante Docker Compose en el archivo `stack_postgres.yml` que emplea las mismas variables de entorno (fichero `.env`) que la aplicación. Iniciar con:
   ```bash
   docker compose -f stack_postgres.yml up
   ```

## Uso
1. **Instalar dependencias**:
   ```bash
   npm install
   ```

2. **Configurar un entorno `.env` a partir del archivo de plantilla `.env-sample`**:
   ```bash
   # .env
   NODE_ENV=development
   
   ORM_DIALECT=sqlite                 # o 'postgres'
   ORM_LOGGING=true
   
   # No necesario para SQLite. Para PostgreSQL:
   #DB_HOST=localhost
   #DB_PORT=5432
   #DB_NAME=spptze
   #DB_USER=postgres
   #DB_PASS=postgres
   ```

3. **Crear base de datos y datos de ejemplo**:
   ```bash
   npm run seed
   ```

4. **Iniciar servidor**:
   ```bash
   npm start
   ```

## Scripts disponibles
- `npm start` - Inicia servidor (preserva datos existentes)
- `npm run dev` - Inicia servidor con nodemon para desarrollo
- `npm run seed` - Crea esquema de base de datos con datos de ejemplo. ⚠️**Elimina el contenido existente en la base de datos**⚠️.
- `npm test` - Ejecuta pruebas de integración

## Endpoints principales
- **API Base**: /api/v1
- **Documentación API (SwaggerUI)**: /api/v1/docs
- **Display demo**: /display
- **Admin Panel demo**: /admin

## Ejemplos de uso

### API Keys de demo
- Hospital: `demo-key-hospital-123`
- Admin: `demo-key-admin-456`

### Envío de llamada de turno
```bash
curl -X POST http://localhost:3000/api/v1/messages \
  -H "X-API-Key: demo-key-hospital-123" \
  -H "Content-Type: application/json" \
  -d '{
    "ticket": "A123",
    "content": "Turno A123 - Consulta 3",
    "target": "SP_CARDIO_03"
  }'
```

### Consulta de estado de nodos
```bash
curl -H "X-API-Key: demo-key-admin-456" \
  http://localhost:3000/api/v1/nodes
```

## Arquitectura
- **API REST**: Express.js + OpenAPI
- **Base de datos**: Sequelize ORM (SQLite/PostgreSQL)
- **Autenticación**: API keys
- **Documentación OpenAPI**: swagger-jsdoc, swagger-ui-express
- **Validación OpenAPI**: express-openapi-validator

## Notas
- La BD se recrea solo con `npm run seed`; se preservan los datos existentes al iniciarse mediante `npm start`
