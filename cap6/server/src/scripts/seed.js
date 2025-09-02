/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - SETUP BASE DE DATOS CON SEQUELIZE
// cap6/server/src/scripts/seed.js
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
// TODO: OJO bulkCreate no ejecuta validaciones ni hooks. Añadir parámetro {validate: true, individualHooks: true }
async function seedDatabase() {
  console.log('Insertando datos de ejemplo...');

  try {

    // Plantillas de presentación
    const defaultTemplate = await DisplayTemplate.create({
      id: 'TPL_HOSP_DEF',
      name: 'Plantilla Principal',
      description: 'Plantilla por defecto del sistema',
      orientation: 'landscape',
      targetSize: 43,
      isActive: true,
      definition: {
        layout: {
          columns: 12, rows: 8, gap: '10px',
          areas: {
            header: { row: [1, 2], column: [1, 13] },
            queue: { row: [2, 7], column: [1, 9] },
            info: { row: [2, 7], column: [9, 13] },
            ticker: { row: [7, 8], column: [1, 13] },
            footer: { row: [8, 9], column: [1, 13] }
          }
        },
        widgets: [
          {
            id: 'hospital-logo', type: 'logo', area: 'header',
            config: {
              src: 'logo-hospital.png',
              height: '80px',
              alignment: 'center'
            }
          },
          {
            id: 'main-queue', type: 'queue', area: 'queue', channel: 'calls',
            config: {
              showTicket: true,
              showContent: true,
              animationDuration: 500,
              striped: true,  // Enable zebra striping
              stripeColor: 'rgba(0,0,0,0.03)'  // Light stripe
            },
            theme: {
              typography: {
                fontSize: '1.1em'  // Slightly larger text
              }
            }
          },
          {
            id: 'info-panel', type: 'info', area: 'info', channel: 'info',
            config: {
              defaultText: 'Bienvenidos al Hospital Universitario',
              fontSize: '1.2em'
            }
          },
          {
            id: 'news-ticker', type: 'ticker', area: 'ticker', channel: 'announcements',
            config: {
              initialText: 'Mantenga la distancia de seguridad • Use mascarilla en zonas comunes • Respete los turnos de espera',
              scrollSpeed: 50
            }
          },
          {
            id: 'datetime-clock', type: 'clock', area: 'footer',
            config: {
              timeFormat: 'HH:mm',  // 24h format without seconds
              dateFormat: 'DD/MM/YYYY'  // European date format
            },
            theme: {
              typography: {
                fontSize: '1.2em'  // Larger clock text
              }
            }
          }
        ],
        theme: {
          colors: {
            primary: '#003366',
            secondary: '#0066cc',
            background: '#f5f5f5',
            text: '#333333',
            accent: '#ff6600'
          },
          typography: {
            fontFamily: 'Arial, Helvetica, sans-serif',
            baseFontSize: '18px',
            headingFont: 'Arial Black, sans-serif'
          },
          animations: {
            queueTransition: 'slide',
            tickerSpeed: 'normal'
          }
        }
      }
    });
    
    const urgenciasTemplate = await DisplayTemplate.create({
      id: 'TPL_CARDIO',
      name: 'Plantilla Urgencias',
      description: 'Plantilla para el área de urgencias con prioridad visual',
      orientation: 'landscape',
      targetSize: 50,
      isActive: true,
      definition: {
        layout: {
          columns: 12, rows: 8, gap: '15px',
          areas: {
            header: { row: [1, 2], column: [1, 10] },
            clock: { row: [1, 2], column: [10, 13] },
            priority: { row: [2, 8], column: [1, 7] },
            queue: { row: [2, 8], column: [7, 13] },
            footer: { row: [8, 9], column: [1, 13] }
          }
        },
        widgets: [
          {
            id: 'urgencias-header', type: 'logo', area: 'header',
            config: {
              src: 'logo-hospital.png'
            }
          },
          {
            id: 'clock', type: 'clock', area: 'clock',
            config: {
              timeFormat: 'HH:mm', dateFormat: 'MM/DD/YYYY'
            }
          },
          {
            id: 'priority-queue', type: 'queue', area: 'priority', channel: 'emergency',
            config: {
              showTicket: true,
              showContent: true,
              animationDuration: 300
            },
            theme: {
              colors: {
                background: '#ff3333',  // Red background for priority
                text: '#ffffff',
                accent: '#ffff00'  // Yellow for calling
              },
              typography: {
                fontSize: '1.3em',  // Larger for visibility
                fontWeight: 'bold'
              }
            }
          },
          {
            id: 'normal-queue', type: 'queue', area: 'queue', channel: 'calls',
            config: {
              maxVisible: 4,
              showTicket: true,
              showContent: true
            }
          },
          {
            id: 'urgencias-info', type: 'ticker', area: 'footer', channel: 'announcements',
            config: {
              initialText: 'URGENCIAS 24H • Respete la prioridad del triaje',
              scrollSpeed: 40
            }
          }
        ],
        theme: {
          colors: {
            primary: '#cc0000',
            secondary: '#ff6666',
            background: '#ffffff',
            text: '#000000',
            accent: '#ffcc00'
          },
          typography: {
            fontFamily: 'Arial, sans-serif',
            baseFontSize: '20px'
          }
        }
      }
    });

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
      { id: 'EDI_PROVI', name: 'Edificio H. Provincial', description: 'Edificio histórico', hierarchyId: 'CH', hierarchyLevelId: 'CH_EDI', parentId: null, templateId: 'TPL_HOSP_DEF' },
      { id: 'EDI_MONTECELO', name: 'Edificio Montecelo', description: 'Edificio principal', hierarchyId: 'CH', hierarchyLevelId: 'CH_EDI', parentId: null, templateId: 'TPL_HOSP_DEF' },
      { id: 'PLANTA_0_HP', name: 'Planta 0', description: 'Planta baja H. Provincial', hierarchyId: 'CH', hierarchyLevelId: 'CH_PLT', parentId: 'EDI_PROVI', templateId: 'TPL_HOSP_DEF' },
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
        templateOverrideId: null
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
    const locationId = 'CONSULTA_3';
    // Probar consulta con asociaciones
    const location = await Location.findByPk(locationId, {
      include: [
        { model: DisplayTemplate, as: 'displayTemplate' },
        { model: Location, as: 'parent' },
        { model: ServicePoint }
      ]
    });

    if (location) {
      console.log('Ubicación encontrada:', location.name);
      console.log('Ubicación madre:', location.parent?.name);
      console.log('Plantilla:', location.DisplayTemplate?.name || `(Propagada): ${location.getEffectiveTemplate()?.name}`);
      console.log('Puntos de servicio:', location?.ServicePoints?.map(sp => sp.name));
    } else {
      console.log('Ubicación NO ENCONTRADA:', locationId)
    }

    // Probar método getEffectiveTemplate
    const node = await DisplayNode.findByPk('NODE_CARDIO', {
      include: [{model: Location}]
    });
    console.log('Nodo:', node?.name);
    console.log('Estado activo:', node?.active);
    console.log('Ubicaciones asignadas:', node?.Locations?.map(l => l.name));
    if (node) {
      console.log('\ Probando método getEffectiveTemplate...');
      const templates = await node.getEffectiveTemplates();
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

    // Probar getDescendants
    const planta2M = await Location.findByPk('PLANTA_2_MONT');
    if (planta2M) {
      const descendants = await planta2M.getDescendants();
      console.log(`\n Ubicación "PLANTA_2_MONT" tiene ${descendants.length} descendientes:`);
      descendants.forEach(descendant => console.log(`  - ${descendant.name} (${descendant.id})`));
    }

    // Probar resolución de service point
    const servicePoint = await ServicePoint.findByPk('SP_CARDIO_03', {
      include: [{ model: Location }]
    });
    
    console.log('\n Service Point:', servicePoint?.name);
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
