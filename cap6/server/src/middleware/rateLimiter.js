/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Middleware limitación del número de peticiones
// cap5/server/src/middleware/rateLimiter.js
// =============================================================
const rateLimit = require('express-rate-limit');

const rateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // ventana de 5 minutos
  max: 100, // máx 100 peticiones en la ventana definida
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' }
});

module.exports = { rateLimiter };
