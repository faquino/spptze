/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Nodo de visualización: MQTT + WebSocket
// cap5/player/src/player.js
// =============================================================
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');  // para ejecutar comandos unix de forma síncrona
const { exec } = require('child_process');  // para ejecutar comandos unix de forma asíncrona
const path = require('path');
const MQTTService = require('./services/mqttService');  // cliente MQTT
const pkgInfo = require('../package.json');  // información del paquete

//TODO: heartbeat al servidor central para informar que el nodo sigue activo

// Para obtener información de la interfaz de red por defecto
// (la que tiene conexión a Internet, o que se usa para conectarse al bróker MQTT)
const getDefaultInterfaceInfo = () => {
  const networkInterfaces = os.networkInterfaces();

  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    
    for (const iface of interfaces) {
      if (!iface.internal && (iface.family === 'IPv4') && (iface.mac !== '00:00:00:00:00:00')) {
        return {
          ifName: interfaceName,
          mac: iface.mac,
          ip: iface.address,
          netmask: iface.netmask
        };
      }
    }
  }
  
  return null;
};

const getSerial = () => {
  try {
    const lines = fs.readFileSync('/proc/cpuinfo', 'utf8').split('\n');
  
    for (const serial_line of lines) {
      if (serial_line.startsWith("Serial")) {
        return serial_line.split(":")[1].slice(1);
      }
    }
  } catch (error) {
    // Si no es posible leer /proc/cpuinfo, usar el número de serie definido en .env
    return process.env.HW_SERIAL_NUMBER || '';
  }
};

const defIfInfo = getDefaultInterfaceInfo();
const mqttClient = new MQTTService(getSerial());

mqttClient.on('spptze:player:mqtt:message', (topic, payload) => {
  // El mensaje recibido vía MQTT se envía a los clientes WebSocket
  socketServer.clients.forEach( (client) => {
    client.send(JSON.stringify(payload));
  });
});

console.log("SPPTZE-player: ejecutando, verificando sistema. cwd: " + process.cwd() + "; mac: " + defIfInfo.mac);


// a partir de aquí el websocket
const WebSocket = require('ws');
const wsPort = process.env.WEBSOCKET_PORT || 80;
const socketServer = new WebSocket.Server({port: wsPort});
socketServer.on('connection', (socketClient) => {
  console.log('New client connected !!!');
  console.log('Number of clients: %d', socketServer.clients.size);

  socketClient.on('message', (data) => {
    const payload = JSON.parse(data);
    if (payload.displayedAt) {
      console.log(`Enviar ACK del mensaje ${payload.id}`);
      mqttClient.publishAck(payload);
    }
  });
});

// Por no incluir aún un template engine via npm (¿ejs, handlebars, pug, etc.?)
function getSystemStatus() {
  return {
    hostname: os.hostname(),
    uptime: os.uptime(),
    cwd: process.cwd(),
    ipAddr: defIfInfo.ip,
    appVer: pkgInfo.version,
    wsPort: wsPort,
    localeString: process.env.LOCALE || 'es-ES'
  };
}

// necesario para el servidor web express
const express = require('express');
//const bodyParser = require('body-parser');
const app = express();

// declaramos la parte estática del servidor, accesible
var publicDir = path.join(__dirname, '../public');
// configurar EJS como template engine
app.set('view engine', 'ejs');

//app.use(bodyParser.json());
app.use('/web', express.static(publicDir));
// TODO ver yarn o vite
// Gestionar manualmente dependencias del frontend como jQuery con NPM por ahora al menos así sus artefactos no van
// a parar al repositorio
app.use('/web/3p/jquery', express.static(path.join(__dirname, '../node_modules/jquery/dist/')));
app.use('/web/3p/fontawesome', express.static(path.join(__dirname, '../node_modules/@fortawesome/fontawesome-free')));


app.get('/', (request, response) => {
  let info = getSystemStatus();
//  info.frases = config.frases || [];
  response.render('player', info);
});


// INICIALIZACIÓN DE SERVICIOS
// =============================================================
async function initializeServices() {
  try {
    console.log('Iniciando servicios...');
    
    // Conexión MQTT
    const mqttBrokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    const mqttOpts = {};
    if (process.env.MQTT_PASS && process.env.MQTT_USER) {
      mqttOpts.username = process.env.MQTT_USER;
      mqttOpts.password = process.env.MQTT_PASS;
    }
    await mqttClient.connect(mqttBrokerUrl, mqttOpts);
    console.log('MQTT conectado');
    
    console.log('Servicios iniciados correctamente');
  } catch (error) {
    console.error('Error iniciando servicios:', error);
    process.exit(1);
  }
}


// MANEJO DE CIERRE ORDENADO DE LA APLICACIÓN
// =============================================================
async function gracefulShutdown() {
  console.log('Cerrando servicios...');

  try {
    await mqttClient.disconnect();
    console.log('MQTT desconectado');
    process.exit(0);
  } catch (error) {
    console.error('Error cerrando servicios:', error);
    process.exit(1);
  }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);


// INICIALIZACIÓN
// =============================================================
async function startPlayer() {
  try {
    //
    await initializeServices();

    const appPort = process.env.APP_PORT || 3000;
    app.listen(appPort, () => {
      console.log('SPPTZE Player - Started successfully');
      console.log('-'.repeat(60));
      console.log(`Página de presentación de llamadas en: http://localhost:${appPort}`);

      console.log('-'.repeat(60));
    });
    
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startPlayer();
}
