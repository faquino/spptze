/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Configuración Swagger/OpenAPI
// cap6/server/src/config/swagger.js
// =============================================================
const path = require('path');

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
        MessageTarget : {
          type: 'string',
          enum: ['service_point', 'location'],
          default: 'service_point',
          description: 'Tipo de destino para direccionamiento (ubicación/punto de servicio)'
        },
        TTSConfig: {
          type: 'object',
          description: 'Configuración de síntesis de voz',
          properties: {
            locale: {
              type: 'string',
              description: 'Código de idioma definido en ttsService. No necesariamente BCP47 (ISO 639 + ISO 3166)',
              example: 'es-ES'
            },
            text: {
              type: 'string',
              maxLength: 500,
              description: 'Texto a sintetizar',
              example: 'Turno A K 47: consulta 3'
            },
            speed: {
              type: 'number',
              minimum: 0.3,
              maximum: 3.0,
              default: 1.0,
              description: 'Velocidad de habla (1.0 = normal). Rango dentro del de webui Speaches'
            }
          },
          additionalProperties: false,
          required: ['locale', 'text']
        },
        Message: {
          type: 'object',
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
              $ref: '#/components/schemas/MessageTarget'
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
            },
            tts: {
              $ref: '#/components/schemas/TTSConfig',
              description: 'Configuración de síntesis de voz (opcional)'
            }
          },
//          additionalProperties: false,
          required: ['content', 'target']
        },
        MessageResponse: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Identificador único del mensaje',
              example: 'ABCDEF0123456789'
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
        DeliveryStats: {
          type: 'object',
          description: 'Estadísticas de entrega a nodos',
          properties: {
            total: {
              type: 'integer',
              description: 'Total de nodos destino',
              example: 2
            },
            acknowledged: {
              type: 'integer',
              description: 'Con confirmación recibida',
              example: 1
            }
          },
          required: ['total', 'acknowledged']
        },
        MessageStatusInfo: {
          type: 'string',
          enum: ['sent', 'displaying', 'displayed', 'success', 'incomplete', 'fail'],
          description: 'Estado agregado de entrega de un mensaje'
        },
        DeliveryStatusInfo: {
          type: 'string',
          enum: ['sent', 'displayed', 'success', 'fail'],
          description: 'Estado de entrega de un mensaje a un nodo individual'
        },
        MessageDeliveryInfo: {
          type: 'object',
          description: 'Información detallada de una entrega específica',
          properties: {
            nodeId: {
              type: 'string',
              description: 'ID del nodo de visualización',
              example: 'NODE_CARDIO_WAIT'
            },
            status: {
              $ref: '#/components/schemas/DeliveryStatusInfo'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Momento de creación del registro',
              example: '2024-12-15T10:30:45.100Z'
            },
            deliveredAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Momento de entrega al nodo (timestamp del nodo)',
              example: '2024-12-15T10:30:45.250Z'
            },
            displayedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Momento de visualización (timestamp del nodo)',
              example: '2024-12-15T10:30:45.300Z'
            },
            acknowledgedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Momento de recepción del ACK (timestamp del servidor)',
              example: '2024-12-15T10:30:45.320Z'
            },
            retractedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Momento de retirada del nodo',
              example: null
            },
            nodeName: {
              type: 'string',
              description: 'Nombre descriptivo del nodo',
              example: 'Pantalla Sala Espera Cardio'
            },
            nodeActive: {
              type: 'boolean',
              description: 'Si el nodo está activo',
              example: true
            }
          },
          required: ['nodeId', 'status', 'createdAt']
        },
        MessageStatus: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Identificador del mensaje',
              example: 'MSG_1640995200000_abc12'
            },
            status: {
              $ref: '#/components/schemas/MessageStatusInfo'
            },
            ticket: {
              type: 'string',
              description: 'Número de turno/tique',
              example: 'A047'
            },
            content: {
              type: 'string',
              description: 'Contenido del mensaje a mostrar',
              example: 'Consulta 3'
            },
            target: {
              type: 'string',
              description: 'Destino del mensaje',
              example: 'SP_CARDIO_03'
            },
            targetType: {
              $ref: '#/components/schemas/MessageTarget'
            },
            priority: {
              type: 'integer',
              minimum: 1,
              maximum: 5,
              description: 'Prioridad del mensaje',
              example: 1
            },
            channel: {
              type: 'string',
              description: 'Canal de visualización',
              example: 'calls'
            },
            externalRef: {
              type: 'string',
              description: 'Referencia externa del sistema origen',
              example: 'CITA_CARD15'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Fecha y hora de creación',
              example: '2024-12-15T10:30:45.000Z'
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              description: 'Fecha y hora de expiración',
              example: '2024-12-15T10:45:45.000Z'
            },
            retractedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Fecha y hora de retirada (si aplica)',
              example: '2024-12-15T10:35:00.000Z'
            },
            targetInfo: {
              type: 'object',
              description: 'Información adicional del destino',
              properties: {
                name: {
                  type: 'string',
                  example: 'Cardiología Consulta 3'
                },
                externalId: {
                  type: 'string',
                  example: 'CARDIO_03'
                }
              }
            },
            sourceSystem: {
              type: 'object',
              description: 'Información del sistema origen',
              properties: {
                id: {
                  type: 'string',
                  example: 'HIS_HOSPITAL'
                },
                name: {
                  type: 'string',
                  example: 'Sistema HIS Hospital'
                }
              }
            },
            deliveryStats: {
              $ref: '#/components/schemas/DeliveryStats'
            }
          },
          required: ['id', 'status', 'content', 'target', 'targetType', 'createdAt', 'deliveryStats']
        },
        MessageStatusDetailed: {
          allOf: [
            { $ref: '#/components/schemas/MessageStatus' },
            {
              type: 'object',
              properties: {
                deliveries: {
                  type: 'array',
                  description: 'Detalle de entregas por nodo',
                  items: {
                    $ref: '#/components/schemas/MessageDeliveryInfo'
                  }
                }
              },
              required: ['deliveries']
            }
          ]
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
          properties: {
            powerStatus: {
              type: 'string',
              enum: ['on', 'standby'],
              description: 'Estado de energía de la pantalla'
            },
            volumeLevel: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              description: 'Nivel de volumen (0-100)'
            }
          },
          additionalProperties: false,
          anyOf: [
            { required: ['powerStatus'] },
            { required: ['volumeLevel'] }
          ]
        }
      }
    },
    security: [
      {
        ApiKeyAuth: []
      }
    ]
  },
  apis: [ path.join(__dirname, '..', 'server.js'),
          path.join(__dirname, '..', 'routes', '*.js') ] // Archivos que contienen anotaciones JSDoc
};

module.exports = { swaggerOptions };