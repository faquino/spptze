/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - RENDERIZADO DE PLANTILLAS
// cap6/player/src/services/templateRenderer.js
// =============================================================
const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const ejs = require('ejs');


class TemplateRenderer {
  constructor(config = {}) {
    this.cacheDir = config.cacheDir || path.join(os.tmpdir(), 'spptze-player');
    this.viewsDir = path.join(__dirname, '..', '..', 'views');
    this.currentTemplate = null;
  }


  async initialize() {
    await fs.mkdir(this.cacheDir, { recursive: true });
    await this.loadCachedTemplate();
    console.log(`TPL8: cacheDir: ${this.cacheDir}`);
  }

  getTemplateId() {
    return this.currentTemplate?.id;
  }

  /**
   * Cargar la plantilla cacheada en el filesystem del nodo
   */
  async loadCachedTemplate() {
    try {
      const cachePath = path.join(this.cacheDir, 'current-template.json');
      const templateData = await fs.readFile(cachePath, 'utf8');
      this.currentTemplate = JSON.parse(templateData);
      console.log(`TLP8: Loaded cached template: ${this.currentTemplate.id}`);
      return true;
    } catch (err) {
      console.log('TPL8: No cached template found, using fallback');
      this.currentTemplate = this.getFallbackTemplate();
      return false;
    }
  }

  /**
   * Actualizar la plantilla
   */
  async updateTemplate(templateData) {
    try {
      const cachePath = path.join(this.cacheDir, 'current-template.json');
      await fs.writeFile(cachePath, JSON.stringify(templateData));
      this.currentTemplate = templateData;
      console.log(`TPL8: Updated template to ${templateData.id}`);
      return true;
    } catch (error) {
      console.error('TPL8: Error updating template:', error);
      return false;
    }
  }

  /**
   * Plantilla de reserva
   */
  getFallbackTemplate() {
    return {
      id: 'fallback',
      name: 'Fallback Template',
      orientation: 'landscape',
      assetsBaseUrl: '',
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
              maxVisible: 5,
              showTicket: true,
              showContent: true
            }
          }
        ],
        theme: {
          colors: {
            primary: '#1976d2',
            background: '#ffffff',
            text: '#333333'
          },
          typography: {
            fontFamily: 'system-ui, sans-serif',
            baseFontSize: '18px'
          }
        }
      }
    };
  }

  /**
   * Renderizar la plantilla mediante una... plantilla EJS
   */
  async renderPage(systemInfo) {
    if (!this.currentTemplate) {
      return this.renderErrorPage('No template loaded');
    }

    try {
      // Datos para la plantilla EJS
      const data = {
        template: this.currentTemplate,
        definition: this.currentTemplate.definition,
        layout: this.currentTemplate.definition.layout,
        widgets: this.currentTemplate.definition.widgets,
        theme: this.currentTemplate.definition.theme,
        assetsBaseUrl: this.currentTemplate.assetsBaseUrl,
        
        // Funciones auxiliares para la plantilla EJS
        helpers: {
          getGridCSS: this.getGridCSS.bind(this),
          getThemeCSS: this.getThemeCSS.bind(this),
          getWidgetsByArea: this.getWidgetsByArea.bind(this)
        },
        
        // Configuración WebSocket
        wsPort: systemInfo.wsPort
      };

      // Renderizar plantilla EJS
      const templatePath = path.join(this.viewsDir, 'display.ejs');
      const html = await ejs.renderFile(templatePath, data);
      return html;
      
    } catch (error) {
      console.error('Error rendering template:', error);
      return this.renderErrorPage(error.message);
    }
  }

  /**
   * Generar estilos para el CSS Grid layout
   */
  getGridCSS(layout) {
    const areas = layout.areas || {};
    let css = `
      .template-container {
        display: grid;
        grid-template-columns: repeat(${layout.columns || 12}, 1fr);
        grid-template-rows: repeat(${layout.rows || 8}, 1fr);
        gap: ${layout.gap || '10px'};
        width: 100vw;
        height: 100vh;
      }
    `;

    // Generar el CSS para cada area del grid
    for (const [areaName, areaConfig] of Object.entries(areas)) {
      css += `
        .area-${areaName} {
          grid-row: ${areaConfig.row[0]} / ${areaConfig.row[1] + 1};
          grid-column: ${areaConfig.column[0]} / ${areaConfig.column[1] + 1};
        }
      `;
    }

    return css;
  }

  /**
   * Generar estilos para CSS theming
   */
  getThemeCSS(theme) {
    const colors = theme.colors || {};
    const typography = theme.typography || {};
    
    return `
      :root {
        --primary: ${colors.primary || '#1976d2'};
        --secondary: ${colors.secondary || '#666'};
        --background: ${colors.background || '#fff'};
        --text: ${colors.text || '#333'};
        --accent: ${colors.accent || '#ff6600'};
        --font-family: ${typography.fontFamily || 'system-ui, sans-serif'};
        --font-size: ${typography.baseFontSize || '18px'};
      }
      
      body {
        font-family: var(--font-family);
        font-size: var(--font-size);
        color: var(--text);
        background: var(--background);
        margin: 0;
        padding: 0;
        overflow: hidden;
      }
    `;
  }

  /**
   * Obtener el widgets para un área específica
   */
  getWidgetsByArea(widgets, areaName) {
    return widgets.filter(w => w.area === areaName);
  }

  /**
   * Página de error
   */
  renderErrorPage(message) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Error - SPPTZE</title>
  <style>
    body {
      font-family: sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #f44336;
      color: white;
    }
    .error {
      text-align: center;
      padding: 20px;
    }
  </style>
</head>
<body>
  <div class="error">
    <h1>Error</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
  }
}

module.exports = new TemplateRenderer();