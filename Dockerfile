# ── Stage 1: build client ────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Build tools needed by better-sqlite3 native addon
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
# Reinstall in the runtime image so native addons compile for this arch
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY worker ./worker
COPY server ./server

ENV PORT=3000 \
    DB_PATH=/data/library.db \
    POSTER_DIR=/data/posters \
    PHOTO_DIR=/photos \
    NODE_ENV=production

EXPOSE 3000

# /data  — SQLite database + generated thumbnails (mount a named volume)
# /photos — read-only source photo directory (bind-mount from host)
VOLUME ["/data", "/photos"]

CMD ["node", "server/index.js"]
