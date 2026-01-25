#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');

console.log('Setting up SwitchControl for Electron...\n');

try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  packageJson.name = 'switchcontrol';
  packageJson.productName = 'SwitchControl';
  packageJson.description = 'SwitchControl - Gaming Optimization Dashboard';
  packageJson.author = 'SwitchControl';
  packageJson.main = 'electron/main.js';

  if (!packageJson.scripts['electron:dev']) {
    packageJson.scripts['electron:dev'] = 'concurrently "npm run dev" "wait-on http://localhost:5000 && electron ."';
  }
  if (!packageJson.scripts['build:client']) {
    packageJson.scripts['build:client'] = 'vite build';
  }
  if (!packageJson.scripts['build:win']) {
    packageJson.scripts['build:win'] = 'npm run build:client && electron-builder --win --config electron-builder.json';
  }
  if (!packageJson.scripts['build:portable']) {
    packageJson.scripts['build:portable'] = 'npm run build:client && electron-builder --win portable --config electron-builder.json';
  }

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

  console.log('package.json updated successfully!\n');
  console.log('Added/Updated:');
  console.log('  - name: switchcontrol');
  console.log('  - main: electron/main.js');
  console.log('  - scripts.electron:dev');
  console.log('  - scripts.build:client');
  console.log('  - scripts.build:win');
  console.log('  - scripts.build:portable');
  console.log('\nNext steps:');
  console.log('  1. Run: npm install');
  console.log('  2. Run: npm run electron:dev');
  console.log('  3. To build installer: npm run build:win');

} catch (error) {
  console.error('Error updating package.json:', error.message);
  process.exit(1);
}
