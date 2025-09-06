/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Servidor central: ORM + API + Interfaces web
// cap6/server/src/server.js
// =============================================================
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const OpenApiValidator = require('express-openapi-validator');

// Modelos y configuración BD
const { testConnection, syncDatabase } = require('./config/database');
const { sequelize } = require('./models');

const MQTTService = require('./services/mqttService');
const { swaggerOptions } = require('./config/swagger.js');
const ttsService = process.env.SPEACHES_URL ? require('./services/ttsService') : null;
const publicDir = path.join(__dirname, '..', 'public');
const assetsDir = process.env.ASSETS_DIR || publicDir;

const app = express();


const swaggerSpec = swaggerJSDoc(swaggerOptions);

const enableAdmin = process.env.ENABLE_ADMIN === 'true' 
                    || (process.env.NODE_ENV === 'development' && !(process.env.ENABLE_ADMIN === 'false'));

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
const node_env = process.env.NODE_ENV || 'production';
 // Para que Helmet no impida CORS, ya que el servidor central hace de CDN de assets de plantillas
 app.use(helmet({
  contentSecurityPolicy: (node_env == 'development') ? false : true,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
// Para servir los assets de las plantillas de presentación
app.use('/',
        cors({ origin: '*', methods: ['GET'], credentials: false }),
        express.static(publicDir));
if (assetsDir !== publicDir)
  app.use('/assets',
          cors({ origin: '*', methods: ['GET'], credentials: false }),
          express.static(assetsDir));

// Logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Validación de parámetros en peticiones según especificación OpenAPI
app.use(OpenApiValidator.middleware({
  apiSpec: swaggerSpec,
  validateRequests: true,
  validateResponses: false
}));


// RUTAS API
// =============================================================
const apiRoutes = require('./routes');
app.use('/api/v1', apiRoutes);


// RUTAS WEB
// =============================================================
/*
app.get('/', (req, res) => {
  res.json({
    message: 'SPPTZE - Sistema de Presentación para Pantallas de Turno',
    endpoints: {
      api: '/api/v1',
      docs: '/api/v1/docs'
    }
  });
});
*/

// MANEJO DE ERRORES
// =============================================================
/*
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
*/

// INICIALIZACIÓN DE SERVICIOS
// =============================================================
async function initializeServices() {
  try {
    console.log('Iniciando servicios...');
    
    // Probar conexión BD
    await testConnection();
    
    // Sincronizar esquema
    await syncDatabase(false);
    
    // Servicio TTS (Speaches)
    if (ttsService) {
      await ttsService.initialize();
    }
    
    // Conexión MQTT
    const mqttBrokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    const mqttOpts = {};
    if (process.env.MQTT_PASS && process.env.MQTT_USER) {
      mqttOpts.username = process.env.MQTT_USER;
      mqttOpts.password = process.env.MQTT_PASS;
    }
    await MQTTService.connect(mqttBrokerUrl, mqttOpts);

    if (enableAdmin) {
      const setupAdminJS = require('./adminjs/setup.js');
      await setupAdminJS(app, sequelize);
    }

    const templateService = require('./services/templateService');
    templateService.initialize();
    templateService.on('spptze:server:template:update', async (template) => {
      // Publicar al topic específico de la plantilla. Los nodos que la usan se habrán suscrito a dicho topic
      const topic = `spptze/system/updates/template/${templateId}`;
      await this.mqttService.publish(topic, JSON.stringify(payload));
      console.log(`Published template ${templateId} update to topic ${topic}`);
    });

    MQTTService.on('spptze:server:mqtt:nodeup', async (nodeSerial, nodeConfig, templates) => {
      const template = (templates?.length > 0) ? templates[0] : await templateService.getDefaultTemplate();
      nodeConfig.template = templateService.generateTemplatePayload(template);
      MQTTService.publishNodeConfig(nodeSerial, nodeConfig);
    });

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
    
    const PORT = process.env.PORT || 3000;
    const HOST = process.env.HOST || 'localhost';
    app.listen(PORT, HOST, () => {
      console.log('SPPTZE Server started successfully');
      console.log('-'.repeat(60));
      console.log(`API Base:          http://${HOST}:${PORT}/api/v1`);
      console.log(`API docs:          http://${HOST}:${PORT}/api/v1/docs`);
      console.log(`OpenAPI Spec.:     http://${HOST}:${PORT}/api/v1/openapi.json`);
      if (enableAdmin) {
        console.log(`AdminJS panel:     http://${HOST}:${PORT}/admin`);
      }
      if (ttsService?.available) {
        console.log(`Speaches panel:    ${process.env.SPEACHES_URL}`);
        console.log(`Speaches API docs: ${process.env.SPEACHES_URL}/docs`);
      }
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
