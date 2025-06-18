# Capítulo 4 - Iteraciones 1 y 2: Requisitos y Arquitectura

Implementación de las dos primeras iteraciones del desarrollo del sistema SPPTZE.

## Contenido

### Iteración 1: Análisis y arquitectura inicial
- Definición de requisitos funcionales y no funcionales
- Casos de uso y diagramas UML
- Diseño de arquitectura del sistema
- Modelo de datos conceptual

### Iteración 2: Prototipos iniciales
- Prueba de concepto API REST
- Implementación modelo de datos con Sequelize
- Servidor integrado con persistencia real

## Estructura de carpetas

```
cap4/
├── api/                   # Prueba de concepto API REST
│   ├── public/            # Interfaces web (display.html, admin.html)
│   ├── server.js          # API con datos en memoria
│   ├── test-api.js        # Pruebas básicas
│   └── package.json       # Dependencias: express, swagger, etc.
├── orm/                   # Prueba de concepto modelo de datos  
│   ├── models.js          # Modelos Sequelize
│   ├── seed.js            # Setup BD + datos ejemplo
│   └── package.json       # Dependencias: sequelize, pg, sqlite3
└── servidor-integrado/    # Integración API + BD (RESULTADO FINAL)
    ├── config/            # Configuración BD
    ├── models/            # Modelos + utilidades
    ├── scripts/           # Seed + pruebas integración
    ├── public/            # Interfaces web
    ├── server.js          # Servidor integrando API + ORM
    └── package.json       # Dependencias combinadas
```

## Resultados de las iteraciones

### Iteración 1 completada
- Casos de uso documentados (12 identificados)
- Requisitos funcionales (9) y no funcionales (8)
- Arquitectura distribuida definida
- Modelo E-R con jerarquías organizativas
- Especificación OpenAPI preliminar

### Iteración 2 completada  
- API REST funcional con autenticación
- Modelo de datos implementado y validado
- Resolución automática service_point → locations → nodes
- Pruebas de integración documentadas
- Prototipo completo API + BD

## Para usar el prototipo final

```bash
cd servidor-integrado/
npm install
npm run seed    # Crear BD con datos
npm start       # Iniciar servidor
npm test        # Validar integración
```

## Documentación generada

- **Swagger UI:** http://localhost:3000/api/v1/docs
- **Interfaces demo:** /display, /admin
- **API completa** con validación OpenAPI

## Tecnologías validadas

- **Backend:** Node.js + Express.js  
- **Base de datos:** Sequelize ORM (SQLite/PostgreSQL)
- **API:** REST + OpenAPI 3.0
- **Autenticación:** API keys
- **Validación:** express-openapi-validator

