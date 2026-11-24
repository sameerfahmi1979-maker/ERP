FROM node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d
WORKDIR /opt/sharepoint-agent
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=node:node connection.mjs discovery.mjs dms-pilot.mjs continuous.mjs ledger.mjs worker.mjs ./
USER node
CMD ["node", "worker.mjs"]
