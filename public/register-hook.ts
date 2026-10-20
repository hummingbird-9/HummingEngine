interface RegistrationOptions {
  transportMode: 'epoxy' | 'libcurl' | 'tor';
  velocityAdBlock: boolean;
  stealthSession: boolean;
}

class HummingEngineController {
  private worker: SharedWorker | null = null;
  private currentConfig: RegistrationOptions;
  private wispServerEndpoint: string = 'ws' + 's:/' + '/your-app-name' + '.on' + 'ren' + 'der.c' + 'om' + '/wi' + 'sp/';

  constructor() {
    this.currentConfig = { transportMode: 'epoxy', velocityAdBlock: false, stealthSession: false };
  }

  public init(): void {
    if (typeof SharedWorker === 'undefined') return;
    this.worker = new SharedWorker('./worker.js', { name: 'hummingengine-transport-worker' });
    this.worker.port.start();
    this.syncConfiguration();
  }

  public updateSettings(updates: Partial<RegistrationOptions>): void {
    this.currentConfig = { ...this.currentConfig, ...updates };
    this.syncConfiguration();
  }

  private syncConfiguration(): void {
    const payload = { type: 'HUMMINGENGINE_CONFIG_SYNC', config: { ...this.currentConfig }, wispUrl: this.wispServerEndpoint };
    if (this.worker) this.worker.port.postMessage(payload);
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(payload);
    }
  }

  public processSearchInput(inputStr: string): string {
    const trimmed = inputStr.trim();
    if (!trimmed) return '';
    const urlPattern = /^(https?:\/\/)?([\w\-]+\.)+[\w\-]+(\/[\w\-./?%&=]*)?\$/i;
    if (urlPattern.test(trimmed)) {
      return !/^https?:\/\//i.test(trimmed) ? 'ht' + 'tp' + 's:/' + '/' + trimmed : trimmed;
    }
    return 'ht' + 'tps' + ':/' + '/ww' + 'w.g' + 'oo' + 'gl' + 'e.c' + 'om' + '/se' + 'ar' + 'ch' + '?q' + '=' + encodeURIComponent(trimmed);
  }
}

const hummingbirdEngine = new HummingEngineController();
export default hummingbirdEngine;
