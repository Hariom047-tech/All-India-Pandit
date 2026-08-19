# React + TypeScript SPA (frontend/app), built then served by nginx.
#
# Built with the REPO ROOT as build context (see docker-compose.yml:
# `build: { context: ., dockerfile: frontend/Dockerfile }`) so it can also
# pull in the shared nginx config from docker/nginx/ — a Dockerfile can only
# COPY from inside its build context, and frontend/ alone doesn't contain it.

FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/app/package.json frontend/app/package-lock.json* ./
RUN npm install
COPY frontend/app ./
# Google OAuth client ID — safe to bake into the bundle (it's a public identifier,
# not a secret; the actual Google Secret Key stays server-side only).
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ARG VITE_GOOGLE_MAPS_API_KEY
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
# NOTE: VITE_ADMIN_SECRET_PATH has been intentionally removed (security fix C3).
# The admin panel is now at a fixed /admin-panel route. The backend API secret
# path is resolved at runtime from /api/admin-config — never baked into the bundle.
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
