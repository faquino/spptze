/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - CONTROL HDMI-CEC (NODO DE VISUALIZACIÓN)
// cap5/player/src/services/cecControl.js
// =============================================================
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class CECControlService {
  constructor() {
    this.initializing = false;
    this.initialized = false;
    this.available = false;
    this.cecCtlVersion = null;
    this.devicePath = null;
    this.physicalAddress = null;
    this.tvConnected = false;
    this.tvPowerStatus = 'unknown';
    this.lastError = null;
    this.commandQueue = [];
    this.processing = false;
    this.lastCommand = null;
    this.lastCommandTime = null;
    this.commandCount = 0;
    this.errorCount = 0;

    // Configuración
    this.commandDelay = 100; // ms entre comandos CEC
  }

  /**
   * Inicializa el servicio CEC: discovery de dispositivos y setup
   */
  async initialize() {
    if (this.initializing) {
      console.log("CEC: Already initializing ALWAYS call initialize() using 'await'");
    }
    this.initializing = true;
    console.log('CEC: Discovering devices...');

    try {
      // Verificar que cec-ctl está disponible
      await this.checkCecCtlAvailable();

      // Obtener dispositivos CEC disponibles
      const devices = await this.discoverCecDevices();
      if (devices.length === 0) throw new Error('CEC: No devices found');
      console.log('CEC: Devices: ', JSON.stringify(devices));

      // Para cada dispositivo, verificar si hay TV conectado
      const tvDevice = await this.findTvDevice(devices);

      if (!tvDevice) throw new Error('CEC: No TV connected to any CEC device');

      // Establecer conexión playback con el TV
      await this.establishPlaybackConnection(tvDevice);

      // Obtener physical address
      this.physicalAddress = await this.getPhysicalAddress(tvDevice);

      // Actualizar estado de energía del TV
      await this.updateTvPowerStatus();

      this.devicePath = tvDevice;
      this.available = true;
      this.initialized = true;
      this.lastError = null;

      console.log(`CEC: SUCESS: Device: ${this.devicePath}; Physical Address: ${this.physicalAddress}; TV Power Status: ${this.tvPowerStatus}`);

    } catch (error) {
      this.available = false;
      this.initialized = false;
      this.lastError = error.message;
      console.log('CEC: Feature unavailable; Error:', error.message);

    } finally {
      this.initializing = false;
    }
  }

  /**
   * Verifica que el comando cec-ctl está disponible y captura su versión
   */
  async checkCecCtlAvailable() {
    try {
      const { stdout } = await execAsync('cec-ctl --version', { timeout: 1000 });

      // Capturar la versión - típicamente algo así como "cec-ctl 1.22.1"
      const versionMatch = stdout.match(/cec-ctl.*?(\d+\.\d+\.\d+)/);
      this.cecCtlVersion = versionMatch ? versionMatch[1] : stdout.trim();

      console.log('CEC: cec-ctl available; version:', this.cecCtlVersion);
    } catch (error) {
      throw new Error(`CEC: cec-ctl unavailable: ${error.message}`);
    }
  }

  /**
   * Descubre dispositivos CEC disponibles
   */
  async discoverCecDevices() {
    try {
      const { stdout } = await execAsync('cec-ctl --list-devices', { timeout: 3000 });

      if (process.env.CEC_DEBUG === 'true') {
        console.log('CEC: cec-ctl output:');
        console.log(stdout);
      }

      // Parsear salida para extraer dispositivos (/dev/cecX)
      const deviceMatches = stdout.match(/\/dev\/cec\d+/g);
      return deviceMatches || [];

    } catch (error) {
      console.error('CEC: Device discovery error:', error.message);
      return [];
    }
  }

  /**
   * Devuelve el primer dispositivo CEC que tenga un TV conectado a su bus
   */
  async findTvDevice(devices) {
    for (const device of devices) {
      console.log(`CEC: Looking for connected TV at ${device}...`);

      try {
        // Obtener topología del bus CEC del dispositivo
        const { stdout } = await execAsync(`cec-ctl -d ${device} --show-topology`, { timeout: 10000 } );

        if (process.env.CEC_DEBUG === 'true') {
          console.log(`CEC: Topology for ${device}:`);
          console.log(stdout);
        }

        // Buscar indicios de un TV conectado (logical address 0, device type TV)
        if (stdout.includes('TV') || stdout.includes('Logical address 0')) {
          console.log(`CEC: TV found at ${device}`);
          return device;
        }

      } catch (error) {
        console.warn(`CEC: Error looking for TV at ${device}:`, error.message);
        continue;
      }
    }

    return null;
  }

  /**
   * Configurar la conexión al bus CEC como un reproductor de contenido
   */
  async establishPlaybackConnection(device) {
    try {
      console.log(`CEC: Configuring connection as playback device on ${device}...`);

      const { stdout, stderr } = await execAsync(`cec-ctl -d ${device} --playback`, { timeout: 5000 });

      if (stderr && stderr.includes('error')) {
        throw new Error(`cec-ctl reported an error: ${stderr}`);
      }

      console.log('CEC: Connection successfully configured as playback device');

      // delay para que la configuración 'asiente'
      await this.sleep(500);

    } catch (error) {
      throw new Error(`CEC: Error configuring connection as playback device: ${error.message}`);
    }
  }

  /**
   * Obtiene la physical address del host, necesaria para la selección de entrada
   */
  async getPhysicalAddress(device) {
    try {
      // Sin más parámetros que el dispositivo, cec-ctl imprimirá simplemente el banner
      //con la configuración. De este modo será más fácil procesar la salida que si se
      //usa -S (--show-topolgy), ya que entonces saldría también la PA del TV
      const { stdout } = await execAsync(`cec-ctl -d ${device}`, { timeout: 5000 });

      // Buscar línea "Physical Address    : X.X.X.X"
      const match = stdout.match(/Physical Address\s*:\s*(\d+\.\d+\.\d+\.\d+)/);

      if (match) {
        console.log(`CEC: Physical Address detectada: ${match[1]}`);
        return match[1];
      }

      // Fallback por defecto 1.0.0.0
      throw new Error('No Physical Address found in cec-ctl output');
    } catch (error) {
      console.warn('CEC: Error getting Physical Address:', error.message);
      return '1.0.0.0';
    }
  }

  /**
   * Obtener el estado de energía del TV
   */
  async updateTvPowerStatus() {
    if (!this.available || !this.devicePath) return;

    try {
      const { stdout } = await execAsync(`cec-ctl -s -d ${this.devicePath} -S`, { timeout: 3000 });

      // Buscar línea "Power Status: xxx"
      const match = stdout.match(/Power Status\s*:\s*(.+)/);

      if (match) {
        const status = match[1].trim().toLowerCase();

        // Mapear estados CEC a nuestros estados
        if (status.includes('on')) {
          this.tvPowerStatus = 'on';
        } else if (status.includes('standby')) {
          this.tvPowerStatus = 'standby';
        } else if (status.includes('transition')) {
          this.tvPowerStatus = 'transitioning';
        } else {
          this.tvPowerStatus = 'unknown';
        }
        console.log(`CEC: TV Power Status: ${this.tvPowerStatus}`);
      }

    } catch (error) {
      console.warn('CEC: Error getting TV power status:', error.message);
      this.tvPowerStatus = 'unknown';
    }
  }

  /**
   * Obtiene el estado actual para p.ej. heartbeats
   */
  getStatus() {
    return {
      available: this.available,
      cecCtlVersion: this.cecCtlVersion,
      devicePath: this.devicePath,
      physicalAddress: this.physicalAddress,
      tvConnected: this.tvConnected,
      tvPowerStatus: this.tvPowerStatus,
      processing: this.processing,
      queueLength: this.commandQueue.length,
      lastCommand: this.lastCommand,
      lastCommandTime: this.lastCommandTime,
      lastError: this.lastError,
      commandCount: this.commandCount,
      errorCount: this.errorCount,
      lastUpdate: new Date().toISOString()
    };
  }

  /**
   * Utility: sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Procesa un comando de control CEC (punto de entrada desde MQTT)
   * @param {Object} command - un objeto con volumeLevel y/o powerStatus: { volumeLevel: 0..100, powerStatus: 'on|standby'}
   * @returns {boolean} Indicación sobre si se ha admitido o no el comando
   */
  async processControlCommand(command) {
    if (!this.available) {
      console.warn('CEC: Control unavailable, command ignored:', command);
      return false;
    }

    console.log('CEC: Command received:', JSON.stringify(command));

    // Añadir comando a la cola
    this.commandQueue.push({
      ...command,
      timestamp: new Date().toISOString(),
      id: Math.random().toString(36).slice(2, 11)
    });

    console.log(`CEC: Command queued (${this.commandQueue.length} pending)`);

    // Si no hay procesamiento activo, iniciarlo
    if (!this.processing) {
      this.processCommandQueue();
    }

    return true;
  }

  /**
   * Procesa la cola de comandos
   */
  async processCommandQueue() {
    if (this.processing || this.commandQueue.length === 0) return;

    this.processing = true;
    console.log('CEC: Starting queue processing...');

    while (this.commandQueue.length > 0) {
      const command = this.commandQueue.shift();

      try {
        console.log(`CEC: Processing command ${command.id}:`, JSON.stringify(command));
        this.lastCommand = `${Object.keys(command).filter(k => k !== 'timestamp' && k !== 'id').join(',')}`;
        this.commandCount++;
        this.lastCommandTime = new Date().toISOString();

        // Si hay varias acciones, ordenarlas según el tipo de operación de energía
        const hasVolume = command.volumeLevel !== undefined;
        const hasPower = command.powerStatus !== undefined;

        if (hasVolume && hasPower) {
          if (command.powerStatus === 'on') {
            // Si vamos a encender: primero encender, luego ajustar volumen
            await this.executePowerControl(command.powerStatus);
            await this.sleep(this.commandDelay);
            await this.executeVolumeControl(command.volumeLevel);
          } else if (command.powerStatus === 'standby') {
            // Si vamos a apagar: primero ajustar volumen, luego apagar
            await this.executeVolumeControl(command.volumeLevel);
            await this.sleep(this.commandDelay);
            await this.executePowerControl(command.powerStatus);
          }
        } else {
          // Una sola acción, ejecutar sin más
          if (hasPower) {
            await this.executePowerControl(command.powerStatus);
          }
          if (hasVolume) {
            await this.executeVolumeControl(command.volumeLevel);
          }
        }

        console.log(`CEC: Command ${command.id} processed succesfully`);

      } catch (error) {
        console.error(`CEC: Error processing command ${command.id}:`, error.message);
        this.lastError = `Command ${command.id}: ${error.message}`;
        this.errorCount++;
      }

      // delay entre comandos
      if (this.commandQueue.length > 0) {
        await this.sleep(this.commandDelay);
      }
    }

    this.processing = false;
    console.log('CEC: Queue processing completed');
  }

  /**
   * Ejecuta control de volumen del TV
   * @param {!number} volumeLevel - El nivel de volumen (0..100) objetivo
   */
  async executeVolumeControl(volumeLevel) {
    if (volumeLevel < 0 || volumeLevel > 100) {
      throw new Error(`Invalid volume value: ${volumeLevel} (must be in 0-100 range)`);
    }

    // Refrescar antes estado de energía, aLGunos televisores se encenderán al recibir
    //comandos de control de volumen, a pesar de ignorarlos cuando están encendidos
    await this.updateTvPowerStatus();
    if (this.tvPowerStatus !== 'on') {
      console.log(`CEC: Ignoring volume command - TV is not on (power status: '${this.tvPowerStatus}')`);
      return;
    }

    console.log(`CEC: Ajusting volume at ${volumeLevel}`);

    // La estrategia es bajar volumen 100 veces, luego subir hasta el nivel deseado
    // Bajar volumen a 0
    console.log('CEC: Setting volume to 0...');
    for (let i = 0; i < 100; i++) {
      await this.execCecCommand('--user-control-pressed ui-cmd=volume-down');
      await this.sleep(this.commandDelay);
    }

    // Paso 2: Subir hasta el nivel deseado
    if (volumeLevel > 0) {
      console.log(`CEC: Rising volume to ${volumeLevel}...`);
      for (let i = 0; i < volumeLevel; i++) {
        await this.execCecCommand('--user-control-pressed ui-cmd=volume-up');
        await this.sleep(this.commandDelay);
      }
    }

    console.log(`CEC: Volume set to ${volumeLevel}`);
  }

  /**
   * Ejecuta control del estado de energía del TV
   * @param {string} powerStatus - Estado de energía ('on|standby') objetivo
   */
  async executePowerControl(powerStatus) {
    if (!['on', 'standby'].includes(powerStatus)) {
      throw new Error(`Invalid power status: ${powerStatus}. Must be 'on' or 'standby'`);
    }

    console.log(`CEC: Applying power status: ${powerStatus}`);

    if (powerStatus === 'on') {
      // Encender TV
      await this.execCecCommand('--image-view-on');
      // Pequeño delay para que se procese el comando en el TV
      await this.sleep(500);

      // Establecer nodo como fuente activa en el TV
      if (this.physicalAddress) {
        await this.execCecCommand(`--active-source phys-addr=${this.physicalAddress}`);
      }

      console.log('CEC: TV on and this host selected as active source');

    } else if (powerStatus === 'standby') {
      // Poner TV en standby
      await this.execCecCommand('--standby');
      console.log('CEC: TV set to standby');
    }

    // Actualizar información de estado tras el cambio
    await this.sleep(500);
    await this.updateTvPowerStatus();
  }

  /**
   * Ejecuta un comando cec-ctl
   */
  async execCecCommand(cecArgs) {
    if (!this.available || !this.devicePath)
      throw new Error('CEC not available or device not configured');

    const fullCommand = `cec-ctl -s -d ${this.devicePath} -t0 ${cecArgs}`;
    try {
      if (process.env.CEC_DEBUG === 'true')
        console.log(`CEC: Executing: ${fullCommand}`);

      const { stdout, stderr } = await execAsync(fullCommand, { timeout: 5000 });

      if (stderr && stderr.includes('error'))
        throw new Error(`Error in CEC command: ${stderr}`);

      if (process.env.CEC_DEBUG === 'true' && stdout.trim())
        console.log(`CEC: cec-ctl output: ${stdout.trim()}`);

      return stdout;

    } catch (error) {
      console.error(`CEC: Error executing comand: ${fullCommand}`);
      throw new Error(`CEC command failed: ${error.message}`);
    }
  }
}

module.exports = CECControlService;