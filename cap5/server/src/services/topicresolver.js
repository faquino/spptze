/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - RESOLUCIÓN DE DESTINOS A TOPICS MQTT
// cap5/server/src/services/topicResolver.js
// =============================================================
const { Location, ServicePoint, DisplayNode } = require('../models');

class TopicResolver {
  #prefix = '';

  constructor(prefix = 'spptze') {
    this.#prefix = prefix;
    console.log('(init) TopicResolver; prefix:', this.#prefix);
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
      return `${this.#prefix}/messages/sp/${targetId}`;
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

  /**
   * Obtener nodos que deben recibir un mensaje
   * @param {Object} message - Instancia del modelo Message
   * @returns {Promise<Array>} Array de instancias DisplayNode
   */
  async getTargetNodes(message) {
    const targetLocations = [];
    
    if (message.targetLocationId) {
      // Mensaje directo a ubicación
      const location = await Location.findByPk(message.targetLocationId);
      if (!location) {
        throw new Error(`Location ${message.targetLocationId} not found`);
      }
      targetLocations.push(location);
    } else {
      // Mensaje a service point - obtener ubicaciones asociadas
      const servicePoint = await ServicePoint.findByPk(message.targetServicePointId, {
        include: [Location]
      });
      if (!servicePoint) {
        throw new Error(`ServicePoint ${message.targetServicePointId} not found`);
      }
      targetLocations.push(...servicePoint.Locations);
    }
    
    const targetNodesMap = new Map(); // nodeId -> node instance
    
    for (const location of targetLocations) {
      // Nodos directamente asociados a esta ubicación
      const directNodes = await location.getDisplayNodes({
        through: { where: { active: true } }
      });
      directNodes.forEach(node => {
        if (node.active) targetNodesMap.set(node.id, node);
      });
      
      // Nodos asociados a ubicaciones ancestras con showChildren: true
      const ancestorNodes = await this.getAncestorNodesWithShowChildren(location);
      ancestorNodes.forEach(node => targetNodesMap.set(node.id, node));
    }
    
    return Array.from(targetNodesMap.values());
  }

  /**
   * Obtener nodos de ubicaciones ancestras que tienen showChildren: true
   * @param {Object} location - Instancia del modelo Location
   * @returns {Promise<Array>} Array de instancias DisplayNode
   */
  async getAncestorNodesWithShowChildren(location) {
    const ancestorNodes = new Map(); // nodeId -> node instance
    const path = await location.getPath();
    
    // Recorrer ancestros (excluyendo la ubicación actual)
    for (let i = 0; i < path.length - 1; i++) {
      const ancestor = path[i];
      
      // Buscar nodos de este ancestro con showChildren: true
      const nodes = await ancestor.getDisplayNodes({
        through: { 
          where: { 
            showChildren: true,
            active: true 
          } 
        }
      });
      
      nodes.forEach(node => {
        if (node.active) ancestorNodes.set(node.id, node);
      });
    }
    
    return Array.from(ancestorNodes.values());
  }

}

module.exports = new TopicResolver('spptze');