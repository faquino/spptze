/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - Script de pruebas - Prueba de concepto API
// =============================================================
const API_BASE = 'http://localhost:3000/api/v1';
const API_KEY = 'demo-key-hospital-123';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function makeRequest(method, endpoint, data = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    }
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const result = await response.json();
    
    console.log(`${method} ${endpoint}:`, response.status);
    console.log(JSON.stringify(result, null, 2));
    console.log('-'.repeat(50));
    
    return result;
  } catch (error) {
    console.error(`Error in ${method} ${endpoint}:`, error.message);
    return null;
  }
}

async function runTests() {
  console.log('SPPTZE API Test Suite');
  console.log('-'.repeat(50));
  
  // 1. Estado del sistema
  console.log('1: Verificar estado del sistema...');
  await makeRequest('GET', '/status');
  await delay(1000);
  
  // 2. Listar nodos
  console.log('2: Consultar nodos de visualización...');
  await makeRequest('GET', '/nodes');
  await delay(1000);
  
  // 3. Enviar nueva llamada
  console.log('3: Enviar nueva llamada de turno...');
  const newCall = await makeRequest('POST', '/messages', {
    ticket: 'C999',
    content: 'Turno C999 - Consulta 3 (PRUEBA API)',
    target: 'SP_CARDIO_03',
    targetType: 'service_point',
    priority: 2,
    externalRef: 'TEST_001'
  });
  await delay(1000);
  
  // 4. Consultar mensajes activos
  console.log('4: Consultando mensajes activos...');
  await makeRequest('GET', '/messages?channel=calls&limit=5');
  await delay(1000);
  
  // 5. Repetir mensaje (si se creó correctamente)
  if (newCall && newCall.id) {
    console.log('5: Repitiendo mensaje...');
    await makeRequest('POST', `/messages/${newCall.id}/repeat`);
    await delay(1000);
  }
  
  // 6. Control de pantalla
  console.log('6: Enviando comando de control a pantalla...');
  await makeRequest('POST', '/nodes/NODE_CARDIO_WAIT/control', {
    action: 'refresh'
  });
  await delay(1000);
  
  // 7. Retirar mensaje (si se creó correctamente)
  if (newCall && newCall.id) {
    console.log('7: Retirando mensaje de prueba...');
    await makeRequest('DELETE', `/messages/${newCall.id}`);
  }
  
  console.log('Pruebas completadas');
  console.log('Verificar cambios en: http://localhost:3000/display');
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { makeRequest, runTests };
