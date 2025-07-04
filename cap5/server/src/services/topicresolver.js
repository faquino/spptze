/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - RESOLUCIÓN DE DESTINOS A TOPICS MQTT
// cap5/server/src/services/topicresolver.js
// =============================================================
const { Location, ServicePoint, DisplayNode } = require('../models');

class TopicResolver {
  #prefix = '';

  constructor(prefix = 'spptze') {
    this.#prefix = prefix;
    console.log('(init) TopicrResolver; prefix:', this.#prefix);
  }

  /**
   * Construye el topic MQTT para un mensaje
   * @param {string} targetType - 'service_point' o 'location'
   * @param {string} targetId - ID del destino
   * @returns {Promise<string>} Topic MQTT completo
   */
  async buildTopic(targetType, targetId) {
    if (targetType === 'service_point') {
      // No es necesario comprobar la existencia en BD del punto de servicio, se acaba de obtener el Id a
      // partir de su externalId
      return `${prefix}/messages/sp/${targetId}`;
    } else {
      // Comprobar que la ubicación existe
      const location = await Location.findByPk(targetId);
      if (!location) throw new Error(`Location ${targetId} not found`);

      const path = await location.getPath(); // Método definido en modelo Sequelize de Location
      const pathStr = path.map(loc => loc.id).join('/');
      return `${this.#prefix}/messages/loc/${pathStr}`;
    }
  }

  /**
   * Calcula el conjunto de suscripciones MQTT para un nodo en función de sus ubicaciones asociadas
   * @param {string} nodeId - ID del nodo de visualización
   * @returns {Promise<string[]>} Lista de topics MQTT a los que suscribirse
   */
  async getNodeSubscriptions(nodeId) {
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
      subscriptions.push(`${this.#prefix}/messages/loc/${pathStr}${suffix}`);
    }
    
    return subscriptions;
  }
}

module.exports = new TopicResolver('spptze');