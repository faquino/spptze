/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Nodo de visualización: MQTT + WebSocket
// cap6/player/src/player.js
// =============================================================
const os = require('os');
const fs = require('fs');
const path = require('path');
const pkgInfoVersion = require('../package.json').version;  // información del paquete
const WebSocket = require('ws');
const MQTTService = require('./services/mqttService');  // Cliente MQTT
const CECControlService = require('./services/cecControl'); // Control CEC
const wsPort = process.env.WEBSOCKET_PORT || 3080;
const templateRenderer = require('./services/templateRenderer');


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

// Intentar obtener el número de serie de la placa Raspberry Pi. se devuelve la variable de entorno
//HW_SERIAL_NUMBER en caso de error
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
const serial = getSerial();

// Devuelve una función que recopila información del servidor WebSocket y el control CEC para adjuntar
// en el heartbeat al servidor central para informar que el nodo sigue activo. Dicha función se le pasa
// al componente MQTTClient, que la invoca en cada heartbeat.
const getHeartBeatInfoFun = (socketServer, cecControl) => {
  return () => {
    return { serialNumber: serial,
             systemInfo: getSystemInfo(),
             socketClients: socketServer.clients.size,
             cecStatus: cecControl.getStatus(),
             templateId: templateRenderer.getTemplateId() };
  };
};

const defIfInfo = getDefaultInterfaceInfo();
console.log(`SPPTZE-player running - Version: ${pkgInfoVersion}; CWD: ${process.cwd()}; MAC: ${defIfInfo.mac}`);

function getSystemInfo() {
  return {
    hostname: os.hostname(),
    uptime: os.uptime(),
    cwd: process.cwd(),
    ipAddr: defIfInfo.ip,
    appVer: pkgInfoVersion,
    wsPort: wsPort,
    localeString: process.env.LOCALE || 'es-ES'
  };
}



const initCECControl = async () => {
  const cecControl = new CECControlService();
  await cecControl.initialize();
  return cecControl;
};

const initMQTTClient = async (serial, getHeartbeatInfo) => {
  const mqttClient = new MQTTService(serial, getHeartbeatInfo);
  const mqttBrokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
  const mqttOpts = {};
  if (process.env.MQTT_PASS && process.env.MQTT_USER) {
    mqttOpts.username = process.env.MQTT_USER;
    mqttOpts.password = process.env.MQTT_PASS;
  }
  await mqttClient.connect(mqttBrokerUrl, mqttOpts);
  return mqttClient;
};

const initWebSocketServer = () => {
  const socketServer = new WebSocket.Server({port: wsPort});
  return socketServer;
};


const express = require('express');
const app = express();

// configurar EJS como template engine
app.set('view engine', 'ejs');

// configurar el origen de los recursos web estáticos
app.use('/web', express.static(path.join(__dirname, '..', 'public')));
// Gestionar manualmente dependencias del frontend como jQuery con NPM por ahora al menos así sus artefactos no van
// a parar al repositorio
// TODO ver yarn o vite?
app.use('/web/3p/jquery', express.static(path.join(__dirname, '..' , 'node_modules', 'jquery', 'dist')));
app.use('/web/3p/fontawesome', express.static(path.join(__dirname, '..' , 'node_modules', '@fortawesome', 'fontawesome-free')));


app.get('/legacy', (request, response) => {
  let info = getSystemInfo();
//  info.frases = config.frases || [];
  response.render('player', info);
});

app.get('/', async (req, res) => {
  try {
    const html = await templateRenderer.renderPage(getSystemInfo());
    res.type('html').send(html);
  } catch (error) {
    console.error('Error rendering page:', error);
    res.status(500).send('<h1>Error loading display</h1>');
  }
});

// INICIALIZACIÓN DE SERVICIOS
// =============================================================
async function initializeServices() {
  try {
    console.log('Starting services...');
    await templateRenderer.initialize();
    const socketServer = initWebSocketServer();
    const cecControl = await initCECControl();
    //TODO: la app debería arrancar incluso sin conexión MQTT
    const mqttClient = await initMQTTClient(serial, getHeartBeatInfoFun(socketServer, cecControl));

    socketServer.on('connection', (socketClient) => {
      console.log('WS: New client connected !!!');
      console.log('WS: Number of clients: %d', socketServer.clients.size);

      socketClient.on('message', (data) => {
        const payload = JSON.parse(data);
        if (payload.displayedAt) {
          console.log(`Publishing ACK for message ${payload.id}`);
          mqttClient.publishAck(payload);
        } else if (payload.retractedAt) {
          console.log(`Publishing ACK for retraction ${payload.retractedAt}`)
          mqttClient.publishAck(payload);
        }
      });
    });

    // Recibido mensaje de llamada via MQTT
    mqttClient.on('spptze:player:mqtt:message', (topic, payload) => {
      // Se deriva a los clientes WebSocket (UI en navegador)
      socketServer.clients.forEach( (client) => {
        client.send(JSON.stringify(payload));
      });
    });

    // Recibida retirada de llamada via MQTT
    mqttClient.on('spptze:player:mqtt:retract', (topic, payload) => {
      // Se deriva a los clientes WebSocket (UI en navegador)
      socketServer.clients.forEach( (client) => {
        client.send(JSON.stringify(payload));
      });
    });

    // Recibido mensaje de control de pantallas
    mqttClient.on('spptze:player:mqtt:control', (topic, payload) => {
      // Se procesa en cecControl
      cecControl.processControlCommand(payload);
    });

    // Se ha recibido una plantilla por configuración (nodeUp) o actualización
    mqttClient.on('spptze:player:mqtt:template', (template) => {
      templateRenderer.updateTemplate(template);
    });

    console.log('Services started successfully');

    // Se devuelve la función para detener los servicios de forma ordenada
    return async () => {
      console.log('Stopping services...');

      try {
        if (mqttClient) {
          await mqttClient.disconnect();
          mqttClient.destroy();
        }
        if (socketServer) socketServer.close();
        process.exit(0);
      } catch (error) {
        console.error('Error stopping services:', error);
        process.exit(1);
      }
    };

  } catch (error) {
    console.error('Error starting services:', error);
    process.exit(1);
  }
}


// INICIALIZACIÓN
// =============================================================
async function startPlayer() {
  try {
    // Manejo de cierre de forma ordenada en caso de interrupción o terminación
    const gracefulShutdown = await initializeServices();
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
    
    const appPort = process.env.APP_PORT || 3000;
    app.listen(appPort, () => {
      console.log('SPPTZE Player - Started successfully');
      console.log('-'.repeat(60));
      console.log(`Queue calling display interface at: http://localhost:${appPort}`);
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
