/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Filtrado de mensajes
// cap6/player/src/services/messageFilter.js
// =============================================================

/**
 * Aunque MQTT garantiza la entrega en el mismo orden de publicación para los mensajes de un mismo cliente en el msimo
 * topic, NO ES El CASO para los mensajes de topics o clientes diferentes. En el caso de SPPTZE, los mensajes de
 * llamada y sus repeticiones pueden publicarse en topics (destinos) diferentes, y los de retirada se publican siempre
 * en un topic distinto al del mensaje a retirar. Esto implica que pueden producirse entregas de mensajes fuera del
 * orden de publicación. La identificación de entregas fuera de orden, como p.ej:
 * - Retirada antes que mensaje: se filtra el mensaje cuando llegue
 * - Repetición fuera de orden: se ignoran repeticiones con timestamp anterior
 * Y su filtrado evitan tener que manejar dichos casos en la UI del nodo (y tráfico WebSocket)
 */
class MessageFilter {
  constructor() {
    this.retractCache = new Map();   // messageId -> timestamp
    // Se normaliza un mensaje y todas sus repeticiones en la misma entrada de caché
    this.ogIdCache = new Map();      // ogMessageId||messageId -> latestCreatedAt
    this.cacheTtlMs = 5 * 60 * 1000; // 5 minutos TTL
    this.cleanupInterval = setInterval(() => { this.cleanup(); }, 60 * 1000); // Limpieza de caches cada minuto

    // Cuenta de filtrados
    this.filteredMessageCount = 0;
    this.filteredRetractCount = 0;
  }

  /**
   * Eliminar entradas antiguas de las cachés
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
    for (const [id, createdAt] of this.ogIdCache) {
      if (createdAt.getTime() < limiteTiempo) {
        this.ogIdCache.delete(id);
      }
    }
  }

  /**
   * Liberar recursos
   */
  destroy() {
    if (this.cleanupInterval)
      clearInterval(this.cleanupInterval);
  }

  /**
   * Cachear retirada de mensaje
   * @param {string} id - messageId del mensaje retirado
   */
  cacheRetraction(id) {
    this.retractCache.set(id, Date.now());
  }

  /**
   * Comprobar si un mensaje está retirado
   * @param {string} messageId - messageId del mensaje a comprobar
   * @returns {boolean}
   */
  isRetracted(messageId) {
    this.cleanup();
    return this.retractCache.has(messageId);
  }

  /**
   * Determinar si un mensaje debe reenviarse al frontend o filtrarse si, p.ej. se ha
   * recibido anteriormente una retirada (fuera de orden) de dicho mensaje o se ha
   * recibido anteriormente una repetición más reciente (fuera de orden) de dicho mensaje
   * @param {Object} payload - Payload del mensaje MQTT
   * @returns {Object} - { fwd: true si debe reenviarse, o false si debe filtrarse,
   *                       ack: true si debe enviarse ack, o false en caso contrario }
   */
  shouldForwardMessage(payload) {
    const messageId = payload.id;
    const ogMessageId = payload.ogMessageId;
    // Normalizar ID (ver definición de this.ogIdCache)
    const normalizedID = payload.ogMessageId || payload.id;
    const payloadCreatedAt = new Date(payload.createdAt);

    // Comprobar que no se haya recibido ya una retirada del mensaeje
    if (this.isRetracted(messageId)) {
      console.log(`Filter: Filtrando mensaje retirado ${messageId}`);
      this.filteredMessageCount++;
      return { fwd: false, ack: false };
    }

    // Comprobar que no sea una repetición fuera de orden
    const cachedCreatedAt = this.ogIdCache.get(normalizedID);
    if (cachedCreatedAt) {
      if (payloadCreatedAt <= cachedCreatedAt) {
        console.log('Filter: Filtrando repetición fuera de orden', 
                    `${messageId} (${payloadCreatedAt.toISOString()} <= ${cachedCreatedAt.toISOString()})`);
        this.filteredMessageCount++;
        return { fwd: false, ack: true };
      } else {
        console.log(`Filter: Reenviando repetición ${messageId} de ${ogMessageId}`);
        this.ogIdCache.set(normalizedID, payloadCreatedAt);
      }
    } else {
      this.ogIdCache.set(normalizedID, payloadCreatedAt);
    }

    return { fwd: true };
  }

  /**
   * Determinar si una retirada debe reenviarse al frontend web o ha de filtrarse
   * si, p.ej. no ha llega todavía el mensaje a retirar
   * @param {Object} payload - Payload de la retirada MQTT
   * @returns {boolean} - true si debe reenviarse, o false si debe filtrarse
   */
  shouldForwardRetract(payload) {
    const messageId = payload.retract;
    const ogMessageId = payload.ogMessageId;
    // Determinar si en la cache de og_ids hay algún mensaje relacionado con este
    const hasRelated = this.ogIdCache.has(ogMessageId || messageId);

    // Cachear id del mensaje a retirar
    this.cacheRetraction(messageId);

    if (hasRelated) {
      console.log(`Filter: Reenviando retirada ${messageId}`);
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
      retractCacheSize: this.retractCache.size,
      msgIdCacheSize: this.ogIdCache.size,
      cacheTimeout: this.cacheTtlMs,
      filteredMessages: this.filteredMessageCount,
      filteredRetracts: this.filteredRetractCount
    };
  }

}

module.exports = MessageFilter;