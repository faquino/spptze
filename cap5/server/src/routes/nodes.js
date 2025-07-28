/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Router Express: API endpoints relativos a nodos
// cap5/server/src/routes/nodes.js
// =============================================================
const express = require('express');
const router = express.Router();

const nodeController = require('../controllers/nodeController');

/**
 * @swagger
 * /:
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
router.get('/', nodeController.getNodes);

/**
 * @swagger
 * /{id}/control:
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
router.post('/:id/control', nodeController.controlNode);


module.exports = router;