import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
// Pull the stable server module out of the new wisp-js library scope
import { server as wisp } from '@mercuryworkshop/wisp-js/server';

const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

// Absolute root mapping to ensure assets load inside the Docker container
const PUBLIC_DIR = path.join(process.cwd(), 'public');

const server = http.createServer((req, res) => {
  const urlPath = req.url === '/' ? '/index.html' : req.url || '/index.html';
  const targetFilePath = path.join(PUBLIC_DIR, urlPath);
  const ext = path.extname(targetFilePath);
  
  let contentType = 'text/html';
  if (ext === '.js') contentType = 'application/javascript';
  if (ext === '.css') contentType = 'text/css';
  if (ext === '.png') contentType = 'image/png';

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

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  if (request.url?.startsWith('/wisp/')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      // Connect to the upgraded, stable wisp-js request handler stream
      wisp.routeRequest(ws);
    });
  } else {
    socket.destroy();
  }
});

server.listen(Number(PORT), HOST, () => {
  console.log(`[hummingengine] Native stable backend running on http://${HOST}:${PORT}`);
});
