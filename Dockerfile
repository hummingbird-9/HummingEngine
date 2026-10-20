FROM docker.io/library/node:20-alpine AS compiler
RUN apk add --no-cache python3 make g++
WORKDIR /build
COPY package*.json tsconfig.json ./
RUN npm install
COPY . .
RUN npm run build
RUN npm prune --production

FROM docker.io/library/node:20-alpine AS runtime
WORKDIR /opt/hummingengine
USER node
COPY --chown=node:node --from=compiler /build/node_modules ./node_modules
COPY --chown=node:node --from=compiler /build/dist ./dist
COPY --chown=node:node --from=compiler /build/public ./public
COPY --chown=node:node --from=compiler /build/package.json ./package.json

ENV PORT=10000
ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "--max-old-space-size=512", "dist/server/index.js"]
