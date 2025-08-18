/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Router Express: API
// cap6/server/src/routes/index.js
// =============================================================
const express = require('express');
const router = express.Router();

// Importar middleware
const { authenticateAPI, validateIPAccess, assignReqUID, rateLimiter} = require('../middleware');

// Sub-routers 'temáticos'
const messageRoutes = require('./messages.js');
const nodeRoutes = require('./nodes');
const statusRoutes = require('./status');

// Endpoint base
router.get('/', (req, res) => {
  res.json({
    name: 'SPPTZE API',
    version: '1.0.0',
    description: 'Sistema de Presentación para Pantallas de Turno en Zonas de Espera',
    documentation: '/api/v1/docs'
  });
});

// Aplicar middleware a las rutas de la API
router.use('/messages', authenticateAPI, validateIPAccess, assignReqUID, rateLimiter, messageRoutes);
router.use('/nodes', authenticateAPI, validateIPAccess, assignReqUID, rateLimiter, nodeRoutes);
router.use('/status', authenticateAPI, validateIPAccess, assignReqUID, rateLimiter, statusRoutes);

module.exports = router;
