/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SETUP BASE DE DATOS SQLITE CON SEQUELIZE
// =============================================================
const { Sequelize } = require('sequelize');


// CONFIGURACIÓN DE SEQUELIZE PARA SQLITE
// =============================================================
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, 'spptze_dev.sqlite'),
  logging: console.log, // Para ver el SQL generado
  define: {
    timestamps: false,     // No se usan timestamps automáticos
    freezeTableName: true, // Usar nombres de tabla exactos, no pluralizados
  }
});

// INICIALIZAR MODELOS
// =============================================================
// Importar las funciones de definición de modelos
const dbModel = require('./models');

// Instanciar todos los modelos con Sequelize
const modelInstances = {};
Object.keys(dbModel.defs).forEach(modelName => {
  if (typeof dbModel.defs[modelName] === 'function') {
    modelInstances[modelName] = dbModel.defs[modelName](sequelize);
  }
});

// Definir asociaciones
dbModel.funs.defineAssociations(modelInstances);
console.log('Modelos instanciados y asociaciones definidas');


// Destructuring de modelos para su uso directo p.ej. Hierarchy en lugar de modelInstances.Hierarchy
const {
  Hierarchy, HierarchyLevel, Location, DisplayNode,
  NodeLocationMapping, ServicePointLocationMapping, ExternalSystem, ServicePoint,
  Message, MessageDelivery, DisplayTemplate
} = modelInstances;


// DATOS DE EJEMPLO
// =============================================================
async function seedDatabase() {
  console.log('Insertando datos de ejemplo...');

  try {
    // 1. Plantillas de presentación
    await DisplayTemplate.bulkCreate([
      {
        id: 'TPL_HOSPITAL_DEFAULT',
        name: 'Plantilla Hospital Estándar',
        description: 'Tema visual estándar para entornos hospitalarios',
        config: {
          channels: {
            calls: { zone: 'main', max_messages: 8, css_class: 'call-display' },
            emergency: { zone: 'overlay', max_messages: 1, css_class: 'emergency-alert' },
            info: { zone: 'footer', max_messages: 3, css_class: 'info-ticker' }
          },
          layout: 'standard',
          colors: { primary: '#2563eb', secondary: '#64748b' }
        }
      },
      {
        id: 'TPL_CARDIO_CUSTOM',
        name: 'Plantilla Cardiología',
        description: 'Tema personalizado para el servicio de cardiología',
        config: {
          channels: {
            calls: { zone: 'main', max_messages: 6, css_class: 'cardio-calls' },
            emergency: { zone: 'overlay', max_messages: 1, css_class: 'cardio-emergency' }
          },
          layout: 'compact',
          colors: { primary: '#dc2626', secondary: '#991b1b' }
        }
      }
    ]);

    // 2. Sistemas externos
    await ExternalSystem.bulkCreate([
      {
        id: 'HIS_SIHGA',
        name: 'Sistema HIS SIHGA',
        description: 'Hospital Information System - SIHGA/HPHIS',
        apiKey: 'api_key_hospital_123',
        allowedIPs: ['192.168.36.44'],
        defaultResolutionType: 'service_point',
        defaultChannel: 'popo',
        messageFormat: { ticket: 'string', agenda: 'string', patient: 'string' },
        ticketField: 'ticket',
        targetField: 'agenda',
        messageField: 'message',
        active: true
      },
      {
        id: 'ADMIN_PANEL',
        name: 'Panel Administración',
        description: 'Interface administrativa interna',
        apiKey: 'admin_key_456',
        defaultResolutionType: 'location',
        defaultChannel: 'info',
        messageFormat: { type: 'string', target_location: 'string', content: 'string' },
        ticketField: 'ticket',
        targetField: 'target_location',
        messageField: 'content',
        active: true
      }
    ]);

    // 3. Jerarquía para complejo hospitalario
    await Hierarchy.bulkCreate([
      { id: 'hospital', name: 'Complejo Hospitalario', description: 'Estructura organizativa típica de un hospital' },
      { id: 'test', name: 'Pruebas', description: 'Solo para comprobar índice en hierarchy_level'}
    ]);

    await HierarchyLevel.bulkCreate([
      { id: 0, hierarchyId: 'hospital', name: 'Edificio', description: 'Edificios del complejo hospitalario', prevId: null },
      { id: 1, hierarchyId: 'hospital', name: 'Planta', description: 'Plantas de cada edificio', prevId: 0 },
      { id: 2, hierarchyId: 'hospital', name: 'Area', description: 'Áreas o servicios especializados', prevId: 1 },
      { id: 3, hierarchyId: 'hospital', name: 'Consulta', description: 'Consultas o salas individuales', prevId: 2 },
      { id: 4, hierarchyId: 'test', name: 'Edificio', description: 'Edificios de Pruebas', prevId: null }
    ]);

    // 4. Estructura de ubicaciones
    await Location.bulkCreate([
      { id: 'EDI_MONTECELO', name: 'Edificio Montecelo', description: 'Edificio principal', hierarchyId: 'hospital', hierarchyLevelId: 0, parentId: null, templateId: 'TPL_HOSPITAL_DEFAULT' },
      { id: 'EDI_PROVINCIAL', name: 'Edificio Provincial', description: 'Edificio anexo', hierarchyId: 'hospital', hierarchyLevelId: 0, parentId: null, templateId: 'TPL_HOSPITAL_DEFAULT' },
      { id: 'PLANTA_2_MONT', name: 'Planta 2', description: 'Segunda planta del Montecelo', hierarchyId: 'hospital', hierarchyLevelId: 1, parentId: 'EDI_MONTECELO', templateId: 'TPL_HOSPITAL_DEFAULT' },
      { id: 'AREA_CARDIO', name: 'Cardiología', description: 'Servicio de Cardiología', hierarchyId: 'hospital', hierarchyLevelId: 2, parentId: 'PLANTA_2_MONT', templateId: 'TPL_CARDIO_CUSTOM' },
      { id: 'AREA_NEUMO', name: 'Neumología', description: 'Servicio de Neumología', hierarchyId: 'hospital', hierarchyLevelId: 2, parentId: 'PLANTA_2_MONT', templateId: 'TPL_HOSPITAL_DEFAULT' },
      { id: 'CONSULTA_3', name: 'Consulta 3', description: 'Consulta de Cardiología 3', hierarchyId: 'hospital', hierarchyLevelId: 3, parentId: 'AREA_CARDIO', templateId: null },
      { id: 'CONSULTA_4', name: 'Consulta 4', description: 'Consulta de Cardiología 4', hierarchyId: 'hospital', hierarchyLevelId: 3, parentId: 'AREA_CARDIO', templateId: null }
    ]);

    // 5. Puntos de servicio
    await ServicePoint.bulkCreate([
      { id: 'SP_CARDIO_03', name: 'Cardiología Consulta 3', externalId: 'CARDIO_MAÑANA_DRG', active: true },
      { id: 'SP_CARDIO_04', name: 'Cardiología Consulta 4', externalId: 'CARDIO_TARDE_DRG', active: true },
      { id: 'SP_CARDIO', name: 'Servicio Cardiología General', externalId: 'CARDIO_GENERAL', active: true }
    ]);

    // 6. Mapeo de puntos de servicio a ubicaciones
    await ServicePointLocationMapping.bulkCreate([
      { servicePointId: 'SP_CARDIO_03', locationId: 'CONSULTA_3' },
      { servicePointId: 'SP_CARDIO_04', locationId: 'CONSULTA_4' },
      { servicePointId: 'SP_CARDIO', locationId: 'AREA_CARDIO' },
      { servicePointId: 'SP_CARDIO', locationId: 'CONSULTA_3' },
      { servicePointId: 'SP_CARDIO', locationId: 'CONSULTA_4' }
    ]);

    // 7. Nodos de visualización
    await DisplayNode.bulkCreate([
      {
        id: 'NODE_CARDIO_WAIT',
        name: 'Pantalla Sala Espera Cardiología',
        description: 'Raspberry Pi en sala de espera de cardiología',
        serialNumber: 'RPI4B2024001',
        macAddress: 'DCA632123456',
        hostname: 'rpi-cardio-01',
        hardwareModel: 'Raspberry Pi 4B',
        status: 'active',
        templateOverrideId: null
      },
      {
        id: 'NODE_PLANTA2_HALL',
        name: 'Pantalla Hall Planta 2',
        description: 'Pantalla informativa general en hall principal',
        serialNumber: 'RPI4B2024002',
        macAddress: 'DCA632123457',
        hostname: 'rpi-hall-02',
        hardwareModel: 'Raspberry Pi 4B',
        status: 'active',
        templateOverrideId: 'TPL_HOSPITAL_DEFAULT'
      }
    ]);

    // 8. Mapeo de nodos a ubicaciones
    await NodeLocationMapping.bulkCreate([
      { nodeId: 'NODE_CARDIO_WAIT', locationId: 'AREA_CARDIO', showChildren: true, active: true },
      { nodeId: 'NODE_PLANTA2_HALL', locationId: 'PLANTA_2_MONT', showChildren: false, active: true }
    ]);

    // 9. Ejemplo de mensaje
    await Message.create({
      id: 'MSG_001',
      channel: 'calls',
      ticket: 'A047',
      content: 'Turno A047 - Consulta 3',
      priority: 3,
      targetLocationId: null,
      targetServicePointId: 'SP_CARDIO_03',
      sourceSystemId: 'HIS_SIHGA',
      externalRef: 'CITA_12345',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutos
    });

    console.log('Datos de ejemplo insertados correctamente');

  } catch (error) {
    console.error('Error insertando datos:', error);
    throw error;
  }
}


// FUNCIÓN PRINCIPAL DE SETUP
// =============================================================
async function setupDatabase() {
  try {
    console.log('Iniciando setup de base de datos SQLite...');
    
    // Probar conexión
    await sequelize.authenticate();
    console.log('Conexión a SQLite establecida correctamente');

    // Crear todas las tablas
    await sequelize.sync({ force: true }); // force: true elimina tablas existentes
    console.log('Tablas creadas correctamente');

    // Insertar datos de ejemplo
    await seedDatabase();

    console.log('Setup completado exitosamente!');
    console.log('Base de datos guardada en: turnos_system.db');
    
    return sequelize;

  } catch (error) {
    console.error('Error durante el setup:', error);
    process.exit(1);
  }
}


// FUNCIÓN DE PRUEBA
// =============================================================
async function testDatabase() {
  console.log('\nEjecutando pruebas mínimas...');

  try {
    // Probar consulta con asociaciones
    const location = await Location.findByPk('CONSULTA_3', {
      include: [
        { model: DisplayTemplate, as: 'displayTemplate' },
        { model: Location, as: 'parent' },
        { model: ServicePoint }
      ]
    });
    
    console.log('Ubicación encontrada:', location?.name);
    console.log('Ubicación padre:', location?.parent?.name);
    console.log('Plantilla:', location?.DisplayTemplate?.name || 'Heredada');
    console.log('Puntos de servicio:', location?.ServicePoints?.map(sp => sp.name));

    // Probar consulta de mensajes
    const message = await Message.findByPk('MSG_001', {
      include: [
        { model: ServicePoint, as: 'targetServicePoint' },
        { model: ExternalSystem }
      ]
    });
    
    console.log('\nMensaje encontrado:', message?.content);
    console.log('Dirigido a:', message?.targetServicePoint?.name);
    console.log('Sistema origen:', message?.ExternalSystem?.name);

    // Probar método getEffectiveTemplate
    const node = await DisplayNode.findByPk('NODE_CARDIO_WAIT');
    if (node) {
      console.log('\nProbando método getEffectiveTemplate...');
      const templates = await node.getEffectiveTemplate();
      if (templates.length === 0) {
        console.log('Plantillas efectivas para NODE_CARDIO_WAIT: Ninguna');
      } else if (templates.length === 1) {
        console.log('Plantilla efectiva para NODE_CARDIO_WAIT:', templates[0].name);
      } else {
        console.log(`Conflicto de plantillas para NODE_CARDIO_WAIT (${templates.length} plantillas en misma profundidad):`);
        templates.forEach(t => console.log(`  - ${t.name} (${t.id})`));
      }
    }

    // Probar métodos de jerarquía
    console.log('\nProbando métodos de jerarquía...');
    
    // Probar con HierarchyLevel
    const consultaLevel = await HierarchyLevel.findOne({ where: { name: 'Consulta' }});
    if (consultaLevel) {
      const depth = await consultaLevel.getDepth();
      const path = await consultaLevel.getPath();
      console.log(`Nivel "Consulta" - Profundidad: ${depth}`);
      console.log(`Path desde raíz: ${path.map(level => level.name).join(' → ')}`);
    }
    
    // Probar con Location
    const consulta3 = await Location.findByPk('CONSULTA_3');
    if (consulta3) {
      const depth = await consulta3.getDepth();
      const path = await consulta3.getPath();
      console.log(`\nUbicación "CONSULTA_3" - Profundidad: ${depth}`);
      console.log(`Path desde raíz: ${path.map(loc => loc.name).join(' → ')}`);
    }

    console.log('\nTodas las pruebas pasaron correctamente');

  } catch (error) {
    console.error('Error en las pruebas:', error);
  }
}


// EJECUCIÓN
// =============================================================
if (require.main === module) {
  // Solo ejecutar si se llama directamente
  setupDatabase()
    .then(() => testDatabase())
    .then(() => {
      console.log('\nSetup finalizado. Base de datos lista para usar.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error fatal:', error);
      process.exit(1);
    });
}
