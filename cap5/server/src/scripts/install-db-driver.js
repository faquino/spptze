/**
 * SPPTZE - Sistema de Presentación para Pantallas de Turno en Zonas de Espera
 * TFE Grado en Ingeniería Informática - Universidad Internacional de La Rioja
 * Copyright (c) 2025 Francisco José Aquino García
 * Licensed under the MIT License - see LICENSE file for details
 */

// =============================================================
// SPPTZE - INSTALACIÓN DE DRIVERS DE BASE DE DATOS
// cap5/server/src/scripts/install-db-driver.js
// =============================================================
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { program, Option } = require('commander');

// Mapa de dialectos soportados por Sequelize y paquetes npm (drivers) necesarios en cada caso
const drivers = {
  postgres: ['pg', 'pg-hstore'],
  sqlite: ['sqlite3'],
  mariadb: ['mariadb'],
  mysql: ['mysql2'],
  mssql: ['tedious'],
  oracle: ['node-oracledb']
};

program
  .name('install-db-driver')
  .description('Install or remove database drivers for Sequelize ORM')
  .addOption(new Option('-d, --dialect <dialect>', 'Database dialect to use or set ORM_DIALECT env var')
    .choices(Object.keys(drivers))) // Determinar valores válidos a partir de drivers
  .addOption(new Option('-p, --purge', 'Remove unnecessary drivers')
    .conflicts('dialect'))
  .parse();

const options = program.opts();
const dialect = options.dialect || process.env.ORM_DIALECT;


// Escala el árbol de directorio hasta encontrar un fichero package.json
function findProjectRoot(dir = process.cwd()) {
  while (true) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // Se alcanzó la raíz del filesystem sin encontrar un package.json :(
    dir = parent;
  }
}

function isPackageInstalled(packageName) {
  try {
    const projectRoot = findProjectRoot();
    if (!projectRoot) return false;
    // Se comprueba si existe <projectRoot>/node_modules/<packageName>/package.json
    return fs.existsSync(path.join(projectRoot, 'node_modules', packageName, 'package.json'));
  } catch {
    return false;
  }
}


// Desinstalar drivers innecesarios si --purge
if (options.purge) {
  const allDrivers = Object.values(drivers).flat();
  const bloat = allDrivers.filter(pkg => isPackageInstalled(pkg));
  
  if (bloat.length > 0) {
    console.log(`Removing all database drivers: ${bloat.join(', ')}`);
    execSync(`npm uninstall ${bloat.join(' ')}`, { stdio: 'inherit' });
  } else {
    console.log('No database drivers to remove');
  }
} else if (dialect) {
  const need = drivers[dialect];
  if (!need) {
    console.error(`Unknown dialect: ${dialect}`);
    process.exit(1);
  }
  // Instalar drivers faltantes
  const missing = need.filter(pkg => !isPackageInstalled(pkg));
  if (missing.length > 0) {
    console.log(`Installing missing drivers for ${dialect}: ${missing.join(', ')}`);
    // --no-save para no alterar package.json
    execSync(`npm install --no-save ${missing.join(' ')}`, { stdio: 'inherit' });
  } else {
    console.log(`All drivers for ${dialect} already installed`);
  }
} else {
  console.error('Error: Must specify either --dialect or --purge');
  program.help();
}
