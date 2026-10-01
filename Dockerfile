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
RUN npx prisma db push
RUN npm run build
RUN npx tsx src/database/seed.ts || true

FROM node:20-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public
COPY --from=builder /app/dev.db ./dev.db

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL="file:./dev.db"

EXPOSE 3000

CMD ["node", "dist/index.js"]
