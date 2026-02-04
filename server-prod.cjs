#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

process.env.NODE_ENV = 'production';

const serverPath = path.join(__dirname, 'server', 'index.ts');

console.log('Starting SwitchControl production server...');
console.log('Server path:', serverPath);

const child = spawn('npx', ['tsx', serverPath], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
  shell: true
});

child.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

child.on('close', (code) => {
  console.log('Server exited with code:', code);
  process.exit(code || 0);
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
});
