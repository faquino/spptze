# SPPTZE
Sistema de Presentación para Pantallas de Turno en Zonas de Espera

## Capítulo 6 - Iteraciones 5 y 6: Funcionalidades avanzadas
Código resultante de las iteraciones 5 y 6 del desarrollo del sistema según la planificación establecida en el apartado 3.4 de la memoria de trabajo.

## Versión final del servidor central
Integra la API REST completa y el acceso a datos usando Sequelize ORM. Implementa el modelo de datos completo y permite validar los casos de uso principales del sistema. Implementa la distrución vía MQTT de mensajes de llamada de turno y gestión de pantallas dirigidos a los nodos de visualización.
Se integra con un servidor Speaches para obtener locuciones text-to-speech en las llamadas de turno. Implementa un sistema de definición de plantillas de presentación personalizables. Añade un panel web de administración basado en AdminJS.

### Estructura del proyecto
```
server/
├── public/
│   └── assets/                   # Recursos estáticos de plantillas de visualización
├── src/
│   ├── adminjs/
│   │   └── setup.js              # Configuración de la consola de administración AdminJS
│   ├── config/
│   │   ├── database.js           # Configuración de acceso a la BD según entorno (.env)
│   │   └── swagger.js            # Esquemas OpenAPI/Swagger y configuración de API
│   ├── controllers/              # Controladores (implementan la lógica de las rutas de la API)
│   ├── middleware/               # Procesamiento común en todas las peticiones de rutas API
│   ├── models/
│   │   ├── index.js              # Inicialización modelos + utilidades
│   │   └── definitions.js        # Definiciones Sequelize (copiado de orm/)
│   ├── routes/                   # Declaraciondes de rutas API y asignación de controllers
│   ├── scripts/
│   │   ├── generate-data-dict.js # Genera diccionario de datos a partir de src/models/definitions.js
│   │   ├── install-db-driver.js  # Instala dependencias de base de datos específicas según variable ORM_DIALECT
│   │   ├── seed-db.js            # Setup BD + datos de ejemplo para la ejecución del script de pruebas de integración
│   │   └── test-integration.js   # Pruebas integración API + BD
│   ├── services/                 # Relacionados con distribución MQTT, plantillas, TTS etc. y empleados por los controllers
│   ├── utils/                    # Funciones de utilidad
│   └── server.js                 # Servidor principal
├── package.json                  # Dependencias + scripts
└── .env-sample                   # Plantilla de archivo .env para la configuración de entorno
```

## Requisitos
- Node.js >= 22.0.0
- PostgreSQL / SQLite u otro RDBMS soportado por Sequelize
- Bróker MQTT (Eclipse Mosquitto, HiveMQ etc.)

Se incluye un *stack* mínimo para iniciar un gestor de base de datos (PostgreSQL) y un bróker MQTT (Eclipse Mosquitto) mediante Docker Compose en el archivo `stack_pg_em.yml`, que emplea las mismas variables de entorno (fichero `.env`) que la aplicación. Iniciar con:
   ```bash
   docker compose -f stack_pg_em.yml up
   ```
Se incluye también un servidor Speaches en un contenedor aparte, ver `cap6/tts`


## Uso
1. **Configurar un entorno `.env` a partir del archivo de plantilla `.env-sample`**:
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

2. **Instalar dependencias**:
   ```bash
   npm install
   npm run db:install-driver #Instala los drivers para la base de datos según ORM_DIALECT
   ```

3. **Crear base de datos y datos de ejemplo**:
   ```bash
   npm run db:seed-db
   ```

4. **Iniciar servidor**:
   ```bash
   npm start
   ```

## Scripts disponibles
- `npm start` - Inicia servidor (preserva datos existentes)
- `npm run dev` - Inicia servidor con `nodemon` para desarrollo
- `npm run db:seed-db` - Crea el esquema de base de datos con datos de ejemplo. ⚠️**Eliminará el contenido existente en la base de datos**⚠️.
- `npm run db:install-driver` - Instala los drivers de base de datos según ORM_DIALECT (`package.json` no incluye dependencias de drivers específicos)
- `npm run db:generate-data-dict` - Genera el diccionario de datos `DATA_DICTIONARY.md` a partir de los modelos Sequelize
- `npm test` - Ejecuta pruebas de integración

## Endpoints principales
- **API Base**: /api/v1
- **Documentación API (SwaggerUI)**: /api/v1/docs
- **Panel AdminJS**: /admin

### API Keys de demo
- Hospital: `demo-api-key-hospital-123`
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
- **Cliente MQTT**: mqtt.js
- **Síntesis de voz**: Speaches
- **Panel admin**: AdminJS

## Notas
- La BD se reinicializa solo con `npm run db:seed-db`; los demás scripts preservan los datos existentes
