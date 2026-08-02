# Built with the REPO ROOT as build context (see docker-compose.yml) purely
# for consistency with frontend/Dockerfile — all paths below are backend/-only.
FROM node:20-alpine

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY backend/src ./src
COPY backend/scripts ./scripts

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/server.js"]
