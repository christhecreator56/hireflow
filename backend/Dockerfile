FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json openapi.json* ./
COPY src ./src
RUN npx tsc
EXPOSE 4000
# Apply migrations on boot, then start. Seed manually: docker compose exec api npm run db:seed
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
