import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import wisp from '@uwu/wisp-server-node';

const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

// Resolve directory paths for local static storage assets
const PUBLIC_DIR = path.join(__dirname, '../public');

const server = http.createServer((req, res) => {
  // Safe routing hooks
  const urlPath = req.url === '/' ? '/index.html' : req.url || '/index.html';
  const targetFilePath = path.join(PUBLIC_DIR, urlPath);

  // Content-Type mapping dictionary for asset streams
  const ext = path.extname(targetFilePath);
  let contentType = 'text/html';
  if (ext === '.js') contentType = 'application/javascript';
  if (ext === '.css') contentType = 'text/css';
  if (ext === '.png') contentType = 'image/png';

  // Read flat UI files directly out of file storage memory
  fs.readFile(targetFilePath, (err, content) => {
    if (err) {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('hummingengine operational');
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Asset Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content, 'utf-8');
  });
});

// Configure WebSockets pipeline attached directly to Render's load balancer port
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  // Handshake route path matching protocol specifications
  if (request.url?.startsWith('/wisp/')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wisp.route(ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(Number(PORT), HOST, () => {
  console.log(`[hummingengine] Native backend routing processing on http://${HOST}:${PORT}`);
});
