FROM node:22-bookworm-slim
WORKDIR /opt/sharepoint-agent
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=node:node connection.mjs discovery.mjs dms-pilot.mjs continuous.mjs ledger.mjs worker.mjs ./
USER node
CMD ["node", "worker.mjs"]
