FROM nginxinc/nginx-unprivileged:1.27-alpine
ENV PORT=8080 OPEN_WEARABLES_UPSTREAM=http://open-wearables.railway.internal:8000
ENV NGINX_ENVSUBST_FILTER="^(PORT|OPEN_WEARABLES_UPSTREAM|DNS_RESOLVERS)$"
COPY --chmod=755 15-dns.envsh /docker-entrypoint.d/15-dns.envsh
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 8080
