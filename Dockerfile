FROM node:22-alpine

# Install build dependencies for native modules (e.g. better-sqlite3)
RUN apk add --no-cache python3 py3-setuptools make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
