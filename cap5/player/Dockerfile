# Dockerfile para /player
FROM node:22 AS builder

WORKDIR /app
COPY . .

RUN npm install --production || true

# Usar http-server para servir contenido estático
FROM node:20-slim
WORKDIR /usr/share/player
COPY --from=builder /app/public ./
RUN npm install -g http-server

EXPOSE 80
CMD ["http-server", ".", "-p", "80"]