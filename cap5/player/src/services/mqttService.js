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


class MQTTService extends EventEmitter {
  constructor(serialNo) {
    super();
    this.serialNumber = serialNo;
    this.nodeId = null;
    this.client = null;
    this.isConnected = false;
    this.nodeSubscriptions = []; // nodeId -> [topics]
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

  /**
   * Publicar mensaje (data) en un topic
   * @param {string} topic - Topic MQTT en el que publicar el mensaje
   * @param {any} data - Datos a publicar
   * @param {Object} [options] - Opciones de publicación (QoS, retain, etc.)
   */
  async publish(topic, data, options = {}) {
    if (!this.isConnected) {
      throw new Error('MQTT client not connected');
    }

    const payload = typeof data === 'string' ? data : JSON.stringify(data);

    return new Promise((resolve, reject) => {
      this.client.publish(topic, payload, options, (error) => {
        if (error) {
          reject(error);
        } else {
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
    try {
      const payload = JSON.parse(message.toString());
      
      if (topic === `spptze/system/nodes/${this.serialNumber}`) {
        // Mensaje del servidor informando de las suscripciones necesarias 
        if (payload.subs) await this.handleMessageSubs(payload);
      } else if (topic.startsWith('spptze/messages/')) {
        // Mensaje de llamada de turno
        payload.deliveredAt = ahora;
        this.emit('spptze:mqtt:message', topic, payload);  // a manejar en player.js
      }
    } catch (error) {
      console.error('MQTT: Error handling message:', error);
    }
  }


  async handleMessageSubs(payload) {
    console.log(`MQTT: Received subscriptions for ${this.serialNumber} (${payload.subs.length} topics)`);
    if (payload.nodeId) this.nodeId = payload.nodeId;
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