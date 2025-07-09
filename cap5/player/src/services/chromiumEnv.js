/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - ENTORNO DE EJECUCIÓN DEL NAVEGADOR
// cap5/player/src/services/chromiumEnv.js
// =============================================================

const displayEnvironmentInfo = () => {
  var stdout = "";
  
  var salidaComando = 0;  // util para retener temporalmente salida de ejecucion de comando
  var modoPantallasConfiguradas = "X"; // OJO: numero de pantallas activas detectadas puede ser "A" "B" y "AB"
  var estaPantallaAConfigurada = 0; // Correspondiente al HDMI-1
  var estaPantallaBConfigurada = 0; // Correspondiente al HDMI-2
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
    console.log('spptze-player: entorno x11 --SI-- se está ejecunto: OK'); 
  } else {
    console.log('spptze-player: entorno x11 --NO-- se está ejecunto: FAIL ' + salidaComando); 
    // comento la siguiente linea porque no se detecta bien desde shell " systemctl start spptze-player "
    //process.exit();  
  }
  // 10) - fin 
  
  
  //  20) ver configuración de los HDMI y saber estado
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
    console.log('spptze-player: pantalla HDMI-1 configurada: OK');
    estaPantallaAConfigurada = 1;
  } else {
    console.log('spptze-player: pantalla HDMI-1 NO configurada ' + salidaComando);
  };
  
  // HDMI-2
  stdout = execSync(' export DISPLAY=:0 ; xrandr --current | grep "HDMI-2"  | wc -l ');
  salidaComando = stdout[0];  // es el primer caracter en valor ascii
  
  // si tiene 49 es que hay una pantalla, si tiene 50 es que son 2
  if (salidaComando == 49) {
    console.log('spptze-player: pantalla HDMI-2 configurada: OK');
    estaPantallaBConfigurada = 1;
  } else {
    console.log('spptze-player: pantalla HDMI-2 NO configurada ' + salidaComando);
  };
  
  
  if (estaPantallaAConfigurada + estaPantallaBConfigurada == 0) {
    console.log('spptze-player: NINGUNA pantalla configurada: FAIL ');
    // comento la siguiente linea porque no se detecta bien desde shell " systemctl start spptze-player "
    //process.exit();
  } else if (estaPantallaAConfigurada + estaPantallaBConfigurada == 2) {
    modoPantallasConfiguradas = "AB";
  } else if (estaPantallaAConfigurada == 1) {
    modoPantallasConfiguradas = "A";
  } else {
    modoPantallasConfiguradas = "B";
  }
  console.log('spptze-player: Modo de pantalla configurada: ' + modoPantallasConfiguradas);
  
  
  // ver si se está duplicando el escritorio, es decir, dos pantallas pero se clona la imagen
  stdout = execSync(' export DISPLAY=:0 ; xrandr --current | grep "+0+0" | wc -l ');
  salidaComando = stdout[0];  // es el primer caracter en valor ascii
  if (salidaComando == 49) {
    estaClonadaAenB = 0;
    console.log('spptze-player: pantalla(s) NO clonadas: ' + modoPantallasConfiguradas);
  }
  if (salidaComando == 50) {
    estaClonadaAenB = 0;
    console.log('spptze-player: pantalla(s) SI clonadas: ' + modoPantallasConfiguradas);
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
      console.log('spptze-player: Pantalla A encencida ' + modoPantallasConfiguradas);
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
      console.log('spptze-player: Pantalla B encencida ' + modoPantallasConfiguradas);
    } else {
      estaPantallaBEncendida = 0;
    }
  }
  
  
  // ver si hay tantas encendidas como configuradas
  if (estaPantallaAConfigurada + estaPantallaBConfigurada == estaPantallaAEncendida + estaPantallaBEncendida) {
    console.log('spptze-player: Pantalla(s) configurada(s) y encendida(s) ' + modoPantallasConfiguradas);
  }

};

const launchChromium = () => {
  // Iniciar navegador en modo kiosko en las pantallas disponibles (ver url)
  //     ===========================================================================
  
  // matamos, por si existe por ser un reinicio, el 'chromium-broser'
  try {
    stdout = execSync(' pkill chromium-b ');
    salidaComando = stdout[0];  // es el primer caracter en valor ascii
  } catch (error) {
    //console.error(error);
    console.log('spptze-player: No se ha encontrado ningún proceso chromium ');
  }
  
  // aquí se llega con todo OK (pantallas y demás)
  // en funcion de la configuración de pantallas para la raspberry ejecutamos chromium con unas opciones u otras
  console.log('spptze-player: ... intentando lanzar un procesho chromium ...');
  if (modoPantallasConfiguradas == "AB" || estaClonadaAenB == 0) { // este es el caso en el que se está extendiendo escritorio
      // abrir dos chrome: uno por cada pantalla y para a y para b
      console.log('spptze-player: PTE ejecutar 2 chromium, va uno sólo: ' + modoPantallasConfiguradas + ' clonadas:' + estaClonadaAenB);
  /*
      try {
        //stdout = execSync( ' runuser -l pi -c "export DISPLAY=:0 ; chromium-browser --kiosk http://localhost:3000?monitor=A  & " ');  // 
        //stdout = execSync(' export DISPLAY=:0 ; chromium  --app=http://localhost:3000?monitor=A  --kiosk &');  // 
        //stdout = execSync(' export DISPLAY=:0 ; chromium-browser --app="http://localhost:3000?monitor=A"  --kiosk & ');  // 
        //salidaComando = stdout[0];  // es el primer caracter en valor ascii
      } catch (error) {
        console.error(error);
        console.log('spptze-player: FALLO (1) al lanzar proceso chromium: ' + modoPantallasConfiguradas + ' clonadas:' + estaClonadaAenB);
      }
  */
    stdout = exec (config.browserCMD, (err, stdout, stderr) => {
      if (err) {
        // node couldn't execute the command
        console.log(`spptze-player: OJO Ha fallado la ejecución del chromium-browser; ERR: ${err.message}`);
        process.exit(1);
      }
      // the *entire* stdout and stderr (buffered)
      //console.log(`stdout: ${stdout}`);
      //console.log(`stderr: ${stderr}`);
    });
  
  } else {  // estamos con una sola pantalla, la A o la B, pero vamos en modo A, ya que es una sola
    console.log('spptze-player: ejecutamos 1 chromium, va uno sólo: ' + modoPantallasConfiguradas + ' clonadas:' + estaClonadaAenB);
    try {
      //stdout = execSync( ' runuser -l pi -c "export DISPLAY=:0 ; chromium-browser --kiosk http://localhost:3000?monitor=A & " ');  // 
      //stdout = execSync(' export DISPLAY=:0 ; chromium  --app=http://localhost:3000?monitor=A  --kiosk & ');  // 
      stdout = execSync(" export DISPLAY=:0 ; chromium  http://localhost:3000?monitor=A & ");  // 
      salidaComando = stdout[0];  // es el primer caracter en valor ascii
    } catch (error) {
      console.error(error);
      console.log('spptze-player: FALLO (2) al lanzar proceso chromium: ' + modoPantallasConfiguradas + ' clonadas:' + estaClonadaAenB);
    }
  }

  // Ocultar puntero de ratón (requiere instalación del paquete 'unclutter')
  //===========================================================================
  exec(' runuser -l pi -c " export DISPLAY=:0 ; unclutter -idle 0" ', (err, stdout, stderr) => {
    console.log('spptze-player: ocultado puntero ratón');
  });
  // es este el punto final?
  //console.log('spptze-player: READY: modo pantallas: ' + modoPantallasConfiguradas + ' clonadas:' + estaClonadaAenB);
};

module.exports = launchChromium;