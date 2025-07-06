/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - PERSISTENCIA DE ENTREGAS DE MENSAJES (MessageDelivery)
// cap5/server/src/services/deliveryService.js
// =============================================================
const { MessageDelivery } = require('../models');
const nodeManager = require('./nodeManager');

class DeliveryService {
  
  /**
   * Procesar ACK de mensaje desde nodo
   */
  async handleMessageAck(nodeId, ackData) {
    const { messageId, deliveredAt, acknowledgedAt } = ackData;
    
    // Validar timestamps del nodo (opcional)
    const now = new Date();
    const maxSkew = 5 * 60 * 1000; // 5 minutos
    
    if (deliveredAt && Math.abs(new Date(deliveredAt) - now) > maxSkew) {
      console.warn(`Clock skew detected for node ${nodeId}: deliveredAt=${deliveredAt}`);
    }
    
    // Actualizar delivery record
    await MessageDelivery.update(
      { 
        deliveredAt: deliveredAt ? new Date(deliveredAt) : new Date(),
        acknowledgedAt: acknowledgedAt ? new Date(acknowledgedAt) : new Date()
      },
      { where: { messageId, nodeId } }
    );
    
    // Actualizar lastSeen del nodo
    await nodeManager.updateLastSeen(nodeId);
    
    console.log(`ACK processed: message ${messageId} from node ${nodeId}`);
  }
  
  /**
   * Crear registros de delivery para un mensaje
   */
  async createDeliveries(message, targetNodes) {
    const deliveries = targetNodes.map(node => ({
      messageId: message.id,
      nodeId: node.id
    }));
    
    return await MessageDelivery.bulkCreate(deliveries);
  }
}

module.exports = new DeliveryService();