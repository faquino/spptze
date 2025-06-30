/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */
 
// =============================================================
// SPPTZE - MODELOS SEQUELIZE
// =============================================================
// Se usa en algunas tablas created_At junto con timestamps: false deliberadamente; timestamps: Sequelize
// añadiría en esas tablas un campo updated_at, que se ha considerado inncecesario para el modelo de datos
const { DataTypes, Op } = require('sequelize');
const ipaddr = require('ipaddr.js');


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


// Canales de mensaje válidos
// TODO: migrar a nueva tabla 'channels' vinculada con ExternalSystem, DisplayTemplate y Message
const VALID_MESSAGE_CHANNELS = ['calls', 'info', 'emergency', 'announcements'];

// Para reutilizar funciones de validación en los modelos
const validators = {
  // En Location, DisplayNode y ServicePoint
  //Los IDs de estas entidades se usarán directamente como niveles en topics MQTT
  isMQTTCompatible(value) {
    if (!/^[A-Za-z0-9_-]{1,16}$/.test(value)) {
      throw new Error('Field must be 1-16 chars, alphanumeric with _ or - only');
    }
  }
};


// HIERARCHY (Jerarquías organizativas)
// =============================================================
const Hierarchy = (sequelize) => {
  return sequelize.define('Hierarchy', {
    id: { type: DataTypes.STRING(16), primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true }
  }, {
    tableName: 'hierarchies',
    timestamps: false,
    comment: 'Jerarquías organizativas definidas en el sistema',
  });
};


// HIERARCHY_LEVEL (Niveles de jerarquía)
// =============================================================
const HierarchyLevel = (sequelize) => {
  const model = sequelize.define('HierarchyLevel', {
    id: { type: DataTypes.STRING(16), primaryKey: true, allowNull: false },
    hierarchyId: { type: DataTypes.STRING(16), allowNull: false, field: 'hierarchy_id',
      references: { model: 'hierarchies', key: 'id' },
      onDelete: 'RESTRICT', // No permitir borrar jerarquía si tiene niveles
      onUpdate: 'CASCADE'
    },
    name: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    prevId: { type: DataTypes.STRING(16), allowNull: true, field: 'prev_id',
      comment: 'Referencia al nivel previo de la jerarquía',
      references: { model: 'hierarchy_levels', key: 'id' },
      onDelete: 'RESTRICT', // No permitir borrar nivel si otros dependen de él
      onUpdate: 'CASCADE'
    }
  }, {
    tableName: 'hierarchy_levels',
    timestamps: false,
    comment: 'Niveles definidos por cada jerarquía organizativa',
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
    id: { type: DataTypes.STRING(16), primaryKey: true, allowNull: false,
      validate: {
        isMQTTCompatible: validators.isMQTTCompatible
      }
    },
    name: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    hierarchyId: { type: DataTypes.STRING(16), allowNull: false, field: 'hierarchy_id',
      comment: '(DN) Referencia a la jerarquía a la que pertenece la ubicación',
      references: { model: 'hierarchies', key: 'id' },
      onDelete: 'RESTRICT', // No permitir borrar jerarquía si tiene ubicaciones
      onUpdate: 'CASCADE'
    },
    hierarchyLevelId: { type: DataTypes.STRING(16), allowNull: false, field: 'hierarchy_level_id',
      references: { model: 'hierarchy_levels', key: 'id' },
      onDelete: 'RESTRICT', // No permitir borrar nivel si hay ubicaciones en él
      onUpdate: 'CASCADE'
     },
    parentId: { type: DataTypes.STRING(16), allowNull: true, field: 'parent_id',
      comment: 'Referencia a la ubicación madre',
      references: { model: 'locations', key: 'id' },
      onDelete: 'RESTRICT', // No permitir borrar ubicación si tiene hijas
      onUpdate: 'CASCADE'
    },
    templateId: { type: DataTypes.STRING(16), allowNull: true, field: 'template_id',
      references: { model: 'display_templates', key: 'id' },
      onDelete: 'SET NULL', // Permitir borrar plantilla, heredará de otra ubicación precedente
      onUpdate: 'CASCADE'
    }
  }, {
    tableName: 'locations',
    timestamps: false,
    comment: 'Ubicaciones inventariadas en la jerarquía organizativa',
    indexes: [
      { fields: ['hierarchy_id'] },
      { fields: ['hierarchy_level_id'] },
      { fields: ['parent_id'] },
      { fields: ['template_id'] }
    ],
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

  // Método para obtener las descendientes de una ubicación
  model.prototype.getChildren = async function() {
    const immediateChildren = await sequelize.models.Location.findAll({ where: { parentId: this.id } });
    let retVal = [...immediateChildren];
    for (const child of immediateChildren) {
      const grandChildren = await child.getChildren();
      retVal = retVal.concat(grandChildren);
    }
    return retVal;
  };

  return model;
};


// DISPLAY_NODE (Nodos de visualización)
// =============================================================
const DisplayNode = (sequelize) => {
  const model = sequelize.define('DisplayNode', {
    id: { type: DataTypes.STRING(16), primaryKey: true, allowNull: false,
      validate: {
        isMQTTCompatible: validators.isMQTTCompatible
      }
    },
    name: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    serialNumber: { type: DataTypes.STRING(32), allowNull: true, field: 'serial_number' },
    macAddress: { type: DataTypes.STRING(12), allowNull: true, field: 'mac_address',
      comment: 'Seis bytes codificados en hexadecimal, sin separadores',
      set(value) {
        this.setDataValue('mac_address', value ? value.replace(/[:-\s\.]/g, '').toUpperCase() : value);
      },
      validate: {
        isValidMAC(value) {
          if (value && !/^[0-9A-F]{12}$/i.test(value)) {
            throw new Error('MAC address must be 12 hex characters without separators');
          }
        }
      }
    },
    hostname: { type: DataTypes.STRING(255), allowNull: true },
    hardwareModel: { type: DataTypes.STRING(32), allowNull: true, field: 'hardware_model' },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    lastSeen: { type: DataTypes.DATE, allowNull: true, field: 'last_seen' },
    templateOverrideId: { type: DataTypes.STRING(16), allowNull: true, field: 'template_override_id',
      comment: 'Permite anular la lógica de asignación de plantilla basada en la jerarquía de ubicaciones',
      references: { model: 'display_templates', key: 'id' },
      onDelete: 'SET NULL', // Permitir borrar plantilla, volverá a resolverse por ubicación
      onUpdate: 'CASCADE'
    },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' }
  }, {
    tableName: 'display_nodes',
    timestamps: false,
    comment: 'Nodos de visualización inventariados en el sistema',
    indexes: [
      { fields: ['active'] },
      { fields: ['template_override_id'] },
      { fields: ['last_seen'] }
    ]
  });

  // Se devuelve un array con las plantillas más específicas (a mayor profundidad en la jerarquía). El código cliente
  //deberá tomar la decisión correspondiente si la longitud de dicho array > 1
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
    nodeId: { type: DataTypes.STRING(16), primaryKey: true, field: 'node_id',
      references: { model: 'display_nodes', key: 'id' },
      onDelete: 'CASCADE', // Borrar nodo elimina sus mapeos
      onUpdate: 'CASCADE'
    },
    locationId: { type: DataTypes.STRING(16), primaryKey: true, field: 'location_id',
      references: { model: 'locations', key: 'id' },
      onDelete: 'CASCADE', // Borrar ubicación elimina sus mapeos
      onUpdate: 'CASCADE'
    },
    showChildren: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'show_children' },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, {
    tableName: 'node_location_mapping',
    timestamps: false,
    comment: 'Tabla de relación M:N entre DisplayNode y Location',
  });
};


// SERVICE_POINT_LOCATION_MAPPING (Mapeo punto servicio-ubicación)
// =============================================================
const ServicePointLocationMapping = (sequelize) => {
  return sequelize.define('ServicePointLocationMapping', {
    servicePointId: { type: DataTypes.STRING(16), primaryKey: true, field: 'service_point_id',
      references: { model: 'service_points', key: 'id' },
      onDelete: 'CASCADE', // Borrar service point elimina sus mapeos
      onUpdate: 'CASCADE'
    },
    locationId: { type: DataTypes.STRING(16), primaryKey: true, field: 'location_id',
      references: { model: 'locations', key: 'id' },
      onDelete: 'CASCADE', // Borrar ubicación elimina sus mapeos
      onUpdate: 'CASCADE'
    }
  }, {
    tableName: 'service_point_location_mapping',
    timestamps: false,
    comment: 'Tabla de relación M:N entre ServicePoint y Location',
  });
};


// EXTERNAL_SYSTEM (Sistemas externos)
// =============================================================
const ExternalSystem = (sequelize) => {
  return sequelize.define('ExternalSystem', {
    id: { type: DataTypes.STRING(16), primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    apiKey: { type: DataTypes.STRING(64), allowNull: true, field: 'api_key' },
    allowedIPs: { type: DataTypes.JSON, allowNull: true, field: 'allowed_ips',
      comment: 'Lista de IPs o rangos CIDR autorizados para el sistema',
      validate: {
        isValidIPArray(value) {
          if (value === null) return;
          if (!Array.isArray(value)) throw new Error('allowedIPs must be an array or null');
          for (const item of value) {
            if (typeof item !== 'string' || item.trim() === '')
              throw new Error('Each item in allowedIPs must be a non-empty string');
            
            // Verificar si es CIDR
            if (item.includes('/')) {
              if (!ipaddr.isValidCIDR(item)) throw new Error(`Invalid CIDR: ${item}`);
            } else {
              if (!ipaddr.isValid(item)) throw new Error(`Invalid IP: ${item}`);
            }
          }
        }
      }
    },
    defaultResolutionType: { type: DataTypes.STRING(1), allowNull: true, field: 'default_resolution_type',
      validate: {
        isIn: [ ['S', 'L'] ] // S=service_point, L=location
      }
    },
    defaultChannel: { type: DataTypes.STRING(16), defaultValue: 'calls', field: 'default_channel',
      validate: { isIn: [VALID_MESSAGE_CHANNELS] }
    },
    messageFormat: { type: DataTypes.JSON, allowNull: true, field: 'message_format' },
    ticketField: { type: DataTypes.STRING(20), defaultValue: 'ticket', field: 'ticket_field' },
    targetField: { type: DataTypes.STRING(20), defaultValue: 'target', field: 'target_field' },
    contentField: { type: DataTypes.STRING(20), defaultValue: 'content', field: 'content_field' },
    active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    tableName: 'external_systems',
    timestamps: false,
    comment: 'Sistemas externos que envían mensajes a través de la API',
  });
};


// SERVICE_POINT (Puntos de servicio - agrupaciones lógicas de ubicaciones)
// TODO?: Una relación M:N con ExternalSystem permitiría p.ej. la reutilización de ServicePoints entre sistemas.
// Actualmente cada ServicePoint pertenece a un único ExternalSystem, para resolver colisiones de external_id entre
// dos o más sistemas externos.
// =============================================================
const ServicePoint = (sequelize) => {
  return sequelize.define('ServicePoint', {
    id: { type: DataTypes.STRING(16), primaryKey: true, allowNull: false,
      validate: {
        isMQTTCompatible: validators.isMQTTCompatible
      }
    },
    name: { type: DataTypes.STRING(80), allowNull: false },
    sourceSystemId: { type: DataTypes.STRING(16), allowNull: false, field: 'source_system_id',
      references: { model: 'external_systems', key: 'id' },
      onDelete: 'RESTRICT', // No permitir borrar sistema si tiene service points
      onUpdate: 'CASCADE'
    },
    externalId: { type: DataTypes.STRING(36), allowNull: false, field: 'external_id' },
    active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    tableName: 'service_points',
    timestamps: false,
    comment: 'Agrupaciones lógicas de ubicaciones referidas por algún sistema externo',
    indexes: [
      { unique: true, fields: ['source_system_id', 'external_id'] },
      { fields: ['source_system_id'] }
    ]
  });
};


// MESSAGE (Mensajes/Llamadas)
// =============================================================
const Message = (sequelize) => {
  return sequelize.define('Message', {
    id: { type: DataTypes.STRING(16), primaryKey: true, allowNull: false },
    channel: { type: DataTypes.STRING(16), defaultValue: 'calls',
      validate: { isIn: [VALID_MESSAGE_CHANNELS] }
    },
    ticket: { type: DataTypes.STRING(16), allowNull: true },
    content: { type: DataTypes.TEXT, allowNull: false },
    priority: { type: DataTypes.INTEGER, defaultValue: 1,
      validate: { min: 1, max: 5 }
    },
    targetLocationId: { type: DataTypes.STRING(16), allowNull: true, field: 'target_location_id',
      references: { model: 'locations', key: 'id' },
      onDelete: 'RESTRICT', // No permitir borrar ubicación si hay mensajes pendientes
      onUpdate: 'CASCADE'
    },
    targetServicePointId: { type: DataTypes.STRING(16), allowNull: true, field: 'target_service_point_id',
      references: { model: 'service_points', key: 'id' },
      onDelete: 'RESTRICT', // No permitir borrar service point si hay mensajes pendientes
      onUpdate: 'CASCADE'
    },
    sourceSystemId: { type: DataTypes.STRING(16), allowNull: true, field: 'source_system_id',
      references: { model: 'external_systems', key: 'id' },
      onDelete: 'RESTRICT', // No permitir borrar sistema si hay mensajes suyos
      onUpdate: 'CASCADE'
    },
    externalRef: { type: DataTypes.STRING(36), allowNull: true, field: 'external_ref',
      comment: 'Identificador del evento/petición/... del mensaje en el sistema externo'
     },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' },
    expiresAt: { type: DataTypes.DATE, allowNull: true, field: 'expires_at' }
  }, {
    tableName: 'messages',
    timestamps: false,
    comment: 'Mensajes o llamadas de turno recibidos a través de la API',
    indexes: [
      { fields: ['target_location_id'] },
      { fields: ['target_service_point_id'] },
      { fields: ['source_system_id'] },
      { fields: ['created_at'] },
      { fields: ['expires_at'] },
      { fields: ['channel'] },
      { fields: ['priority'] }
    ],
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
    messageId: { type: DataTypes.STRING(16), primaryKey: true, field: 'message_id',
      references: { model: 'messages', key: 'id' },
      onDelete: 'CASCADE', // Borrar mensaje elimina sus registros de entrega
      onUpdate: 'CASCADE'
    },
    nodeId: { type: DataTypes.STRING(16), primaryKey: true, field: 'node_id',
      references: { model: 'display_nodes', key: 'id' },
      onDelete: 'CASCADE', // Borrar nodo elimina sus registros de entrega
      onUpdate: 'CASCADE'
    },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' },
    deliveredAt: { type: DataTypes.DATE, allowNull: true, field: 'delivered_at',
      comment: 'A proporcionar por el nodo en su ACK'
     },
    acknowledgedAt: { type: DataTypes.DATE, allowNull: true, field: 'acknowledged_at' },
    status: { type: DataTypes.STRING(12), defaultValue: 'pending', field: 'status',
      validate: {
        isIn: [['pending', 'displayed', 'expired', 'filtered', 'error']]
      }
    },
    statusReason: { type: DataTypes.STRING(16), allowNull: true, field: 'status_reason' },
    acknowledged: {
      type: DataTypes.VIRTUAL,
      get() { return this.acknowledgedAt !== null; }
    }
  }, {
    tableName: 'message_deliveries',
    timestamps: false,
    comment: 'Registros de entrega de mensajes a nodos de visualización',
    indexes: [
      { fields: ['status'] },
      { fields: ['created_at'] },
      { fields: ['delivered_at'] },
      { fields: ['acknowledged_at'] },
      { fields: ['status', 'created_at'] }
    ],
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
    id: { type: DataTypes.STRING(16), primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    config: { type: DataTypes.JSON, allowNull: true, defaultValue: {},
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


// DEFINICIÓN DE ASOCIACIONES ENTRE MODELOS-ENTIDADES
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

    // Puntos de servicio y sistemas externos
  ExternalSystem.hasMany(ServicePoint, { foreignKey: 'sourceSystemId' });
  ServicePoint.belongsTo(ExternalSystem, { as: 'sourceSystem', foreignKey: 'sourceSystemId' });

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