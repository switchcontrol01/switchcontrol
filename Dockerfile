FROM node:24.13.0-bookworm-slim

WORKDIR /app

RUN npm install -g npm@11.18.0

COPY package.json package-lock.json ./

# --ignore-scripts skips postinstall (which tries `cd electron && npm install`
# and the Replit-specific tsx/esbuild proxy — neither is needed in a container)
RUN npm ci --legacy-peer-deps --no-audit --no-fund --ignore-scripts

COPY . .

RUN npm run build

# ws and systeminformation are kept external in the server bundle (not inlined by
# esbuild) so dist/index.cjs requires them from node_modules at runtime.
# Re-install them explicitly after the build to guarantee they are present even
# if an earlier npm ci layer was served from cache with a stale node_modules.
RUN npm install --no-save --ignore-scripts --legacy-peer-deps ws systeminformation

ENV NODE_ENV=production

CMD ["npm", "run", "start"]
