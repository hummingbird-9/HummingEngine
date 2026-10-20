import http from 'node:http';
import { WebSocketServer } from 'ws';
import wisp from '@uwu/wisp-server-node';

// Render configuration parameters
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

// Initialize bare HTTP server instance
const server = http.createServer((req, res) => {
  // Simple health check and static assets route fallback
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('hummingengine backend operational');
    return;
  }
  
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// Configure low-overhead WebSocket server attached to the HTTP pipeline
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  // Ensure the route path matches the target Wisp protocol standard path
  if (request.url?.startsWith('/wisp/')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wisp.route(ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Start listening immediately to comply with Render's boot-up timeout policies
server.listen(Number(PORT), HOST, () => {
  // Explicitly log state without multi-socket network blocking routines
  console.log(`[hummingengine] Native Wisp backend processing on http://${HOST}:${PORT}`);
});
