/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - GESTOR DE NODOS
// cap6/server/src/services/nodeManager.js
// =============================================================
const { DisplayNode, Location, MessageDelivery } = require('../models');

class NodeManager {

  /**
   * Construir suscripciones MQTT para un nodo
   * @param {Object} node - Instancia del modelo DisplayNode
   * @returns {Promise<Array<string>>} Array de topics MQTT
   */
  async getNodeSubscriptions(node) {
    if (!node || !node.active) throw new Error(`Node must be active`);

    // Cargar ubicaciones si no están incluidas
    if (!node.Locations) {
      await node.reload({
        include: [{ model: Location,
                    through: { attributes: ['showChildren'], where: { active: true } } }]
      });
    }

    const subscriptions = new Set();
    for (const location of node.Locations) {
      const showChildren = location.NodeLocationMapping.showChildren;
      
      // Construir topic para la ubicación
      const path = await location.getPath();
      const topicBase = `spptze/messages/loc/${path.map(l => l.id).join('/')}`;
      subscriptions.add(`${topicBase}${showChildren ? '/#' : ''}`);
      
      // Añadir suscripciones a puntos de servicio relacionados con esta ubicación
      const servicePointSubs = await this.getServicePointSubscriptions(location, showChildren);
      servicePointSubs.forEach(sub => subscriptions.add(sub));
    }
    
    return Array.from(subscriptions);
  }

  async messageAck(payload) {
    const node = await this.getNodeBySN(payload.nodeSerial);
    if (!node) throw new Error(`Node ${payload.nodeId} not found`);
    
    // Actualizar delivery record (messageId, nodeId)
    const deliveryInfo = { acknowledgedAt: new Date() };
    if (payload.deliveredAt) deliveryInfo.deliveredAt = new Date(payload.deliveredAt);
    if (payload.displayedAt) deliveryInfo.displayedAt = new Date(payload.displayedAt);
    if (payload.retractedAt) deliveryInfo.retractedAt = new Date(payload.retractedAt);
    const delivery = await MessageDelivery.findOne({ where: { messageId: payload.id, nodeId: node.id } });
    if (!delivery) throw new Error(`Message delivery record not found for message ${payload.id} and node ${node.id}`);

    await delivery.update(deliveryInfo);
  }

  /**
   * Obtener suscripciones a service points para una ubicación
   */
  async getServicePointSubscriptions(location, includeChildren = false) {
    const subscriptions = new Set();
    
    // Service points directamente asociados a esta ubicación
    const servicePoints = await location.getServicePoints({
      where: { active: true }
    });
    
    servicePoints.forEach(sp => {
      subscriptions.add(`spptze/messages/sp/${sp.id}`);
    });
    
    // Si es necesario, obtener puntos de servicio relacionados con ubicaciones hijas
    if (includeChildren) {
      const descendants = await location.getDescendants();
      for (const descendant of descendants) {
        const descendantSPs = await descendant.getServicePoints({ where: { active: true }});
        descendantSPs.forEach(sub => subscriptions.add(`spptze/messages/sp/${sp.id}`));
      }
    }
    return Array.from(subscriptions);
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
   * Recuperar un nodo de la base de datos por su número de serie.
   * NO USAR SI NO SE PRETENDE ACTUALIZAR EL CAMPO LAST_SEEN.
   * @param {string} serial - Número de serie del nodo a recuperar de BD
   * @returns Object - Instancia de modelo DisplayNode correspondiente al número de
   *                   serie facilitado
   */
  async getNodeBySN(serial) {
    const displayNode = await DisplayNode.findOne({ where: { serialNumber: serial } });
    if (!displayNode) {
      throw new Error(`Node with serial ${serial} not found`);
    } else {
      displayNode.lastSeen = new Date();
      await displayNode.save();
    }
    return displayNode;
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