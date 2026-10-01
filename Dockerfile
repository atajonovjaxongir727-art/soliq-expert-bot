FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

ENV DATABASE_URL="file:./dev.db"

RUN npm install

COPY tsconfig.json ./
COPY src ./src/
COPY public ./public/

RUN npx prisma generate
RUN npm run build

FROM node:20-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL="file:./dev.db"

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && npx tsx src/database/seed.ts && node dist/index.js"]
