FROM node:24.13.0-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build

ENV NODE_ENV=production

CMD ["npm", "run", "start"]
