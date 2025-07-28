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

function isFun(value) {
  return (typeof value === 'function');
}

class MQTTService extends EventEmitter {
  constructor(serialNo, heartbeatInfoFun) {
    super();
    this.serialNumber = serialNo;
    this.nodeId = null;
    this.client = null;
    this.isConnected = false;
    this.nodeSubscriptions = []; // nodeId -> [topics]
    this.heartbeatInterval = null;
    this.heartbeatInfoFun = heartbeatInfoFun;
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


  /**
   * Conectar al bróker MQTT
   */
  async connect(brokerUrl, options = {}) {
    const defaultOptions = {
      clientId: `spptze-server-${Date.now()}`,
      clean: true,
      connectTimeout: 4000,
      ...options
    };

    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(brokerUrl, defaultOptions);
      
      this.client.on('connect', () => {
        console.log('MQTT: Connected to broker');
        this.isConnected = true;
        
        // Suscribirse a topics del sistema
        this.client.subscribe(`spptze/system/nodes/${this.serialNumber}`, (err) => {
          if (err) console.error('MQTT: Error subscribing to nodeup:', err);
        });

        this.publish('spptze/system/nodeup', { serialNumber: this.serialNumber });
        resolve();
      });

      this.client.on('error', (error) => {
        console.error('MQTT: Connection error:', error);
        reject(error);
      });

      this.client.on('message', (topic, message) => {
        this.handleMessage(topic, message);
      });
    });
  }

  async publishAck(message) {
    this.publish('spptze/messages/ack', { nodeId: this.nodeId, nodeSerial: this.serialNumber, ...message });
  }


  async publishHeartbeat(payload) {
    if (!this.isConnected) throw new Error('MQTT client not connected');
    this.publish('spptze/system/heartbeat', { nodeId: this.nodeId, ...payload });
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
      this.client.publish(topic, payload, options, (error) => {
        if (error) {
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
  async handleMessage(topic, message) {
    const ahora = Date.now();
    console.log('MQTT: DELIVER', topic);
    try {
      const payload = JSON.parse(message.toString());
      
      if (topic === `spptze/system/nodes/${this.serialNumber}`) {
        // Mensaje del servidor informando de las suscripciones necesarias 
        if (payload.subs) await this.handleMessageSubs(payload);
      } else if (topic.startsWith('spptze/messages/')) {
        // Mensaje de llamada de turno
        payload.deliveredAt = ahora;
        this.emit('spptze:player:mqtt:message', topic, payload); // a manejar en player.js
      } else if (topic.startsWith('spptze/control/')) {
        this.emit('spptze:player:mqtt:control', topic, payload); // a manejar en player.js
      } else {
        throw new Error(`No handler for topic '${topic}'`);
      }
    } catch (error) {
      console.error('MQTT: Error handling message:', error);
    }
  }


  async handleMessageSubs(payload) {
    console.log(`MQTT: Received subscriptions for ${this.serialNumber} (${payload.subs.length} topics)`);
    if (payload.nodeId) this.nodeId = payload.nodeId;
    this.setupHeartbeat(payload.heartbeatInterval);
    // Limpiar suscripciones previas
    while (this.nodeSubscriptions.length > 0) {
      const sub = this.nodeSubscriptions.pop();
      this.client.unsubscribe(sub);
      console.log(`MQTT: Unsubscribed from ${sub}`);
    }
    for (const sub of payload.subs) {
      // Suscribirse a topics del sistema
      this.client.subscribe(sub, (err) => {
        if (err)
          console.error(`MQTT: Error subscribing to ${sub}: ${err}`);
        else {
          console.log(`MQTT: Subscribed to ${sub}`);
          this.nodeSubscriptions.push(sub);
        }
      });
    }
  }

  /**
   * Obtener estadísticas del servicio MQTT
   */
  getStats() {
    return {
      connected: this.isConnected,
      activeNodeSubscriptions: this.nodeSubscriptions.length,
      clientId: this.client?.options?.clientId
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

module.exports = MQTTService;