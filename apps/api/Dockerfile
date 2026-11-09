# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/api --include-workspace-root
COPY apps/api apps/api
# prisma generate no se conecta a la BD, pero prisma.config.ts exige la variable
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run build -w apps/api

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
# El seed (prisma/seed.ts, con tsx) reutiliza el cliente generado y los motores de estadísticas, reputación y ranking
COPY --from=build /app/apps/api/src ./apps/api/src
COPY --from=build /app/apps/api/tsconfig.json ./apps/api/tsconfig.json
WORKDIR /app/apps/api
USER node
EXPOSE 4100
# Aplica migraciones pendientes y arranca la API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
