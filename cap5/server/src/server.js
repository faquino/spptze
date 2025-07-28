/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Servidor central: ORM + API + Interfaces web
// cap5/server/src/server.js
// =============================================================
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const OpenApiValidator = require('express-openapi-validator');

// Modelos y configuración BD
const { testConnection, syncDatabase } = require('./config/database');

const MQTTService = require('./services/mqttService');
const { swaggerOptions } = require('./config/swagger.js');


const app = express();


const swaggerSpec = swaggerJsdoc(swaggerOptions);

// INTERFAZ SWAGGERUI
// =============================================================
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// Para obtener spec OpenAPI/Swagger, útil para herramientas. Similar al .wsdl en WS SOAP
app.get('/api/v1/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});


// MIDDLEWARE
// =============================================================
app.use(helmet({ contentSecurityPolicy: false })); //TODO cambiar en producción
app.use(cors());
app.use(express.json({ limit: '10mb' }));
// Servir contenido estático en /public
app.use(express.static('public'));

// Logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});


// RUTAS API
// =============================================================
const apiRoutes = require('./routes');
app.use('/api/v1', apiRoutes);


// Validación de parámetros en peticiones según especificación OpenAPI
app.use(OpenApiValidator.middleware({
  apiSpec: swaggerSpec,
  validateRequests: true,
  validateResponses: false
}));

// RUTAS WEB
// =============================================================
app.get('/', (req, res) => {
  res.json({
    message: 'SPPTZE - Sistema de Presentación para Pantallas de Turno',
    endpoints: {
      api: '/api/v1',
      docs: '/api/v1/docs'
    }
  });
});


// MANEJO DE ERRORES
// =============================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((error, req, res, next) => {
  if (error.status && error.errors) {
    return res.status(error.status).json({
      error: 'Validation failed',
      details: error.errors
    });
  }

  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});


// INICIALIZACIÓN DE SERVICIOS
// =============================================================
async function initializeServices() {
  try {
    console.log('Iniciando servicios...');
    
    // Probar conexión BD
    await testConnection();
    
    // Sincronizar esquema
    await syncDatabase(false);
    
    // Conexión MQTT
    const mqttBrokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    const mqttOpts = {};
    if (process.env.MQTT_PASS && process.env.MQTT_USER) {
      mqttOpts.username = process.env.MQTT_USER;
      mqttOpts.password = process.env.MQTT_PASS;
    }
    await MQTTService.connect(mqttBrokerUrl, mqttOpts);
    console.log('MQTT conectado');
    
    console.log('Servicios iniciados correctamente');
  } catch (error) {
    console.error('Error iniciando servicios:', error);
    process.exit(1);
  }
}


// MANEJO DE CIERRE ORDENADO
// =============================================================
async function gracefulShutdown() {
  console.log('Cerrando servicios...');
  
  try {
    await MQTTService.disconnect();
    console.log('MQTT desconectado');
    
    process.exit(0);
  } catch (error) {
    console.error('Error cerrando servicios:', error);
    process.exit(1);
  }
}


process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);


// INICIALIZACIÓN
// =============================================================
async function startServer() {
  try {
    //
    await initializeServices();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log('SPPTZE Server started successfully');
      console.log('-'.repeat(60));
      console.log(`API Base:          http://localhost:${PORT}/api/v1`);
      console.log(`API Documentación: http://localhost:${PORT}/api/v1/docs`);
      console.log(`OpenAPI Spec.:     http://localhost:${PORT}/api/v1/openapi.json`);
      console.log('-'.repeat(60));
    });

  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
