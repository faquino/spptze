/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - CLIENTE MQTT (SERVIDOR CENTRAL)
// cap5/server/src/services/mqttService.js
// =============================================================
const mqtt = require('mqtt');
const EventEmitter = require('events');
const nodeManager = require('./nodeManager');


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
  constructor() {
    super();
    this.client = null;
    this.isConnected = false;
    this.connectedAt = null;
    this.nodeSubscriptions = new Map(); // nodeId -> [topics]
    this.lastConnErrTime = null;
    this.publishCount = 0; // Cuenta de mensajes publicados
    this.publishErrs = 0;  // Cuenta de errores al publicar
    this.deliverCount = 0  // Cuenta de mensajes recibidos
    this.deliverErrs = 0;  // Cuenta de errores al recibir
  }


  /**
   * Conectarse al bróker MQTT
   * @param {string} brokerUrl - Cadena con la URL de la forma mqtt://<mqtt_broker_host>
   * @param {Object} options - Opciones de conexión (QoS, LWT etc.)
   */
  async connect(brokerUrl, options = {}) {
    const defaultOptions = {
      clientId: `spptze-server-${Date.now()}`,
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
        this.connectedAt = new Date();
        this.lastConnErrTime = null;

        // Suscribirse a topics del sistema
        this.client.subscribe('spptze/system/nodeup', (err) => {
          if (err) console.error('MQTT: Error subscribing to nodeup:', err);
        });

        // Suscribirse a topics del sistema
        this.client.subscribe('spptze/system/heartbeat', (err) => {
          if (err) console.error('MQTT: Error subscribing to heartbeat:', err);
        });

        this.client.subscribe('spptze/messages/ack', (err) => {
          if (err) console.error('MQTT: Error subscribing to ack:', err);
        });

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
   * Manejar mensajes MQTT recibidos
   */
  async handleMessage(topic, message, timestamp) {
    this.deliverCount++;
    try {
      const payload = JSON.parse(message.toString());
      
      if (topic === 'spptze/system/nodeup') {
        await this.handleNodeUp(topic, payload);
      } else if (topic === 'spptze/system/heartbeat') {
        await this.handleNodeHeartbeat(topic, payload);
      } else if (topic === 'spptze/messages/ack') {
        await this.handleMessageAck(topic, payload);
      } else {
        throw new Error(`No handler for topic '${topic}'`);
      }
      
      // Emitir evento para otros componentes
      this.emit('message', { topic, payload });
    } catch (error) {
      console.error('MQTT: Error handling message:', error);
    }
  }

  /**
   * Manejar evento de nodo conectándose
   */
  async handleNodeUp(topic, payload) {
    console.log(`MQTT: Node ${payload.serialNumber} coming up`);
    
    try {
      // Obtener el nodo por el número de serie
      const node = await nodeManager.getNodeBySN(payload.serialNumber);
      
      // Obtener suscripciones para el nodo
      const subscriptions = await nodeManager.getNodeSubscriptions(node);
      
      // Enviar configuración de suscripciones al nodo
      const response = {
        nodeId: node.id,
        heartbeatInterval: process.env.HEARTBEAT_INTERVAL || 60,
        subs: subscriptions
      };
      
      await this.publish(`spptze/system/nodes/${payload.serialNumber}`, response);
      
      // Guardar suscripciones en memoria para... tracking?
      this.nodeSubscriptions.set(node.id, subscriptions);
      
      console.log(`MQTT: Sent ${subscriptions.length} subscriptions to ${payload.serialNumber}`);
    } catch (error) {
      console.error(`MQTT: Error configuring node ${payload.serialNumber}:`, error);
    }
  }

  /**
   * Manejar heartbeat de un nodo
   * @param {string} topic 
   * @param {object} payload 
   */
  async handleNodeHeartbeat(topic, payload) {
    console.log('MQTT: Hearteat from node: ', payload.nodeId || payload.serialNumber);
    if (payload?.serialNumber)
      await nodeManager.getNodeBySN(payload.serialNumber);
    else
      throw new Error('No valid serial in heartbeat message');
    //TODO: Simplemente se refresca lastSeen del nodo en cuestión, aunque el heartbeat 
    // proporciona mucha más info sobre el nodo
  }

  /**
   * Manejar ACK de un mensaje
   */
  async handleMessageAck(topic, payload) {
    // Hay que actualizar la tupla correspondiente en MessageDelivery (deliveredAt, displayedAt y acknowledgedAt),
    // además del campo lastSeen en DisplayNode
    console.log(`MQTT: ACK from ${payload.nodeId}`);
  
    // El id de mensaje en las retiradas ve en el atributo retract
    if (payload.retract) payload.id = payload.retract;

    // Actualizar MessageDelivery
    await nodeManager.messageAck(payload);
  }

  /**
   * Publicar mensaje de llamada de turno
   * @param {string} topic 
   * @param {Object} message 
   */
  async publishMessage(topic, message) {
    const payload = {
      id: message.id,
      channel: message.channel,
      ticket: message.ticket,
      content: message.content,
      priority: message.priority,
      createdAt: message.createdAt
    };
    if (message.ogMessageId) payload.ogMessageId = message.ogMessageId;

    await this.publish(topic, payload, { qos: 1 });
    console.log(`MQTT: Published message ${message.id} to ${topic}`);
  }

  /**
   * Publicar retirade de mensaje
   * @param {string} id - Identificador del mensaje a retirar
   */
  async publishMessageRetract(message) {
    const payload = {
      retract: message.id
    };
    if (message.ogMessageId) payload.ogMessageId = message.ogMessageId;

    await this.publish('spptze/messages/retract', payload);
    console.log(`MQTT: Retracted message ${message.id}`);
  }

  /**
   * Publicar comando de control de nodo
   * @param {string} serial 
   * @param {Object} command 
   */
  async publishControl(serial, command) {
    await this.publish(`spptze/system/nodes/${serial}`, command);
  }

  /**
   * Obtener estadísticas del servicio MQTT
   */
  getStats() {
    return {
      connected: this.isConnected,
      activeNodeSubscriptions: this.nodeSubscriptions.size,
      clientId: this.client?.options?.clientId,
      lastConnect: this.connectedAt,
      pubCount: this.publishCount,
      pubErrs: this.publishErrs,
      rcvCount: this.deliverCount,
      rcvErrs: this.deliverErrs
    };
  }

  /**
   * Desconectar del bróker
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
}

module.exports = new MQTTService();