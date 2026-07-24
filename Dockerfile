FROM node:24.13.0-bookworm-slim

WORKDIR /app

RUN npm install -g npm@11.18.0

COPY package.json package-lock.json ./
# scripts/ must exist before npm ci so postinstall.cjs can run
COPY scripts/ ./scripts/

RUN npm ci --legacy-peer-deps --no-audit --no-fund

COPY . .

RUN npm run build

ENV NODE_ENV=production

CMD ["npm", "run", "start"]
