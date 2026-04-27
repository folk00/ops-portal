FROM node:20-bookworm-slim AS deps

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app/web

COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile


FROM node:20-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app/web

COPY --from=deps /app/web/node_modules ./node_modules
COPY web ./

ARG API_PROXY_BASE_URL=http://api:8010
ARG NEXT_PUBLIC_API_BASE_URL=

ENV API_PROXY_BASE_URL=$API_PROXY_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

RUN pnpm build


FROM node:20-bookworm-slim AS runner

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache

WORKDIR /app/web

COPY --from=builder --chown=nextjs:nodejs /app/web/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/web/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/web/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/web/next.config.ts ./next.config.ts

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const h=require('http');h.get('http://localhost:3000/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "./node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
