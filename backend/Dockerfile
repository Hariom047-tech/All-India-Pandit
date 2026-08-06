# Built with the REPO ROOT as build context (see docker-compose.yml) purely
# for consistency with frontend/Dockerfile — all paths below are backend/-only.
FROM node:20-alpine

# Create a non-root user — if an RCE exploit fires, attacker gets appuser,
# not root (can't write to /etc, can't install packages, can't read other
# containers' namespaced resources on the host).
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./
# Removed --no-audit: npm will now warn on known vulnerabilities at build time.
RUN npm install --omit=dev --no-fund

COPY backend/src ./src
COPY backend/scripts ./scripts

# Hand ownership to the non-root user before switching to it
RUN chown -R appuser:appgroup /app
USER appuser

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/server.js"]
