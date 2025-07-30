/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Router Express: API endpoints relativos a mensajes
// cap5/server/src/routes/messages.js
// =============================================================
const express = require('express');
const router = express.Router();

const messageController = require('../controllers/messageController');


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
router.post('/', messageController.createMessage);


/**
 * @swagger
 * /messages/{id}:
 *   get:
 *     summary: Consultar estado de mensaje específico
 *     description: |
 *       Obtiene información sobre el estado actual de un mensaje específico.
 *       Con details=false, se devuelve información agregada sobre el estado de entrega.
 *       Con details=true, se inclyen los detalles de las entregas individuales a nodos.
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
 *       - in: query
 *         name: details
 *         required: false
 *         description: Si true, se incluye información detallada sobre las entregas a nodos.
 *         schema:
 *           type: boolean
 *           default: false
 *         example: true
 *     responses:
 *       200:
 *         description: Estado del mensaje
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/MessageStatus'
 *                 - $ref: '#/components/schemas/MessageStatusDetailed'
 *             examples:
 *               basic_response:
 *                 summary: Respuesta básica (details=false)
 *                 value:
 *                   id: "MSG_1640995200000_abc12"
 *                   status: "incomplete"
 *                   ticket: "A047"
 *                   content: "Consulta 3"
 *                   target: "SP_CARDIO_03"
 *                   targetType: "service_point"
 *                   priority: 1
 *                   channel: "calls"
 *                   externalRef: "CITA_CARD15"
 *                   createdAt: "2024-12-15T10:30:45.000Z"
 *                   expiresAt: "2024-12-15T10:45:45.000Z"
 *                   deliveryStats:
 *                     total: 2
 *                     acknowledged: 1
 *               detailed_response:
 *                 summary: Respuesta detallada (details=true)
 *                 value:
 *                   id: "MSG_1640995200000_abc12"
 *                   status: "incomplete"
 *                   ticket: "A047"
 *                   content: "Consulta 3"
 *                   target: "SP_CARDIO_03"
 *                   targetType: "service_point"
 *                   priority: 1
 *                   channel: "calls"
 *                   externalRef: "CITA_CARD15"
 *                   createdAt: "2024-12-15T10:30:45.000Z"
 *                   expiresAt: "2024-12-15T10:45:45.000Z"
 *                   deliveryStats:
 *                     total: 2
 *                     acknowledged: 1
 *                   deliveries:
 *                     - nodeId: "NODE_CARDIO_WAIT"
 *                       status: "displayed"
 *                       createdAt: "2024-12-15T10:30:45.100Z"
 *                       deliveredAt: "2024-12-15T10:30:45.250Z"
 *                       displayedAt: "2024-12-15T10:30:45.300Z"
 *                       acknowledgedAt: "2024-12-15T10:30:45.600Z"
 *                       nodeName: "Pantalla Sala Espera Cardio"
 *                     - nodeId: "NODE_CARDIO_INFO"
 *                       status: "sent"
 *                       createdAt: "2024-12-15T10:30:45.100Z"
 *                       nodeName: "Pantalla Info General Cardio"
 *       404:
 *         description: Mensaje no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', messageController.getMessageStatus);


/**
 * @swagger
 * /messages/{id}/retract:
 *   patch:
 *     summary: Retirar mensaje específico
 *     description: |
 *       Marca un mensaje como retirado y lo elimina de todas las pantallas de visualización.
 *       Útil p.ej. cuando se quiere eliminar el mensade de las pantallas al confirmarse la
 *       presencia de la persona a atender en el punto de servicio, o al darse por finalizada 
 *       la atención.
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
 *     responses:
 *       200:
 *         description: Mensaje retirado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Mensaje ya retirado anteriormente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Mensaje no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:id/retract', messageController.retractMessage);


/**
 * @swagger
 * /messages/{id}/repeat:
 *   patch:
 *     summary: Repetir llamada existente
 *     description: |
 *       Crea una repetición de un mensaje existente, útil p.ej. cuando la persona a atender no acude
 *       al punto de servicio, o si es necesario cambiar el punto de atención tras haberla llamado.
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
router.patch('/:id/repeat', messageController.repeatMessage);


module.exports = router;