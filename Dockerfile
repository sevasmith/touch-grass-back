FROM node:22-alpine AS base

# Upgrade OS packages and npm to resolve Trivy CVEs
RUN apk upgrade --no-cache && \
    npm install -g npm@latest

RUN corepack enable pnpm

WORKDIR /app

FROM base AS prod-dependencies

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm run build

FROM base AS production

RUN apk add --no-cache tini

ENV NODE_ENV=production
ENV PORT=3001

RUN mkdir -p /app && chown -R node:node /app
WORKDIR /app

USER node

COPY --chown=node:node package.json ./
COPY --from=prod-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist

EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/ || exit 1

CMD ["node", "dist/main.js"]
