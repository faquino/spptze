/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Configuración de base de datos via Sequelize ORM
// =============================================================
const { Sequelize } = require('sequelize');
const path = require('path');

const dbDialect = process.env.ORM_DIALECT || 'sqlite';
const dbLogging = process.env.ORM_LOGGING === 'true';

// Configuración por entorno
const dialectConfigs = {
  sqlite: {
    dialect: 'sqlite',
    storage: path.join(__dirname, '..', 'spptze_dev.sqlite'),
    logging: dbLogging ? console.log : false,
    define: {
      timestamps: false,
      freezeTableName: true
    }
  },

  postgres: {
    dialect: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'spptze',
    username: process.env.DB_USER || 'spptze_user',
    password: process.env.DB_PASS || '',
    logging: dbLogging ? console.log : false,
    define: {
      timestamps: false,
      freezeTableName: true
    }/*,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }*/
  }
};

const env = process.env.NODE_ENV || 'development';
const dbConfig = dialectConfigs[dbDialect];
if (!dbConfig) {
  throw new Error(`Unsupported ORM_DIALECT: ${dbDialect}. Use one of [${Object.getOwnPropertyNames(dialectConfigs).join(',')}]`);
}

// Crear instancia de Sequelize a partir de la configuración seleccionada
const sequelize = new Sequelize(dbConfig);


// Función para probar conexión
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log(`Conexión a BD establecida (${dbConfig.dialect})`);
    return true;
  } catch (error) {
    console.error('Error conectando a BD:', error);
    return false;
  }
}

// Función para sincronizar modelos
async function syncDatabase(force = false) {
  try {
    await sequelize.sync({ force });
    console.log(`Esquema de base de datos ${force ? 'FORZADO' : 'SINCRONIZADO'}`);
    return true;
  } catch (error) {
    console.error('Error sincronizando BD:', error);
    return false;
  }
}

module.exports = {
  sequelize,
  testConnection,
  syncDatabase,
  config: dbConfig
};
