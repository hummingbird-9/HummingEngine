// SharedWorker execution context scope 
const connections: MessagePort[] = [];
let activeConfig = {
  transportMode: 'epoxy',
  velocityAdBlock: false,
  stealthSession: false
};

/* @ts-ignore */
onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  connections.push(port);

  port.onmessage = (msgEvent) => {
    const data = msgEvent.data;
    
    if (data && data.type === 'HUMMINGENGINE_CONFIG_SYNC') {
      // Absorb updated UI options mapping payload
      activeConfig = { ...activeConfig, ...data.config };
      
      // Echo configuration state out to all open frame contexts instantly
      connections.forEach((conn) => {
        conn.postMessage({
          type: 'HUMMINGENGINE_CONFIG_BROADCAST',
          config: activeConfig
        });
      });
    }
  };

  port.start();
};
