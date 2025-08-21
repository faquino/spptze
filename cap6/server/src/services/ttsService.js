/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - CLIENTE SPEACHES (Modelos de síntesis de voz)
// cap6/server/src/services/ttsService.js
// =============================================================
const axios = require('axios');


class TTSService {
  /**
   * Constructor del servicio TTS
   * @param {Object} config - Configuración del servicio
   * @param {string} config.url - URL del servicio Speaches
   * @param {boolean} config.cacheEnabled - Habilitar caché de audio
   * @param {number} config.timeout - Timeout en ms para síntesis
   */
  constructor(config = {}) {
    this.config = {
      url: config.url || process.env.SPEACHES_URL,
      cacheEnabled: config.cacheEnabled !== false,
      timeout: config.timeout || 10 * 1000,
      ...config
    };
    // Mapeo de idiomas a alias de modelos definidos en tts/model_aliases.json
    // No es posible consultar model_aliases a través de la API de Speaches
    // TODO: ¿Extraer a un JSON/JS de configuración externo?
    this.voiceMap = {
      'es-ES': {
        model_alias: 'tts-es-ES',
        model: 'speaches-ai/piper-es_ES-sharvard-medium',
        opts: { voice: 'sharvard' }
      },
      'es-ES-f': {
        model_alias: 'tts-es-ES',
        model: 'speaches-ai/piper-es_ES-sharvard-medium',
        opts: { voice: '1' }
      },
      'es-ES-m': {
        model_alias: 'tts-es-ES',
        model: 'speaches-ai/piper-es_ES-sharvard-medium',
        opts: { voice: '0' }
      },
      'es-MX': {
        model_alias: 'tts-es-MX',
        model: 'speaches-ai/piper-es_MX-claude-high',
        opts: { voice: 'claude' }
      }
    };
    // El código cliente deberá encargarse de invocar initialize()
    this.available = false;
    this.audioCache = new Map();
    this.cacheHits = 0;
    this.models = [];
  }

  /**
   * Inicializar y verificar disponibilidad del servicio
   * @returns {Promise<boolean>} true si el servicio está disponible
   */
  async initialize() {
    try {
      const response = await axios.get(`${this.config.url}/v1/models?task=text-to-speech`, { timeout: 5 * 1000 });

      const models = response.data.data || [];
      this.models = models;

      if (this.models.length < 1) {
        console.warn('TTS: No text-to-spech models available');
        this.available = false;
        return false;
      }
      console.log(`TTS: Available at ${this.config.url}; Models: ${models.map(m => m.id).join(', ')}`);
      this.available = true;
      return true;

    } catch (error) {
      if (error.code == 'ECONNREFUSED') {
        console.error(`TTS: Connection to ${this.config.url} refused`);
      } else {
        console.error('TTS: Error initializing:', error.message);
      }
      this.available = false;
      return false;
    }
  }

  /**
   * Sintetizar locución de audio a partir de texto
   * @param {string} text - Texto a leer
   * @param {string} language - Código de idioma (es-ES, es-MX) definido en voiceMap
   * @param {Object} options - Opciones adicionales de síntesis
   * @param {number} options.speed - Velocidad de locución (default: 1.0)
   * @param {boolean} options.useCache - Usar caché (default: config.cacheEnabled)
   * @returns {Promise<Buffer>} - Audio en formato MP3
   * @throws {Error} Si el servicio no está disponible o falla la síntesis
   */
  async synthesize(text, language = 'es-ES', options = {}) {
    if (!this.available) throw new Error('TTS: Service unavailable');

    const speed = options.speed || 1.0;
    const useCache = (options.useCache !== undefined) ? options.useCache : this.config.cacheEnabled;

    // Verificar caché
    const cacheKey = this.getCacheKey(text, language, speed);
    if (useCache && this.audioCache.has(cacheKey)) {
      console.log('TTS: Returning audio from cache');
      const cacheItem = this.audioCache.get(cacheKey);
      cacheItem.lastUsed = Date.now();
      this.cacheHits++;
      return cacheItem.audio;
    }

    // Mapear idioma a modelo/voz disponible
    const modelInfo = this.getModelForLanguage(language);
    if (!modelInfo) {
      throw new Error(`TTS: No voice available for requested language: ${language}`);
    }

    try {
      console.log(`TTS: Synthesizing text...`);
      const response = await axios.post(
        `${this.config.url}/v1/audio/speech`,
        {
          model: modelInfo.model_alias,
          input: text,
          response_format: 'mp3',
          speed: speed,
          ...modelInfo.opts // voice etc
        },
        {
          responseType: 'arraybuffer',
          timeout: this.config.timeout,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const audioBuffer = Buffer.from(response.data);
      // Guardar en caché si está habilitado
      if (useCache) {
        this.audioCache.set(cacheKey, { audio: audioBuffer, since: Date.now() });
      }
      return audioBuffer;

    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message;
      console.error('TTS: Error en síntesis:', errorMsg);
      throw new Error(`Error en síntesis TTS: ${errorMsg}`);
    }
  }

  /**
   * Obtener la voz correspondiente a un idioma
   * @private
   * @param {string} lang - Código de idioma
   * @returns {Object|null} Información del modelo de voz o null si no existe
   */
  getModelForLanguage(lang) {
    const modelInfo = this.voiceMap[lang];

    // Verificar que el modelo está disponible en el servidor Speaches
    if (modelInfo) {
      const speachesModel = this.models.find(m => m.id === modelInfo.model);
      if (speachesModel) {
        // TODO por si fuese necesario completar modelInfo con algo de speachesModel
        return { ...modelInfo };
      }
    }

    // TODO ¿Si no hay coincidencia exacta, intentar encontrar un modelo menos específico?
    return null;
  }

  /**
   * Generar clave de caché
   * @private
   * @param {string} text - Texto a sintetizar
   * @param {string} voice - Voz a usar
   * @param {number} speed - Velocidad de habla
   * @returns {string} Clave de caché
   */
  getCacheKey(text, voice, speed = 1.0) {
    return `${voice}:${speed}:${text}`;
  }

  /**
   * Obtener información y estadísticas del servicio
   * @returns {Object} Estadísticas actuales
   */
  getInfo() {
    // En realidad solo la memoria correspondiente al audio
    const cacheMemory = Array.from(this.audioCache.values())
      .reduce((sum, item) => sum + item.audio.length, 0);
    
    return {
      available: this.available,
      models: this.models.map(m => ({ id: m.id })),
      voiceMap: this.voiceMap,
      cache: {
        enabled: this.config.cacheEnabled,
        entries: this.audioCache.size,
        hits: this.cacheHits,
        memoryBytes: cacheMemory
      }
    };
  }

}

module.exports = new TTSService();