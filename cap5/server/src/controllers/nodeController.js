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

class NodeController {

  async getNodes(req, res) {
    try {
      const nodes = await DisplayNode.findAll({
        include: [{
          model: Location,
          through: { attributes: ['showChildren', 'active'] }
        }]
      });
      
      const nodesWithStatus = nodes.map(node => {
        const now = new Date();
        const lastSeenDiff = node.lastSeen ? now - new Date(node.lastSeen) : null;
        const isOnline = lastSeenDiff ? lastSeenDiff < 30000 : false; // 30 segundos
        
        return {
          id: node.id,
          name: node.name,
          status: node.status,
          isOnline,
          lastSeen: node.lastSeen,
          locations: node.Locations?.map(loc => loc.name) || []
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
    const { action, value } = req.body;
    
    const node = nodes.find(n => n.id === id);
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    const validActions = ['power_on', 'power_off', 'volume', 'refresh'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ 
        error: 'Invalid action',
        validActions 
      });
    }
    
    console.log(`Control ${action} enviado a ${node.name}${value ? ` (${value})` : ''}`);
    
    res.json({
      nodeId: id,
      action,
      value: value || null,
      status: 'sent',
      timestamp: new Date().toISOString()
    });
  }

}

module.exports = new NodeController();
