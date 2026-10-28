(() => {
'use strict';
const $ = id => document.getElementById(id);
const defaults = {engine:'google',transport:'libcurl',adblock:false,tor:false,bookmarksVisible:true,scramjetVersion:'1',autoFallback:true};
const read = (key, fallback) => {try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;}};
const settings = {...defaults,...read('hummingproxy-settings',{})};
if (!['google','duckduckgo','firefox'].includes(settings.engine)) settings.engine='google';
if (!['1','2'].includes(settings.scramjetVersion)) settings.scramjetVersion='1';
if (!['libcurl','epoxy'].includes(settings.transport)) settings.transport='libcurl';
const persist = () => {try {localStorage.setItem('hummingproxy-settings',JSON.stringify(settings));} catch {}};
const saveData = () => {try {localStorage.setItem('hummingproxy-bookmarks',JSON.stringify(bookmarks));localStorage.setItem('hummingproxy-tabs',JSON.stringify(tabs.map(t=>({id:t.id,url:t.url,title:t.title,icon:t.icon,history:t.history.slice(-25),index:t.index}))));} catch {}};
let bookmarks=read('hummingproxy-bookmarks',[]).filter(x=>x && typeof x.url==='string').slice(0,60);
let tabs=[], current=null, scramjet=null, mux=null, v2Controller=null, ready=false, torEndpoint='', activeTransport='', loadTimeout=0, booting=false, pendingSearch=null;
let storedTabs=read('hummingproxy-tabs',[]);
let seq=0;
let fallbackV2=false, fallbackReason='', storageRepair='not attempted';
const diagnosticEvents=[];
const logDiagnostic=(kind,detail='')=>{diagnosticEvents.push({time:new Date().toISOString(),kind,detail:String(detail).slice(0,250)});if(diagnosticEvents.length>35)diagnosticEvents.shift();};
window.addEventListener('error',event=>logDiagnostic('page error',event.message||'unknown'));
window.addEventListener('unhandledrejection',event=>logDiagnostic('unhandled rejection',event.reason?.message||String(event.reason)));

const isHomeVisible=()=>!$('home').classList.contains('hidden');
const status = v => $('status').textContent=v;
const loading = (on, detail='') => {clearTimeout(loadTimeout);$('loader').classList.toggle('hidden',!on);if(detail)$('loadDetail').textContent=detail;if(on)loadTimeout=setTimeout(()=>loading(false),20000);};
const searchUrls = {google:q=>`https://www.google.com/search?igu=1&q=${encodeURIComponent(q)}`,duckduckgo:q=>`https://duckduckgo.com/?q=${encodeURIComponent(q)}`,firefox:q=>`https://www.google.com/search?igu=1&q=${encodeURIComponent(q)}`};
function resolveUrl(input) {
  const v=input.trim();
  if(!v)return '';
  if(/^https?:\/\//i.test(v)){const u=new URL(v);if(!['http:','https:'].includes(u.protocol))throw Error('Unsupported address');return u.href;}
  if(/^(localhost|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?(?:\/.*)?$/i.test(v))throw Error('Local addresses are not supported');
  if(/^[^\s/]+\.[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i.test(v))return new URL('https://'+v).href;
  return searchUrls[settings.engine](v);
}
function route(){return {name:settings.transport,url:settings.tor?torEndpoint:`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/wisp/`};}
async function switchTransport(){
  if(settings.tor&&!torEndpoint)throw Error('Tor is not available on this server');
  const {name,url}=route(), key=name+'|'+url;
  if(activeTransport===key)return;
  status('Connecting…');
  if(settings.scramjetVersion==='2'||fallbackV2){
    if(!v2Controller)throw Error('Scramjet 2 is not initialized');
    const {default: Transport}=await import(name==='libcurl'?'/v2-libcurl/index.mjs':'/v2-epoxy/index.mjs');
    v2Controller.setTransport(new Transport({wisp:url}));
    activeTransport=key;
    status(settings.tor?'Tor route selected':name+' ready');
    return;
  }
  if(name==='libcurl')await mux.setTransport('/libcurl/index.mjs',[{websocket:url}]);
  else await mux.setTransport('/epoxy/index.mjs',[{wisp:url}]);
  activeTransport=key;
  status(settings.tor?'Tor route selected':name+' ready');
}
function currentTab(){return tabs.find(t=>t.id===current);}
function shortTitle(url){try{return new URL(url).hostname.replace(/^www\./,'');}catch{return 'New tab';}}
function makeTab(data={}){
  const tab={id:++seq,url:typeof data.url==='string'?data.url:'',title:data.title||shortTitle(data.url||''),icon:typeof data.icon==='string'?data.icon:'',history:Array.isArray(data.history)?data.history.slice(-25):[],index:Number.isInteger(data.index)?data.index:-1,frame:null,busy:false};
  tabs.push(tab);return tab;
}
function drawTabs(){
  const host=$('tabStrip');host.replaceChildren();
  tabs.forEach(tab=>{
    const item=document.createElement('div');item.className='tab'+(tab.id===current?' active':'');
    const pick=document.createElement('button');pick.type='button';pick.className='tab-pick';const icon=document.createElement('span');icon.className='tab-site-icon';
    if(tab.icon){const img=document.createElement('img');img.alt='';img.src=tab.icon;img.referrerPolicy='no-referrer';img.onerror=()=>{img.remove();icon.textContent='◎';};icon.append(img);}else icon.textContent='◎';
    const caption=document.createElement('span');caption.className='tab-caption';caption.textContent=tab.title;
    pick.append(icon,caption);pick.title=tab.url||'New tab';pick.onclick=()=>activate(tab.id);
    const close=document.createElement('button');close.type='button';close.className='tab-close';close.textContent='×';close.title='Close tab';close.setAttribute('aria-label','Close '+tab.title);close.onclick=()=>closeTab(tab.id);
    item.append(pick,close);host.append(item);
  });
  $('newTab').disabled=false;
}
function drawBookmarks(){
  $('bookmarkBar').classList.toggle('hidden',!settings.bookmarksVisible);
  $('showBookmarks').checked=settings.bookmarksVisible;
  const bar=$('bookmarkItems');bar.replaceChildren();
  bookmarks.forEach((mark,i)=>{
    const button=document.createElement('button');button.type='button';button.className='bookmark-link';button.textContent=mark.title||shortTitle(mark.url);button.title=mark.url;button.onclick=()=>navigate(mark.url);
    button.oncontextmenu=e=>{e.preventDefault();if(confirm('Remove this bookmark?')){bookmarks.splice(i,1);saveData();drawBookmarks();}};
    bar.append(button);
  });
  $('bookmarkToggle').textContent=bookmarks.some(b=>b.url===currentTab()?.url)?'★':'☆';
  $('bookmarkToggle').title='Bookmark this page';
}
function updateUI(){
  const t=currentTab();$('browserAddress').value=t?.url||'';
  $('back').disabled=!t||t.index<=0;
  $('forward').disabled=!t||t.index>=t.history.length-1;
  drawTabs();drawBookmarks();
}
function trimFrames(){
  const live=tabs.filter(t=>t.frame);
  if(live.length<=3)return;
  for(const tab of live){
    if(tab.id===current)continue;
    dropFrame(tab);
    if(tabs.filter(t=>t.frame).length<=3)break;
  }
}
function activate(id){
  const tab=tabs.find(t=>t.id===id);if(!tab)return;
  current=id;
  tabs.forEach(t=>{if(t.frame)t.frame.frame.classList.toggle('hidden',t.id!==id);});
  $('home').classList.add('hidden');$('browser').classList.remove('hidden');
  $('emptyTab').classList.toggle('hidden',!!(tab.url||tab.frame));
  updateUI();saveData();
  if(tab.url&&!tab.frame&&ready)navigate(tab.url,false);
  trimFrames();
}
function createTab(url=''){
  const tab=makeTab();activate(tab.id);if(url)navigate(url);else $('emptyTabAddress').focus();
}
function closeTab(id){
  const idx=tabs.findIndex(t=>t.id===id);if(idx<0)return;
  const [tab]=tabs.splice(idx,1);
  if(tab.frame)dropFrame(tab);
  if(tabs.length===0){current=null;home();updateUI();saveData();return;}
  if(id===current){current=tabs[Math.min(idx,tabs.length-1)].id;activate(current);}
  else updateUI();
  saveData();
}
function ads(tab){
  if(!settings.adblock||!tab?.frame)return;
  try{
    const doc=tab.frame.frame.contentDocument;
    if(!doc||doc.getElementById('humming-cosmetic-filter'))return;
    const style=doc.createElement('style');style.id='humming-cosmetic-filter';style.textContent='[id="google_ads_iframe"],[data-ad-slot],.adsbygoogle,[id^="div-gpt-ad"],.ad-banner,.ad-container{display:none!important}';doc.head?.append(style);
  }catch{}
}
function refreshTabMetadata(tab){
  if(!tab?.frame?.frame)return;
  let doc;
  try{doc=tab.frame.frame.contentDocument||tab.frame.frame.contentWindow?.document;}catch{return;}
  if(!doc)return;
  let changed=false;
  try{
    const raw=(doc.title||'').trim().slice(0,110);
    if(raw && !/^\{[\s\S]*\}$/.test(raw) && raw!==tab.title){tab.title=raw;changed=true;}
    const link=doc.querySelector('link[rel~="icon"],link[rel="shortcut icon"]');
    const rawIcon=link?.getAttribute('href');
    if(rawIcon){
      const resolved=new URL(rawIcon,doc.baseURI).href;
      if(/^https?:\/\//.test(resolved) && resolved.startsWith(location.origin+'/') && resolved!==tab.icon){tab.icon=resolved;changed=true;}
    }else if(!tab.icon&&tab.url&&!(settings.scramjetVersion==='2'||fallbackV2)){
      tab.icon='/service/'+encodeURIComponent(new URL('/favicon.ico',tab.url).href);changed=true;
    }
  }catch(e){logDiagnostic('metadata error',e.message||e);}
  if(changed){if(tab.id===current)updateUI();else drawTabs();saveData();}
}
function monitorTabMetadata(tab){
  refreshTabMetadata(tab);
  try{
    const doc=tab.frame.frame.contentDocument;
    if(!doc)return;
    if(tab.metadataObserver)tab.metadataObserver.disconnect();
    const observer=new MutationObserver(()=>refreshTabMetadata(tab));
    observer.observe(doc.head||doc.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['href','rel']});
    tab.metadataObserver=observer;
  }catch{}
}
function dropFrame(tab){
  tab.metadataObserver?.disconnect();tab.metadataObserver=null;
  if(tab.frame){tab.frame.frame.remove();tab.frame=null;}
}
async function repairScramjetDatabase(){
  storageRepair='checking $scramjet';
  if(!('indexedDB' in window)){storageRepair='IndexedDB unavailable';return false;}
  const inspect=()=>new Promise((resolve,reject)=>{
    let done=false,request;const timer=setTimeout(()=>{if(!done){done=true;reject(Error('database inspection timed out'));}},3500);
    try{request=indexedDB.open('$scramjet');}catch(e){clearTimeout(timer);reject(e);return;}
    request.onsuccess=()=>{if(done){request.result.close();return;}done=true;clearTimeout(timer);const db=request.result;const data={version:db.version,stores:[...db.objectStoreNames]};db.close();resolve(data);};
    request.onerror=()=>{if(!done){done=true;clearTimeout(timer);reject(request.error||Error('database open failed'));}};
    request.onblocked=()=>logDiagnostic('IndexedDB inspection blocked','$scramjet');
  });
  try{
    const existing=await inspect();
    logDiagnostic('storage schema',JSON.stringify(existing));
    if(existing.stores.length){storageRepair='nonempty schema '+existing.stores.join(',')+'; no mutation';return false;}
    storageRepair='empty database detected, trying safe schema upgrade';
    const result=await new Promise((resolve,reject)=>{
      let request,done=false;
      const timer=setTimeout(()=>{if(!done){done=true;reject(Error('upgrade blocked or timed out'));}},4500);
      request=indexedDB.open('$scramjet',existing.version+1);
      request.onupgradeneeded=()=>{
        const db=request.result;
        for(const store of ['config','cookies'])if(!db.objectStoreNames.contains(store))db.createObjectStore(store);
      };
      request.onsuccess=()=>{const db=request.result;const stores=[...db.objectStoreNames];db.close();if(!done){done=true;clearTimeout(timer);resolve(stores);}};
      request.onerror=()=>{if(!done){done=true;clearTimeout(timer);reject(request.error||Error('schema upgrade failed'));}};
      request.onblocked=()=>logDiagnostic('IndexedDB upgrade blocked','close other tabs using HummingProxy');
    });
    storageRepair='schema upgrade completed: '+result.join(',');logDiagnostic('storage repair',storageRepair);return true;
  }catch(e){storageRepair='could not upgrade: '+(e.message||e);logDiagnostic('storage repair',storageRepair);return false;}
}
function ensureFrame(tab){
  if(tab.frame)return;
  if(settings.scramjetVersion==='2'||fallbackV2){
    const raw=v2Controller.createFrame();
    tab.frame={frame:raw.element,go:url=>raw.go(url)};
  }else tab.frame=scramjet.createFrame();
  tab.frame.frame.title='HummingProxy: '+tab.title;
  tab.frame.frame.setAttribute('allow','fullscreen; autoplay; clipboard-read; clipboard-write');
  tab.frame.frame.classList.toggle('hidden',tab.id!==current);
  $('frameHost').append(tab.frame.frame);
  tab.frame.frame.addEventListener('load',()=>{monitorTabMetadata(tab);tab.busy=false;logDiagnostic('iframe load',tab.url);if(current===tab.id){loading(false);status('Frame loaded (page rendering unverified)');}ads(tab);});
  tab.frame.frame.addEventListener('error',()=>logDiagnostic('iframe error',tab.url));
  tab.frame.addEventListener?.('urlchange',e=>{
    const url=String(e.url||tab.frame.url||'');if(!/^https?:\/\//.test(url))return;
    tab.url=url;tab.title=shortTitle(url);tab.icon='';
    if(tab.history[tab.index]!==url){tab.history=tab.history.slice(0,tab.index+1);tab.history.push(url);tab.index=tab.history.length-1;}
    if(current===tab.id)updateUI();saveData();ads(tab);
  });
}
async function navigate(input,push=true){
  if(!ready){pendingSearch={input,push};$('address').value=input;status('Waiting for proxy setup…');return;}
  let url;
  try{url=resolveUrl(input);if(!url)return;}catch(e){alert(e.message);return;}
  let tab=currentTab();if(!tab||isHomeVisible()){tab=makeTab();current=tab.id;}
  loading(true,'the sound of the scramjet and lack of your ear protection instantly destroy your eardrums as you see hummingbirds getting blasted out to search for results…');
  try{
    await switchTransport();ensureFrame(tab);
    tab.url=url;tab.title=shortTitle(url);tab.icon='';tab.busy=true;
    if(push){tab.history=tab.history.slice(0,tab.index+1);tab.history.push(url);tab.index=tab.history.length-1;}
    $('home').classList.add('hidden');$('browser').classList.remove('hidden');$('emptyTab').classList.add('hidden');updateUI();saveData();
    logDiagnostic('navigate',url);
    await tab.frame.go(url);
    trimFrames();
  }catch(e){logDiagnostic('navigation error',e.message||e);loading(false);tab.busy=false;status('Navigation failed');alert(`Couldn't open the page: ${e.message}`);}
}
async function refreshTor(){
  try{
    const response=await fetch('/api/config',{cache:'no-store'});if(!response.ok)throw Error('Backend unavailable');
    const c=await response.json();torEndpoint=c.torAvailable?(c.torWispUrl==='__LOCAL_TOR__'?`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/tor-wisp/`:c.torWispUrl):'';
    $('tor').disabled=!torEndpoint;
    if(!torEndpoint&&settings.tor){settings.tor=false;activeTransport='';persist();}
    $('tor').checked=settings.tor;
    $('torNote').textContent=torEndpoint?'Tor exit verified by backend. Extra startup time is normal.':(c.torStarting?'Tor is starting; try again shortly.':'Tor unavailable. Docker deployment required.');
  }catch{$('tor').disabled=true;$('torNote').textContent='Cannot check Tor status';}
}
function waitForWorker(registration,timeout=18000){
  return new Promise((resolve,reject)=>{
    if(registration.active&&registration.active.state==='activated'){resolve(registration.active);return;}
    let settled=false;
    const finish=(error,worker)=>{if(settled)return;settled=true;clearTimeout(timer);registration.removeEventListener('updatefound',inspect);if(error)reject(error);else resolve(worker);};
    const inspect=()=>{
      const worker=registration.active||registration.waiting||registration.installing;
      if(!worker)return;
      if(worker.state==='activated'){finish(null,worker);return;}
      if(worker.state==='redundant'){finish(Error('Service worker became redundant. Reload this page.'));return;}
      worker.addEventListener('statechange',inspect,{once:true});
    };
    const timer=setTimeout(()=>finish(Error('Service worker activation timed out. Check DevTools for a service worker script error.')),timeout);
    registration.addEventListener('updatefound',inspect);
    inspect();
  });
}
async function init(){
  if(booting)return;booting=true;
  $('engine').value=settings.engine;$('transport').value=settings.transport;$('adblock').checked=settings.adblock;
  drawBookmarks();
  $('scramjetVersion').value=settings.scramjetVersion; $('autoFallback').checked=settings.autoFallback!==false;
  if(!tabs.length){current=makeTab().id;updateUI();}
  $('go').disabled=false;
  await refreshTor();
  try{
    if(!('serviceWorker'in navigator))throw Error('Service workers unavailable in this browser');
    if(settings.scramjetVersion==='2'){
      await initializeV2();
    }else{
      try {
        await initializeV1();
      }catch(error){
        fallbackReason=String(error?.message||error);
        logDiagnostic('Scramjet 1 setup failed',fallbackReason);
        if(!isMissingStore(error))throw error;
        const repaired=await repairScramjetDatabase();
        if(repaired){
          try{scramjet=null;mux=null;activeTransport='';await initializeV1();fallbackReason='';}
          catch(retryError){fallbackReason=String(retryError?.message||retryError);logDiagnostic('retry after repair failed',fallbackReason);}
        }
        if(fallbackReason){
          if(settings.autoFallback===false)throw Error('Scramjet 1 storage problem: '+fallbackReason+' (automatic fallback disabled)');
          fallbackV2=true;
          status('Scramjet 1 failed; using Scramjet 2 for this session…');
          await initializeV2();
        }
      }
    }
    await switchTransport();
    ready=true;logDiagnostic('initialized',fallbackV2?'Scramjet 2 fallback':settings.scramjetVersion);status(fallbackV2?'Ready · Scramjet 2 fallback':'Ready to fly');$('go').disabled=false;
    const valid=Array.isArray(storedTabs)?storedTabs.filter(t=>t&&typeof t.url==='string'):[];
    if(valid.length){tabs=[];valid.forEach(t=>makeTab(t));current=tabs[0].id;}
    updateUI();
    const params=new URLSearchParams(location.search);
    const query=params.get('q');
    if(query!==null&&query.trim()){
      history.replaceState(null,'',location.pathname);
      pendingSearch={input:query,push:true};
    }
    if(pendingSearch){const target=pendingSearch;pendingSearch=null;await navigate(target.input,target.push);}
    else home();
  }catch(e){
    logDiagnostic('setup error',e.message||e);console.error('HummingProxy setup',e);status('Setup failed — select Scramjet 2 or open Storage Diagnostics');
    $('setupError').textContent='Proxy setup failed: '+(e.message||String(e))+(String(e.message||'').includes('object stores')?' Scramjet 1 database has missing stores. Scramjet 2 may work on this device.':'');$('setupError').classList.remove('hidden');$('repairProxy').classList.remove('hidden');$('go').disabled=false;
  }
}
function isMissingStore(error){return /object store|NotFoundError|transaction.*IDBDatabase/i.test(String(error?.message||error));}
async function initializeV2(){
      status('Loading Scramjet 2…');
      for(const src of ['/v2-scram/scramjet.js','/v2-controller/controller.api.js','/v2-utils/scramjet-utils.js']){
        await new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=src;tag.onload=resolve;tag.onerror=()=>reject(Error('Could not load '+src));document.head.append(tag);});
      }
      const registration=await navigator.serviceWorker.register('/sw-v2.js',{scope:'/v2/',updateViaCache:'none'});
      const activatedWorker=await waitForWorker(registration);
      const {default: Transport}=await import(settings.transport==='libcurl'?'/v2-libcurl/index.mjs':'/v2-epoxy/index.mjs');
      const initialRoute=route();
      if(settings.tor&&!torEndpoint)throw Error('Tor is unavailable');
      v2Controller=new window.$scramjetController.Controller({
        serviceworker:activatedWorker,
        transport:new Transport({wisp:initialRoute.url}),
        config:{prefix:'/v2/p/',wasmPath:'/v2-scram/scramjet.wasm',injectPath:'/v2-controller/controller.inject.js'},
        scramjetConfig:{files:{wasm:'/v2-scram/scramjet.wasm'}}
      });
      await v2Controller.wait();
      activeTransport=initialRoute.name+'|'+initialRoute.url;
      setInterval(()=>{try{registration.active?.postMessage('keepalive');}catch{}},15000);
}
async function initializeV1(){
      if(!window.$scramjetLoadController)throw Error('Scramjet library unavailable');
      const {ScramjetController}=window.$scramjetLoadController();
      scramjet=new ScramjetController({prefix:'/service/',files:{wasm:'/scram/scramjet.wasm.wasm',all:'/scram/scramjet.all.js',sync:'/scram/scramjet.sync.js'}});
      status('Registering service worker…');
      const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
      await waitForWorker(registration);
      status('Starting Scramjet…');
      await scramjet.init();
      const {BareMuxConnection}=window.BareMux||await import('/baremux/index.mjs');
      mux=new BareMuxConnection('/baremux/worker.js');
}
async function diagnosticsText(){
  const t=currentTab(),f=t?.frame?.frame;
  const rect=f?.getBoundingClientRect();
  let workers=[];
  try{workers=(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,active:r.active?.state||'none',waiting:r.waiting?.state||'none'}));}catch(e){workers=['unavailable: '+e.message];}
  const lines=[
    'HummingProxy diagnostics',
    'Time: '+new Date().toISOString(),
    'Browser: '+navigator.userAgent,
    'Origin: '+location.origin,
    'Engine: '+(fallbackV2?'Scramjet 2 fallback':settings.scramjetVersion),
    'Ready: '+ready,
    'Fallback reason: '+(fallbackReason||'none'),
    'Storage repair: '+storageRepair,
    'Transport: '+settings.transport,
    'Tor selected: '+settings.tor,
    'Active transport configured: '+Boolean(activeTransport),
    'Page: '+(t?.url||'none'),
    'Frame present: '+Boolean(f),
    'Frame attached: '+Boolean(f?.isConnected),
    'Frame hidden: '+Boolean(f?.classList.contains('hidden')),
    'Frame dimensions: '+(rect?Math.round(rect.width)+'x'+Math.round(rect.height):'none'),
    'Frame src: '+(f?.getAttribute('src')||'none'),
    'Frame loading: '+Boolean(t?.busy),
    'Service worker controller: '+(navigator.serviceWorker.controller?.scriptURL||'none'),
    'Registrations: '+JSON.stringify(workers),
    'Events: '+JSON.stringify(diagnosticEvents,null,2)
  ];
  return lines.join('\n');
}
async function refreshDiagnostics(){ $('diagnosticsOutput').textContent=await diagnosticsText(); }
$('diagnosticsBtn').onclick=()=>{$('diagnosticsPanel').classList.toggle('hidden');if(!$('diagnosticsPanel').classList.contains('hidden'))void refreshDiagnostics();};
$('closeDiagnostics').onclick=()=>$('diagnosticsPanel').classList.add('hidden');
$('refreshDiagnostics').onclick=()=>void refreshDiagnostics();
$('copyDiagnostics').onclick=async()=>{const content=await diagnosticsText();try{await navigator.clipboard.writeText(content);status('Diagnostics copied');}catch{const area=document.createElement('textarea');area.value=content;document.body.append(area);area.select();document.execCommand('copy');area.remove();status('Diagnostics copy attempted');}};
$('repairProxy').onclick=()=>{location.assign('/repair.html');};
$('searchForm').onsubmit=e=>{e.preventDefault();void navigate($('address').value);};
$('browserForm').onsubmit=e=>{e.preventDefault();void navigate($('browserAddress').value);};
$('emptyTabForm').onsubmit=e=>{e.preventDefault();void navigate($('emptyTabAddress').value);};
$('settingsBtn').onclick=()=>{$('settings').classList.toggle('hidden');refreshTor();};
$('closeSettings').onclick=()=>$('settings').classList.add('hidden');
$('engine').onchange=e=>{settings.engine=e.target.value;persist();};
$('autoFallback').onchange=e=>{settings.autoFallback=e.target.checked;persist();};
$('adblock').onchange=e=>{settings.adblock=e.target.checked;persist();tabs.forEach(ads);};
$('showBookmarks').onchange=e=>{settings.bookmarksVisible=e.target.checked;persist();drawBookmarks();};
async function changeRoute(key,value){
  const old=settings[key];settings[key]=value;persist();
  try{
    if(ready){await switchTransport();for(const t of tabs){if(t.frame)dropFrame(t); }const t=currentTab();if(t?.url&&!isHomeVisible())await navigate(t.url,false);}
  }catch(e){settings[key]=old;persist();$('transport').value=settings.transport;$('tor').checked=settings.tor;activeTransport='';alert(e.message);}
}
$('scramjetVersion').onchange=e=>{
  const next=e.target.value;
  if(next===settings.scramjetVersion)return;
  settings.scramjetVersion=next;persist();location.reload();
};
$('transport').onchange=e=>changeRoute('transport',e.target.value);
$('tor').onchange=e=>changeRoute('tor',e.target.checked);
function home(){loading(false);$('home').classList.remove('hidden');$('browser').classList.add('hidden');$('settings').classList.add('hidden');}
$('homeBtnTop').onclick=home;$('homeBtn').onclick=home;
$('newTab').onclick=()=>createTab();
$('openTabs').onclick=()=>{if(!tabs.length){createTab();return;}activate(current&&tabs.some(t=>t.id===current)?current:tabs[0].id);};
$('bookmarkToggle').onclick=()=>{
  const t=currentTab();if(!t?.url)return;
  const idx=bookmarks.findIndex(b=>b.url===t.url);
  if(idx>=0)bookmarks.splice(idx,1);else if(bookmarks.length<60)bookmarks.push({url:t.url,title:t.title});
  saveData();drawBookmarks();
};
$('reload').onclick=()=>{const t=currentTab();if(t?.url)navigate(t.url,false);};
$('back').onclick=()=>{const t=currentTab();if(t&&t.index>0)navigate(t.history[--t.index],false);};
$('forward').onclick=()=>{const t=currentTab();if(t&&t.index<t.history.length-1)navigate(t.history[++t.index],false);};
function updateFullscreen(){const full=document.fullscreenElement===$('browser');$('expand').textContent=full?'⤢':'⛶';$('expand').title=full?'Exit fullscreen':'Fullscreen';$('expand').setAttribute('aria-label',$('expand').title);}
$('expand').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('browser').requestFullscreen();}catch(e){status('Fullscreen unavailable: '+e.message);}};
document.addEventListener('fullscreenchange',updateFullscreen);
$('cancelLoad').onclick=()=>loading(false);
$('brandLogo').addEventListener('error',()=>{$('brandLogo').classList.add('hidden');$('logoFallback').classList.remove('hidden');});
if($('brandLogo').complete&&!$('brandLogo').naturalWidth){$('brandLogo').classList.add('hidden');$('logoFallback').classList.remove('hidden');}
init();
})();
