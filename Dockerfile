# F02: the production runtime must match the Linux/CI verification runtime.
FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN test "$(node --version)" = "v22.23.2" && test "$(npm --version)" = "10.9.8"

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --no-fund
COPY src ./src
COPY public ./public
COPY next.config.ts tsconfig.json tsconfig.shipping.json postcss.config.mjs ./
# Only intentionally public browser configuration is accepted at build time.
# Service-role credentials, worker secrets and signing keys are runtime-only.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" && test -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" && test -n "$NEXT_PUBLIC_SITE_URL"
RUN npm run build && npm run typecheck

FROM base AS runtime
ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=16384 \
    PORT=3000
# Preserve Next's full-server behavior and required native server packages.
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/next.config.ts /app/tsconfig.json /app/tsconfig.shipping.json ./
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start"]
