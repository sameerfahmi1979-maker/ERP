# F02: the production runtime must match the Linux/CI verification runtime.
FROM node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN test "$(node --version)" = "v22.23.4" && test "$(npm --version)" = "10.9.9"

FROM base AS build
COPY package.json package-lock.json ./
COPY vendor/braces-3.0.3-algt-integrated-2.tgz ./vendor/braces-3.0.3-algt-integrated-2.tgz
COPY vendor/sprintf-js-1.0.3-algt.1.tgz ./vendor/sprintf-js-1.0.3-algt.1.tgz
RUN npm ci --no-fund
COPY src ./src
COPY vendor/shadcn/tailwind.css ./vendor/shadcn/tailwind.css
COPY tooling/dms/validate-intake.cjs ./tooling/dms/validate-intake.cjs
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
COPY --from=build --chown=node:node /app/tooling/dms/validate-intake.cjs ./tooling/dms/validate-intake.cjs
COPY --from=build --chown=node:node /app/next.config.ts /app/tsconfig.json /app/tsconfig.shipping.json ./
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start"]
