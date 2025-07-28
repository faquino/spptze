/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Lógica de rutas - Estado
// cap5/server/src/controllers/statusController.js
// =============================================================
const Op = require('sequelize').Op;
const { Message, DisplayNode, ExternalSystem} = require('../models');

class StatusController {

  async getSystemStatus(req, res) {
    try {
      const now = new Date();

      const [totalMessages, activeMessages, totalNodes, activeSystems] = await Promise.all([
        Message.count(),
        Message.count({ where: { expiresAt: { [Op.gt]: now } } }),
        DisplayNode.count(),
        ExternalSystem.count({ where: { active: true } })
      ]);

      res.json({
        status: 'operational',
        timestamp: now.toISOString(),
        version: '1.0.0-integrated',
        uptime: process.uptime(),
        stats: {
          totalMessages,
          activeMessages,
          totalNodes,
          activeSystems
        },
        health: {
          database: 'ok',
          api: 'ok'
        }
      });

    } catch (error) {
      console.error('Error fetching status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

}

module.exports = new StatusController();
