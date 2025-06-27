/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Servidor central: ORM + API + Interfaces web
// =============================================================
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const OpenApiValidator = require('express-openapi-validator');
const rateLimit = require('express-rate-limit');

// Modelos y configuración BD
const { testConnection, syncDatabase } = require('./config/database');
const { 
  ExternalSystem, 
  ServicePoint, 
  Location, 
  DisplayNode, 
  Message, 
  MessageDelivery,
  resolverUtils 
} = require('./models');

const app = express();


// Configuración de Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SPPTZE API',
      version: '1.0.0',
      description: 'SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera',
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000/api/v1',
        description: 'Servidor de desarrollo'
      }/*,
      {
        url: 'https://spptze-server.local/api/v1', 
        description: 'Servidor de pruebas (ejemplo)'
      }*/
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Clave API para autenticación. Claves de demo: demo-key-hospital-123, demo-key-admin-456'
        }
      },
      schemas: {
        Message: {
          type: 'object',
          required: ['content', 'target'],
          properties: {
            ticket: {
              type: 'string',
              description: 'Número de turno o identificador visible',
              example: 'A047'
            },
            content: {
              type: 'string',
              description: 'Texto completo del mensaje a mostrar',
              example: 'Turno A047 - Consulta 3'
            },
            target: {
              type: 'string', 
              description: 'Identificador del destino (punto de servicio o ubicación)',
              example: 'SP_CARDIO_03'
            },
            targetType: {
              type: 'string',
              enum: ['service_point', 'location'],
              default: 'service_point',
              description: 'Tipo de destino (ubicación/punto de servicio) para direccionamiento'
            },
            priority: {
              type: 'integer',
              minimum: 1,
              maximum: 5,
              default: 1,
              description: 'Prioridad del mensaje (1=normal, 5=crítica)'
            },
            channel: {
              type: 'string',
              description: 'Canal de información en la plantilla al que se dirige el mensaje',
              example: 'calls'
            },
            externalRef: {
              type: 'string',
              description: 'Referencia externa del sistema origen',
              example: 'CITA_12345'
            }
          }
        },
        MessageResponse: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Identificador único del mensaje',
              example: 'MSG_1640995200000_abc12'
            },
            status: {
              type: 'string',
              enum: ['sent', 'repeated', 'retired'],
              description: 'Estado de la operación'
            },
            targetNodes: {
              type: 'integer',
              description: 'Número de nodos de visualización que recibieron el mensaje'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Timestamp de la operación'
            }
          }
        },
        //OJO no es que esto sea un problema ahora, pero... está ahí:
        //    express-openapi-validator produce mensajes de error con un esquema ligeramente diferente
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Tipo de error'
            },
            message: {
              type: 'string', 
              description: 'Descripción detallada del error'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        NodeControl: {
          type: 'object',
          required: ['action'],
          properties: {
            action: {
              type: 'string',
              enum: ['power_on', 'power_off', 'volume', 'refresh'],
              description: 'Comando de control a enviar al nodo'
            },
            value: {
              type: 'string',
              description: 'Valor adicional para el comando (ej: nivel de volumen)',
              example: '50'
            }
          }
        }
      }
    },
    security: [
      {
        ApiKeyAuth: []
      }
    ]
  },
  apis: ['./server.js'], // Archivos que contienen anotaciones JSDoc
};

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


// AUTENTICACIÓN API KEY e IPs PERMITIDAS
// =============================================================
const authenticateAPI = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ 
      error: 'API key required',
      message: 'Include an X-API-Key header' 
    });
  }
  
  try {
    const system = await ExternalSystem.findOne({ 
      where: { apiKey, active: true } 
    });
    
    if (!system) {
      return res.status(401).json({ 
        error: 'Invalid API key',
        message: 'API key not found or system inactive' 
      });
    }

    req.system = system;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


// VALIDACIÓN DE IPs
// =============================================================
//TODO, portar de ../api-poc/server.js



// RATE LIMITING
// =============================================================
const rateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // ventana de 5 minutos
  max: 100, // máx 100 peticiones en la ventana definida
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' }
});


// FUNCIONES AUXILIARES
// =============================================================
const generateMessageId = () => `MSG_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;


// RUTAS API
// =============================================================
const apiRouter = express.Router();

// Endpoint base
app.get('/api/v1', (req, res) => {
  res.json({
    name: 'SPPTZE API',
    version: '1.0.0',
    description: 'Sistema de Presentación para Pantallas de Turno en Zonas de Espera',
    documentation: '/api/v1/docs'
  });
});

/**
 * @swagger
 * /messages:
 *   post:
 *     summary: Enviar nueva llamada de turno
 *     description: |
 *       Crea una nueva llamada de turno que será distribuida a los nodos de visualización correspondientes.
 *       El sistema determina automáticamente qué nodos deben mostrar el mensaje basándose en el target especificado.
 *     tags:
 *       - Mensajes
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Message'
 *           examples:
 *             llamada_normal:
 *               summary: Llamada de turno normal
 *               value:
 *                 ticket: "A047"
 *                 content: "Turno A047 - Consulta 3"
 *                 target: "SP_CARDIO_03"
 *                 priority: 1
 *             llamada_urgente:
 *               summary: Llamada urgente
 *               value:
 *                 ticket: "URGENTE"
 *                 content: "Atención inmediata - Consulta 1"
 *                 target: "SP_CARDIO_01"
 *                 priority: 5
 *     responses:
 *       201:
 *         description: Llamada creada y enviada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Datos de entrada inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: API key requerida o inválida
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: IP no autorizada para esta API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
apiRouter.post('/messages', async (req, res) => {
  try {
    const { ticket, content, target, targetType = 'service_point', priority = 1, channel = 'calls', externalRef } = req.body;
    
    // Validaciones básicas
    if (!content || !target) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['content', 'target']
      });
    }

    // Crear mensaje
    const messageData = {
      id: generateMessageId(),
      ticket,
      content,
      priority,
      channel,
      sourceSystemId: req.system.id,
      externalRef,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutos
    };

    // Asignar target según tipo
    if (targetType === 'service_point') {
      messageData.targetServicePointId = target;
    } else {
      messageData.targetLocationId = target;
    }

    // Guardar mensaje en BD
    const message = await Message.create(messageData);
    
    // Resolver nodos objetivo
    const targetNodes = await resolverUtils.resolveMessageTargets(message);
    
    // Crear registros de entrega (para futura implementación MQTT)
    const deliveries = targetNodes.map(node => ({
      messageId: message.id,
      nodeId: node.id,
      status: 'pending'
    }));
    
    if (deliveries.length > 0) {
      await MessageDelivery.bulkCreate(deliveries);
    }

    console.log(`Nueva llamada: ${ticket || 'N/A'} - ${content} -> ${targetNodes.length} nodos`);
    
    res.status(201).json({ 
      id: message.id, 
      status: 'sent',
      targetNodes: targetNodes.length,
      timestamp: message.createdAt
    });

  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /messages/{id}:
 *   get:
 *     summary: Consultar estado de mensaje específico
 *     description: Obtiene información sobre el estado actual de un mensaje específico
 *     tags:
 *       - Mensajes
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Identificador único del mensaje
 *         schema:
 *           type: string
 *         example: MSG_1640995200000_abc12
 *     responses:
 *       200:
 *         description: Estado del mensaje
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [active, expired, retired]
 *                 ticket:
 *                   type: string
 *                 content:
 *                   type: string
 *                 target:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Mensaje no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
apiRouter.get('/messages/:id', async (req, res) => {
  try {
    const message = await Message.findByPk(req.params.id, {
      include: [
        { model: ServicePoint, as: 'targetServicePoint' },
        { model: Location, as: 'targetLocation' },
        { model: ExternalSystem }
      ]
    });
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
/*    const deliveries = await MessageDelivery.findAll({
      where: { messageId: message.id },
      include: [{ model: DisplayNode }]
    });*/
    const deliveries = await MessageDelivery.count({
      where: { messageId: message.id }
    });
    
    res.json({
      id: message.id,
      ticket: message.ticket,
      content: message.content,
      status: new Date() > message.expiresAt ? 'expired' : 'active',
      target: message.targetServicePoint?.name || message.targetLocation?.name,
      createdAt: message.createdAt,
      expiresAt: message.expiresAt,
      deliveries: deliveries.length
    });
    
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @swagger
 * /messages/{id}/retire:
 *   patch:
 *     summary: Retirar mensaje específico
 *     description: |
 *       Marca un mensaje como retirado y lo elimina de todas las pantallas de visualización.
 *       Útil cuando el paciente confirma su presencia o se completa la atención.
 *     tags:
 *       - Mensajes
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Identificador único del mensaje a retirar
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Motivo de la retirada (opcional, para auditoría)
 *                 example: "Paciente confirmó presencia"
 *           examples:
 *             confirmacion:
 *               summary: Confirmación de presencia
 *               value:
 *                 reason: "Paciente confirmó presencia en recepción"
 *             cancelacion:
 *               summary: Cancelación de cita
 *               value:
 *                 reason: "Cita cancelada por el paciente"
 *     responses:
 *       200:
 *         description: Mensaje retirado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       404:
 *         description: Mensaje no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
apiRouter.patch('/messages/:id/retire', handlePATCHMessageRetire);
function handlePATCHMessageRetire(req, res) {
  const { id } = req.params;
  const index = messages.findIndex(m => m.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Message not found' });
  }
  
  const removed = messages.splice(index, 1)[0];
  console.log(`🗑️ Mensaje retirado: ${removed.ticket || removed.id}`);
  
  res.json({ 
    id: removed.id, 
    status: 'removed',
    ticket: removed.ticket,
    timestamp: new Date().toISOString()
  });
}

/**
 * @swagger
 * /messages/{id}/repeat:
 *   patch:
 *     summary: Repetir llamada existente
 *     description: |
 *       Crea una repetición de un mensaje existente, útil cuando un paciente no responde 
 *       a la primera llamada. El mensaje original se marca como repetido y se crea una nueva instancia.
 *     tags:
 *       - Mensajes
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Identificador único del mensaje a repetir
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Llamada repetida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/MessageResponse'
 *                 - type: object
 *                   properties:
 *                     originalId:
 *                       type: string
 *                       description: ID del mensaje original
 *       404:
 *         description: Mensaje original no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
apiRouter.patch('/messages/:id/repeat', handlePATCHMessageRepeat);
function handlePATCHMessageRepeat(req, res) {
  const { id } = req.params;
  const original = messages.find(m => m.id === id);
  
  if (!original) {
    return res.status(404).json({ error: 'Original message not found' });
  }
  
  const repeated = {
    ...original,
    id: generateMessageId(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min
    status: 'repeated',
    originalId: id,
    sourceSystemId: req.system.id
  };
  
  messages.unshift(repeated);
  console.log(`🔁 Mensaje repetido: ${repeated.ticket || repeated.id}`);
  
  res.json({ 
    id: repeated.id, 
    status: 'repeated',
    originalId: id,
    timestamp: repeated.createdAt
  });
}

/**
 * @swagger
 * /nodes:
 *   get:
 *     summary: Estado de nodos de visualización
 *     description: Obtiene información sobre todos los nodos de visualización registrados en el sistema
 *     tags:
 *       - Nodos
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Lista de nodos y su estado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nodes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: NODE_CARDIO_WAIT
 *                       name:
 *                         type: string
 *                         example: Pantalla Sala Espera Cardiología
 *                       location:
 *                         type: string
 *                         example: AREA_CARDIO
 *                       status:
 *                         type: string
 *                         enum: [active, offline, maintenance]
 *                       isOnline:
 *                         type: boolean
 *                       lastSeen:
 *                         type: string
 *                         format: date-time
 *                       messagesCount:
 *                         type: integer
 *                         description: Mensajes activos en este nodo
 *                 total:
 *                   type: integer
 *                 online:
 *                   type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
apiRouter.get('/nodes', async (req, res) => {
  try {
    const nodes = await DisplayNode.findAll({
      include: [{
        model: Location,
        through: { attributes: ['showChildren', 'active'] }
      }]
    });
    
    const nodesWithStatus = nodes.map(node => {
      const now = new Date();
      const lastSeenDiff = node.lastSeen ? now - new Date(node.lastSeen) : null;
      const isOnline = lastSeenDiff ? lastSeenDiff < 30000 : false; // 30 segundos
      
      return {
        id: node.id,
        name: node.name,
        status: node.status,
        isOnline,
        lastSeen: node.lastSeen,
        locations: node.Locations?.map(loc => loc.name) || []
      };
    });
    
    res.json({
      nodes: nodesWithStatus,
      total: nodes.length,
      online: nodesWithStatus.filter(n => n.isOnline).length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching nodes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /nodes/{id}/control:
 *   post:
 *     summary: Control remoto de pantallas
 *     description: |
 *       Envía comandos de control a un nodo de visualización específico para gestionar 
 *       el estado de la pantalla conectada mediante protocolo HDMI-CEC.
 *     tags:
 *       - Nodos
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Identificador del nodo de visualización
 *         schema:
 *           type: string
 *         example: NODE_CARDIO_WAIT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NodeControl'
 *           examples:
 *             encender:
 *               summary: Encender pantalla
 *               value:
 *                 action: power_on
 *             apagar:
 *               summary: Apagar pantalla
 *               value:
 *                 action: power_off
 *             volumen:
 *               summary: Ajustar volumen
 *               value:
 *                 action: volume
 *                 value: "50"
 *     responses:
 *       200:
 *         description: Comando enviado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nodeId:
 *                   type: string
 *                 action:
 *                   type: string
 *                 value:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: sent
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Nodo no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
apiRouter.post('/nodes/:id/control', handlePOSTNodeControl);
function handlePOSTNodeControl(req, res) {
  const { id } = req.params;
  const { action, value } = req.body;
  
  const node = nodes.find(n => n.id === id);
  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }
  
  const validActions = ['power_on', 'power_off', 'volume', 'refresh'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ 
      error: 'Invalid action',
      validActions 
    });
  }
  
  console.log(`🎛️ Control ${action} enviado a ${node.name}${value ? ` (${value})` : ''}`);
  
  res.json({
    nodeId: id,
    action,
    value: value || null,
    status: 'sent',
    timestamp: new Date().toISOString()
  });
}

/**
 * @swagger
 * /status:
 *   get:
 *     summary: Estado general del sistema
 *     description: Obtiene métricas generales y estado de salud del sistema SPPTZE
 *     tags:
 *       - Sistema
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Estado del sistema
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [operational, degraded, maintenance]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 version:
 *                   type: string
 *                   example: 1.0.0-demo
 *                 uptime:
 *                   type: number
 *                   description: Tiempo en funcionamiento en segundos
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalMessages:
 *                       type: integer
 *                     activeMessages:
 *                       type: integer
 *                     totalNodes:
 *                       type: integer
 *                     onlineNodes:
 *                       type: integer
 *                     registeredSystems:
 *                       type: integer
 *                 health:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       enum: [ok, error]
 *                     mqtt:
 *                       type: string
 *                       enum: [ok, error]
 *                     api:
 *                       type: string
 *                       enum: [ok, error]
 */
apiRouter.get('/status', async (req, res) => {
  try {
    const now = new Date();
    
    const [totalMessages, activeMessages, totalNodes, activeSystems] = await Promise.all([
      Message.count(),
      Message.count({ where: { expiresAt: { [require('sequelize').Op.gt]: now } } }),
      DisplayNode.count(),
      ExternalSystem.count({ where: { active: true } })
    ]);
    
    res.json({
      status: 'operational',
      timestamp: now.toISOString(),
      version: '1.0.0-integrated',
      uptime: process.uptime(),
      stats: {
        totalMessages,
        activeMessages,
        totalNodes,
        activeSystems
      },
      health: {
        database: 'ok',
        api: 'ok'
      }
    });
    
  } catch (error) {
    console.error('Error fetching status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Validación de parámetros en llamadas según especificación OpenAPI
app.use(OpenApiValidator.middleware({
  apiSpec: swaggerSpec,
  validateRequests: true,
  validateResponses: false
}));

// Aplicar middleware a rutas API
app.use('/api/v1', authenticateAPI, rateLimiter, apiRouter);


// RUTAS WEB
// =============================================================
app.get('/display', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
  res.json({
    message: 'SPPTZE - Sistema de Presentación para Pantallas de Turno',
    endpoints: {
      display: '/display',
      admin: '/admin',
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


// INICIALIZACIÓN
// =============================================================
async function startServer() {
  try {
    // Probar conexión BD
    await testConnection();
    
    // Sincronizar esquema
    await syncDatabase(false);
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log('SPPTZE Server started successfully');
      console.log('-'.repeat(60));
      console.log(`API Base:          http://localhost:${PORT}/api/v1`);
      console.log(`API Documentación: http://localhost:${PORT}/api/v1/docs`);
      console.log(`OpenAPI Spec.:     http://localhost:${PORT}/api/v1/openapi.json`);

      console.log(`Display Demo:      http://localhost:${PORT}/display`);
      console.log(`Admin Panel:       http://localhost:${PORT}/admin`);
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
