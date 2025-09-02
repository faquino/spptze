/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - GESTION DE PLANTILLAS DE PRESENTACIÖN
// cap6/server/src/services/templateService.js
// =============================================================
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const { DisplayTemplate, DisplayNode } = require('../models');

class TemplateService  extends EventEmitter {
  constructor(config = {}) {
    super();
    // Ruta de assets en el sistema de ficheros, para las funciones de gestión de recursos
    this.assetsBasePath = process.env.ASSETS_DIR || path.join(process.cwd(), 'public', 'assets', 'templates');
    this.serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
    this.defaultTemplateId = process.env.DEFAULT_TEMPLATE_ID; //TODO: Una tabla de constantes/defaults?
  }

  /**
   * Initializar servicio
   */
  async initialize(config) {

  }

  /**
   * Obtener plantilla por defecto del sistema o la plantilla de reserva hardcodeada
   */
  async getDefaultTemplate() {
    // Intentar obtener la plantilla por defecto configurada
    if (this.defaultTemplateId) {
      const defaultTemplate = await DisplayTemplate.findByPk(this.defaultTemplateId);
      if (defaultTemplate) return defaultTemplate;
    }
    // Si no hay defaultTemplateId,  o no se encuentra, devolver la de reserva
    return this.getFallbackTemplate();
  }

  /**
   * Plantilla base alternativa de reserva, 'hardcodeada'
   */
  getFallbackTemplate() {
    return {
      id: 'fallback',
      name: 'Fallback Template',
      orientation: 'landscape',
      targetSize: 43,
      definition: {
        layout: {
          columns: 12, rows: 8, gap: '10px',
          areas: {
            main: { row: [1, 8], column: [1, 12] }
          }
        },
        widgets: [
          {
            id: 'queue', type: 'queue', area: 'main', channel: 'calls',
            config: {
              showTicket: true,
              showContent: true
            }
          }
        ],
        theme: {
          colors: {
            primary: '#000000',
            background: '#ffffff',
            text: '#000000'
          },
          typography: {
            fontFamily: 'sans-serif',
            baseFontSize: '16px'
          }
        }
      },
      updatedAt: new Date()
    };
  }

  async updateTemplate(templateId, templateData) {
    const template = await DisplayTemplate.findByPk(templateId);
    if (!template) throw new Error(`Template ${templateId} not found`);
    templateData.isDirty = true;
    await template.update(templateData);
  }

  /**
   * Distribuir plantilla actualizada via MQTT
   * Se publica en un topic específico de la plantilla al que cada nodo está suscrito previamente
   */
  async distributeTemplateUpdate(templateId) {
    const template = await DisplayTemplate.findByPk(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }
    this.emit('spptze:server:template:update', this.generateTemplatePayload(template));
  }

  // Añadir URL base de los assets a la información de la plantilla a publicar
  generateTemplatePayload(template) {
    return {
      id: template.id,
      name: template.name,
      orientation: template.orientation,
      targetSize: template.targetSize,
      definition: template.definition,
      assetsBaseUrl: `${this.serverUrl}/assets/`,
      updatedAt: template.updatedAt
    };
  }

  /**
   * Guardar un recurso de plantilla en el sistema de ficheros
   * No se redistribuye automáticamente la plantilla a los nodos
   */
  async uploadAsset(templateId, fileName, fileBuffer) {
    const template = await DisplayTemplate.findByPk(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }
    
    // Grabar el fichero. Se guardan todos juntos en el directorio assetsBasePath
    const filePath = path.join(this.assetsBasePath, fileName);
    await fs.writeFile(filePath, fileBuffer);
    
    // TODO: Marcar plantilla como sucia
    // Requiere un campo adicional en el modelo DisplayTemplate. Por ahora solo logear
    console.log(`Asset uploaded for template ${templateId}: ${fileName}`);
    console.log(`Template ${templateId} has pending asset changes - redistribute when ready`);
    
    return {
      url: `${this.serverUrl}/assets/${fileName}`,
      size: fileBuffer.length,
      message: 'Asset uploaded. Remember to redistribute template when all assets are ready.'
    };
  }

  /**
   * Borrar archivo de recurso de una plantilla
   */
  async deleteAsset(templateId, fileName) {
    const filePath = path.join(this.assetsBasePath, fileName);
    
    try {
      await fs.unlink(filePath);
      console.log(`Asset deleted for template ${templateId}: ${fileName}`);
      return { success: true };
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`Asset not found: ${fileName}`);
      }
      throw err;
    }
  }

  /**
   * Clonar una plantilla
   */
  async cloneTemplate(sourceId, newName) {
    const source = await DisplayTemplate.findByPk(sourceId);
    if (!source) throw new Error(`Source template ${sourceId} not found`);
    
    // La nueva plantilla copia la definición etc. de la original
    const newTemplate = await DisplayTemplate.create({
      name: newName,
      description: `Cloned from ${source.name}`,
      orientation: source.orientation,
      targetSize: source.targetSize,
      definition: JSON.parse(JSON.stringify(source.definition)), // 'Deep copy'
      isActive: source.isActive
    });
    
    return newTemplate;
  }

  /**
   * Validar estructura de definición de una plantilla
   * TODO: En progreso, terminar
   */
  validateTemplateDefinition(definition) {
    const errors = [];
    
    // Chequeo de elementos requeridos
    if (!definition.layout) {
      errors.push('Missing layout definition');
    } else {
      if (typeof definition.layout.columns !== 'number' || definition.layout.columns < 1) {
        errors.push('Layout must define columns (positive number)');
      }
      if (typeof definition.layout.rows !== 'number' || definition.layout.rows < 1) {
        errors.push('Layout must define rows (positive number)');
      }
      if (!definition.layout.areas || typeof definition.layout.areas !== 'object') {
        errors.push('Layout must define areas object');
      }
    }
    
    if (!definition.widgets || !Array.isArray(definition.widgets)) {
      errors.push('Missing or invalid widgets array');
    } else {
      // Validar widgets
      const widgetIds = new Set();
      const usedAreas = new Set();
      
      for (const widget of definition.widgets) {
        if (!widget.id) {
          errors.push('Widget missing id');
        } else if (widgetIds.has(widget.id)) {
          errors.push(`Duplicate widget id: ${widget.id}`);
        } else {
          widgetIds.add(widget.id);
        }
        
        if (!widget.type) {
          errors.push(`Widget ${widget.id} missing type`);
        }
        
        if (!widget.area) {
          errors.push(`Widget ${widget.id} missing area`);
        } else {
          usedAreas.add(widget.area);
        }
      }
      
      // Chequear que las areas referenciadas por los widgets están definidas en el layout
      if (definition.layout && definition.layout.areas) {
        for (const area of usedAreas) {
          if (!definition.layout.areas[area]) {
            errors.push(`Widget references undefined area: ${area}`);
          }
        }
      }
    }
    
    if (!definition.theme) {
      errors.push('Missing theme definition');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Marcar plantilla para redistribución
   */
  async markTemplateAsModified(templateId) {
    const template = await DisplayTemplate.findByPk(templateId);
    if (!template) throw new Error(`Template ${templateId} not found`);
    
    template.updatedAt = new Date();
    template.isDirty = false;
    await template.save();
    
    console.log(`Template ${templateId} marked as modified`);
  }

  /**
   * Redistribuir plantilla
   */
  async forceRedistribute(templateId) {
    await this.distributeTemplateUpdate(templateId);
    console.log(`Template ${templateId} redistributed`);
  }
}

module.exports = new TemplateService();