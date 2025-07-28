/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Lógica de rutas - Mensajes
// cap5/server/src/controllers/messageController.js
// =============================================================
const {
  ExternalSystem, 
  ServicePoint, 
  Location, 
  DisplayNode, 
  Message, 
  MessageDelivery,
  resolverUtils 
} = require('../models');

const TopicResolver = require('../services/topicresolver');
const MQTTService = require('../services/mqttService');
const { processMessageDeliveries } = require('../utils/messageStatus');

class MessageController {

  async createMessage(req, res) {
    try {
      const { ticket, content, target, targetType, priority = 1, channel = 'calls', externalRef } = req.body;
      
      // Crear mensaje
      const messageData = {
        id: req.requestId,
        ticket,
        content,
        priority,
        channel,
        sourceSystemId: req.system.id,
        externalRef,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutos
      };
  
      let effectiveTargetType = targetType;
      let effectiveTargetId = null;
      // Si la petición no incluye el tipo de destino, usar el valor por defecto del origen
      if (!targetType) {
        effectiveTargetType = (req.system.defaultTargetType == 'S') ? 'service_point' : 'location';
      }
  
      // Asignar target según tipo
      if (effectiveTargetType === 'service_point') {
        // Los sistemas externos se refieren a los puntos de servicio por su externalId
        // Buscar ServicePoint con externalId == target
        messageData.targetServicePointId = await resolverUtils.resolveServicePoint(req.system.id, target);
        effectiveTargetId = messageData.targetServicePointId;
      } else {
        messageData.targetLocationId = target;
        effectiveTargetId = messageData.targetLocationId;
      }
  
      // Guardar mensaje en BD
      const message = await Message.create(messageData);
  
      // Resolver el topic a usar para publicar el mensaje
      const topic = await TopicResolver.buildTopic(effectiveTargetType, effectiveTargetId);
      
      // Calcular los nodos destino
      const targetNodes = await TopicResolver.getTargetNodes(message);
  //    const targetNodes = await resolverUtils.resolveMessageTargets(message);
      
      // Crear los registros de entrega
      const deliveries = targetNodes.map(node => ({
        messageId: message.id,
        nodeId: node.id
      }));
      
      if (deliveries.length > 0) {
        await MessageDelivery.bulkCreate(deliveries);
        // await?
        MQTTService.publishMessage(topic, message);
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


  async getMessageStatus(req, res) {
    try {
      const message = await Message.findByPk(req.params.id, {
        include: [
          { model: ServicePoint, as: 'targetServicePoint' },
          { model: Location, as: 'targetLocation' },
          { model: ExternalSystem },
          { model: DisplayNode,
            through: { attributes: ['createdAt', 'deliveredAt', 'displayedAt', 'acknowledgedAt', 'retractedAt'] } }
        ]
      });
  
      if (!message) return res.status(404).json({ error: 'Message not found' });
  
      // Procesar las entregas
      const deliveryInfo = processMessageDeliveries(message, req.query.details);
  
      const response = {
        id: message.id,
        ticket: message.ticket,
        content: message.content,
        target: message.targetServicePointId || message.targetLocationId,
        targetType: message.targetServicePointId ? 'service_point' : 'location',
        priority: message.priority,
        channel: message.channel,
        externalRef: message.externalRef,
        createdAt: message.createdAt,
        expiresAt: message.expiresAt,
        ...deliveryInfo
      };
  
      res.json(response);
  
    } catch (error) {
      console.error('Error fetching message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }


  async retireMessage(req, res) {
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


  async repeatMessage(req, res) {
    const { id } = req.params;
    const original = messages.find(m => m.id === id);
    
    if (!original) {
      return res.status(404).json({ error: 'Original message not found' });
    }
    
    const repeated = {
      ...original,
      id: req.requestId,
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


}

module.exports = new MessageController();
