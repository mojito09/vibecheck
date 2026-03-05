FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npx next build

ENV PORT=8080
EXPOSE 8080

RUN chmod +x start.sh
CMD ["bash", "start.sh"]
