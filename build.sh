#!/bin/bash
set -e

npm run build

cat > dist/index.cjs << 'SERVEREOF'
#!/usr/bin/env node
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

app.use(express.json());

const distPath = __dirname;
app.use(express.static(distPath));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/{*splat}', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Application not found');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('SwitchControl server running on port ' + PORT);
});
SERVEREOF

chmod +x dist/index.cjs
echo "Build complete with production server"
