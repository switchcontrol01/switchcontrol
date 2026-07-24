FROM node:24.13.0-bookworm-slim

WORKDIR /app

RUN npm install -g npm@11.18.0

COPY package.json package-lock.json ./

# --ignore-scripts skips postinstall (which tries `cd electron && npm install`
# and the Replit-specific tsx/esbuild proxy — neither is needed in a container)
RUN npm ci --legacy-peer-deps --no-audit --no-fund --ignore-scripts

COPY . .

RUN npm run build

ENV NODE_ENV=production

CMD ["npm", "run", "start"]
