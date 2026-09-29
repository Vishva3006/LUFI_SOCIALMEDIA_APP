FROM node:22-bookworm-slim

# Install build dependencies for native modules (better-sqlite3)
# Debian Bookworm uses Python 3.11 which still has distutils built-in
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-setuptools make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
