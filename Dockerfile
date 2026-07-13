# GridWars — Dockerfile
# Multi-stage build: builds the client, then serves everything from the server

FROM node:20-alpine AS builder

WORKDIR /app

# Install root + server + client deps
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN npm install --omit=dev && \
    cd server && npm install --omit=dev && \
    cd ../client && npm install

# Copy source
COPY server/ ./server/
COPY client/ ./client/

# Build client
RUN cd client && npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy only what's needed
COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/gridwars.db
ENV TZ=Asia/Kolkata

EXPOSE 3001

CMD ["node", "server/index.js"]
