/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Lógica de rutas - Estado
// cap6/server/src/controllers/statusController.js
// =============================================================
const Op = require('sequelize').Op;
const { Message, DisplayNode, ExternalSystem } = require('../models');
const MQTTService = require('../services/mqttService');
const packageInfo = require('../../package.json');


/**
 * Obtener información de estado de MQTTService
 * @returns {Object} Información de estado de MQTT
 */
function getMQTTInfo() {
  try {
    const mqttStats = MQTTService.getStats();
    return {
      status: mqttStats.connected ? 'connected' : 'disconnected',
      broker: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
      clientId: mqttStats.clientId || 'unknown',
      lastConnect: mqttStats.lastConnect
    };
  } catch (error) {
    console.error('Error getting MQTT stats:', error);
    return {
      status: 'error',
      broker: process.env.MQTT_BROKER_URL || 'unknown',
      clientId: 'unknown',
      lastConnect: null
    };
  }
}


class StatusController {

  async getSystemStatus(req, res) {
    try {
      const now = new Date();
      
      // Definir intervalos de tiempo
      const intervals = {
        last5min: new Date(now.getTime() - 5 * 60 * 1000),
        last15min: new Date(now.getTime() - 15 * 60 * 1000),
        last1hour: new Date(now.getTime() - 60 * 60 * 1000)
      };

      // Umbral para nodos online (2 * heartbeatInterval)
      const heartbeatInterval = parseInt(process.env.HEARTBEAT_INTERVAL || '60');
      const onlineThreshold = new Date(now.getTime() - (2 * heartbeatInterval * 1000));

      // Definir consultas para Promise.all
      let databaseErrors = 0;

      const queries = [
        // Mensajes de la última hora
        Message.findAll({
          where: { createdAt: { [Op.gte]: intervals.last1hour } },
          include: [{ model: ExternalSystem, attributes: ['id', 'name'] }],
          attributes: ['sourceSystemId', 'createdAt', 'expiresAt']
        }).catch(error => {
          console.error('Error fetching messages:', error);
          databaseErrors++;
          return []; // Valor por defecto
        }),

        // Nodos (total)
        DisplayNode.count().catch(error => {
          console.error('Error counting total nodes:', error);
          databaseErrors++;
          return 0;
        }),

        // Nodos activos
        DisplayNode.count({ where: { active: true } }).catch(error => {
          console.error('Error counting active nodes:', error);
          databaseErrors++;
          return 0;
        }),

        // Nodos online
        DisplayNode.count({
          where: {
            active: true,
            lastSeen: { [Op.gt]: onlineThreshold }
          }
        }).catch(error => {
          console.error('Error counting online nodes:', error);
          databaseErrors++;
          return 0;
        }),

        // Nodos offline (activos pero sin lastSeen reciente)
        DisplayNode.findAll({
          where: {
            active: true,
            [Op.or]: [
              { lastSeen: { [Op.lte]: onlineThreshold } },
              { lastSeen: { [Op.is]: null } }
            ]
          },
          attributes: ['id']
        }).catch(error => {
          console.error('Error fetching offline nodes:', error);
          databaseErrors++;
          return [];
        }),

        // Sistemas externos activos
        ExternalSystem.count({ where: { active: true } }).catch(error => {
          console.error('Error counting active systems:', error);
          databaseErrors++;
          return 0;
        })
      ];

      const totalQueries = queries.length;

      // Se ejecutan todas las consultas en paralelo
      const [
        recentMessages,
        totalNodes,
        activeNodes,
        onlineNodes,
        offlineNodes,
        activeSystems
      ] = await Promise.all(queries);

      // Procesar mensajes en memoria (mucho más eficiente)
      let activeMessages = 0;
      let messages5min = 0, messages15min = 0, messages1hour = 0;
      const systemsStats = {};

      recentMessages.forEach(message => {
        const createdAt = new Date(message.createdAt);
        const isActive = new Date(message.expiresAt) > now;
        
        // Contadores de mensajes por intervalo
        messages1hour++;
        if (createdAt >= intervals.last15min) messages15min++;
        if (createdAt >= intervals.last5min) messages5min++;
        if (isActive) activeMessages++;
        
        // Actividad por sistema externo
        if (message.sourceSystemId) {
          const systemId = message.sourceSystemId;
          if (!systemsStats[systemId]) {
            systemsStats[systemId] = {
              name: message.ExternalSystem?.name || systemId,
              last5min: 0,
              last15min: 0,
              last1hour: 0
            };
          }
          
          systemsStats[systemId].last1hour++;
          if (createdAt >= intervals.last15min) systemsStats[systemId].last15min++;
          if (createdAt >= intervals.last5min) systemsStats[systemId].last5min++;
        }
      });

      // Obtener información de MQTT
      const mqttInfo = getMQTTInfo();

      // Determinar estado de la base de datos según errores
      let databaseStatus;
      if (databaseErrors === 0) {
        databaseStatus = 'ok';
      } else if (databaseErrors < totalQueries / 2) {
        databaseStatus = 'degraded'; // Algunos errores, pero mayoritariamente funcional
      } else {
        databaseStatus = 'error';    // Mayoría de consultas fallaron
      }

      // Determinar estado general del sistema
      let systemStatus = 'operational';
      if (databaseStatus === 'error') {
        systemStatus = 'maintenance';     // BD crítica completamente mal
      } else if (databaseStatus === 'degraded' || mqttInfo.status !== 'connected') {
        systemStatus = 'degraded';        // Problemas parciales
      }
      
      // Construir respuesta
      const response = {
        status: systemStatus,
        timestamp: now.toISOString(),
        version: packageInfo.version,
        uptime: process.uptime(),
        
        messages: {
          active: activeMessages,
          recent: {
            last5min: messages5min,
            last15min: messages15min,
            last1hour: messages1hour
          }
        },
        
        nodes: {
          total: totalNodes,
          active: activeNodes,
          online: onlineNodes,
          offline: offlineNodes.map(node => node.id)
        },
        
        systems: {
          active: activeSystems,
          bySystem: systemsStats
        },
        
        health: {
          database: databaseStatus,
          mqtt: mqttInfo
        }
      };

      res.json(response);

    } catch (error) {
      console.error('Error fetching system status:', error);
      
      // Obtener información de MQTT de forma segura
      const mqttInfo = getMQTTInfo();
      
      // En caso de error general, devolver estado básico
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        version: packageInfo.version,
        uptime: process.uptime(),
        health: {
          database: 'error',    // Asumir error de BD si llegamos al catch general
          mqtt: mqttInfo
        },
        error: 'Failed to retrieve system status'
      });
    }
  }
}

module.exports = new StatusController();