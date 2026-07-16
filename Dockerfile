FROM node:24.13.0-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --legacy-peer-deps --no-audit --no-fund

COPY . .

RUN npm run build

ENV NODE_ENV=production

CMD ["npm", "run", "start"]
