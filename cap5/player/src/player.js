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
  
    var x = 0;
    var serial_line = "";
    while (x < lines.length) {
      serial_line = lines[x];
      if (serial_line.startsWith("Serial")) {
        return serial_line.split(":")[1].slice(1);
      }
      x++;
    }
  } catch (error) {
    // Si no es posible leer /proc/cpuinfo, usar el número de serie definido en .env
    return process.env.HW_SERIAL_NUMBER || '';
  }
};

const defIfInfo = getDefaultInterfaceInfo();
const mqttClient = new MQTTService(getSerial());

mqttClient.on('spptze:mqtt:message', (topic, payload) => {
  // El mensaje recibido vía MQTT se envía a los clientes WebSocket
  socketServer.clients.forEach( (client) => {
    client.send(JSON.stringify(payload));
  });
});

console.log("SPPTZE-player: ejecutando, verificando sistema. cwd: " + process.cwd() + "; mac: " + defIfInfo.mac);


const displayEnvironmentInfo = () => {
  var stdout = "";
  
  var salidaComando = 0;  // util para retener temporalmente salida de ejecucion de comando
  var modoPantallasConfiguradas = "X"; // OJO: numero de pantallas activas detectadas puede ser "A" "B" y "AB"
  var estaPantallaAConfigurada = 0; // Correspondiente al hdmi-1
  var estaPantallaBConfigurada = 0; // Correspondiente al hdmi-2
  var estaPantallaAEncendida = 0; // cec
  var estaPantallaBEncendida = 0; // cec
  var estaClonadaAenB = 0;
  
  //  10) controlar que todos los pasos a dar se realizan correctamente
  //      =============================================================
  salidaComando = 0;
  // Ejecutar el comando    " ps -U pi  | grep lxsession | wc -l  "
  stdout = execSync(' ps -aU pi | grep lxsession | wc -l');
  salidaComando = stdout[0];  // es el primer caracter en valor ascii
  
  // Si no se están ejecutando las X11 (lxsession), deberiamos lanzarlas (o no)
  // si tiene 49 es que sí se está ejecutando lxsession
  if (salidaComando == 49) {
    console.log('qicio: entorno x11 --SI-- se está ejecunto: OK'); 
  } else {
    console.log('qicio: entorno x11 --NO-- se está ejecunto: FAIL ' + salidaComando); 
    // comento la siguiente linea porque no se detecta bien desde shell " systemctl start qicio "
    //process.exit();  
  }
  // 10) - fin 
  
  
  //  20) ver configuración de los hdmi y saber estado
  //      ============================================================================
  salidaComando = 0;
  // Hay dos posibilidades, usar el kmsprint o usar xrandr, me decanto por la segunda
  
  // Usando el comando    " kmsprint | grep Connector  "
  // pero filtrándolo para saber si hay alguna conectada " kmsprint | grep \(conn | wc -l "
  // const stdout2 = execSync(' kmsprint | grep \\(conn | wc -l ');  // debemos escapar la barra
  
  // pero prefiero 'xrandr' y hacerlo por cada pantalla, si tenemos una o dos pero controlando cuál
  //  ' export DISPLAY=:0 ; xrandr --current | grep "HDMI-1" | wc -l '
  
  // HDMI-1
  stdout = execSync(' export DISPLAY=:0 ; xrandr --current | grep "HDMI-1"  | wc -l ');
  salidaComando = stdout[0];  // es el primer caracter en valor ascii
  
  // si tiene 49 es que hay una pantalla, si tiene 50 es que son 2
  if (salidaComando == 49) {
    console.log('qicio: pantalla HDMI-1 configurada: OK');
    estaPantallaAConfigurada = 1;
  } else {
    console.log('qicio: pantalla HDMI-1 NO configurada ' + salidaComando);
  };
  
  // HDMI-2
  stdout = execSync(' export DISPLAY=:0 ; xrandr --current | grep "HDMI-2"  | wc -l ');
  salidaComando = stdout[0];  // es el primer caracter en valor ascii
  
  // si tiene 49 es que hay una pantalla, si tiene 50 es que son 2
  if (salidaComando == 49) {
    console.log('qicio: pantalla HDMI-2 configurada: OK');
    estaPantallaBConfigurada = 1;
  } else {
    console.log('qicio: pantalla HDMI-2 NO configurada ' + salidaComando);
  };
  
  
  if (estaPantallaAConfigurada + estaPantallaBConfigurada == 0) {
    console.log('qicio: NINGUNA pantalla configurada: FAIL ');
    // comento la siguiente linea porque no se detecta bien desde shell " systemctl start qicio "
    //process.exit();
  } else if (estaPantallaAConfigurada + estaPantallaBConfigurada == 2) {
    modoPantallasConfiguradas = "AB";
  } else if (estaPantallaAConfigurada == 1) {
    modoPantallasConfiguradas = "A";
  } else {
    modoPantallasConfiguradas = "B";
  }
  console.log('qicio: Modo de pantalla configurada: ' + modoPantallasConfiguradas);
  
  
  // ver si se está duplicando el escritorio, es decir, dos pantallas pero se clona la imagen
  stdout = execSync(' export DISPLAY=:0 ; xrandr --current | grep "+0+0" | wc -l ');
  salidaComando = stdout[0];  // es el primer caracter en valor ascii
  if (salidaComando == 49) {
    estaClonadaAenB = 0;
    console.log('qicio: pantalla(s) NO clonadas: ' + modoPantallasConfiguradas);
  }
  if (salidaComando == 50) {
    estaClonadaAenB = 0;
    console.log('qicio: pantalla(s) SI clonadas: ' + modoPantallasConfiguradas);
  }
  
  // 30) Chequear si están encendidas las pantallas
  //     ================================================================================
  
  // Ver si, estando configurada la pantalla A, está encendica
  if (estaPantallaAConfigurada == 1) {
    stdout = execSync(" cec-ctl -d/dev/cec0 --to 0 --image-view-on ");  // encendemos, por si estaba apagada
    stdout = execSync(" cec-ctl -d/dev/cec0 --playback -S  | grep ': On' | wc -l ");  // comprobamos si está realmente encendida 
    salidaComando = stdout[0];  // es el primer caracter en valor ascii
    if (salidaComando == 49) {
      estaPantallaAEncendida = 1;
      console.log('qicio: Pantalla A encencida ' + modoPantallasConfiguradas);
    } else {
      estaPantallaAEncendida = 0;
    }
  }
  
  // Ver si, estando configurada la pantalla B, está encendica
  if (estaPantallaBConfigurada == 1) {
    stdout = execSync(" cec-ctl -d/dev/cec1 --to 0 --image-view-on ");  // encendemos, por si estaba apagada
    stdout = execSync(" cec-ctl -d/dev/cec1 --playback -S  | grep ': On' | wc -l ");  // comprobamos si está realmente encendida 
    salidaComando = stdout[0];  // es el primer caracter en valor ascii
    if (salidaComando == 49) {
      estaPantallaBEncendida = 1;
      console.log('qicio: Pantalla B encencida ' + modoPantallasConfiguradas);
    } else {
      estaPantallaBEncendida = 0;
    }
  }
  
  
  // ver si hay tantas encendidas como configuradas
  if (estaPantallaAConfigurada + estaPantallaBConfigurada == estaPantallaAEncendida + estaPantallaBEncendida) {
    console.log('qicio: Pantalla(s) configurada(s) y encendida(s) ' + modoPantallasConfiguradas);
  }

};



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


const launchChromium = () => {
  // Iniciar navegador en modo kiosko en las pantallas disponibles (ver url)
  //     ===========================================================================
  
  // matamos, por si existe por ser un reinicio, el 'chromium-broser'
  try {
    stdout = execSync(' pkill chromium-b ');
    salidaComando = stdout[0];  // es el primer caracter en valor ascii
  } catch (error) {
    //console.error(error);
    console.log('qicio: No se ha encontrado ningún proceso chromium ');
  }
  
  // aquí se llega con todo OK (pantallas y demás)
  // en funcion de la configuración de pantallas para la raspberry ejecutamos chromium con unas opciones u otras
  console.log('qicio: ... intentando lanzar un procesho chromium ...');
  if (modoPantallasConfiguradas == "AB" || estaClonadaAenB == 0) { // este es el caso en el que se está extendiendo escritorio
      // abrir dos chrome: uno por cada pantalla y para a y para b
      console.log('qicio: PTE ejecutar 2 chromium, va uno sólo: ' + modoPantallasConfiguradas + ' clonadas:' + estaClonadaAenB);
  /*
      try {
        //stdout = execSync( ' runuser -l pi -c "export DISPLAY=:0 ; chromium-browser --kiosk http://localhost:3000/web/qicio.html?monitor=A  & " ');  // 
        //stdout = execSync(' export DISPLAY=:0 ; chromium  --app=http://localhost:3000/web/qicio.html?monitor=A  --kiosk &');  // 
        //stdout = execSync(' export DISPLAY=:0 ; chromium-browser --app="http://localhost:3000/web/qicio.html?monitor=A"  --kiosk & ');  // 
        //salidaComando = stdout[0];  // es el primer caracter en valor ascii
      } catch (error) {
        console.error(error);
        console.log('qicio: FALLO (1) al lanzar proceso chromium: ' + modoPantallasConfiguradas + ' clonadas:' + estaClonadaAenB);
      }
  */
    stdout = exec (config.browserCMD, (err, stdout, stderr) => {
      if (err) {
        // node couldn't execute the command
        console.log(`qicio: OJO Ha fallado la ejecución del chromium-browser; ERR: ${err.message}`);
        process.exit(1);
      }
      // the *entire* stdout and stderr (buffered)
      //console.log(`stdout: ${stdout}`);
      //console.log(`stderr: ${stderr}`);
    });
  
  } else {  // estamos con una sola pantalla, la A o la B, pero vamos en modo A, ya que es una sola
    console.log('qicio: ejecutamos 1 chromium, va uno sólo: ' + modoPantallasConfiguradas + ' clonadas:' + estaClonadaAenB);
    try {
      //stdout = execSync( ' runuser -l pi -c "export DISPLAY=:0 ; chromium-browser --kiosk http://localhost:3000/web/qicio.html?monitor=A & " ');  // 
      //stdout = execSync(' export DISPLAY=:0 ; chromium  --app=http://localhost:3000/web/qicio.html?monitor=A  --kiosk & ');  // 
      stdout = execSync(" export DISPLAY=:0 ; chromium  http://localhost:3000/web/qicio2.html?monitor=A & ");  // 
      salidaComando = stdout[0];  // es el primer caracter en valor ascii
    } catch (error) {
      console.error(error);
      console.log('qicio: FALLO (2) al lanzar proceso chromium: ' + modoPantallasConfiguradas + ' clonadas:' + estaClonadaAenB);
    }
  }

  // Ocultar puntero de ratón (requiere instalación del paquete 'unclutter')
  //===========================================================================
  exec(' runuser -l pi -c " export DISPLAY=:0 ; unclutter -idle 0" ', (err, stdout, stderr) => {
    console.log('qicio: ocultado puntero ratón');
  });
};
  
// es este el punto final?
//console.log('qicio: READY: modo pantallas: ' + modoPantallasConfiguradas + ' clonadas:' + estaClonadaAenB);


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
      console.log('SPPTZE Player started successfully');
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
