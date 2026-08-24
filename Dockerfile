# Single-container build: builds shared + client + server, runs the server which
# serves the client's static bundle. Play over LAN; no internet needed at runtime.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/shared/package.json ./shared/
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/client/package.json ./client/
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
RUN npm install --omit=dev
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
