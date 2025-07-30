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
router.get('/', statusController.getSystemStatus);

module.exports = router;