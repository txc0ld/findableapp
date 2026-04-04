FROM oven/bun:1.3 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

# Runtime
FROM base AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY packages/shared ./packages/shared
COPY src ./src
COPY package.json bun.lock ./

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

CMD ["bun", "run", "src/index.ts"]
