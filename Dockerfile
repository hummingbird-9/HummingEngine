# =========================================================================
# STAGE 1: High-Performance Dependency Compiler
# =========================================================================
FROM docker.io/library/node:20-alpine AS compiler

# Install basic development build packages required for compiling proxy extensions
RUN apk add --no-cache python3 make g++

WORKDIR /build

# Copy configuration descriptors first to leverage Docker build cache layers
COPY package*.json ./
RUN npm install

# Pull down the rest of your local codebase components
COPY . .

# Compile your server-side TypeScript files down to highly-optimized JavaScript
RUN npm run build

# Strip away development dependencies to maintain a minimum RAM overhead footprint
RUN npm prune --production
