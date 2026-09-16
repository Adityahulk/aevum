FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM nginxinc/nginx-unprivileged:1.27-alpine
ENV PORT=8080 API_UPSTREAM=http://api:8080
ENV NGINX_ENVSUBST_FILTER="^(PORT|API_UPSTREAM|DNS_RESOLVERS)$"
COPY --chmod=755 15-runtime-env.envsh /docker-entrypoint.d/15-runtime-env.envsh
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 8080
