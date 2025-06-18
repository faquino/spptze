/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Servidor central - Prueba de concepto API
// =============================================================
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const OpenApiValidator = require('express-openapi-validator');
const rateLimit = require('express-rate-limit');

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
// Middleware para servir la documentación
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Endpoint para obtener el spec en JSON (útil para herramientas externas)
//   similar a un .wsdl en sistemas SOAP
app.get('/api/v1/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});


// MIDDLEWARE Y CONFIGURACIÓN
// =============================================================
app.use(helmet({
  contentSecurityPolicy: false // Para el demo, en producción configurar apropiadamente
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Logging simple
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});


// SIMULACIÓN DE BASE DE DATOS EN MEMORIA
// =============================================================
let messages = [];
let systems = [
  {
    id: 'HIS_SIHGA',
    name: 'Sistema HIS SIHGA', 
    apiKey: 'demo-key-hospital-123',
    rateLimit: { windowMs: 60 * 1000, max: 20}, // 20 peticiones / minuto
    active: true
  },
  {
    id: 'ADMIN_PANEL',
    name: 'Panel Administración',
    apiKey: 'demo-key-admin-456', 
    active: true
  }
];

let nodes = [
  { 
    id: 'NODE_CARDIO_WAIT', 
    name: 'Pantalla Sala Espera Cardiología',
    location: 'AREA_CARDIO',
    status: 'active',
    lastSeen: new Date()
  },
  { 
    id: 'NODE_PLANTA2_HALL', 
    name: 'Pantalla Hall Planta 2',
    location: 'PLANTA_2_MONT', 
    status: 'active',
    lastSeen: new Date()
  }
];


// MIDDLEWARE DE AUTENTICACIÓN
// =============================================================
const authenticateAPI = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  
  if (!apiKey) {
    return res.status(401).json({ 
      error: 'API key required',
      message: 'Include X-API-Key header' 
    });
  }
  
  const system = systems.find(s => s.apiKey === apiKey && s.active);
  if (!system) {
    return res.status(401).json({ 
      error: 'Invalid API key',
      message: 'API key not found or system inactive/unreachable' 
    });
  }

  req.system = system;

  next();
};

// Función auxiliar para validar IP en rango CIDR (versión simple)
function isIPInRange(ip, range) {
  if (!range.includes('/')) {
    // IP específica
    return ip === range;
  }
  
  // Rango CIDR - implementación básica para el demo
  // Para producción usar librería como 'ip-range-check'
  const [rangeIP, prefixLength] = range.split('/');
  const mask = (0xffffffff << (32 - parseInt(prefixLength))) >>> 0;
  
  const ipNum = ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
  const rangeNum = rangeIP.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
  
  return (ipNum & mask) === (rangeNum & mask);
}

// Middleware de validación de IP
const validateIPAccess = (req, res, next) => {
  // Obtener IP del cliente (considerando proxies)
  const clientIP = req.headers['x-forwarded-for'] || 
                   req.headers['x-real-ip'] || 
                   req.connection.remoteAddress || 
                   req.socket.remoteAddress ||
                   req.ip;
  
  // Limpiar IP (remover ::ffff: prefix de IPv4 mapped)
  const cleanIP = clientIP.replace(/^::ffff:/, '');
  
  const system = req.system; // Ya establecido por authenticateAPI
  
  // Si no hay restricciones de IP configuradas, permitir acceso
  if (!system.allowedIPs || system.allowedIPs.length === 0) {
    console.log(`No IP restrictions for system ${system.id}, allowing access from ${cleanIP}`);
    return next();
  }
  
  // Verificar si la IP está en la lista autorizada
  const isAllowed = system.allowedIPs.some(allowedIP => {
    try {
      return isIPInRange(cleanIP, allowedIP);
    } catch (error) {
      console.error(`Error validating IP range ${allowedIP}:`, error);
      return false;
    }
  });
  
  if (!isAllowed) {
    console.log(`IP access denied: ${cleanIP} not in allowed list for system ${system.id}`);
    console.log(`   Allowed IPs: ${system.allowedIPs.join(', ')}`);
    
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'Source IP address not authorized for this API key',
      clientIP: cleanIP, // Para debugging - opcional quitar en producción
      timestamp: new Date().toISOString()
    });
  }
  
  console.log(`IP access granted: ${cleanIP} authorized for system ${system.id}`);
  next();
};


// RATE LIMITING
// =============================================================
const DEF_RATE_LIMIT_CONF = { windowMs: 5 * 60 * 1000, max: 10 }; // 10 peticiones cada 5 minutos BAJO A PROPÓSITO

const globalRateLimiter = rateLimit({
  windowMs: DEF_RATE_LIMIT_CONF.windowMs,
  max: DEF_RATE_LIMIT_CONF.max,
  standardHeaders: true,    // añade Retry-After en header y...
  legacyHeaders: false,     // evita X-RateLimit-* antiguos
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Se ha superado el límite de peticiones establecido. Inténtalo más tarde.'
    });
  }
});


// FUNCIONES AUXILIARES
// =============================================================
const generateMessageId = () => `MSG_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

const getTargetNodes = (target, targetType = 'auto') => {
  // Simplificación para demo - en producción usaría el modelo de datos
  if (targetType === 'location' || target.startsWith('AREA_') || target.startsWith('PLANTA_')) {
    return nodes.filter(node => 
      node.location === target || 
      node.location.startsWith(target) ||
      target.startsWith(node.location)
    );
  }
  
  // Por defecto, asumir servicio de cardiología
  return nodes.filter(node => node.location.includes('CARDIO'));
};


// RUTAS DE LA API
// =============================================================

// Endpoint base de la API y docs
app.get('/api/v1', (req, res) => {
  res.json({
    name: 'SPPTZE API',
    version: '1.0.0',
    description: 'SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera',
    documentation: {
      swagger_ui: '/api/v1/docs',
      openapi_spec: '/api/v1/openapi.json'
    },
    demo_keys: {
      hospital: 'demo-key-hospital-123',
      admin: 'demo-key-admin-456'
    },
    endpoints: {
      'POST /api/v1/messages': 'Enviar nueva llamada de turno',
      'GET /api/v1/messages/:id': 'Consultar estado de mensaje específico', 
      'PATCH /api/v1/messages/:id/retire': 'Retirar mensaje específico',
      'PATCH /api/v1/messages/:id/repeat': 'Repetir llamada existente',
      'GET /api/v1/nodes': 'Estado de nodos de visualización',
      'POST /api/v1/nodes/:id/control': 'Control remoto de pantallas',
      'GET /api/v1/status': 'Estado general del sistema'
    }
  });
});

const apiRouter = express.Router();

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
apiRouter.post('/messages', handlePOSTMessages);

function handlePOSTMessages(req, res) {
  try {
    const { 
      ticket, 
      content, 
      target, 
      targetType = 'service_point',
      priority = 1,
      channel = 'calls',
      expiresIn = 900 // 15 minutos por defecto
    } = req.body;
    
    // Algunas validaciones mínimas
    //TODO REDUNDANTE con express-openapi-validator >
    if (!content || !target) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['content', 'target'],
        received: Object.keys(req.body)
      });
    }

    if (priority < 1 || priority > 5) {
      return res.status(400).json({ 
        error: 'Priority must be between 1 and 5' 
      });
    }
    //< TODO

    // Crear mensaje
    const message = {
      id: generateMessageId(),
      ticket: ticket || null,
      content,
      target,
      targetType,
      priority,
      channel,
      sourceSystemId: req.system.id,
      externalRef: req.body.externalRef || null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      status: 'active'
    };

    // Determinar nodos objetivo
    const targetNodes = getTargetNodes(target, targetType);
    message.targetNodes = targetNodes.map(n => n.id);

    // Guardar mensaje
    messages.unshift(message);
    
    // Limpiar mensajes antiguos (mantener últimos 50)
    if (messages.length > 50) {
      messages = messages.slice(0, 50);
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
}



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
apiRouter.get('/messages:id', handleGETMessage);
function handleGETMessage(req, res) {
  //TODO Implementar este endpoint
}

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
  console.log(`Mensaje retirado: ${removed.ticket || removed.id}`);
  
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
  console.log(`Mensaje repetido: ${repeated.ticket || repeated.id}`);
  
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
apiRouter.get('/nodes', handleGETNodes);
function handleGETNodes(req, res) {
  const now = new Date();
  
  const nodesWithStatus = nodes.map(node => {
    const lastSeenDiff = now - new Date(node.lastSeen);
    const isOnline = lastSeenDiff < 30000; // 30 segundos
    
    return {
      ...node,
      isOnline,
      lastSeenAgo: Math.floor(lastSeenDiff / 1000),
      messagesCount: messages.filter(m => m.targetNodes.includes(node.id)).length
    };
  });
  
  res.json({
    nodes: nodesWithStatus,
    total: nodes.length,
    online: nodesWithStatus.filter(n => n.isOnline).length,
    timestamp: now.toISOString()
  });
}

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
  
  console.log(`Control ${action} enviado a ${node.name}${value ? ` (${value})` : ''}`);
  
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
apiRouter.get('/status', handleGETStatus);
function handleGETStatus(req, res) {
  const now = new Date();
  const activeMessages = messages.filter(m => new Date(m.expiresAt) > now);
  const onlineNodes = nodes.filter(n => (now - new Date(n.lastSeen)) < 30000);
  
  res.json({
    status: 'operational',
    timestamp: now.toISOString(),
    version: '1.0.0-demo',
    uptime: process.uptime(),
    stats: {
      totalMessages: messages.length,
      activeMessages: activeMessages.length,
      totalNodes: nodes.length,
      onlineNodes: onlineNodes.length,
      registeredSystems: systems.filter(s => s.active).length
    },
    health: {
      database: 'ok', // Simulado
      mqtt: 'ok',     // Simulado
      api: 'ok'
    }
  });
}

// Validación automática de entrada según OpenAPI
const validator = OpenApiValidator.middleware({
    apiSpec: swaggerSpec,
    validateRequests: true,
    validateResponses: false // opcional: true para validar también respuestas
  });
app.use(validator);

app.use('/api/v1',
        authenticateAPI, validateIPAccess, globalRateLimiter, apiRouter);


// RUTAS PARA INTERFACES WEB
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
    demo_urls: {
      display: '/display',
      admin: '/admin',
      api: '/api/v1'
    }
  });
});


// MANEJO DE ERRORES
// =============================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((error, req, res, next) => {
  if (error.status && error.errors) {  // Error de validación OpenAPI
    return res.status(error.status).json({
      error: 'Validation failed',
      details: error.errors
    })
  }

  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});


// INICIAR 'SERVIDOR'
// =============================================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('SPPTZE Server started successfully');
  console.log('-'.repeat(60));
  console.log(`API Base:          http://localhost:${PORT}/api/v1`);
  console.log(`API Documentation: http://localhost:${PORT}/api/v1/docs`);
  console.log(`OpenAPI Spec:      http://localhost:${PORT}/api/v1/openapi.json`);
  console.log(`Display Demo:      http://localhost:${PORT}/display`);
  console.log(`Admin Panel:       http://localhost:${PORT}/admin`);
  console.log('-'.repeat(60));
  console.log('Demo API Keys:');
  console.log('  Hospital: demo-key-hospital-123');
  console.log('  Admin:    demo-key-admin-456');
  console.log('-'.repeat(60));
  
  // Insertar mensajes de ejemplo después de 2 segundos
  setTimeout(() => {
    console.log('Loading demo data...');
    messages.push(
      {
        id: 'MSG_DEMO_001',
        ticket: 'A047',
        content: 'Turno A047 - Consulta 3',
        target: 'SP_CARDIO_03',
        targetType: 'service_point',
        priority: 1,
        channel: 'calls',
        sourceSystemId: 'HIS_SIHGA',
        externalRef: 'CITA_12345',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        status: 'active',
        targetNodes: ['NODE_CARDIO_WAIT']
      },
      {
        id: 'MSG_DEMO_002',
        ticket: 'B023',
        content: 'Turno B023 - Consulta 4',
        target: 'SP_CARDIO_04',
        targetType: 'service_point',
        priority: 1,
        channel: 'calls', 
        sourceSystemId: 'HIS_SIHGA',
        externalRef: 'CITA_12346',
        createdAt: new Date(Date.now() - 60000).toISOString(),
        expiresAt: new Date(Date.now() + 14 * 60 * 1000).toISOString(),
        status: 'active',
        targetNodes: ['NODE_CARDIO_WAIT']
      }
    );
    console.log('Demo data loaded');
  }, 2000);
});