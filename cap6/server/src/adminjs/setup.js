/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Configuración de AdminJS
// cap6/server/src/admin/setup.js
// =============================================================
const bcrypt = require('bcryptjs');
const AdminJS = require('adminjs');
const AdminJSExpress = require('@adminjs/express');
const AdminJSSequelize = require('@adminjs/sequelize');

// Contenedores para el menú de navegación
// La selección de iconos disponibles en esta versión es mucho más reducida que la que sale en:
// https://storybook.adminjs.co/?path=/docs/designsystem-atoms-icon--docs
// TODO: Migrar proyecto CommonJS --> ESM
const structureParent = { name: 'Estructura', icon: 'Layers' };
const integrationParent = { name: 'Integración', icon: 'User' };
const presentationParent = { name: 'Presentación', icon: 'Airplay' };
const operationsParent = { name: 'Operaciones', icon: 'Send' };

AdminJS.registerAdapter(AdminJSSequelize);

function setupAdmin(app, sequelize) {
  console.log('Configurando AdminJS v6...');
  
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPass = process.env.ADMIN_PASS;
    const cookiePass = process.env.ADMIN_COOKIE;
    const sessionSecret = process.env.ADMIN_SECRET;

    const errs = [];
    if (!adminEmail) errs.push('Falta ADMIN_EMAIL');
    if (!adminPass) errs.push('Falta ADMIN_PASS');
    if (!cookiePass) errs.push('Falta ADMIN_COOKIE');
    if (!sessionSecret) errs.push('Falta ADMIN_SECRET');
    if (errs.length > 0) throw new Error(errs.join(', '));

    const adminJs = new AdminJS({
      databases: [sequelize],
      rootPath: '/admin',
      version: true,
      branding: {
        logo: '/assets/brand-logo.svg',
        companyName: 'SPPTZE'
      },

      resources: [
        {
          resource: sequelize.models.Hierarchy,
          options: {
            parent: structureParent,
            listProperties: ['id', 'name', 'description']
          }
        },
        {
          resource: sequelize.models.HierarchyLevel,
          options: {
            parent: structureParent,
            listProperties: ['id', 'name', 'description']
          }
        },
        {
          resource: sequelize.models.Location,
          options: {
            parent: structureParent,
            listProperties: ['id', 'name', 'description', 'hierarchyId', 'hierarchyLevelId', 'parentId', 'templateId']
          }
        },
        {
          resource: sequelize.models.ExternalSystem,
          options: {
            parent: integrationParent,
            listProperties: ['id', 'name', 'description', 'defaultChannel', 'active'],
            properties: {
              apiKey: {
                type: 'password',
                isVisible: {
                  list: false,
                  filter: false,
                  show: true,
                  edit: true
                }
              }
            }
          }
        },
        {
          resource: sequelize.models.ServicePoint,
          options: {
            parent: integrationParent,
            listProperties: ['id', 'externalId', 'name', 'sourceSystemId']
          }
        },
        {
          resource: sequelize.models.ServicePointLocationMapping,
          options: {
            parent: integrationParent
          }
        },
        {
          resource: sequelize.models.DisplayNode,
          options: {
            parent: presentationParent,
            actions: {
              list: {
                before: async (request, context) => {
                  context.resource.decorate().name = 'Nodos de visualización';
                  return request;
                }
              }
            },
            listProperties: ['id', 'name', 'active', 'lastSeen']
          }
        },
        {
          resource: sequelize.models.DisplayTemplate,
          options: {
            parent: presentationParent,
            listProperties: ['id', 'name', 'description', 'orientation', 'targetSize', 'active', 'dirty'],
            properties: {
              definition: {
                type: 'textarea',
                isVisible: true,
                props: { rows: 15 }
              }
            },
            actions: {
              new: {
                before: async (request) => {
                  // Convertir string a JSON ANTES de que Sequelize lo valide
                  if (request.payload?.definition) {
                    try {
                      request.payload.definition = JSON.parse(request.payload.definition);
                    } catch (e) {
                      throw new Error('El JSON no es válido');
                    }
                  }
                  return request;
                }
              },
              edit: {
                before: async (request, context) => {
                  // Para POST: convertir de vuelta string a JSON antes de guardar
                  if (request.method === 'post' && request.payload?.definition) {
                    try {
                      request.payload.definition = JSON.parse(request.payload.definition);
                    } catch (e) {
                      throw new Error('El JSON no es válido');
                    }
                  }
                  return request;
                },
                after: async (response, request, context) => {
                  // Para GET: mostrar JSON como string formateada
                  if (request.method === 'get' && response.record) {
                    const record = await sequelize.models.DisplayTemplate.findByPk(
                      response.record.params.id,
                      { raw: true }
                    );
                    if (record?.definition) {
                      response.record.params.definition = JSON.stringify(record.definition, null, 2);
                    }
                  }
                  return response;
                }
              },
              show: {
                before: async (response) => {
                  if (response.record?.params?.definition) {
                    // Si es un objeto, convertirlo a string formateada
                    const def = response.record.params.definition;
                    if (typeof def === 'object') {
                      response.record.params.definition = JSON.stringify(def, null, 2);
                    }
                  }
                  return response;
                }
              }
            }
          }
        },
        {
          resource: sequelize.models.NodeLocationMapping,
          options: {
            parent: presentationParent
          }
        },
        {
          resource: sequelize.models.Message,
          options: {
            parent: operationsParent,
            listProperties: ['id', 'ticket', 'content', 'status', 'createdAt'],
            actions: {
              new: { isVisible: false },
              edit: { isVisible: false },
              delete: { isVisible: false }
            }
          }
        },
        {
          resource: sequelize.models.MessageTTS,
          options: {
            parent: operationsParent
          }
        },
        {
          resource: sequelize.models.MessageDelivery,
          options: {
            parent: operationsParent
          }
        }
      ],
      locale: {
        translations: {
          labels: {
            hierarchies: 'Jerarquías',
            hierarchy_levels: 'Niveles de jerarquía',
            locations: 'Ubicaciones',
            external_systems: 'Sistemas externos',
            service_points: 'Puntos de servicio',
            service_point_location_mapping: 'Mapeos Ubicación-Pto. de servicio',
            display_nodes: 'Nodos de visualización',
            display_templates: 'Plantillas de presentación',
            node_location_mapping: 'Mapeos Nodo-Ubicación',
            messages: 'Mensajes',
            message_tts: 'TTS',
            message_deliveries: 'Registros de entrega'
          }
        }
      }
    });

//    const router = AdminJSExpress.buildRouter(adminJs);

    // Construir router con autenticación
    const router = AdminJSExpress.buildAuthenticatedRouter(adminJs, {
      authenticate: async (email, password) => {
        if (email === adminEmail) {
          try {
            const valid = await bcrypt.compare(password, adminPass);
            if (valid) {
              return { email, id: 1, title: 'Administrador' };
            }
          } catch (error) {
            console.error('Error verificando contraseña:', error.message);
          }
        }
        return null;
      },
      cookieName: 'adminjs',
      cookiePassword: cookiePass
    }, null, {
      // Configuración de express-session
      resave: false,
      saveUninitialized: false,
      secret: sessionSecret,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // HTTPS en producción
        maxAge: 1000 * 60 * 60 * 24 // 24 horas
      }
    });

    app.use(adminJs.options.rootPath, router);
    return adminJs;
  } catch (error) {
    console.error('Error en AdminJS:', error);
    return null;
  }
}

if (require.main === module) {
  //TODO podría iniciarse el panel AdminJS en un proceso distinto del de la aplicación principal?

}

module.exports = setupAdmin;