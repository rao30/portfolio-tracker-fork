# Multi-stage build: cache deps, build frontend, run slim production image.
# Railway reuses layers when package-lock.json is unchanged.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --ignore-scripts

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY index.html vite.config.ts postcss.config.js tailwind.config.js tsconfig*.json ./
COPY public ./public
COPY src ./src
COPY server ./server
COPY mcp-server ./mcp-server
ARG VITE_PORTFOLIO_API_KEY
ARG VITE_PORTFOLIO_WRITE_KEY
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_PORTFOLIO_API_KEY=$VITE_PORTFOLIO_API_KEY
ENV VITE_PORTFOLIO_WRITE_KEY=$VITE_PORTFOLIO_WRITE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

FROM node:20-alpine AS release
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server.js ./
COPY server ./server
COPY --from=build /app/server/portfolio-analytics.mjs ./server/portfolio-analytics.mjs
COPY --from=build /app/mcp-server/dist ./mcp-server/dist
COPY public ./public
EXPOSE 3000
CMD ["node", "server.js"]
