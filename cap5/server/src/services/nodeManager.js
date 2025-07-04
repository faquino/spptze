/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - GESTOR DE NODOS
// cap5/server/src/services/nodeManager.js
// =============================================================
const { DisplayNode, Location, ServicePoint } = require('../models');

class NodeManager {
  
  /**
   * Construir el conjunto de suscripciones MQTT para un nodo
   */
  async getNodeSubscriptions(nodeId) {
    const node = await DisplayNode.findByPk(nodeId, {
      include: [{
        model: Location,
        through: { 
          attributes: ['showChildren'],
          where: { active: true }
        }
      }]
    });

    if (!node || !node.active) {
      throw new Error(`Active node ${nodeId} not found`);
    }

    const subscriptions = new Set();
    
    for (const location of node.Locations) {
      const showChildren = location.NodeLocationMapping.showChildren;
      
      // Construir topic base para la ubicación
      const path = await location.getPath();
      const topicBase = `spptze/messages/loc/${path.map(l => l.id).join('/')}`;
      
      if (showChildren) {
        // Suscripción con wildcard para incluir descendientes
        subscriptions.add(`${topicBase}/#`);
      } else {
        // Suscripción exacta solo a esta ubicación
        subscriptions.add(topicBase);
      }
      
      // Añadir suscripciones a service points relacionados con esta ubicación
      const servicePointSubs = await this.getServicePointSubscriptions(location);
      servicePointSubs.forEach(sub => subscriptions.add(sub));
    }
    
    return Array.from(subscriptions);
  }

  /**
   * Obtener suscripciones a service points para una ubicación
   */
  async getServicePointSubscriptions(location) {
    const subscriptions = new Set();
    
    // Service points directamente asociados a esta ubicación
    const servicePoints = await location.getServicePoints({
      where: { active: true }
    });
    
    servicePoints.forEach(sp => {
      subscriptions.add(`spptze/messages/sp/${sp.id}`);
    });
    
    return Array.from(subscriptions);
  }

  /**
   * Actualizar la última vez visto de un nodo
   */
  async updateLastSeen(nodeId) {
    await DisplayNode.update(
      { lastSeen: new Date() },
      { where: { id: nodeId } }
    );
  }

  /**
   * Obtener información completa de un nodo
   */
  async getNodeInfo(nodeId) {
    return await DisplayNode.findByPk(nodeId, {
      include: [
        {
          model: Location,
          through: { attributes: ['showChildren', 'active'] }
        }
      ]
    });
  }

  /**
   * Activar/desactivar un nodo
   */
  async setNodeActive(nodeId, active) {
    const [updatedRows] = await DisplayNode.update(
      { active },
      { where: { id: nodeId } }
    );
    
    if (updatedRows === 0) {
      throw new Error(`Node ${nodeId} not found`);
    }
    
    return await this.getNodeInfo(nodeId);
  }

  /**
   * Listar todos los nodos activos
   */
  async getActiveNodes() {
    return await DisplayNode.findAll({
      where: { active: true },
      include: [
        {
          model: Location,
          through: { 
            attributes: ['showChildren'],
            where: { active: true }
          }
        }
      ]
    });
  }
}

module.exports = new NodeManager();