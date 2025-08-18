/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Middleware autenticación API key
// cap6/server/src/middleware/apiAuth.js
// =============================================================
const { ExternalSystem } = require('../models');

const authenticateAPI = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ 
      error: 'API key required',
      message: 'Include an X-API-Key header' 
    });
  }
  
  try {
    const system = await ExternalSystem.findOne({ 
      where: { apiKey, active: true } 
    });
    
    if (!system) {
      return res.status(401).json({ 
        error: 'Invalid API key',
        message: 'API key not found or system inactive' 
      });
    }

    // TODO: VALIDACIÓN DE IPs portar de ../api-poc/server.js

    // La fila correspondiente al sistema externo se añade a req y está disponible en el resto
    // de la cadena de procesamiento de la petición (middleware-ruta-handler)
    req.system = system;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { authenticateAPI };
