# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — dependency installer
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Copy manifests only so this layer is cached unless deps change
COPY package.json package-lock.json* ./
RUN npm ci


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — builder
# next build requires NEXT_PUBLIC_* vars at build time.
# Pass them via --build-arg or docker-compose build.args.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Accept build-time env vars (values are baked into the JS bundle)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build


# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — minimal runtime image
# Uses the standalone output (next.config.ts output: "standalone") which
# includes only the minimal server + node_modules subset needed at runtime.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Copy the standalone server
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Copy static assets (not included in standalone)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy public folder
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
