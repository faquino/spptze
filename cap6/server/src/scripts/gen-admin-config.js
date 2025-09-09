/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - GENERACIÓN DE CONFIGURACIÓN DE SEGURIDAD PARA ADMINJS
// cap6/server/src/scripts/gen-admin-config.js
// =============================================================
const { program } = require('commander');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

program
  .name('gen-admin-config')
  .description('Genera configuración segura para el panel AdminJS')
  .argument('[password]', 'Contraseña en texto plano a hashear')
  .option('-r, --rounds <rounds>', 'Rondas de bcrypt (10-15)', '10')
  .action((password, options) => {
    // Si no se proporciona contraseña mostrar ayuda y salir
    if (!password) {
      program.help();
    }

    const rounds = parseInt(options.rounds);
    if (rounds < 10 || rounds > 15) {
      console.error('Error: Las rondas deben estar entre 10 y 15');
      program.help();
    }

    console.log('Añade estas líneas a tu archivo .env:');

    // Generar configuración
    const hash = bcrypt.hashSync(password, rounds);
    const cookieSecret = crypto.randomBytes(32).toString('hex');
    const sessionSecret = crypto.randomBytes(32).toString('hex');

    console.log(`ADMIN_PASS="${hash}"`);
    console.log(`ADMIN_COOKIE="${cookieSecret}"`);
    console.log(`ADMIN_SECRET="${sessionSecret}"`);
    
  })
  .addHelpText('after', `
Ejemplos:
  $ node scripts/generate-admin-config.js "mi Password"
    Genera configuración con la contraseña proporcionada

  $ node scripts/generate-admin-config.js -r 12 miPassword
    Usa 12 rondas de bcrypt (más seguro pero más lento)
`);

program.parse();