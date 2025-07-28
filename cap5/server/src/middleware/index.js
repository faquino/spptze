/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Middleware Express.js
// cap5/server/src/middleware/index.js
// =============================================================
const { authenticateAPI } = require('./apiAuth');
const { assignReqUID } = require('./assignReqUID');
const { rateLimiter } = require('./rateLimiter');

module.exports = { authenticateAPI, assignReqUID, rateLimiter };
