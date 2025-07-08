/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - GENERACIÓN MARKDOWN DICCIONARIO DE DATOS
// cap5/server/src/scripts/generate-data-dict.js
// =============================================================
const fs = require('fs');
const path = require('path');

// Importar solo las definiciones de modelos (sin instanciar Sequelize)
const dbModel = require('../models/definitions');

// Simulamos DataTypes para el análisis estático
const DataTypes = {
  STRING: function(length) { 
    this._length = length; 
    this.constructor.name = 'STRING';
    return this;
  },
  TEXT: { constructor: { name: 'TEXT' } },
  INTEGER: { constructor: { name: 'INTEGER' } },
  BOOLEAN: { constructor: { name: 'BOOLEAN' } },
  DATE: { constructor: { name: 'DATE' } },
  JSONB: { constructor: { name: 'JSONB' } },
  JSON: { constructor: { name: 'JSON' } }
};

// Función para analizar definiciones de modelo sin Sequelize
function analyzeModelDefinition(modelDefFunction) {
  const modelInfo = {
    attributes: {},
    options: {},
    tableName: '',
    comment: '',
    auxiliaryFunctions: []
  };

  // Crear un mock de sequelize.define para capturar la definición
  const mockSequelize = {
    define: (name, attributes, options) => {
      modelInfo.modelName = name;
      modelInfo.attributes = attributes;
      modelInfo.options = options || {};
      modelInfo.tableName = options?.tableName || name.toLowerCase();
      modelInfo.comment = options?.comment || '';

      // Crear un mock que puede recibir asignaciones con Proxy para detectar funciones
      const mockModel = {
        prototype: new Proxy({}, {
          set(target, prop, value) {
            if (typeof value === 'function') {
              modelInfo.auxiliaryFunctions.push(prop);
            }
            target[prop] = value;
            return true;
          }
        })
      };

      return mockModel;
    }
  };

  // Ejecutar la función de definición con el mock
  try {
    modelDefFunction(mockSequelize);
  } catch (error) {
    // Silenciar errores esperados del análisis estático
    if (!error.message.includes('Cannot read properties') && 
        !error.message.includes('Cannot set properties')) {
      console.warn(`Error analizando modelo: ${error.message}`);
    }
  }

  return modelInfo;
}

// Función para convertir tipo a texto legible
function formatDataType(fieldDef) {
  if (!fieldDef.type) return 'UNKNOWN';

  const type = fieldDef.type;
  if (typeof type === 'function') return type.name || 'UNKNOWN';
  if (type.constructor?.name === 'STRING') return `VARCHAR(${type._length || 255})`;
  
  return type.constructor?.name || 'UNKNOWN';
}

// Función para obtener validaciones
function getValidations(fieldDef) {
  const validations = [];
  
  if (fieldDef.allowNull === false) validations.push('NOT NULL');
  if (fieldDef.primaryKey) validations.push('PRIMARY KEY');
  if (fieldDef.unique) validations.push('UNIQUE');

  if (fieldDef.validate) {
    Object.keys(fieldDef.validate).forEach(rule => {
      switch (rule) {
        case 'isEmail':
          validations.push('Email válido');
          break;
        case 'isIn':
          validations.push(`Valores: ${JSON.stringify(fieldDef.validate[rule])}`);
          break;
        case 'min':
          validations.push(`Mínimo: ${fieldDef.validate[rule]}`);
          break;
        case 'max':
          validations.push(`Máximo: ${fieldDef.validate[rule]}`);
          break;
        default:
          validations.push(`${rule} (custom)`);
      }
    });
  }

  return validations.join(', ');
}

async function generateSequelizeDictionary() {
  try {
    let markdown = `# Diccionario de Datos - Base de Datos SPPTZE\n\n`;
    markdown += `*Generado el ${new Date().toLocaleString('es-ES')} por ${__filename.split(/[\/\\]/).pop()} a partir del modelo Sequelize*\n\n`;
    markdown += `## Índice de Tablas\n\n`;

    // Analizar cada modelo
    const modelAnalysis = {};

    Object.keys(dbModel.defs).forEach(modelName => {
      if (typeof dbModel.defs[modelName] === 'function') {
        try {
          const analysis = analyzeModelDefinition(dbModel.defs[modelName]);
          modelAnalysis[modelName] = analysis;
        } catch (error) {
          console.warn(`Error analizando ${modelName}:`, error.message);
        }
      }
    });

    // Generar índice
    Object.keys(modelAnalysis).sort().forEach(modelName => {
      const model = modelAnalysis[modelName];
      const anchor = model.tableName.toLowerCase().replace(/_/g, '-');
      markdown += `- [${model.tableName}](#${anchor})\n`;
    });
    
    markdown += `\n---\n\n`;

    // Generar documentación por modelo
    Object.keys(modelAnalysis).sort().forEach(modelName => {
      const model = modelAnalysis[modelName];
      const anchor = model.tableName.toLowerCase().replace(/_/g, '-');
      
      markdown += `<a id="${anchor}"></a>\n## ${model.tableName}\n\n`;
      
      // Comentario de tabla si existe
      if (model.comment) {
        markdown += `${model.comment}\n\n`;
      }
      
      // Información general
      markdown += `**Modelo:** ${modelName}  \n`;
      markdown += `**Tabla:** ${model.tableName}  \n`;
      markdown += `**Timestamps:** ${model.options.timestamps !== false ? 'Sí' : 'No'}\n\n`;
      
      // Tabla de campos
      markdown += `### Campos\n\n`;
      markdown += `| Campo | Tipo | Restricciones | Defecto | Validaciones |\n`;
      markdown += `|-------|------|---------------|---------|--------------|\n`;
      
      Object.keys(model.attributes).forEach(fieldName => {
        const fieldDef = model.attributes[fieldName];
        const type = formatDataType(fieldDef);
        const defaultValue = fieldDef.defaultValue !== undefined ? 
          JSON.stringify(fieldDef.defaultValue) : '-';
        const validations = getValidations(fieldDef) || '-';
        
        // Construir restricciones
        const constraints = [];
        if (fieldDef.primaryKey) constraints.push('PK');
        if (fieldDef.references) {
          constraints.push(`FK → \`${fieldDef.references.model}.${fieldDef.references.key}\``);
        }
        if (fieldDef.unique) constraints.push('UNIQUE');
        
        const constraintsText = constraints.length > 0 ? constraints.join(', ') : '-';
        
        markdown += `| \`${fieldName}\` | ${type} | ${constraintsText} | ${defaultValue} | ${validations} |\n`;
      });
      
      // Índices
      if (model.options.indexes && model.options.indexes.length > 0) {
        markdown += `\n#### Índices\n\n`;
        model.options.indexes.forEach((index, i) => {
          const fields = Array.isArray(index.fields) ? index.fields.join(', ') : index.fields;
          const unique = index.unique ? ' (UNIQUE)' : '';
          markdown += `- **Índice ${i + 1}:** ${fields}${unique}\n`;
        });
      }
      
      // Validaciones de modelo
      if (model.options.validate) {
        markdown += `\n#### Validaciones de Modelo\n\n`;
        Object.keys(model.options.validate).forEach(validationName => {
          markdown += `- **${validationName}:** Validación personalizada\n`;
        });
      }
      
      // Funciones auxiliares detectadas automáticamente
      if (model.auxiliaryFunctions && model.auxiliaryFunctions.length > 0) {
        markdown += `\n#### Funciones Auxiliares\n\n`;
        model.auxiliaryFunctions.forEach(funcName => {
          markdown += `- **${funcName}:** Función auxiliar del modelo\n`;
        });
      }
      
      markdown += `\n---\n\n`;
    });

    // Guardar archivo
    const outputPath = 'DATA_DICTIONARY.md';
    fs.writeFileSync(outputPath, markdown);
    console.log(`Diccionario de datos generado: ${outputPath}`);
    
  } catch (error) {
    console.error('Error generando diccionario:', error);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  generateSequelizeDictionary();
}

module.exports = { generateSequelizeDictionary };