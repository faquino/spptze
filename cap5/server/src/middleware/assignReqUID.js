/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Middleware generación unique Id a petición
// cap5/server/src/middleware/assignReqId.js
// =============================================================
const ShortUniqueId = require('short-unique-id');
const uid = new ShortUniqueId();

const assignReqUID = (req, res, next) => {
  // Se genera un UID de 16 caracteres, válido para insertar como message.id en la BD
  // Alternativamente, el método stamp() incluye un timestamp al UID, de manera que éste ya no es totalmente
  // aleatorio como con rnd(). En cualquier caso habría que generar miles de UIDs en el mismo segundo para que hubiese
  // un riesgo real de colisión. La parte buena es que de este modo la raíz del UID es lexicográficamente ordenable y su
  // impacto negativo en un índice de BD (por fragmentación) se reduce
  const requestId = uid.rnd(16);
  req.requestId = requestId;
  res.set('X-Request-Id', requestId);
  next();
};

module.exports = { assignReqUID };