/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */
 
// =============================================================
// SPPTZE - MODELOS SEQUELIZE
// =============================================================
const { DataTypes, Op } = require('sequelize');


// ALGUNAS FUNCIONES DE UTILIDAD
// =============================================================

// Para prevenir formación de ciclos, usada en la validación de HierarchyLevel y Location
const detectCycle = async (model, entityId, parentFieldName = null, visited = new Set()) => {
  if (!parentFieldName) {
    parentFieldName = detectSelfRefField(model);
    if (!parentFieldName) return false;
  }

  let currentId = entityId;
  while (currentId) {
    if (visited.has(currentId)) return true; // Ciclo detectado

    visited.add(currentId);
    const entity = await model.findByPk(currentId);
    if (!entity) throw new Error('Could not find parent in path, data inconsistency?');

    currentId = entity[parentFieldName]; // Si 'falsy' se habrá acabado sin encontrar ciclos
  }
  return false;
};

// Para _intentar_ obtener el campo de autorreferencia de un modelo
const detectSelfRefField = (model) => {
  const associations = model.associations;
  const tableName = model.tableName;

  // Buscar asociación belongsTo que apunte a la misma tabla
  for (const association of Object.values(associations)) {
    if ((association.associationType === 'BelongsTo') && (association.target.tableName === tableName))
      return association.foreignKey;
  }
  // (fallback) Buscar campos comunes de autorreferencia
  const commonSelfRefFields = ['parentId', 'parent_id', 'prevId', 'prev_id'];
  const attributes = Object.keys(model.rawAttributes);
  for (const field of commonSelfRefFields) {
    if (attributes.includes(field)) return field;
  }
  // Vaya... :(
  return null;
};

// Para obtener la secuencia completa desde la raíz hasta la entidad
//   parentFieldName debe poder usarse con findByPk, o pasarán cosas malas
const getEntityPath = async (model, entity, parentFieldName = null) => {
  if (!parentFieldName) {
    parentFieldName = detectSelfRefField(model);
    if (!parentFieldName)
      throw new Error(`Could not detect self-reference field for model '${model.name}'; please specify explicit parentFieldName`);
  }

  const path = [entity];
  const visited = new Set([entity.id]); // Rastreo de IDs de entidades visitadas
  let current = entity;

  while (current[parentFieldName]) {
    if (visited.has(current[parentFieldName])) throw new Error(`Cycle detected`);
    const parent = await model.findByPk(current[parentFieldName]);
    if (!parent) {
      throw new Error('Could not find parent in path, data inconsistency?');
    }
    visited.add(current[parentFieldName]);
    path.unshift(parent);
    current = parent;
  }
  return path;
};

// Para obtener la profundidad de una entidad desde la raíz
//   parentFieldName debe poder usarse con findByPk, o pasarán cosas malas
const getEntityDepth = async (model, entity, parentFieldName = null) => {
  const entityPath = await getEntityPath(model, entity, parentFieldName);
  return entityPath.length - 1; // La profundidad mínima es 0
};


// HIERARCHY (Jerarquías organizativas)
// =============================================================
const Hierarchy = (sequelize) => {
  return sequelize.define('Hierarchy', {
    id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true }
  }, {
    tableName: 'hierarchies',
    timestamps: false
  });
};


// HIERARCHY_LEVEL (Niveles de jerarquía)
// =============================================================
const HierarchyLevel = (sequelize) => {
  const model = sequelize.define('HierarchyLevel', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    hierarchyId: { type: DataTypes.STRING, allowNull: false, field: 'hierarchy_id',
      references: { model: 'hierarchies', key: 'id' },
      onDelete: 'CASCADE'
    },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    prevId: { type: DataTypes.INTEGER, allowNull: true, field: 'prev_id',
      comment: 'Referencia al nivel previo de la jerarquía',
      references: { model: 'hierarchy_levels', key: 'id' }
    }
  }, {
    tableName: 'hierarchy_levels',
    timestamps: false,
    indexes: [ { unique: true, fields: ['hierarchy_id', 'name'] },
               { unique: true, fields: ['prev_id'] } ],
    validate: {
      async validatePrevLevel() {
        if (this.prevId) {
          const prev = await sequelize.models.HierarchyLevel.findByPk(this.prevId);
          if (!prev || prev.hierarchyId !== this.hierarchyId) {
            throw new Error('Previous level not in same hierarchy');
          }
        }
      },
      async validateNoCycles() {
        if (this.prevId) {
          if (this.prevId === this.id) throw new Error('Level cannot be its own previous');
          const hasCycle = await detectCycle(sequelize.models.HierarchyLevel, this.prevId, 'prevId', new Set([this.id]));
          if (hasCycle) throw new Error('Creating this relationship would create a cycle');
        }
      }
    }
  });

  // Método para calcular la profundidad de este nivel en la jerarquía
  model.prototype.getDepth = async function() {
    return await getEntityDepth(sequelize.models.HierarchyLevel, this, 'prevId');
  };
  
  // Método para obtener el path completo desde el nivel raíz
  model.prototype.getPath = async function() {
    return await getEntityPath(sequelize.models.HierarchyLevel, this, 'prevId');
  };

  return model;
};


// LOCATION (Ubicaciones específicas)
// =============================================================
const Location = (sequelize) => {
  const model = sequelize.define('Location', {
    id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    hierarchyId: { type: DataTypes.STRING, allowNull: false, field: 'hierarchy_id',
      comment: '(DN) Referencia a la jerarquía a la que pertenece la ubicación',
      references: { model: 'hierarchies', key: 'id' }
    },
    hierarchyLevelId: { type: DataTypes.INTEGER, allowNull: false, field: 'hierarchy_level_id',
      references: { model: 'hierarchy_levels', key: 'id' }
     },
    parentId: { type: DataTypes.STRING, allowNull: true, field: 'parent_id',
      comment: 'Referencia a la ubicación madre',
      references: { model: 'locations', key: 'id' }
    },
    templateId: { type: DataTypes.STRING, allowNull: true, field: 'template_id',
      references: { model: 'display_templates', key: 'id' }
    }
  }, {
    tableName: 'locations',
    timestamps: false,
    validate: {
      // Verificar que el parent pertenece al nivel que precede al de esta ubicación
      async validateParentHierarchy() {
        if (this.parentId) {
          const parent = await Location.findByPk(this.parentId);
          // Ubicación madre existe?
          if (!parent) throw new Error('Parent location not found');
          // Ubicaciones madre e hija en la misma jerarquía?
          if (parent.hierarchyId != this.hierarchyId) throw new Error('Parent and child must be in same hierarchy');
          const thisLevel = await HierarchyLevel.findByPk(this.hierarchyLevelId);
          // Nivel existe?
          if (!thisLevel) throw new Error('Hierarchy level not found');
          // Ubicaciones madre e hija en niveles consecutivos?
          if (thisLevel.prevId !== parent.hierarchyLevelId) throw new Error('Location at wrong level');
        }
      },
      async validateNoCycles() {
        if (this.parentId) {
          if (this.parentId === this.id) throw new Error('Location cannot be its own parent');
          const hasCycle = await detectCycle(Location, this.parentId, 'parentId', new Set([this.id]));
          if (hasCycle) throw new Error('Creating this relationship would create a cycle');
        }
      }
    }
  });

  model.prototype.getEffectiveTemplate = async function () {
    if (this.templateId) return this.templateId;
    if (this.parentId) {
      const parent = await sequelize.models.Location.findByPk(this.parentId);
      return parent ? await parent.getEffectiveTemplate() : null;
    }
    return null;
  };

  // Método para calcular la profundidad de una ubicación en la jerarquía
  model.prototype.getDepth = async function() {
    return await getEntityDepth(sequelize.models.Location, this, 'parentId');
  };

  // Método para obtener el path completo de una ubicación desde la ubicación raíz
  model.prototype.getPath = async function() {
    return await getEntityPath(sequelize.models.Location, this, 'parentId');
  };

  return model;
};


// DISPLAY_NODE (Nodos de visualización)
// =============================================================
const DisplayNode = (sequelize) => {
  const model = sequelize.define('DisplayNode', {
    id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    serialNumber: { type: DataTypes.STRING, allowNull: true, field: 'serial_number' },
    macAddress: { type: DataTypes.STRING(12), allowNull: true, field: 'mac_address',
      comment: 'Seis bytes codificados en hexadecimal, sin separadores',
      set(value) {
        this.setDataValue('mac_address', value ? value.replace(/[:-]/g, '').toUpperCase() : value);
      },
      validate: {
        isValidMac(value) {
          if (value && !/^[0-9A-F]{12}$/i.test(value)) {
            throw new Error('MAC address must be 12 hex characters without separators');
          }
        }
      }
    },
    hostname: { type: DataTypes.STRING, allowNull: true },
    hardwareModel: { type: DataTypes.STRING, allowNull: true, field: 'hardware_model' },
    status: { type: DataTypes.STRING, defaultValue: 'active',
      validate: {
        isIn: [['active', 'offline', 'maintenance']]
      }
    },
    lastSeen: { type: DataTypes.DATE, allowNull: true, field: 'last_seen' },
    templateOverrideId: { type: DataTypes.STRING, allowNull: true, field: 'template_override_id',
      references: { model: 'display_templates', key: 'id' }
    },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' }
  }, {
    tableName: 'display_nodes',
    timestamps: false
  });

  model.prototype.getEffectiveTemplate = async function () {
    // Si hay template override se usa ése
    if (this.templateOverrideId) return await sequelize.models.DisplayTemplate.findByPk(this.templateOverrideId);

    // En otro caso, hay que buscar la plantilla de ubicación más específica
    const locations = await this.getLocations({
      include: [
        { model: sequelize.models.DisplayTemplate, as: 'displayTemplate' }
      ]
    });

    let highestDepth = -1;
    const templatesAtHighestDepth = [];

    // Calcular profundidad de cada ubicación para encontrar las más específicas
    for (const location of locations) {
      if (location.displayTemplate) {
        const depth = await location.getDepth();
        if (depth > highestDepth) {
          // Nueva profundidad más alta, reiniciar array
          highestDepth = depth;
          templatesAtHighestDepth.length = 0;
          templatesAtHighestDepth.push(location.displayTemplate);
        } else if (depth === highestDepth) {
          // Misma profundidad, añadir al array si no está ya
          const templateExists = templatesAtHighestDepth.some(t => t.id === location.displayTemplate.id);
          if (!templateExists) {
            templatesAtHighestDepth.push(location.displayTemplate);
          }
        }
      }
    }
    return templatesAtHighestDepth;
  };

  return model;
};


// NODE_LOCATION_MAPPING (Mapeos nodo-ubicación)
// =============================================================
const NodeLocationMapping = (sequelize) => {
  return sequelize.define('NodeLocationMapping', {
    nodeId: { type: DataTypes.STRING, primaryKey: true, field: 'node_id',
      references: { model: 'display_nodes', key: 'id' },
      onDelete: 'CASCADE'
    },
    locationId: { type: DataTypes.STRING, primaryKey: true, field: 'location_id',
      references: { model: 'locations', key: 'id' },
      onDelete: 'CASCADE'
    },
    showChildren: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'show_children' },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, {
    tableName: 'node_location_mapping',
    timestamps: false
  });
};


// SERVICE_POINT_LOCATION_MAPPING (Mapeo punto servicio-ubicación)
// =============================================================
const ServicePointLocationMapping = (sequelize) => {
  return sequelize.define('ServicePointLocationMapping', {
    servicePointId: { type: DataTypes.STRING, primaryKey: true, field: 'service_point_id',
      references: { model: 'service_points', key: 'id' },
      onDelete: 'CASCADE'
    },
    locationId: { type: DataTypes.STRING, primaryKey: true, field: 'location_id',
      references: { model: 'locations', key: 'id' },
      onDelete: 'CASCADE'
    }
  }, {
    tableName: 'service_point_location_mapping',
    timestamps: false
  });
};


// EXTERNAL_SYSTEM (Sistemas externos)
// =============================================================
const ExternalSystem = (sequelize) => {
  return sequelize.define('ExternalSystem', {
    id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    apiKey: { type: DataTypes.STRING, allowNull: true, field: 'api_key' },
    allowedIPs: { type: DataTypes.JSONB, allowNull: true, field: 'allowed_ips',
      comment: 'Lista de IPs o rangos CIDR autorizados para el sistema',
      validate: {
        isValidIPArray(value) {
          if (value === null) return;
          if (!Array.isArray(value)) throw new Error ('allowedIPs must be an array or null');
          for (const item of value) {
            if (typeof item !== 'string' || item.trim() === '')
              throw new Error('Each item in allowedIPs must be a non-empty string');
            //TODO: Llegados aquí valdría la pena comprobar si item es realmente una IP o rango CIDR
          }
        }
      }
    },
    defaultResolutionType: { type: DataTypes.STRING, allowNull: true, field: 'default_resolution_type',
      validate: {
        isIn: [ ['service_point', 'location'] ]
      }
    },
    defaultChannel: { type: DataTypes.STRING, defaultValue: 'calls', field: 'default_channel',
      validate: {
        isIn: [['calls', 'info', 'emergency', 'announcements']]
      }
    },
    messageFormat: { type: DataTypes.JSONB, allowNull: true, field: 'message_format' },
    ticketField: { type: DataTypes.STRING, defaultValue: 'ticket', field: 'ticket_field' },
    targetField: { type: DataTypes.STRING, defaultValue: 'target', field: 'target_field' },
    messageField: { type: DataTypes.STRING, defaultValue: 'message', field: 'message_field' },
    active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    tableName: 'external_systems',
    timestamps: false
  });
};


// SERVICE_POINT (Puntos de servicio - agrupaciones lógicas de ubicaciones)
// =============================================================
const ServicePoint = (sequelize) => {
  return sequelize.define('ServicePoint', {
    id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    externalId: { type: DataTypes.STRING, allowNull: true, field: 'external_id' },
    active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    tableName: 'service_points',
    timestamps: false
  });
};


// MESSAGE (Mensajes/Llamadas)
// =============================================================
const Message = (sequelize) => {
  return sequelize.define('Message', {
    id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    channel: { type: DataTypes.STRING, defaultValue: 'calls',
      validate: { isIn: [['calls', 'info', 'emergency', 'announcements']] }
    },
    ticket: { type: DataTypes.STRING, allowNull: true },
    content: { type: DataTypes.TEXT, allowNull: false },
    priority: { type: DataTypes.INTEGER, defaultValue: 1,
      validate: { min: 1, max: 5 }
    },
    targetLocationId: { type: DataTypes.STRING, allowNull: true, field: 'target_location_id',
      references: { model: 'locations', key: 'id' }
    },
    targetServicePointId: { type: DataTypes.STRING, allowNull: true, field: 'target_service_point_id',
      references: { model: 'service_points', key: 'id' }
    },
    sourceSystemId: { type: DataTypes.STRING, allowNull: true, field: 'source_system_id',
      references: { model: 'external_systems', key: 'id' }
    },
    externalRef: { type: DataTypes.STRING, allowNull: true, field: 'external_ref',
      comment: 'Identificador del evento/petición/ del mensaje en el sistema externo'
     },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' },
    expiresAt: { type: DataTypes.DATE, allowNull: true, field: 'expires_at' }
  }, {
    tableName: 'messages',
    timestamps: false,
    validate: {
      // Exactamente uno de los targets debe estar presente
      hasOneTarget() {
        if (!this.targetLocationId && !this.targetServicePointId) {
          throw new Error('Message must have either target_location_id or target_service_point_id');
        }
        if (this.targetLocationId && this.targetServicePointId) {
          throw new Error('Message cannot have both target_location_id and target_service_point_id');
        }
      }
    }
  });
};


// MESSAGE_DELIVERY (Registro de entregas)
// =============================================================
const MessageDelivery = (sequelize) => {
  return sequelize.define('MessageDelivery', {
    messageId: { type: DataTypes.STRING, primaryKey: true, field: 'message_id',
      references: { model: 'messages', key: 'id' },
      onDelete: 'CASCADE'
    },
    nodeId: { type: DataTypes.STRING, primaryKey: true, field: 'node_id',
      references: { model: 'display_nodes', key: 'id' },
      onDelete: 'CASCADE'
    },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' },
    deliveredAt: { type: DataTypes.DATE, allowNull: true, field: 'delivered_at',
      comment: 'A proporcionar por el nodo en su ACK'
     },
    acknowledgedAt: { type: DataTypes.DATE, allowNull: true, field: 'acknowledged_at' },
    status: { type: DataTypes.STRING, defaultValue: 'pending', field: 'status',
      validate: {
        isIn: [['pending', 'displayed', 'expired', 'filtered', 'error']]
      }
    },
    statusReason: { type: DataTypes.STRING, allowNull: true, field: 'status_reason' },
    acknowledged: {
      type: DataTypes.VIRTUAL,
      get() { return this.acknowledgedAt !== null; }
    }
  }, {
    tableName: 'message_deliveries',
    timestamps: false,
    validate: {
      ackAfterDelivery() {
        if (this.deliveredAt && this.acknowledgedAt) {
          if (this.acknowledgedAt <= this.deliveredAt) {
            throw new Error('Acknowledge time must be after delivery time');
          }
        }
      }
    }
  });
};


// DISPLAY_TEMPLATE (Plantillas de presentación)
// =============================================================
const DisplayTemplate = (sequelize) => {
  return sequelize.define('DisplayTemplate', {
    id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    config: { type: DataTypes.JSONB, allowNull: true, defaultValue: {},
      validate: {
        isValidConfig(value) {
          // Validación básica de estructura de configuración
          if (value && typeof value !== 'object') {
            throw new Error('Config must be a valid JSON object');
          }
        }
      }
    }
  }, {
    tableName: 'display_templates',
    timestamps: false,
    comment: 'Plantillas que definen apariencia y comportamiento de la presentación en los nodos de visualización'
  });
};


// DEFINICIÓN DE ASOCIACIONES ENTRE MODELOS
// =============================================================
const defineAssociations = ({ Hierarchy, HierarchyLevel, Location, DisplayNode,
                              NodeLocationMapping, ServicePointLocationMapping, ExternalSystem,
                              ServicePoint, Message, MessageDelivery, DisplayTemplate }) => {

  // Relación jerarquía--nivel
  Hierarchy.hasMany(HierarchyLevel, { foreignKey: 'hierarchyId' });
  HierarchyLevel.belongsTo(Hierarchy, { foreignKey: 'hierarchyId' });
  
  // Autorreferencia en nivel
  HierarchyLevel.belongsTo(HierarchyLevel, { as: 'previous', foreignKey: 'prevId' });
  HierarchyLevel.hasOne(HierarchyLevel, { as: 'next', foreignKey: 'prevId' });
  
  // Relación nivel--ubicación
  HierarchyLevel.hasMany(Location, { foreignKey: 'hierarchyLevelId' });
  Location.belongsTo(HierarchyLevel, { as: 'hierarchyLevel', foreignKey: 'hierarchyLevelId'});

  // (de-normalización) Relación ubicación--jerarquía
  Hierarchy.hasMany(Location, { foreignKey: 'hierarchyId' });
  Location.belongsTo(Hierarchy, { foreignKey: 'hierarchyId' });
  
  // Autorreferencia en ubicación
  Location.belongsTo(Location, { as: 'parent', foreignKey: 'parentId' });
  Location.hasMany(Location, { as: 'children', foreignKey: 'parentId' });

  // Plantillas - Relación con ubicaciones Y nodos (para override)
  DisplayTemplate.hasMany(Location, { foreignKey: 'templateId' });
  Location.belongsTo(DisplayTemplate, { as: 'displayTemplate', foreignKey: 'templateId' });
  
  DisplayTemplate.hasMany(DisplayNode, { foreignKey: 'templateOverrideId' });
  DisplayNode.belongsTo(DisplayTemplate, { as: 'templateOverride', foreignKey: 'templateOverrideId' });

  // Mapeos de nodos a ubicaciones (M:N)
  DisplayNode.belongsToMany(Location, { 
    through: NodeLocationMapping, 
    foreignKey: 'nodeId',
    otherKey: 'locationId'
  });
  Location.belongsToMany(DisplayNode, { 
    through: NodeLocationMapping, 
    foreignKey: 'locationId',
    otherKey: 'nodeId'
  });

  // Puntos de servicio y ubicaciones (M:N)
  ServicePoint.belongsToMany(Location, { 
    through: ServicePointLocationMapping, 
    foreignKey: 'servicePointId',
    otherKey: 'locationId'
  });
  Location.belongsToMany(ServicePoint, { 
    through: ServicePointLocationMapping, 
    foreignKey: 'locationId',
    otherKey: 'servicePointId'
  });

  // Mensajes
  ExternalSystem.hasMany(Message, { foreignKey: 'sourceSystemId' });
  Message.belongsTo(ExternalSystem, { foreignKey: 'sourceSystemId' });
  
  Location.hasMany(Message, { foreignKey: 'targetLocationId' });
  Message.belongsTo(Location, { as: 'targetLocation', foreignKey: 'targetLocationId' });
  
  ServicePoint.hasMany(Message, { foreignKey: 'targetServicePointId' });
  Message.belongsTo(ServicePoint, { as: 'targetServicePoint', foreignKey: 'targetServicePointId' });

  // Entregas de mensajes (M:N)
  Message.belongsToMany(DisplayNode, { 
    through: MessageDelivery, 
    foreignKey: 'messageId',
    otherKey: 'nodeId'
  });
  DisplayNode.belongsToMany(Message, { 
    through: MessageDelivery, 
    foreignKey: 'nodeId',
    otherKey: 'messageId'
  });
};


// EXPORTACIÓN DE MODELOS
// =============================================================
module.exports = {
  defs: {
    Hierarchy,
    HierarchyLevel,
    Location,
    DisplayNode,
    NodeLocationMapping,
    ServicePointLocationMapping,
    ExternalSystem,
    ServicePoint,
    Message,
    MessageDelivery,
    DisplayTemplate
  },
  funs: { defineAssociations }
};
