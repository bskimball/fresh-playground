# One app process with its SQLite database and local uploads on the /data volume.
# Build: docker build -t fresh-playground .
# Run:   docker run -p 4321:4321 -v fresh-data:/data \
#          -e BETTER_AUTH_SECRET=... -e BETTER_AUTH_URL=https://app.example.com fresh-playground

# The full image has the toolchain for any native dependency builds.
FROM node:24.21.0-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contract/package.json packages/contract/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24.21.0-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321 \
    DATABASE_PATH=/data/app.db \
    STORAGE_PATH=/data/uploads
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
WORKDIR /app/packages/web
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4321/health/ready').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server/main.js"]
