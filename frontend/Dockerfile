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
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
