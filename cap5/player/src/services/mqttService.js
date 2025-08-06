/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - CLIENTE MQTT (NODO DE VISUALIZACIÓN)
// cap5/player/src/services/mqttService.js
// =============================================================
const mqtt = require('mqtt');
const EventEmitter = require('events');
const MessageFilter = require('./messageFilter');

// Devuelve true si value es una función
function isFun(value) {
  return (typeof value === 'function');
}

/**
 * Determina los milisegundos transcurridos desde el instante expresado por el parámetro
 * @param {number} since  - Instante (obtenido p.ej. con Date.now() o [Date].getTime())
 * @returns {number} - Milisegundos transcurridos desde el instante expresado por el parámetro
 */
function elapsedMs(since) {
  return since ? (Date.now() - since) : Number.MAX_SAFE_INTEGER;
}

/**
 * Determina si han transcurrido al menos thresholdMs desde el instante expresado por {@link since}
 * @param {number} since - Instante de comienzo del intervalo
 * @param {number} thresholdMs - Longitud del ntervalo expresada en milisegundos
 * @returns {boolean} - Si ha transcurrido la 
 */
function passedMs(since, thresholdMs) {
  return elapsedMs(since) > thresholdMs;
}

class MQTTService extends EventEmitter {
  constructor(serialNo, heartbeatInfoFun) {
    super();
    this.serialNumber = serialNo;
    this.nodeId = null;
    this.client = null;
    this.isConnected = false;
    this.lastConnErrTime = null;
    this.sysSubs = []; // Lista de topics de suscripción - Sistema
    this.msgSubs = []; // Lista de topics de suscripción - Mensajes
    this.heartbeatInterval = null;
    this.heartbeatInfoFun = heartbeatInfoFun;
    this.publishCount = 0; // Cuenta de mensajes publicados
    this.publishErrs = 0;  // Cuenta de errores al publicar
    this.deliverCount = 0  // Cuenta de mensajes recibidos
    this.deliverErrs = 0;  // Cuenta de errores al recibir
    this.messageFilter = new MessageFilter();
  }

  destroy() {
    if (this.messageFilter)
      this.messageFilter.destroy();
    if (this.heartbeatInterval)
      clearInterval(this.heartbeatInterval);
  }

  /**
   * Conectarse al bróker MQTT
   * @param {string} brokerUrl - Cadena con la URL de la forma mqtt://<mqtt_broker_host>
   * @param {Object} options - Opciones de conexión (QoS, LWT etc.)
   */
  async connect(brokerUrl, options = {}) {
    const defaultOptions = {
      clientId: `spptze-player-${this.serialNumber}-${Date.now()}`,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 30000,
      maxReconnectTimes: 20,
      keepalive: process.env.NODE_ENV == 'development' ? 0 : 60,
      reschedulePings: true,
      ...options
    };

    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(brokerUrl, defaultOptions);

      this.client.on('reconnect', () => {
        console.log('MQTT: Attempting to reconnect...');
      });

      this.client.on('offline', () => {
        console.log('MQTT: Connection went offline');
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('MQTT: Connected to broker');
        this.isConnected = true;
        this.lastConnErrTime = null;

        // Suscribirse a topic específico del nodo en el sistema, donde se recibirán mensajes
        //de configuración (suscripciones) y también de control de pantalla
        this.subscribe(`spptze/system/nodes/${this.serialNumber}`, true);
        // Topic para recibir notificaciones de retirada de llamadas
        this.subscribe('spptze/messages/retract', true);

        this.publish('spptze/system/nodeup', { serialNumber: this.serialNumber });

        resolve();
      });

      this.client.on('error', (error) => {
        if (error.code === 'ECONNREFUSED') {
          // Evitar spammear el log de consola con trazas de ECONNREFUSED
          if (passedMs(this.lastConnErrTime, 5 * 60 * 1000)) {
            console.error('MQTT: Connection error:', error);
            this.lastConnErrTime = Date.now();
          } else {
            console.log(`MQTT: Broker unavailable, retrying every ${defaultOptions.reconnectPeriod/1000} seconds...`);
          }
        } else {
          console.error('MQTT: Error:', error);
        }
        if (!this.isConnected) reject(error);
      });

      this.client.on('message', (topic, message) => {
        console.log('MQTT: DELIVER', topic);
        this.handleMessage(topic, message, Date.now());
      });
    });
  }

  /**
   * Desconectarse del bróker MQTT
   */
  async disconnect() {
    if (this.client) {
      await new Promise((resolve) => {
        this.client.end(false, resolve);
      });
      this.isConnected = false;
      console.log('MQTT: Disconnected from broker');
    }
  }


  /**
   * Eliminar la suscripción al topic indicado
   * @param {string} topic - Topic dal que des-suscribirse
   */
  unsubscribe(topic) {
    this.client.unsubscribe(topic);
    console.log(`MQTT: Unsubscribed from ${topic}`);
  }

  /**
   * Suscribirse al topic indicado
   * @param {string} topic - Topic al que suscribirse
   * @param {boolean} system - Indicación de si se trata de una suscripción a un topic de sistema o de distribución de mensajes
   */
  subscribe(topic, system = false) {
    this.client.subscribe(topic, (err) => {
      if (err)
        console.error(`MQTT: Error subscribing to ${topic}: ${err}`);
      else {
        console.log(`MQTT: Subscribed to ${topic}`);
        if (system) {
          this.sysSubs.push(topic);
        } else {
          // Se trata más que nada de evitar que se eliminen las suscripciones 'de sistema' más adelante
          //cuando se reciba la configuración y se invoque handleMessageSubs()
          this.msgSubs.push(topic);
        }
      }
    });
  }

  // El heartbeat se inicia cuando se recibe el mensaje con las suscripciones
  setupHeartbeat(intervalSecs = 60) {
    console.log(`MQTT: Configuring heartbeat every ${intervalSecs} secs`);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      const payload = isFun(this.heartbeatInfoFun) ? this.heartbeatInfoFun() : { serialNumber: this.serialNumber };
      this.publishHeartbeat(payload);
    }, intervalSecs * 1000);
  }



  async publishAck(message) {
    this.publish('spptze/messages/ack', { nodeId: this.nodeId, nodeSerial: this.serialNumber, ...message });
  }

  async publishHeartbeat(payload) {
    if (!this.isConnected) throw new Error('MQTT client not connected');
    this.publish('spptze/system/heartbeat', { nodeId: this.nodeId, mqttStatus: this.getStats(), ...payload });
  }

  /**
   * Publicar mensaje (data) en un topic
   * @param {string} topic - Topic MQTT en el que publicar el mensaje
   * @param {any} data - Datos a publicar
   * @param {Object} [options] - Opciones de publicación (QoS, retain, etc.)
   */
  async publish(topic, data, options = {}) {
    if (!this.isConnected) throw new Error('MQTT client not connected');

    const payload = typeof data === 'string' ? data : JSON.stringify(data);

    return new Promise((resolve, reject) => {
      this.publishCount++;
      this.client.publish(topic, payload, options, (error) => {
        if (error) {
          this.publishErrs++;
          reject(error);
        } else {
          console.log('MQTT: PUBLISH', topic);
          resolve();
        }
      });
    });
  }


  /**
   * Manejar mensajes entregados por el bróker MQTT
   */
  async handleMessage(topic, message, timestamp) {
    this.deliverCount++;
    try {
      const payload = JSON.parse(message.toString());
      
      if (topic.startsWith(`spptze/system/nodes/${this.serialNumber}`)) {
        if (payload.subs) {
          // Mensaje del servidor informando de las suscripciones necesarias 
          await this.handleMessageSubs(payload);
        } else if (payload.volumeLevel !== undefined || payload.powerStatus) {
          // Mensaje para el control de la pantalla, a manejar en player.js
          this.emit('spptze:player:mqtt:control', topic, payload);
        }
      } else if (topic.startsWith('spptze/messages/')) {
        payload.deliveredAt = timestamp;
        if (topic == 'spptze/messages/retract') {
          if (this.messageFilter.shouldForwardRetract(payload)) {
            this.emit('spptze:player:mqtt:retract', topic, payload);
          } else {
            //(1) Mensaje de retirada filtrado porque el mensaje a retirar todavía no
            //ha llegado. Se envía el ACK inmediatamente. Cuando llegue el mensaje a
            //retirar, también será filtrado, caso que se maneja en (2)
            payload.retractedAt = timestamp;
            this.publishAck(payload);
          }
        } else {
          // Mensaje de llamada de turno
          if (this.messageFilter.shouldForwardMessage(payload)) {
            this.emit('spptze:player:mqtt:message', topic, payload);
          } else {
            //(2) Mensaje de llamada filtrado. Puede deberse a un mensaje de retirada o
            //una repetición, en ambos casos entregados fuera de orden.
            this.publishAck(payload);
          }
        }
      } else {
        throw new Error(`No handler for topic '${topic}'`);
      }
    } catch (error) {
      this.deliverErrs++;
      console.error('MQTT: Error handling message:', error);
    }
  }

  async handleMessageSubs(payload) {
    console.log(`MQTT: Received subscriptions for ${this.serialNumber} (${payload.subs.length} topics)`);
    if (payload.nodeId) this.nodeId = payload.nodeId;
    this.setupHeartbeat(payload.heartbeatInterval);
    // Limpiar suscripciones previas
    while (this.msgSubs.length > 0) {
      this.unsubscribe(this.msgSubs.pop());
    }
    for (const topic of payload.subs) {
      // Suscribirse a topics indicados desde el servidor central
      this.subscribe(topic);
    }
  }

  /**
   * Obtener estadísticas del servicio MQTT
   */
  getStats() {
    return {
      nodeSubs: this.msgSubs.length,
      clientId: this.client?.options?.clientId,
      pubCount: this.publishCount,
      pubErrs: this.publishErrs,
      rcvCount: this.deliverCount,
      rcvErrs: this.deliverErrs,
      filter: this.messageFilter.getStats()
    };
  }

}

module.exports = MQTTService;