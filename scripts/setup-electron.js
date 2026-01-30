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

  packageJson.scripts['electron:dev'] = 'concurrently --kill-others "npm run dev" "wait-on http://localhost:5000 && cross-env NODE_ENV=development VITE_DEV_SERVER_URL=http://localhost:5000 electron ."';
  packageJson.scripts['electron:build'] = 'npm run build && electron-builder --win';
  packageJson.scripts['electron:pack'] = 'npm run build && electron-builder --dir';

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

  console.log('package.json updated successfully!\n');
  console.log('Added/Updated:');
  console.log('  - name: switchcontrol');
  console.log('  - main: electron/main.js');
  console.log('  - scripts.electron:dev - Run app in dev mode');
  console.log('  - scripts.electron:build - Build Windows installer');
  console.log('  - scripts.electron:pack - Build without installer');
  console.log('\nNext steps:');
  console.log('  1. Run: npm install');
  console.log('  2. Run: npm run electron:dev');
  console.log('  3. To build installer: npm run electron:build');

} catch (error) {
  console.error('Error updating package.json:', error.message);
  process.exit(1);
}
