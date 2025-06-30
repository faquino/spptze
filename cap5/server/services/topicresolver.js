/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - RESOLUCIÓN DE DESTINOS A TOPICS MQTT
// cap5/server/services/topicresolver.js
// =============================================================
const { Location, ServicePoint, DisplayNode } = require('../models');

class TopicResolver {
  /**
   * Construye el topic MQTT para un mensaje
   * @param {string} targetType - 'service_point' o 'location'
   * @param {string} targetId - ID del destino
   * @param {string} sourceId - ID del sistema externo
   * @returns {Promise<string>} Topic MQTT completo
   */
  static async buildTopic(targetType, targetId) {
    const servicePoint = await ServicePoint.findOne({where: {}})
    if (targetType === 'service_point') {
      return `spptze/messages/sp/${targetId}`;
    } else {
      return await this.buildLocationTopic(targetId);
    }
  }

  /**
   * Construye topic jerárquico para ubicación
   */
  static async buildLocationTopic(locationId) {
    const location = await Location.findByPk(locationId);
    if (!location) throw new Error(`Location ${locationId} not found`);
    
    const path = await location.getPath(); // Tu método existente
    const pathStr = path.map(loc => loc.id).join('/');
    return `spptze/messages/loc/${pathStr}`;
  }

  /**
   * Calcula suscripciones MQTT para un nodo
   */
  static async getNodeSubscriptions(nodeId) {
    const node = await DisplayNode.findByPk(nodeId, {
      include: [Location]
    });
    
    if (!node) throw new Error(`Node ${nodeId} not found`);
    
    const subscriptions = [];
    for (const location of node.Locations) {
      const path = await location.getPath();
      const pathStr = path.map(loc => loc.id).join('/');
      
      // Si showChildren=true, suscribirse a hijos también
      const suffix = location.NodeLocationMapping?.showChildren ? '/#' : '';
      subscriptions.push(`spptze/messages/loc/${pathStr}${suffix}`);
    }
    
    return subscriptions;
  }
}

module.exports = TopicResolver;