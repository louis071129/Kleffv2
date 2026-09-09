# syntax=docker/dockerfile:1
# Multi-Stage-Build fuer KLAEFF. Der Produktions-Container laeuft als
# nicht-root User und enthaelt nur, was der Custom-Server zur Laufzeit
# braucht (kein devDependencies, kein Test-/Lint-Tooling).

FROM node:22-slim AS base
WORKDIR /app

# --- deps: alle Abhaengigkeiten (inkl. devDependencies) fuer den Build ---
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/scoring/package.json packages/scoring/package.json
COPY packages/protocol/package.json packages/protocol/package.json
RUN npm ci

# --- builder: Next.js Production-Build ---
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runner: schlankes Laufzeit-Image, nur Production-Dependencies ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

RUN groupadd --system --gid 1001 klaeff \
  && useradd --system --uid 1001 --gid klaeff --home /app klaeff

COPY package.json package-lock.json ./
COPY packages/scoring/package.json packages/scoring/package.json
COPY packages/protocol/package.json packages/protocol/package.json
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/app ./app
COPY --from=builder /app/server ./server
COPY --from=builder /app/packages/scoring/src ./packages/scoring/src
COPY --from=builder /app/packages/protocol/src ./packages/protocol/src
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN chown -R klaeff:klaeff /app
USER klaeff

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
