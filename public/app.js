/* HummingProxy client — Scramjet 1.x, bare-mux 2.x */
(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const defaults = { engine: 'duckduckgo', transport: 'libcurl', adblock: false, tor: false };
let settings;
try { settings = { ...defaults, ...JSON.parse(localStorage.getItem('hummingproxy-settings') || '{}') }; } catch { settings = { ...defaults }; }
let scramjet, frame, mux, activeTransport = '', activeUrl = '', history = [], historyIndex = -1, torEndpoint = '';
let ready = false, loadingTimer, setupFailure = ''; 
const persist = () => localStorage.setItem('hummingproxy-settings', JSON.stringify(settings));
const status = (text) => { $('status').textContent = text; };
const showLoading = (on, detail = '') => {
  clearTimeout(loadingTimer);
  $('loader').classList.toggle('hidden', !on);
  if (detail) $('loadDetail').textContent = detail;
  if (on) loadingTimer = setTimeout(() => showLoading(false), 18000);
};
const searchUrls = {
  duckduckgo: q => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  google: q => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  firefox: q => `https://www.google.com/search?q=${encodeURIComponent(q)}`
};
function resolveUrl(input) {
  const value = input.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(localhost|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?(?:\/.*)?$/i.test(value)) throw Error('Local addresses are not supported.');
  if (/^[^\s/]+\.[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i.test(value)) return `https://${value}`;
  return searchUrls[settings.engine](value);
}
function transportConfig() {
  const url = settings.tor ? torEndpoint : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/wisp/`;
  return { name: settings.transport, url };
}
async function switchTransport() {
  const { name, url } = transportConfig();
  if (settings.tor && !torEndpoint) throw Error('No Tor-routed relay is configured.');
  const key = `${name}|${url}`;
  if (activeTransport === key) return;
  status('Connecting…');
  if (name === 'libcurl') await mux.setTransport('/libcurl/index.mjs', [{ websocket: url }]);
  else await mux.setTransport('/epoxy/index.mjs', [{ wisp: url }]);
  activeTransport = key;
  status(`${settings.tor ? 'Tor relay' : name} ready`);
}
function cosmeticAds() {
  if (!settings.adblock || !frame) return;
  try {
    const doc = frame.frame.contentDocument;
    if (!doc || doc.getElementById('humming-cosmetic-filter')) return;
    const css = doc.createElement('style');
    css.id = 'humming-cosmetic-filter';
    // Cosmetic only: deliberately avoid intercepting requests or claiming network filtering.
    css.textContent = '[id="google_ads_iframe"],[data-ad-slot],.adsbygoogle,[id^="div-gpt-ad"],.ad-banner,.ad-container{display:none!important}';
    doc.head?.append(css);
  } catch (_) { /* Cross-origin document or navigation in progress */ }
}
function ensureFrame() {
  if (frame) return;
  frame = scramjet.createFrame();
  frame.frame.setAttribute('title', 'HummingProxy browsing window');
  frame.frame.setAttribute('allow', 'fullscreen; autoplay; clipboard-read; clipboard-write');
  $('frameHost').append(frame.frame);
  frame.frame.addEventListener('load', () => { showLoading(false); status('Browsing'); cosmeticAds(); });
  frame.addEventListener?.('urlchange', (event) => {
    const next = event.url || frame.url;
    if (next) { activeUrl = String(next); $('browserAddress').value = activeUrl; }
    cosmeticAds();
  });
}
async function navigate(raw, push = true) {
  if (!ready) { status('Proxy is not ready'); $('setupError').classList.remove('hidden'); $('setupError').textContent = setupFailure || 'The proxy is still starting. Check browser console for errors.'; return; }
  let url;
  try { url = resolveUrl(raw); if (!url) return; new URL(url); } catch (err) { return alert(err.message); }
  showLoading(true, 'the sound of the scramjet and lack of your ear protection instantly destroy your eardrums as you see hummingbirds getting blasted out to search for results…');
  try {
    await switchTransport();
    ensureFrame();
    $('home').classList.add('hidden');
    $('browser').classList.remove('hidden');
    activeUrl = url;
    $('browserAddress').value = url;
    if (push) { history = history.slice(0, historyIndex + 1); history.push(url); historyIndex = history.length - 1; }
    // On the first activation, attach iframe only once; reuse to reduce Chromebook memory.
    await frame.go(url);
  } catch (err) { showLoading(false); status('Navigation failed'); alert(`Couldn't open the page: ${err.message}`); }
}
async function init() {
  $('engine').value = settings.engine;
  $('transport').value = settings.transport;
  $('adblock').checked = settings.adblock;
  try {
    const cfg = await (await fetch('/api/config', { cache: 'no-store' })).json();
    torEndpoint = cfg.torAvailable ? cfg.torWispUrl : '';
  } catch { torEndpoint = ''; }
  $('tor').disabled = !torEndpoint;
  if (!torEndpoint) settings.tor = false;
  $('tor').checked = settings.tor;
  $('torNote').textContent = torEndpoint ? 'Routes traffic through your separately configured Tor Wisp relay; verify its operator.' : 'Unavailable — configure TOR_WISP_URL with a trusted Tor-routed Wisp server';
  persist();
  try {
    if (!('serviceWorker' in navigator)) throw Error('Service workers are unavailable. Use HTTPS or localhost.');
    if (!window.$scramjetLoadController) throw Error('Scramjet assets failed to load.');
    const { ScramjetController } = window.$scramjetLoadController();
    scramjet = new ScramjetController({ prefix: '/service/', files: { wasm: '/scram/scramjet.wasm.wasm', all: '/scram/scramjet.all.js', sync: '/scram/scramjet.sync.js' } });
    status('Registering service worker…');
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    if (!registration.active) throw Error('Service worker did not activate');
    status('Starting Scramjet…');
    await scramjet.init();
    mux = new (window.BareMux?.BareMuxConnection || (await import('/baremux/index.mjs')).BareMuxConnection)('/baremux/worker.js');
    await switchTransport();
    ready = true;
    status('Ready to fly');
  } catch (err) { console.error('HummingProxy initialization failed:', err); setupFailure = `Proxy setup failed: ${err.message || String(err)}. Try reloading once; if it persists, check DevTools → Console.`; status('Setup failed'); $('setupError').textContent = setupFailure; $('setupError').classList.remove('hidden'); $('go').disabled = true; }
}
$('searchForm').addEventListener('submit', e => { e.preventDefault(); navigate($('address').value); });
$('browserForm').addEventListener('submit', e => { e.preventDefault(); navigate($('browserAddress').value); });
for (const el of document.querySelectorAll('[data-url]')) el.addEventListener('click', () => navigate(el.dataset.url));
$('settingsBtn').onclick = () => $('settings').classList.toggle('hidden');
$('closeSettings').onclick = () => $('settings').classList.add('hidden');
$('engine').onchange = e => { settings.engine = e.target.value; persist(); };
$('adblock').onchange = e => { settings.adblock = e.target.checked; persist(); cosmeticAds(); };
async function changeRoute(key, value) {
  const before = settings[key]; settings[key] = value; persist();
  try {
    if (ready) { await switchTransport(); if (activeUrl) await navigate(activeUrl, false); }
  } catch (err) { settings[key] = before; persist(); $(key).value = before; $(key).checked = before; alert(err.message); }
}
$('transport').onchange = e => changeRoute('transport', e.target.value);
$('tor').onchange = e => changeRoute('tor', e.target.checked);
$('homeBtnTop').onclick = () => { $('browser').classList.add('hidden'); $('home').classList.remove('hidden'); showLoading(false); };
$('homeBtn').onclick = () => { $('browser').classList.add('hidden'); $('home').classList.remove('hidden'); showLoading(false); };
$('reload').onclick = () => { if (activeUrl) navigate(activeUrl, false); };
$('back').onclick = () => { if (historyIndex > 0) navigate(history[--historyIndex], false); };
$('forward').onclick = () => { if (historyIndex < history.length - 1) navigate(history[++historyIndex], false); };
$('expand').onclick = () => $('browser').requestFullscreen?.();
$('cancelLoad').onclick = () => showLoading(false);
// Use the supplied logo directly; show a textual fallback if the host blocks the image.
$('brandLogo').addEventListener('error', () => { $('brandLogo').classList.add('hidden'); $('logoFallback').classList.remove('hidden'); });
if ($('brandLogo').complete && !$('brandLogo').naturalWidth) { $('brandLogo').classList.add('hidden'); $('logoFallback').classList.remove('hidden'); }
init();
})();
