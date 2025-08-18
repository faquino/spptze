/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Funciones para determinar estado de entrega de mensajes
// cap6/server/src/utils/messageStatus.js
// =============================================================

/**
 * Determina el estado de entrega individual de un mensaje a un nodo específico
 * @param {Object} delivery - Registro de MessageDelivery
 * @param {Boolean} isExpired - Indicación de si se ha superado o no el tiempo de expiración del mensaje
 * @returns {string} Estado de entrega según enum DeliveryStatusInfo
 */
function getDeliveryStatus(delivery, isExpired) {
  // Si el mensaje ha expirado y no hay confirmación, marcarlo como fallido
  if (isExpired && !delivery.acknowledgedAt) {
    return 'fail';
  }
  
  // Si hay confirmación (ACK recibido del nodo)
  if (delivery.acknowledgedAt) {
    // Si también hay timestamp de visualización, está completamente exitoso
    if (delivery.displayedAt) {
      return 'success';
    }
    // Si solo hay confirmación pero no timestamp de display, está entregado pero no mostrado
    return 'displayed';
  }
  
  // Si no hay confirmación pero tampoco ha expirado, está pendiente
  return 'sent';
}

/**
 * Determina el estado agregado de un mensaje considerando todas sus entregas
 * @param {Array} deliveries - Array de registros MessageDelivery
 * @param {Boolean} isExpired - Indicación de si se ha superado o no el tiempo de expiración del mensaje
 * @returns {string} Estado agregado según enum MessageStatusInfo
 */
function getAggregatedMessageStatus(deliveries, isExpired) {
  if (!deliveries || deliveries.length === 0) {
    return 'sent';
  }
  
  // Calcular estados individuales
  const individualStatuses = deliveries.map(delivery => 
    getDeliveryStatus(delivery, isExpired)
  );
  
  const successCount = individualStatuses.filter(status => status === 'success').length;
  const displayedCount = individualStatuses.filter(status => status === 'displayed').length;
  const failCount = individualStatuses.filter(status => status === 'fail').length;
  const sentCount = individualStatuses.filter(status => status === 'sent').length;
  
  // Si todas las entregas fueron exitosas
  if (successCount === deliveries.length) {
    return 'success';
  }
  
  // Si todas fallaron
  if (failCount === deliveries.length) {
    return 'fail';
  }
  
  // Si hay una mezcla pero el mensaje ha expirado
  if (isExpired) {
    // Si al menos algunas fueron exitosas/mostradas
    if (successCount > 0 || displayedCount > 0) {
      return 'incomplete';
    }
    // Si ninguna fue exitosa
    return 'fail';
  }
  
  // Si el mensaje no ha expirado
  if (successCount > 0 || displayedCount > 0) {
    // Si hay entregas exitosas/mostradas y otras pendientes
    if (sentCount > 0) {
      return 'displaying';
    }
    // Si solo hay exitosas/mostradas
    return 'displayed';
  }
  
  // Si todas están pendientes (sent)
  return 'sent';
}

/**
 * Genera estadísticas de entrega para el campo deliveryStats
 * @param {Array} deliveries - Array de registros MessageDelivery
 * @param {Date} messageExpiresAt - Timestamp de expiración del mensaje
 * @returns {Object} Estadísticas de entrega
 */
function calculateDeliveryStats(deliveries, messageExpiresAt) {
  if (!deliveries || deliveries.length === 0) {
    return { total: 0,
             acknowledged: 0 };
  }
  
  const acknowledgedCount = deliveries.filter(delivery => 
    (delivery.acknowledgedAt !== null) && (delivery.acknowledgedAt < messageExpiresAt)
  ).length;
  
  return {
    total: deliveries.length,
    acknowledged: acknowledgedCount
  };
}

// Función auxiliar para usar en el endpoint GET /messages/:id
function processMessageDeliveries(message, includeDetails = false) {
  const deliveries = message.DisplayNodes.map(node => ({
    nodeId: node.id,
    nodeName: node.name,
    nodeActive: node.active,
    createdAt: node.MessageDelivery.createdAt,
    sentAt: node.MessageDelivery.sentAt,
    displayedAt: node.MessageDelivery.displayedAt,
    acknowledgedAt: node.MessageDelivery.acknowledgedAt,
    retractedAt: node.MessageDelivery.retractedAt
  }));
  const deliveryStats = calculateDeliveryStats(deliveries, message.expiresAt);
  const aggregatedStatus = getAggregatedMessageStatus(deliveries, message.expiresAt);
  
  const result = {
    // ... otros campos del mensaje
    status: aggregatedStatus,
    deliveryStats
  };
  
  if (includeDetails) {
    result.deliveries = deliveries.map(delivery => ({
      nodeId: delivery.nodeId,
      status: getDeliveryStatus(delivery, message.expiresAt),
      createdAt: delivery.createdAt,
      deliveredAt: delivery.deliveredAt,
      displayedAt: delivery.displayedAt,
      acknowledgedAt: delivery.acknowledgedAt,
      retractedAt: delivery.retractedAt,
      nodeName: delivery.nodeName,
      nodeActive: delivery.nodeActive
    }));
  }
  
  return result;
}

module.exports = { processMessageDeliveries };