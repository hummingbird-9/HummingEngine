import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { scramjetPath } from '@mercuryworkshop/scramjet/path';
import { baremuxPath } from '@mercuryworkshop/bare-mux/node';
import { libcurlPath } from '@mercuryworkshop/libcurl-transport';
import { epoxyPath } from '@mercuryworkshop/epoxy-transport';
import { server as wisp, logging } from '@mercuryworkshop/wisp-js/server';
import WebSocket, { WebSocketServer } from 'ws';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(projectRoot, 'public');
const v2Require = createRequire(resolve(projectRoot, 'v2/package.json'));
const v2Dir = (name:string) => dirname(v2Require.resolve(name));
const port = Number(process.env.PORT || 3000);
const run = promisify(execFile);
const torEnabled = process.env.BUILTIN_TOR === '1';
const externalTorUrl = process.env.TOR_WISP_URL || '';
if (externalTorUrl && !/^wss:\/\//.test(externalTorUrl)) throw Error('TOR_WISP_URL must start with wss://');
let lastCheck = 0;
let torVerified = false;
async function torStatus() {
  if (!torEnabled) return false;
  if (Date.now() - lastCheck < 45000) return torVerified;
  lastCheck = Date.now();
  try {
    const { stdout } = await run('curl', ['--silent','--show-error','--fail','--max-time','6','--socks5-hostname','127.0.0.1:9050','https://check.torproject.org/api/ip'], {timeout:8000});
    torVerified = JSON.parse(stdout).IsTor === true;
  } catch { torVerified = false; }
  return torVerified;
}
logging.set_level(logging.NONE);
Object.assign(wisp.options, {allow_udp_streams:false,allow_private_ips:false,allow_loopback_ips:false,dns_servers:['1.1.1.1','1.0.0.1']});
const bridge = new WebSocketServer({noServer:true,perMessageDeflate:false,maxPayload:2**20});
bridge.on('connection',(client) => {
  const upstream = new WebSocket('ws://127.0.0.1:8765/',{perMessageDeflate:false});
  const queue: Array<{data:Buffer,isBinary:boolean}> = [];
  let ended = false;
  const terminate = () => {if(ended)return;ended=true;client.close();upstream.close();};
  client.on('message',(data,isBinary)=>{
    const item = {data:Buffer.from(data as Buffer),isBinary};
    if(upstream.readyState===WebSocket.OPEN)upstream.send(item.data,{binary:item.isBinary});
    else if(upstream.readyState===WebSocket.CONNECTING && queue.length<16)queue.push(item);
    else terminate();
  });
  upstream.on('open',()=>{for(const item of queue)upstream.send(item.data,{binary:item.isBinary});queue.length=0;});
  upstream.on('message',(data,isBinary)=>{if(client.readyState===WebSocket.OPEN)client.send(data,{binary:isBinary});});
  client.on('close',terminate);upstream.on('close',terminate);
  client.on('error',terminate);upstream.on('error',terminate);
});
const app = Fastify({
  logger:true,
  serverFactory: handler => createServer((req,res)=>{
    res.setHeader('Cross-Origin-Opener-Policy','same-origin');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    handler(req,res);
  }).on('upgrade',(req,socket,head)=>{
    const path = new URL(req.url||'/','http://localhost').pathname;
    if(path==='/wisp/')wisp.routeRequest(req,socket,head);
    else if(path==='/tor-wisp/'&&torEnabled){
      void torStatus().then(ok=>{
        if(!ok){socket.destroy();return;}
        bridge.handleUpgrade(req,socket,head,client=>bridge.emit('connection',client,req));
      }).catch(()=>socket.destroy());
    }else socket.destroy();
  })
});
app.addHook('onSend',async(req,reply,payload)=>{
  if(/^\/(?:|index\.html|sw\.js|app\.js|api\/config)$/.test(new URL(req.url,'http://localhost').pathname))reply.header('Cache-Control','no-store,max-age=0');
  return payload;
});
app.get('/health',async()=>({ok:true,app:'HummingProxy'}));
app.get('/api/config',async()=>{
  const available = externalTorUrl ? true : await torStatus();
  return {torAvailable:available,torStarting:torEnabled&&!available,torWispUrl:available?(externalTorUrl||'__LOCAL_TOR__'):''};
});
await app.register(fastifyStatic,{root,prefix:'/'});
await app.register(fastifyStatic,{root:scramjetPath,prefix:'/scram/',decorateReply:false});
await app.register(fastifyStatic,{root:v2Require('@mercuryworkshop/scramjet/path').scramjetPath,prefix:'/v2-scram/',decorateReply:false});
await app.register(fastifyStatic,{root:v2Dir('@mercuryworkshop/scramjet-controller'),prefix:'/v2-controller/',decorateReply:false});
await app.register(fastifyStatic,{root:v2Dir('@mercuryworkshop/scramjet-utils'),prefix:'/v2-utils/',decorateReply:false});
await app.register(fastifyStatic,{root:v2Dir('@mercuryworkshop/libcurl-transport'),prefix:'/v2-libcurl/',decorateReply:false});
await app.register(fastifyStatic,{root:v2Dir('@mercuryworkshop/epoxy-transport'),prefix:'/v2-epoxy/',decorateReply:false});
await app.register(fastifyStatic,{root:baremuxPath,prefix:'/baremux/',decorateReply:false});
await app.register(fastifyStatic,{root:libcurlPath,prefix:'/libcurl/',decorateReply:false});
await app.register(fastifyStatic,{root:epoxyPath,prefix:'/epoxy/',decorateReply:false});
app.setNotFoundHandler((req,reply)=>{
  const path = new URL(req.url,'http://localhost').pathname;
  if(path.startsWith('/v2/p/') || path.startsWith('/service/')) {
    reply.code(503).type('text/html; charset=utf-8').header('Cache-Control','no-store');
    return '<!doctype html><html><head><meta charset="utf-8"><title>HummingProxy worker unavailable</title></head><body style="font:16px sans-serif;padding:24px"><h2>Proxy worker did not intercept this page</h2><p>This URL reached the server instead of the proxy service worker. Return to HummingProxy, refresh the page, and check Diagnostics. If you selected Scramjet 2, try Scramjet 1.</p></body></html>';
  }
  return reply.code(404).send({error:'Not found'});
});
await app.listen({port,host:'0.0.0.0'});
