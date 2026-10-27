import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { scramjetPath } from '@mercuryworkshop/scramjet/path';
import { baremuxPath } from '@mercuryworkshop/bare-mux/node';
import { libcurlPath } from '@mercuryworkshop/libcurl-transport';
import { epoxyPath } from '@mercuryworkshop/epoxy-transport';
import { server as wisp, logging } from '@mercuryworkshop/wisp-js/server';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const port = Number(process.env.PORT || 3000);
const require = createRequire(import.meta.url);
// Tor requires a separately operated Wisp endpoint whose EGRESS really goes through Tor.
// Never claim the standard Render egress is Tor.
const torWispUrl = process.env.TOR_WISP_URL || '';
if (torWispUrl && !/^wss:\/\//.test(torWispUrl)) throw Error('TOR_WISP_URL must start with wss://');

logging.set_level(logging.NONE);
Object.assign(wisp.options, {
  allow_udp_streams: false,
  allow_private_ips: false,
  allow_loopback_ips: false,
  dns_servers: ['1.1.1.1', '1.0.0.1']
});
const app = Fastify({
  logger: true,
  serverFactory: (handler) => createServer((req, res) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    // Do not force COEP: the user-supplied remotely hosted logo may not send CORP headers.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    handler(req, res);
  }).on('upgrade', (req, socket, head) => {
    if (new URL(req.url || '/', 'http://localhost').pathname === '/wisp/') {
      wisp.routeRequest(req, socket, head);
    } else socket.destroy();
  })
});
app.get('/health', async () => ({ ok: true, app: 'HummingProxy' }));
app.get('/api/config', async () => ({ torAvailable: Boolean(torWispUrl), torWispUrl }));
await app.register(fastifyStatic, { root, prefix: '/' });
await app.register(fastifyStatic, { root: scramjetPath, prefix: '/scram/', decorateReply: false });
await app.register(fastifyStatic, { root: baremuxPath, prefix: '/baremux/', decorateReply: false });
await app.register(fastifyStatic, { root: libcurlPath, prefix: '/libcurl/', decorateReply: false });
await app.register(fastifyStatic, { root: epoxyPath, prefix: '/epoxy/', decorateReply: false });
app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: 'Not found' }));
await app.listen({ port, host: '0.0.0.0' });
