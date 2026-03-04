FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npx next build

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "npx prisma migrate deploy; npm run worker & npm run start"]
