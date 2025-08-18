/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Middleware validación de IP
// cap6/server/src/middleware/validateIP.js
// =============================================================
const rangeCheck = require('range_check');


/**
 * Middleware de validación del acceso según la IP de origen de la petición
 * @param {Object} req - Objeto request. Debe tener el atributo req.system (puesto ahí previamente por authenticateAPI)
 * @param {*} res - Objeto response
 * @param {*} next - Siguiente función en la cadena de middlewares
 * @returns 
 */
const validateIPAccess = (req, res, next) => {
  // Obtener IP del cliente (considerando proxy headers)
  const clientIP = req.headers['x-forwarded-for'] || 
                   req.headers['x-real-ip'] || 
                   req.connection.remoteAddress || 
                   req.socket.remoteAddress ||
                   req.ip;

  // Limpiar IP (quitar prefijo ::ffff: de direcciones IPv4-mapped en redes IPv6)
  const cleanIP = clientIP.replace(/^::ffff:/, '');

  const system = req.system; // Ya establecido por authenticateAPI

  // Si no hay restricciones de IP configuradas, se permite el acceso
  if (!system.allowedIPs || system.allowedIPs.length === 0) {
    console.log(`No IP restrictions for system ${system.id}, allowing access from ${cleanIP}`);
    return next();
  }

  // Comprobar si la IP de la petición coincide con alguna de las IPs o rangos CIDR en system.allowedIPs
  const isAllowed = system.allowedIPs.some(allowedIP => {
    try {
      return rangeCheck.inRange(cleanIP, allowedIP);
    } catch (error) {
      console.error(`Error validating IP range ${allowedIP}:`, error);
      return false;
    }
  });

  if (!isAllowed) {
    console.log(`IP access denied: ${cleanIP} not in allowed list for system ${system.id}`);

    return res.status(403).json({ 
      error: 'Access denied',
      message: 'Source IP address not authorized for this API key',
      clientIP: cleanIP, // Para debugging - opcional quitar en producción
      timestamp: new Date().toISOString()
    });
  }
  return next();
};

module.exports = { validateIPAccess };
