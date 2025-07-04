/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - SETUP BASE DE DATOS CON SEQUELIZE
// cap5/server/scripts/seed.js
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
// TODO bulkCreate no ejecuta validaciones ni hooks. Añadir parámetro {validate: true, individualHooks: true }
async function seedDatabase() {
  console.log('Insertando datos de ejemplo...');

  try {
    // Plantillas de presentación
    await DisplayTemplate.bulkCreate([
      {
        id: 'TPL_HOSP_DEF',
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
        id: 'TPL_CARDIO',
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
        defaultTargetType: 'S', // S=service_point
        defaultChannel: 'calls',
        messageFormat: { ticket: 'string', agenda: 'string', patient: 'string' },
        ticketField: 'ticket',
        targetField: 'agenda',
        contentField: 'message',
        active: true
      },
      {
        id: 'ADMIN_PANEL',
        name: 'Panel Administración',
        description: 'Interfaz administrativa interna',
        apiKey: 'demo-key-admin-456',
        defaultTargetType: 'L', // L=location
        defaultChannel: 'info',
        messageFormat: { type: 'string', target_location: 'string', content: 'string' },
        ticketField: 'ticket',
        targetField: 'target_location',
        contentField: 'content',
        active: true
      }
    ]);

    // Jerarquía para complejo hospitalario
    await Hierarchy.bulkCreate([
      { id: 'CH', name: 'Complejo Hospitalario', description: 'Estructura organizativa típica de un hospital' }
    ]);

    // Niveles de la jerarquía
    await HierarchyLevel.bulkCreate([
      { id: 'CH_EDI', hierarchyId: 'CH', name: 'Edificio', description: 'Edificios del complejo hospitalario', prevId: null },
      { id: 'CH_PLT', hierarchyId: 'CH', name: 'Planta', description: 'Plantas de cada edificio', prevId: 'CH_EDI' },
      { id: 'CH_ARA', hierarchyId: 'CH', name: 'Area', description: 'Áreas o servicios especializados', prevId: 'CH_PLT' },
      { id: 'CH_CON', hierarchyId: 'CH', name: 'Consulta', description: 'Consultas o salas individuales', prevId: 'CH_ARA' }
    ]);

    // Ubicaciones
    await Location.bulkCreate([
      { id: 'EDI_MONTECELO', name: 'Edificio Montecelo', description: 'Edificio principal', hierarchyId: 'CH', hierarchyLevelId: 'CH_EDI', parentId: null, templateId: 'TPL_HOSP_DEF' },
      { id: 'PLANTA_2_MONT', name: 'Planta 2', description: 'Segunda planta del Montecelo', hierarchyId: 'CH', hierarchyLevelId: 'CH_PLT', parentId: 'EDI_MONTECELO', templateId: 'TPL_HOSP_DEF' },
      { id: 'AREA_CARDIO', name: 'Cardiología', description: 'Servicio de Cardiología', hierarchyId: 'CH', hierarchyLevelId: 'CH_ARA', parentId: 'PLANTA_2_MONT', templateId: 'TPL_CARDIO' },
      { id: 'CONSULTA_3', name: 'Consulta 3', description: 'Consulta de Cardiología 3', hierarchyId: 'CH', hierarchyLevelId: 'CH_CON', parentId: 'AREA_CARDIO', templateId: null },
      { id: 'CONSULTA_4', name: 'Consulta 4', description: 'Consulta de Cardiología 4', hierarchyId: 'CH', hierarchyLevelId: 'CH_CON', parentId: 'AREA_CARDIO', templateId: null }
    ]);

    // Puntos de servicio
    await ServicePoint.bulkCreate([
      { id: 'SP_CARDIO_03', name: 'Cardiología Consulta 3', sourceSystemId: 'HIS_SIHGA', externalId: 'CARDIO_MAÑANA_DRG', active: true },
      { id: 'SP_CARDIO_04', name: 'Cardiología Consulta 4', sourceSystemId: 'HIS_SIHGA', externalId: 'CARDIO_TARDE_DRG', active: true }
    ]);

    // Mapeo de puntos de servicio a ubicaciones
    await ServicePointLocationMapping.bulkCreate([
      { servicePointId: 'SP_CARDIO_03', locationId: 'CONSULTA_3' },
      { servicePointId: 'SP_CARDIO_04', locationId: 'CONSULTA_4' }
    ]);

    // Nodos de visualización
    await DisplayNode.bulkCreate([
      {
        id: 'NODE_CARDIO',
        name: 'Pantalla Sala Espera Cardiología',
        description: 'Raspberry Pi en sala de espera de cardiología',
        serialNumber: 'RPI4B2024001',
        macAddress: 'DCA632123456',
        hostname: 'rpi-cardio-01',
        hardwareModel: 'Raspberry Pi 4B',
        active: 'true',
        templateOverrideId: null,
        lastSeen: new Date()
      }
    ]);

    // Mapeo de nodos a ubicaciones
    await NodeLocationMapping.bulkCreate([
      { nodeId: 'NODE_CARDIO', locationId: 'CONSULTA_3', showChildren: false, active: true }
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
    const node = await DisplayNode.findByPk('NODE_CARDIO', {
      include: [{model: Location}]
    });
    console.log('Nodo:', node?.name);
    console.log('Estado activo:', node?.active);
    console.log('Ubicaciones asignadas:', node?.Locations?.map(l => l.name));
    if (node) {
      console.log('\ Probando método getEffectiveTemplate...');
      const templates = await node.getEffectiveTemplate();
      if (templates.length === 0) {
        console.log('Plantillas efectivas para NODE_CARDIO: Ninguna');
      } else if (templates.length === 1) {
        console.log('Plantilla efectiva para NODE_CARDIO:', templates[0].name);
      } else {
        console.log(`Conflicto de plantillas para NODE_CARDIO (${templates.length} plantillas en misma profundidad):`);
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

    // Probar getChildren
    const planta2M = await Location.findByPk('PLANTA_2_MONT');
    if (planta2M) {
      const children = await planta2M.getChildren();
      console.log(`\n Ubicación "PLANTA_2_MONT" tiene ${children.length} descendientes:`);
      children.forEach(child => console.log(`  - ${child.name} (${child.id})`));
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