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

class MQTTService extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.isConnected = false;
    this.nodeSubscriptions = new Map(); // nodeId -> [topics]
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
        this.client.subscribe('spptze/system/nodeup', (err) => {
          if (err) console.error('MQTT: Error subscribing to nodeup:', err);
        });
        
        this.client.subscribe('spptze/messages/ack', (err) => {
          if (err) console.error('MQTT: Error subscribing to ack:', err);
        });
        
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

  /**
   * 
   * @param {string} topic 
   * @param {*} message 
   */
  async publishMessage(topic, message) {
    const data = {
//      id: message.id,
      content: message.content
    };
    if (message.ticket) data.ticket = message.ticket;
    if (message.priority) data.priority = message.priority;
    if (message.channel) data.channel = message.channel;
    if (message.externalRef) data.externalRef = message.externalRef;
    return this.publish(topic, data);
  }

  /**
   * Publicar mensaje (data) en un topic
   * @param {string} topic - Topic MQTT en el que publicar el mensaje
   * 
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
    try {
      const payload = JSON.parse(message.toString());
      
      if (topic === 'spptze/system/nodeup') {
        await this.handleNodeUp(topic, payload);
      } else if (topic === 'spptze/messages/ack') {
        await this.handleMessageAck(topic, payload);
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
   * Manejar ACK de mensaje
   */
  async handleMessageAck(topic, payload) {
    // Hay que actualizar la tupla correspondiente en MessageDelivery (deliveredAt, displayedAt y acknowledgedAt),
    // además del campo lastSeen en DisplayNode
    console.log(`MQTT: ACK from ${payload.nodeId}`);
  
    // Emitir evento para actualizar MessageDelivery
    await nodeManager.messageAck(payload);
//    this.emit('messageAck', { nodeId, ...payload });
  }

  /**
   * Publicar mensaje de llamada de turno
   */
  async publishMessage(topic, message) {
    const messageData = {
      id: message.id,
      channel: message.channel,
      ticket: message.ticket,
      content: message.content,
      priority: message.priority,
      createdAt: message.createdAt
    };

    await this.publish(topic, messageData, { qos: 1 });
    console.log(`MQTT: Published message ${message.id} to ${topic}`);
  }

  /**
   * Obtener estadísticas del servicio MQTT
   */
  getStats() {
    return {
      connected: this.isConnected,
      activeNodeSubscriptions: this.nodeSubscriptions.size,
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

module.exports = new MQTTService();