import http from 'node:http';
import { WebSocketServer } from 'ws';
import wisp from '@uwu/wisp-server-node';

const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

// Initialize bare HTTP server instance
const server = http.createServer((req, res) => {
  // Safe Internal Route Links: '/health' and '/'
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('hummingengine backend operational');
    return;
  }
  
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  // Safe Internal Endpoint Link Path prefix: '/wisp/'
  if (request.url?.startsWith('/wisp/')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wisp.route(ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(Number(PORT), HOST, () => {
  console.log(`[hummingengine] Native Wisp backend processing on http://${HOST}:${PORT}`);
});
