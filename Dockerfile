# Etapa 1: instalación de dependencias de producción
FROM node:22-alpine AS dependencies

WORKDIR /app

# Herramientas necesarias para compilar dependencias nativas
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

# Etapa 2: imagen final de ejecución
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_FILE=/data/catalogo.db

# Bibliotecas necesarias para ejecutar módulos nativos
RUN apk add --no-cache libstdc++ \
    && mkdir -p /data /app/uploads \
    && chown -R node:node /app /data

# Copiar únicamente los archivos necesarios
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
