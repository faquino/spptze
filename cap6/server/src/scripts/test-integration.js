/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Pruebas de integración API + BD
// cap5/server/src/scripts/test-integrations.js
// =============================================================
const { testConnection } = require('../config/database');
const { ExternalSystem, ServicePoint, Message, resolverUtils } = require('../models');

const API_BASE = 'http://localhost:3000/api/v1';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function makeRequest(method, endpoint, data = null, apiKey = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  if (apiKey) {
    options.headers['X-API-Key'] = apiKey;
  }
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const result = await response.json();
    
    return {
      status: response.status,
      ok: response.ok,
      data: result
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      error: error.message
    };
  }
}


async function testDatabaseIntegration() {
  console.log('Pruebas de integración Base de Datos');
  console.log('-'.repeat(50));
  
  try {
    // Probar conexión BD
    console.log('·Probando conexión a BD...');
    const connected = await testConnection();
    if (!connected) throw new Error('No se pudo conectar a la BD');
    console.log('Conexión BD OK');
    
    // Verificar datos de prueba
    console.log('\n·Verificando datos de prueba...');
    const systemCount = await ExternalSystem.count();
    const servicePointCount = await ServicePoint.count();
    console.log(`Sistemas externos: ${systemCount}`);
    console.log(`Puntos de servicio: ${servicePointCount}`);
    
    // Probar resolución de targets
    console.log('\n·Probando resolución de targets...');
    const locations = await resolverUtils.resolveServicePointToLocations('SP_CARDIO_03');
    console.log(`SP_CARDIO_03 → ${locations.length} ubicaciones`);
    
    if (locations.length > 0) {
      const nodes = await resolverUtils.resolveLocationToNodes(locations[0].id);
      console.log(`${locations[0].name} → ${nodes.length} nodos`);
    }
    
    return true;
  } catch (error) {
    console.error('Error en pruebas BD:', error.message);
    return false;
  }
}

async function testAPIIntegration() {
  console.log('\nPruebas de integración API');
  console.log('-'.repeat(50));
  
  let apiKey = null;
  
  try {
    // 1. Obtener API key válida de BD
    console.log('·Obteniendo API key de BD...');
    const system = await ExternalSystem.findOne({ where: { active: true } });
    if (!system) throw new Error('No hay sistemas activos en BD');
    
    apiKey = system.apiKey;
    console.log(`API key obtenida: ${apiKey.substring(0, 8)}...`);
    
    // 2. Probar autenticación
    console.log('\n·Probando autenticación...');
    const authTest = await makeRequest('GET', '/status', null, apiKey);
    if (!authTest.ok) throw new Error(`Auth falló: ${authTest.status}`);
    console.log('Autenticación OK');
    
    // 3. Crear mensaje
    console.log('\n·Creando mensaje de prueba...');
    const newMessage = {
      ticket: 'TST12',
      content: 'C-27',
      target: 'CARDIO_MAÑANA_DRG',
      targetType: 'service_point',
      externalRef: 'INTEGRATION_TEST'
    };
    
    const createResponse = await makeRequest('POST', '/messages', newMessage, apiKey);
    if (!createResponse.ok) {
      throw new Error(`Error creando mensaje: ${JSON.stringify(createResponse.data)}`);
    }
    
    console.log(`Mensaje creado: ${createResponse.data.id}`);
    console.log(`   Nodos objetivo: ${createResponse.data.targetNodes}`);
    
    // 4. Verificar mensaje en BD
    console.log('\n·Verificando mensaje en BD...');
    const messageInDB = await Message.findByPk(createResponse.data.id);
    if (!messageInDB) throw new Error('Mensaje no encontrado en BD');
    console.log('Mensaje persistido en BD');
    
    // 5. Consultar mensaje via API
    await sleep(500);
    console.log('\n·Consultando mensaje via API...');
    const getResponse = await makeRequest('GET', `/messages/${createResponse.data.id}?details=true`, null, apiKey);
    if (!getResponse.ok) throw new Error('Error consultando mensaje');
    console.log(`Mensaje consultado: ${JSON.stringify(getResponse.data)}`);
    
    // 6. Consultar nodos
    console.log('\n·Consultando estado de nodos...');
    const nodesResponse = await makeRequest('GET', '/nodes', null, apiKey);
    if (!nodesResponse.ok) throw new Error('Error consultando nodos');
    console.log(`Nodos consultados: ${nodesResponse.data.total} total, ${nodesResponse.data.online} online`);
    
    return true;
    
  } catch (error) {
    console.error('Error en pruebas API:', error.message);
    return false;
  }
}

async function testEndToEndFlow() {
  console.log('\nPrueba flujo completo End-to-End');
  console.log('-'.repeat(50));

  try {
    // Simular flujo real: HIS (Sist. externo) envía llamada → API → BD → resolución nodos
    const system = await ExternalSystem.findByPk('HIS_SIHGA');
    if (!system) throw new Error('Sistema HIS_SIHGA no encontrado');

    console.log('Simular llamada desde HIS...');
    const hospitalCall = {
      ticket: 'E2E_TEST',
      content: 'Turno E2E_TEST - Consulta 3 (Dr. García)',
      target: 'CARDIO_TARDE_DRG',
      externalRef: 'CITA_E2E_12345'
    };

    const response = await makeRequest('POST', '/messages', hospitalCall, system.apiKey);
    if (!response.ok) throw new Error('Error en llamada HIS');

    console.log('Llamada HIS procesada');
    console.log(`   ID: ${response.data.id}`);
    console.log(`   Nodos: ${response.data.targetNodes}`);

    // Verificar resolución completa
    const message = await Message.findByPk(response.data.id);
    const targetNodes = await resolverUtils.resolveMessageTargets(message);

    console.log('\nResolución completa:');
    console.log(`   Service Point: ${message.targetServicePointId}`);
    console.log(`   Nodos objetivo: ${targetNodes.map(n => n.name).join(', ')}`);

    return true;

  } catch (error) {
    console.error('Error en flujo E2E:', error.message);
    return false;
  }
}

async function testRetractFlow() {
  console.log('\nPrueba de publicación y retirada');
  console.log('-'.repeat(50));

  try {
    // Simular flujo real: HIS (Sist. externo) envía llamada → API → BD → resolución nodos
    const system = await ExternalSystem.findByPk('HIS_SIHGA');
    if (!system) throw new Error('Sistema HIS_SIHGA no encontrado');

    console.log('Simular llamada desde HIS...');
    const newMessage = {
      ticket: 'ZZ99',
      content: 'C-04',
      target: 'CARDIO_MAÑANA_DRG',
      targetType: 'service_point',
      externalRef: 'INTEGRATION_TEST'
    };
    
    const createResponse = await makeRequest('POST', '/messages', newMessage, system.apiKey);
    if (!createResponse.ok) {
      throw new Error(`Error creando mensaje: ${JSON.stringify(createResponse.data)}`);
    }
    console.log('Mensaje publicado:', createResponse.data.id);
    await delay(500);
    const retractResponse = await makeRequest('PATCH', `/messages/${createResponse.data.id}/retract`, null, system.apiKey);
    if (!retractResponse.ok) throw new Error('Error retirando mensaje');
    console.log('Mensaje Retirado:', JSON.stringify(retractResponse.data));
    return true;

  } catch (error) {
    console.error('Error en flujo E2E:', error.message);
    return false;
  }
}

async function testRepeatFlow() {
  console.log('\nPrueba de publicación y repetición');
  console.log('-'.repeat(50));

  try {
    // Simular flujo real: HIS (Sist. externo) envía llamada → API → BD → resolución nodos
    const system = await ExternalSystem.findByPk('HIS_SIHGA');
    if (!system) throw new Error('Sistema HIS_SIHGA no encontrado');

    console.log('Simular llamada desde HIS...');
    const newMessage = {
      ticket: 'TR01',
      content: 'C-13',
      target: 'CARDIO_MAÑANA_DRG',
      targetType: 'service_point',
      externalRef: 'INTEGRATION_TEST'
    };
    
    const createResponse = await makeRequest('POST', '/messages', newMessage, system.apiKey);
    if (!createResponse.ok) {
      throw new Error(`Error creando mensaje: ${JSON.stringify(createResponse.data)}`);
    }
    console.log('Mensaje publicado:', createResponse.data.id);
    await delay(500);
    const repMessage = {
      ...newMessage,
      ticket: 'TR01',
      content: 'C-15'
    };

    const repeatResponse = await makeRequest('PATCH', `/messages/${createResponse.data.id}/repeat`, repMessage, system.apiKey);
    if (!repeatResponse.ok) throw new Error('Error retirando mensaje');
    console.log('Mensaje repetido:', JSON.stringify(repeatResponse.data));
    return true;

  } catch (error) {
    console.error('Error en flujo E2E:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('SPPTZE - Pruebas de Integración');
  console.log('='.repeat(60));

  const results = {
    database: false,
    api: false,
    endToEnd: false,
    retract: false,
    repeat: false
  };

  // Ejecutar pruebas
  results.database = await testDatabaseIntegration();
  await delay(1000);

  if (results.database) {
    results.api = await testAPIIntegration();
    await delay(1000);

    if (results.api) {
      results.endToEnd = await testEndToEndFlow();
      await delay(1000);

      if (results.endToEnd) {
        results.retract = await testRetractFlow();
        await delay(1000);

        if (results.retract) {
          results.repeat = await testRepeatFlow();
        }
      }
    }
  }

  // Resumen
  console.log('\n' + '='.repeat(60));
  console.log('RESUMEN DE PRUEBAS');
  console.log('-'.repeat(60));
  console.log(`BD Integration:     ${results.database ? 'PASS' : 'FAIL'}`);
  console.log(`API Integration:    ${results.api ? 'PASS' : 'FAIL'}`);
  console.log(`End-to-End Flow:    ${results.endToEnd ? 'PASS' : 'FAIL'}`);
  console.log(`Retract Flow:       ${results.retract ? 'PASS' : 'FAIL'}`);
  console.log(`Repeat Flow:        ${results.repeat ? 'PASS' : 'FAIL'}`);

  const allPassed = Object.values(results).every(r => r);
  console.log(`\nResultado Global:   ${allPassed ? 'SUCCESS' : 'FAILED'}`);

  process.exit(allPassed ? 0 : 1);
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
}

module.exports = { testDatabaseIntegration, testAPIIntegration, testEndToEndFlow };
