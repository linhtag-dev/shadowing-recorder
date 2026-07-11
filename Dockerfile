ARG NODE_VERSION=24.18.0

FROM node:${NODE_VERSION}-bookworm-slim AS build

ARG VITE_SHADOWING_VIDEO_ID

ENV VITE_SHADOWING_VIDEO_ID=${VITE_SHADOWING_VIDEO_ID}

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm ci

COPY . .

RUN npm run build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime

ENV HOST=0.0.0.0 \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/packages/contracts/dist packages/contracts/dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["npm", "run", "start"]
