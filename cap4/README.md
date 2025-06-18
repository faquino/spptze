# SPPTZE
Sistema de Presentación para Pantallas de Turno en Zonas de Espera

## Capítulo 4 - Iteraciones 1 y 2: Requisitos y Arquitectura
Código resultante de las dos primeras iteraciones del desarrollo del sistema según la planificación inicial establecida en la memoria de trabajo

### Iteración 1: Análisis y arquitectura inicial
- Análisis del contexto y requisitos del sistema
- Diseño de la arquitectura general y modelo de datos
- Especificación inicial de la API REST
Entregables: pruebas de concepto de API y ORM en las carpetas **`api/`** y **`orm/`** respectivamente

### Iteración 2: Prototipos iniciales
- Desarrollo del modelo de datos
- Implementación básica del sevidor central con API REST
- Prueba de concepto de interfaces web
Entregables: prototipo funcional del servidor central en la carpeta **`server/`**

## Estructura de carpetas
```
cap4/
├── api/       # Prueba de concepto API REST
├── orm/       # Prueba de concepto modelo de datos 
└── server     # Integración API + BD
```

## Tecnologías validadas
- **Backend:** Node.js + Express.js
- **Base de datos:** Sequelize ORM (SQLite/PostgreSQL)
- **API:** REST + OpenAPI 3.0
- **Autenticación:** API keys
- **Validación:** express-openapi-validator
