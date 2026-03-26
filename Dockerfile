FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

CMD ["npx", "vite", "--host", "0.0.0.0"]
