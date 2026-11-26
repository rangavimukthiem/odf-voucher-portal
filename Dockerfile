# Stage 1: Build & Dependencies
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat python3 make g++ git

# Install backend dependencies
COPY package*.json pnpm-lock.yaml* yarn.lock* ./
RUN if [ -f "pnpm-lock.yaml" ]; then corepack enable && pnpm install --frozen-lockfile; \
    elif [ -f "yarn.lock" ]; then yarn install --frozen-lockfile; \
    elif [ -f "package-lock.json" ]; then npm ci --legacy-peer-deps || npm install --legacy-peer-deps; \
    else npm install --legacy-peer-deps; fi

# Install SvelteKit frontend dependencies
COPY web/package*.json web/pnpm-lock.yaml* web/yarn.lock* ./web/
RUN cd web && \
    if [ -f "pnpm-lock.yaml" ]; then corepack enable && pnpm install --frozen-lockfile; \
    elif [ -f "yarn.lock" ]; then yarn install --frozen-lockfile; \
    elif [ -f "package-lock.json" ]; then npm ci --legacy-peer-deps || npm install --legacy-peer-deps; \
    else npm install --legacy-peer-deps; fi

COPY . .
RUN if grep -q '"build":' package.json; then npm run build; fi

# Stage 2: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

RUN apk add --no-cache libc6-compat curl

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server ./server
COPY --from=builder /app/web/build ./web/build

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/health || exit 1

CMD ["npm", "start"]
