# =========================================================================
# STAGE 1: High-Performance Dependency Compiler
# =========================================================================
FROM node:20-alpine AS compiler

# Install basic development build packages required for compiling proxy extensions
RUN apk add --no-cache python3 make g++

WORKDIR /build

# Copy configuration descriptors first to leverage Docker build cache layers
COPY package*.json ./
RUN npm ci

# Pull down the rest of your local codebase components
COPY . .

# Compile your server-side TypeScript files down to highly-optimized JavaScript
RUN npm run build

# Strip away development dependencies to maintain a minimum RAM overhead footprint
RUN npm prune --production


# =========================================================================
# STAGE 2: Microscopic Production Runtime Layer
# =========================================================================
FROM node:20-alpine AS runtime

WORKDIR /opt/hummingengine

# Establish non-privileged user sandbox permissions for optimal platform security
USER node

# Copy production components cleanly out of the compiler container state
COPY --chown=node:node --from=compiler /build/node_modules ./node_modules
COPY --chown=node:node --from=compiler /build/dist ./dist
COPY --chown=node:node --from=compiler /build/public ./public
COPY --chown=node:node --from=compiler /build/package.json ./package.json

# Render environment port variable assignment compliance
ENV PORT=10000
ENV NODE_ENV=production

# Expose Render infrastructure traffic routing ports
EXPOSE 10000

# Instruct Node's V8 engine to constrain memory usage on low-spec hosting pools
CMD ["node", "--max-old-space-size=512", "dist/server/index.js"]
