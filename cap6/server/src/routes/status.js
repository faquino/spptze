/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Router Express: API endpoint de estado del sistema
// cap5/server/src/routes/nodes.js
// =============================================================
const express = require('express');
const router = express.Router();

const statusController = require('../controllers/statusController');


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
 *                   description: Estado general del sistema
 *                   example: operational
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: Timestamp de la consulta
 *                   example: "2025-01-01T10:00:00.000Z"
 *                 version:
 *                   type: string
 *                   description: Versión del sistema
 *                   example: "1.0.0-integrated"
 *                 uptime:
 *                   type: number
 *                   description: Tiempo en funcionamiento en segundos
 *                   example: 3600.45
 *                 messages:
 *                   type: object
 *                   description: Estadísticas de mensajes
 *                   properties:
 *                     active:
 *                       type: integer
 *                       description: Mensajes activos (no expirados)
 *                       example: 12
 *                     recent:
 *                       type: object
 *                       description: Mensajes por intervalos de tiempo
 *                       properties:
 *                         last5min:
 *                           type: integer
 *                           description: Mensajes creados en los últimos 5 minutos
 *                           example: 8
 *                         last15min:
 *                           type: integer
 *                           description: Mensajes creados en los últimos 15 minutos
 *                           example: 23
 *                         last1hour:
 *                           type: integer
 *                           description: Mensajes creados en la última hora
 *                           example: 156
 *                       required: [last5min, last15min, last1hour]
 *                   required: [active, recent]
 *                 nodes:
 *                   type: object
 *                   description: Estado de nodos de visualización
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: Total de nodos configurados
 *                       example: 8
 *                     active:
 *                       type: integer
 *                       description: Nodos configurados como activos
 *                       example: 7
 *                     online:
 *                       type: integer
 *                       description: Nodos activos que han reportado recientemente
 *                       example: 6
 *                     offline:
 *                       type: array
 *                       description: IDs de nodos activos pero sin conexión reciente
 *                       items:
 *                         type: string
 *                       example: ["NODE_CARDIO_B2", "NODE_TRAUMAT_P1"]
 *                   required: [total, active, online, offline]
 *                 systems:
 *                   type: object
 *                   description: Actividad de sistemas externos
 *                   properties:
 *                     active:
 *                       type: integer
 *                       description: Número de sistemas externos activos
 *                       example: 3
 *                     bySystem:
 *                       type: object
 *                       description: Actividad por sistema externo (solo sistemas con actividad en la última hora)
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           last5min:
 *                             type: integer
 *                             description: Mensajes del sistema en los últimos 5 minutos
 *                           last15min:
 *                             type: integer
 *                             description: Mensajes del sistema en los últimos 15 minutos
 *                           last1hour:
 *                             type: integer
 *                             description: Mensajes del sistema en la última hora
 *                         required: [last5min, last15min, last1hour]
 *                       example:
 *                         HIS_SIHGA:
 *                           last5min: 5
 *                           last15min: 18
 *                           last1hour: 89
 *                         APP_MOBILE:
 *                           last5min: 2
 *                           last15min: 4
 *                           last1hour: 15
 *                   required: [active, bySystem]
 *                 health:
 *                   type: object
 *                   description: Estado de salud de componentes críticos
 *                   properties:
 *                     database:
 *                       type: string
 *                       enum: [ok, error]
 *                       description: Estado de la conexión a base de datos
 *                       example: ok
 *                     mqtt:
 *                       type: object
 *                       description: Estado detallado de conexión MQTT
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [connected, disconnected, error]
 *                           description: Estado de conexión al bróker MQTT
 *                           example: connected
 *                         broker:
 *                           type: string
 *                           description: URL del bróker MQTT
 *                           example: "mqtt://localhost:1883"
 *                         clientId:
 *                           type: string
 *                           description: ID del cliente MQTT
 *                           example: "spptze-server-1234567890"
 *                         lastConnect:
 *                           type: string
 *                           format: date-time
 *                           description: Timestamp de la última conexión exitosa
 *                           example: "2025-01-01T09:45:00.000Z"
 *                       required: [status, broker, clientId, lastConnect]
 *                   required: [database, mqtt]
 *               required: [status, timestamp, version, uptime, messages, nodes, systems, health]
 */
router.get('/', statusController.getSystemStatus);

module.exports = router;