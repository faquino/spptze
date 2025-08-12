/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - INICIALIZACIÓN DE MODELOS; FUNCIONES DE UTILIDAD
// cap5/server/src/models/index.js
// =============================================================
const { sequelize } = require('../config/database');
const modelDefinitions = require('./definitions');

// Inicializar todos los modelos
const models = {};
Object.keys(modelDefinitions.defs).forEach(modelName => {
  if (typeof modelDefinitions.defs[modelName] === 'function') {
    models[modelName] = modelDefinitions.defs[modelName](sequelize);
  }
});

// Definir asociaciones
modelDefinitions.funs.defineAssociations(models);

// Funciones utilitarias para resolución de targets
const resolverUtils = {
  
  /**
   * Resuelve un service_point a sus ubicaciones asociadas
   */
  async resolveServicePointToLocations(servicePointId) {
    const servicePoint = await models.ServicePoint.findByPk(servicePointId, {
      include: [{
        model: models.Location,
        through: { attributes: [] }
      }]
    });
    
    return servicePoint ? servicePoint.Locations : [];
  },

  async resolveLocationToNodes(locationId, includeChildren = true) {
    const nodes = await models.DisplayNode.findAll({
      include: [{
        model: models.Location,
        where: { id: locationId },
        through: { 
          where: { active: true },
          attributes: []
        }
      }],
      where: { active: true }
    });
    
    return nodes;
  },

  async resolveServicePoint(sourceSystemId, externalId) {
    const servicePoint = await models.ServicePoint.findOne({
      where: {sourceSystemId: sourceSystemId, externalId: externalId}
    });
    if (!servicePoint) throw new Error('Service point not found');
    return servicePoint.id;
  },

  /**
   * Resuelve el conjunto de nodos en el que debe mostrarse un mensaje
   */
  async resolveMessageTargets(message) {
    let targetLocations = [];
    
    if (message.targetServicePointId) {
      targetLocations = await this.resolveServicePointToLocations(message.targetServicePointId);
    } else if (message.targetLocationId) {
      const location = await models.Location.findByPk(message.targetLocationId);
      if (location) targetLocations = [location];
    }
    
    // Obtener todos los nodos para estas ubicaciones
    const allNodes = [];
    for (const location of targetLocations) {
      const nodes = await this.resolveLocationToNodes(location.id, true);
      allNodes.push(...nodes);
    }
    
    // Eliminar duplicados
    const uniqueNodes = allNodes.filter((node, index, self) => 
      index === self.findIndex(n => n.id === node.id)
    );
    
    return uniqueNodes;
  }
};

// Exportar modelos y utilidades
module.exports = {
  ...models,
  resolverUtils
};
