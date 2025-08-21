/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Lógica de rutas - Mensajes
// cap6/server/src/controllers/messageController.js
// =============================================================
const {
  ExternalSystem, 
  ServicePoint, 
  Location, 
  DisplayNode, 
  Message, 
  MessageDelivery,
  MessageTTS,
  resolverUtils 
} = require('../models');

const TopicResolver = require('../services/topicresolver');
const MQTTService = require('../services/mqttService');
const { processMessageDeliveries } = require('../utils/messageStatus');
const ttsService = process.env.SPEACHES_URL ? require('../services/ttsService') : null;

const callTTS = async (messageTTS) => {
  if (!messageTTS) return Promise.resolve(null);

  return (async() => {
    let ttsStatus = null;
    let result = null;
    try {
      if (!ttsService.available) await ttsService.initialize(); // No pasa nada por intentarlo...
      result = await ttsService.synthesize(messageTTS.text, messageTTS.locale,
                                           { speed: messageTTS.speed || 1.0, useCache: true });
      ttsStatus = { result: 'SYNTH_OK', audioSize: result.length, audioFormat: 'audio/mpeg', resultAt: new Date()};
    } catch (error) {
      ttsStatus = { result: 'FAIL', resultAt: new Date(), errorMessage: error.message };
      result = null;
    } finally {
      if (ttsStatus) messageTTS.update(ttsStatus).catch(err => {
        console.log(`Error actualizando registro TTS del mensaje ${messageTTS.messageId}: ${err.message}`);
      });
    }
    return result;
  })();
};


class MessageController {

  async createMessage(req, res) {
    try {
      const { ticket, content, target, targetType, priority = 1, channel = 'calls', externalRef, tts } = req.body;
      
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

      // Guardar info sobre TTS si es necesario
      let messageTTS = null;
      if (tts && tts.text && tts.locale) {
        messageTTS = await MessageTTS.create({ messageId: message.id, text: tts.text, locale: tts.locale });
      }
      const ttsPromise = callTTS(messageTTS); // Asíncrona (significativo sii messageTTS != null, claro)

      // Resolver el topic a usar para publicar el mensaje y sus nodos destino
      const topic = await TopicResolver.buildTopic(effectiveTargetType, effectiveTargetId);
      const targetNodes = await TopicResolver.getTargetNodes(message);
      
      // Crear los registros de entrega
      const deliveries = targetNodes.map(node => ({
        messageId: message.id,
        nodeId: node.id
      }));
      
      if (deliveries.length > 0) {
        await MessageDelivery.bulkCreate(deliveries);
        const ttsResult = await ttsPromise;
        MQTTService.publishMessage(topic, message, ttsResult);
      }
      
      console.log(`New message: ${message.id} (${targetNodes.length} nodes)`);
      
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


  async retractMessage(req, res) {
    try {
      const { id } = req.params;
      const ahora = new Date();

      // Recuperar el mensaje original
      const message = await Message.findByPk(id);
      if (!message) {
        return res.status(404).json( { error: 'Message not found' });
      }
      // Comprobar que el mensaje no haya expirado aún
      if (ahora > message.expiresAt) {
        return res.status(400).json({ error: 'Expired messages cannot be retracted'});
      }
      // Comprobar que el mensaje no haya sido ya retirado antes
      if (message.retractedAt) {
        return res.status(400).json({ error: 'Message already retracted' });
      }

      // Marcar el mensaje en BD como retirado
      await message.update({ retractedAt: ahora });
      // Publicar el mensaje MQTT de retirada
      MQTTService.publishMessageRetract(message);
      console.log('Message retracted:', message.id);
      res.json({
        id: message.id,
        retractedAt: message.retractedAt
      });

    } catch (error) {
      console.error('Error retracting message:', error);
      res.status(500).json({ error: 'Internal server error'});
    }
  }


  async repeatMessage(req, res) {
    try {
      const { content, target, targetType, priority, tts } = req.body;
      const { id } = req.params;
      const ahora = new Date();

      // Recuperar el mensaje original
      const og_message = await Message.findByPk(id);
      if (!og_message) {
        return res.status(404).json({ error: 'Original message not found' });
      }
      // Comprobar que el mensaje no haya expirado aún
      if (ahora > og_message.expiresAt) {
        return res.status(400).json({ error: 'Expired messages cannot be repeated' });
      }
      // Comprobar que el mensaje no haya sido retirado
      if (og_message.retractedAt) {
        return res.status(400).json({ error: 'Retracted messages cannot be repeated' });
      }
      // Marcar el mensaje original en BD como retirado
      await og_message.update({ retractedAt: ahora });
      // Publicar el mensaje MQTT de retirada
      // TODO si no se marca esto de algún modo como 'retirada por repetición', la repetición será filtrada en el nodo
      //      ¿O podría identificarse la situación de algún otro modo en messageFilter en el nodo de visualización, y
      //      si se rediseña la cache de retiradas?
      MQTTService.publishMessageRetract(og_message);

      // Todas las repeticiones (o repeticiones de repeticiones) referencian el mensaje original
      const ogMessageId = og_message.ogMessageId || id;
      // Los campos no modificables por las repeticiones son: ticket, channel y externalRef
      const messageData = {
        id: req.requestId,
        ogMessageId: ogMessageId,
        ticket: og_message.ticket,
        channel: og_message.channel,
        externalRef: og_message.externalRef,
        content: content || og_message.content,
        priority: priority || og_message.priority,
        sourceSystemId: req.system.id,
        expiresAt: new Date(ahora + 15 * 60 * 1000)
      }
      
      // El destino puede ser diferente del original
      let effectiveTargetType = targetType;
      let effectiveTargetId = null;
      if (target) {
        if (!effectiveTargetType)
          effectiveTargetType (req.system.defaultTargetType == 'S') ? 'service_point' : 'location';

        if (effectiveTargetType == 'service_point') {
           messageData.targetServicePointId = await resolverUtils.resolveServicePoint(req.system.id, target);
           effectiveTargetId = messageData.targetServicePointId;
        } else {
           messageData.targetLocationId = target;
           effectiveTargetId = messageData.targetLocationId;
        }
      } else {
        // Usar el target del mensaje original
        messageData.targetServicePointId = og_message.targetServicePointId;
        messageData.targetLocationId = og_message.targetLocationId;
        effectiveTargetType = og_message.targetLocationId ? 'location' : 'service_point';
        effectiveTargetId = og_message.targetLocationId || og_message.targetServicePointId;
      }

      // Guardar la repetición y publicar el mensaje de retirada del original
      const repetition = await Message.create(messageData);

      // Guardar info sobre TTS si es necesario
      let messageTTS = null;
      if (tts && tts.text && tts.locale) {
        messageTTS = await MessageTTS.create({ messageId: repetition.id, text: tts.text, locale: tts.locale });
      }
      const ttsPromise = callTTS(messageTTS); // Asíncrona (significativo sii messageTTS != null, claro)

      // Resolver el topic a usar para publicar el mensaje y sus nodos destino
      const topic = await TopicResolver.buildTopic(effectiveTargetType, effectiveTargetId);
      const targetNodes = await TopicResolver.getTargetNodes(repetition);
      // Crear registros de entrega
      const deliveries = targetNodes.map(node => ({
        messageId: repetition.id,
        nodeId: node.id
      }));
      if (deliveries.length > 0) {
        await MessageDelivery.bulkCreate(deliveries);
        const ttsResult = await ttsPromise;
        MQTTService.publishMessage(topic, repetition, ttsResult);
      }

      console.log(`Repeated message: ${id} -> ${repetition.id} (${targetNodes.length} nodes)`);
      
      res.status(201).json({
        originalId: ogMessageId,
        id: repetition.id, 
        status: 'sent',
        targetNodes: targetNodes.length,
        timestamp: repetition.createdAt
      });
    } catch (error) {
      console.error('Error repeating message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

}

module.exports = new MessageController();