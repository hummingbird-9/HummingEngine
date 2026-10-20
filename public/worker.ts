const activePorts: MessagePort[] = [];
let globalState = { transportMode: 'epoxy', velocityAdBlock: false, stealthSession: false, wispUrl: '' };

/* @ts-ignore */
onconnect = (event: MessageEvent) => {
  const currentPort = event.ports[0];
  activePorts.push(currentPort);

  currentPort.onmessage = (msgEvent) => {
    const data = msgEvent.data;
    if (data && data.type === 'HUMMINGENGINE_CONFIG_SYNC') {
      globalState = {
        transportMode: data.config.transportMode,
        velocityAdBlock: data.config.velocityAdBlock,
        stealthSession: data.config.stealthSession,
        wispUrl: data.wispUrl
      };
      activePorts.forEach((port) => {
        port.postMessage({ type: 'HUMMINGENGINE_CONFIG_BROADCAST', config: globalState });
      });
    }
  };
  currentPort.start();
};
