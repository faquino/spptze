/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Filtrado de mensajes
// cap5/player/src/services/messageFilter.js
// =============================================================

/**
 * Aunque MQTT garantiza la entrega en el mismo orden de publicación para los mensajes de un mismo cliente en el msimo
 * topic, NO ES ASÍ entre topics o clientes diferentes. En el caso de SPPTZE, los mensajes de llamada y sus
 * repeticiones pueden publicarse en topics (destinos) diferentes, y los de retirada se publican siempre en un topic
 * distinto al del mensaje a retirar. Esto implica que pueden producirse entregas de mensajes fuera del orden de
 * publicación. La identificación de entregas fuera de orden y el filtrado evitan tener que manejar dichos casos en la
 * UI del nodo, como p.ej:
 * - Retirada antes que mensaje: se filtra el mensaje cuando llegue
 * - Repetición fuera de orden: se ignoran repeticiones con timestamp anterior
 */
class MessageFilter {
  constructor() {
    this.retractCache = new Map();   // ogMessageId||messageId -> timestamp
    this.msgIdCache = new Map();     // ogMessageId||messageId -> latestCreatedAt
    this.cacheTtlMs = 5 * 60 * 1000; // 5 minutos TTL
    this.cleanupInterval = setInterval(() => { this.cleanup(); }, 60 * 1000); // Limpieza de caches cada minuto

    // Cuenta de filtrados
    this.filteredMessageCount = 0;
    this.filteredRetractCount = 0;
  }

  /**
   * Limpiar entradas antiguas
   */
  cleanup() {
    const ahora = Date.now();
    
    // Limpiar retiradas antiguas
    for (const [id, timestamp] of this.retractCache) {
      if (ahora - timestamp > this.cacheTtlMs) {
        this.retractCache.delete(id);
      }
    }
    
    // Limpiar mensajes antiguos (más de 15 minutos)
    const limiteTiempo = ahora - (15 * 60 * 1000);
    for (const [id, createdAt] of this.msgIdCache) {
      if (createdAt.getTime() < limiteTiempo) {
        this.msgIdCache.delete(id);
      }
    }
  }

  destroy() {
    if (this.cleanupInterval)
      clearInterval(this.cleanupInterval);
  }

  /**
   * Cachear retirada de mensaje
   * @param {string} id - ogMessageId||messageId del mensaje retirado
   */
  cacheRetraction(id) {
    this.retractCache.set(id, Date.now());
  }

  /**
   * Comprobar si un mensaje está retirado
   * @param {string} messageId - ogMessageId||messageId del mensaje a comprobar
   * @returns {boolean}
   */
  isRetracted(messageId) {
    this.cleanup();
    return this.retractCache.has(messageId);
  }

  /**
   * Determinar si un mensaje debe reenviarse al frontend
   * @param {Object} payload - Payload del mensaje MQTT
   * @returns {boolean} - true si debe reenviarse, false si debe filtrarse
   */
  shouldForwardMessage(payload) {
    const messageId = payload.id;
    const ogMessageId = payload.ogMessageId;
    const normalizedID = payload.ogMessageId || payload.id;
    const currentCreatedAt = new Date(payload.createdAt);

    // Comprobar no se haya recibido una retirada del mensaeje
    if (this.isRetracted(normalizedID)) {
      console.log(`Filter: Filtrando mensaje retirado ${messageId}`);
      this.filteredMessageCount++;
      return false;
    }

    // Comprobar que no sea una repetición fuera de orden
    const cachedCreatedAt = this.msgIdCache.get(normalizedID);
    if (cachedCreatedAt) {
      if (currentCreatedAt <= cachedCreatedAt) {
        console.log('Filter: Filtrando repetición fuera de orden', 
                    `${messageId} (${currentCreatedAt.toISOString()} <= ${cachedCreatedAt.toISOString()})`);
        this.filteredMessageCount++;
        return false;
      } else {
        console.log(`Filter: Aceptando repetición ${messageId} de ${ogMessageId}`);
        this.msgIdCache.set(normalizedID, currentCreatedAt);
      }
    } else {
      this.msgIdCache.set(normalizedID, currentCreatedAt);
    }

    return true;
  }

  /**
   * Determinar si una retirada debe reenviarse al frontend
   * @param {Object} payload - Payload de la retirada MQTT
   * @returns {boolean} - true si debe reenviarse
   */
  shouldForwardRetract(payload) {
    const messageId = payload.retract;
    const ogMessageId = payload.ogMessageId;
    // Determinar si en la cache de og_ids hay algún mensaje relacionado con éste
    const hasRelated = this.msgIdCache.has(ogMessageId || messageId);

    // Cachear retirada
    this.cacheRetraction(ogMessageId || messageId);

    if (hasRelated) {
//      console.log(`Filter: Reenviando retirada ${messageId}`);
    } else {
      console.log(`Filter: Filtrando retirada ${messageId}`);
      this.filteredRetractCount++;
    }
    return hasRelated;
  }

  /**
   * Obtener estadísticas del filtro para debugging
   * @returns {Object}
   */
  getStats() {
    this.cleanup();
    return {
      retiradosEnCache: this.retractCache.size,
      versionesRegistradas: this.msgIdCache.size,
      cacheTimeout: this.cacheTtlMs
    };
  }

}

module.exports = MessageFilter;