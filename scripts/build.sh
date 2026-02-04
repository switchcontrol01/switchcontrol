#!/bin/bash
set -e

echo "Building frontend with Vite..."
npm run build:client

echo "Building server with esbuild..."
npx esbuild server/index.ts --bundle --platform=node --format=cjs --outfile=dist/index.cjs --packages=external

echo "Build complete!"
ls -la dist/
