FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends tor python3 python3-pip curl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN pip3 install --break-system-packages --no-cache-dir wisp-python==0.8.3
WORKDIR /app
COPY package*.json ./
COPY v2/package.json ./v2/package.json
RUN npm install
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm run build && npm prune --omit=dev
COPY start.sh ./start.sh
RUN chmod +x ./start.sh
ENV BUILTIN_TOR=1
CMD ["/app/start.sh"]
