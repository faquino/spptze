/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - SETUP BASE DE DATOS SQLITE CON SEQUELIZE
// =============================================================
const { sequelize, testConnection, syncDatabase } = require('../config/database');
// Importar las funciones de definición de modelos
const dbModel = require('../models/definitions');


// INICIALIZAR MODELOS SEQUELIZE
// =============================================================
const modelInstances = {};
Object.keys(dbModel.defs).forEach(modelName => {
  if (typeof dbModel.defs[modelName] === 'function') {
    modelInstances[modelName] = dbModel.defs[modelName](sequelize);
  }
});

// Definir asociaciones
dbModel.funs.defineAssociations(modelInstances);

// Destructuring de modelos para su uso directo p.ej. Hierarchy en lugar de modelInstances.Hierarchy
const {
  Hierarchy, HierarchyLevel, Location, DisplayNode,
  NodeLocationMapping, ServicePointLocationMapping, ExternalSystem, ServicePoint,
  Message, MessageDelivery, DisplayTemplate
} = modelInstances;


// INSERCIÓN DE DATOS DE EJEMPLO
// =============================================================
async function seedDatabase() {
  console.log('Insertando datos de ejemplo...');

  try {
    // Plantillas de presentación
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

    // Sistemas externos
    await ExternalSystem.bulkCreate([
      {
        id: 'HIS_SIHGA',
        name: 'Sistema HIS SIHGA',
        description: 'Hospital Information System - SIHGA/HPHIS',
        apiKey: 'demo-api-key-hospital-123',
        allowedIPs: ['127.0.0.1', '::1'],
        defaultResolutionType: 'service_point',
        defaultChannel: 'calls',
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
        apiKey: 'demo-key-admin-456',
        defaultResolutionType: 'location',
        defaultChannel: 'info',
        messageFormat: { type: 'string', target_location: 'string', content: 'string' },
        ticketField: 'ticket',
        targetField: 'target_location',
        messageField: 'content',
        active: true
      }
    ]);

    // Jerarquía para complejo hospitalario
    await Hierarchy.bulkCreate([
      { id: 'hospital', name: 'Complejo Hospitalario', description: 'Estructura organizativa típica de un hospital' }
    ]);

    // Niveles de la jerarquía
    await HierarchyLevel.bulkCreate([
      { id: 0, hierarchyId: 'hospital', name: 'Edificio', description: 'Edificios del complejo hospitalario', prevId: null },
      { id: 1, hierarchyId: 'hospital', name: 'Planta', description: 'Plantas de cada edificio', prevId: 0 },
      { id: 2, hierarchyId: 'hospital', name: 'Area', description: 'Áreas o servicios especializados', prevId: 1 },
      { id: 3, hierarchyId: 'hospital', name: 'Consulta', description: 'Consultas o salas individuales', prevId: 2 }
    ]);

    // Ubicaciones
    await Location.bulkCreate([
      { id: 'EDI_MONTECELO', name: 'Edificio Montecelo', description: 'Edificio principal', hierarchyId: 'hospital', hierarchyLevelId: 0, parentId: null, templateId: 'TPL_HOSPITAL_DEFAULT' },
      { id: 'PLANTA_2_MONT', name: 'Planta 2', description: 'Segunda planta del Montecelo', hierarchyId: 'hospital', hierarchyLevelId: 1, parentId: 'EDI_MONTECELO', templateId: 'TPL_HOSPITAL_DEFAULT' },
      { id: 'AREA_CARDIO', name: 'Cardiología', description: 'Servicio de Cardiología', hierarchyId: 'hospital', hierarchyLevelId: 2, parentId: 'PLANTA_2_MONT', templateId: 'TPL_CARDIO_CUSTOM' },
      { id: 'CONSULTA_3', name: 'Consulta 3', description: 'Consulta de Cardiología 3', hierarchyId: 'hospital', hierarchyLevelId: 3, parentId: 'AREA_CARDIO', templateId: null },
      { id: 'CONSULTA_4', name: 'Consulta 4', description: 'Consulta de Cardiología 4', hierarchyId: 'hospital', hierarchyLevelId: 3, parentId: 'AREA_CARDIO', templateId: null }
    ]);

    // Puntos de servicio
    await ServicePoint.bulkCreate([
      { id: 'SP_CARDIO_03', name: 'Cardiología Consulta 3', externalId: 'CARDIO_MAÑANA_DRG', active: true },
      { id: 'SP_CARDIO_04', name: 'Cardiología Consulta 4', externalId: 'CARDIO_TARDE_DRG', active: true }
    ]);

    // Mapeo de puntos de servicio a ubicaciones
    await ServicePointLocationMapping.bulkCreate([
      { servicePointId: 'SP_CARDIO_03', locationId: 'CONSULTA_3' },
      { servicePointId: 'SP_CARDIO_04', locationId: 'CONSULTA_4' }
    ]);

    // Nodos de visualización
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
        templateOverrideId: null,
        lastSeen: new Date()
      }
    ]);

    // Mapeo de nodos a ubicaciones
    await NodeLocationMapping.bulkCreate([
      { nodeId: 'NODE_CARDIO_WAIT', locationId: 'AREA_CARDIO', showChildren: true, active: true }
    ]);

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
    console.log('Iniciando setup de base de datos...');
    
    // Probar conexión
    await testConnection();

    // Sincronización de modelos con la BD y creación del esquema
    await syncDatabase(true); // Se sobreescribe el esquema existente

    // Inserción de datos iniciales
    await seedDatabase();

    console.log('Setup completado con éxito!');

  } catch (error) {
    console.error('Error durante el setup:', error);
    process.exit(1);
  }
}


// PRUEBAS SEQUELIZE SOBRE EL MODELO CON LOS DATOS INICIALES
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

    // Probar método getEffectiveTemplate
    const node = await DisplayNode.findByPk('NODE_CARDIO_WAIT', {
      include: [{model: Location}]
    });
    console.log('Nodo:', node?.name);
    console.log('Ubicaciones asignadas:', node?.Locations?.map(l => l.name));
    if (node) {
      console.log('\ Probando método getEffectiveTemplate...');
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
    console.log('\n Probando métodos de jerarquía...');
    
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
      console.log(`\n Ubicación "CONSULTA_3" - Profundidad: ${depth}`);
      console.log(`Path desde raíz: ${path.map(loc => loc.name).join(' → ')}`);
    }

    // Probar resolución de service point
    const servicePoint = await ServicePoint.findByPk('SP_CARDIO_03', {
      include: [{ model: Location }]
    });
    
    console.log('Service Point:', servicePoint?.name);
    console.log('Ubicaciones:', servicePoint?.Locations?.map(l => l.name));

    console.log('\n Todas las pruebas pasaron correctamente');

  } catch (error) {
    console.error('Error en las pruebas:', error);
  }
}


// EJECUCIÓN
// =============================================================
if (require.main === module) {   // Solo ejecutar si se llama directamente (no desde imports)
  setupDatabase()
    .then(() => testDatabase())
    .then(() => {
      console.log('\n Setup finalizado. Base de datos lista para usar.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error fatal:', error);
      process.exit(1);
    });
}
