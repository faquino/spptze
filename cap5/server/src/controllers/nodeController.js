/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Lógica de rutas - Nodos
// cap5/server/src/controllers/nodeController.js
// =============================================================
const { DisplayNode, Location } = require('../models');
const MQTTService = require('../services/mqttService');

class NodeController {

  async getNodes(req, res) {
    try {
      const nodes = await DisplayNode.findAll({
        include: [{
          model: Location,
          through: { attributes: ['showChildren', 'active'] }
        }]
      });

      const now = new Date();
      const nodesWithStatus = nodes.map(node => {
        const lastSeenDiff = node.lastSeen ? now - new Date(node.lastSeen) : null;
        const isOnline = lastSeenDiff ? lastSeenDiff < 30000 : false; // 30 segundos
        
        return {
          id: node.id,
          name: node.name,
          locations: node.Locations?.map(loc => loc.name) || [],
          isOnline,
          lastSeen: node.lastSeen
        };
      });
      
      res.json({
        nodes: nodesWithStatus,
        total: nodes.length,
        online: nodesWithStatus.filter(n => n.isOnline).length,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error fetching nodes:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async controlNode(req, res) {
    const { id } = req.params;
    const { powerStatus, volumeLevel } = req.body;
    
    try {
      // Recuperar nodo de BD
      const node = await DisplayNode.findByPk(id);

      if (!node)
        return res.status(404).json({ error: 'Node not found' });

      if (!node.active)
        return res.status(400).json({ error: 'Node configured as inactive'} );

      const controlCommand = {};
      if (powerStatus)
        controlCommand.powerStatus = powerStatus;
      if (volumeLevel !== undefined)
        controlCommand.volumeLevel = volumeLevel;
      await MQTTService.publishControl(node.serialNumber, controlCommand);

      res.json({
        nodeId: id, 
        command: controlCommand,
        status: 'sent',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error controlling node:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

}

module.exports = new NodeController();
