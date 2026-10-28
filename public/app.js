(() => {
'use strict';
const $ = id => document.getElementById(id);
const defaults = {engine:'google',transport:'libcurl',adblock:false,tor:false,bookmarksVisible:true,scramjetVersion:'1'};
const read = (key, fallback) => {try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;}};
const settings = {...defaults,...read('hummingproxy-settings',{})};
if (!['google','duckduckgo','firefox'].includes(settings.engine)) settings.engine='google';
if (!['1','2'].includes(settings.scramjetVersion)) settings.scramjetVersion='1';
if (!['libcurl','epoxy'].includes(settings.transport)) settings.transport='libcurl';
const persist = () => {try {localStorage.setItem('hummingproxy-settings',JSON.stringify(settings));} catch {}};
const saveData = () => {try {localStorage.setItem('hummingproxy-bookmarks',JSON.stringify(bookmarks));localStorage.setItem('hummingproxy-tabs',JSON.stringify(tabs.map(t=>({id:t.id,url:t.url,title:t.title,history:t.history.slice(-25),index:t.index}))));} catch {}};
let bookmarks=read('hummingproxy-bookmarks',[]).filter(x=>x && typeof x.url==='string').slice(0,60);
let tabs=[], current=null, scramjet=null, mux=null, v2Controller=null, ready=false, torEndpoint='', activeTransport='', loadTimeout=0, booting=false;
let storedTabs=read('hummingproxy-tabs',[]);
let seq=0;
const status = v => $('status').textContent=v;
const loading = (on, detail='') => {clearTimeout(loadTimeout);$('loader').classList.toggle('hidden',!on);if(detail)$('loadDetail').textContent=detail;if(on)loadTimeout=setTimeout(()=>loading(false),20000);};
const searchUrls = {google:q=>`https://www.google.com/search?q=${encodeURIComponent(q)}`,duckduckgo:q=>`https://duckduckgo.com/?q=${encodeURIComponent(q)}`,firefox:q=>`https://www.google.com/search?q=${encodeURIComponent(q)}`};
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
  if(settings.scramjetVersion==='2'){
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
  const tab={id:++seq,url:typeof data.url==='string'?data.url:'',title:data.title||shortTitle(data.url||''),history:Array.isArray(data.history)?data.history.slice(-25):[],index:Number.isInteger(data.index)?data.index:-1,frame:null,busy:false};
  tabs.push(tab);return tab;
}
function drawTabs(){
  const host=$('tabStrip');host.replaceChildren();
  tabs.forEach(tab=>{
    const item=document.createElement('div');item.className='tab'+(tab.id===current?' active':'');
    const pick=document.createElement('button');pick.type='button';pick.className='tab-pick';pick.textContent=tab.title;pick.title=tab.url||'New tab';pick.onclick=()=>activate(tab.id);
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
function activate(id){
  const tab=tabs.find(t=>t.id===id);if(!tab)return;
  current=id;
  tabs.forEach(t=>{if(t.frame)t.frame.frame.classList.toggle('hidden',t.id!==id);});
  if(tab.url||tab.frame){$('home').classList.add('hidden');$('browser').classList.remove('hidden');}else{$('home').classList.remove('hidden');$('browser').classList.add('hidden');}
  updateUI();saveData();
  if(tab.url&&!tab.frame&&ready)navigate(tab.url,false);
}
function createTab(url=''){
  const tab=makeTab();activate(tab.id);if(url)navigate(url);
}
function closeTab(id){
  const idx=tabs.findIndex(t=>t.id===id);if(idx<0)return;
  const [tab]=tabs.splice(idx,1);
  if(tab.frame)tab.frame.frame.remove();
  if(tabs.length===0){const next=makeTab();current=next.id;}
  else if(id===current)current=tabs[Math.min(idx,tabs.length-1)].id;
  activate(current);saveData();
}
function ads(tab){
  if(!settings.adblock||!tab?.frame)return;
  try{
    const doc=tab.frame.frame.contentDocument;
    if(!doc||doc.getElementById('humming-cosmetic-filter'))return;
    const style=doc.createElement('style');style.id='humming-cosmetic-filter';style.textContent='[id="google_ads_iframe"],[data-ad-slot],.adsbygoogle,[id^="div-gpt-ad"],.ad-banner,.ad-container{display:none!important}';doc.head?.append(style);
  }catch{}
}
function ensureFrame(tab){
  if(tab.frame)return;
  if(settings.scramjetVersion==='2'){
    const raw=v2Controller.createFrame();
    tab.frame={frame:raw.element,go:url=>raw.go(url)};
  }else tab.frame=scramjet.createFrame();
  tab.frame.frame.title='HummingProxy: '+tab.title;
  tab.frame.frame.setAttribute('allow','fullscreen; autoplay; clipboard-read; clipboard-write');
  tab.frame.frame.classList.toggle('hidden',tab.id!==current);
  $('frameHost').append(tab.frame.frame);
  tab.frame.frame.addEventListener('load',()=>{tab.busy=false;if(current===tab.id){loading(false);status('Browsing');}ads(tab);});
  tab.frame.addEventListener?.('urlchange',e=>{
    const url=String(e.url||tab.frame.url||'');if(!/^https?:\/\//.test(url))return;
    tab.url=url;tab.title=shortTitle(url);
    if(tab.history[tab.index]!==url){tab.history=tab.history.slice(0,tab.index+1);tab.history.push(url);tab.index=tab.history.length-1;}
    if(current===tab.id)updateUI();saveData();ads(tab);
  });
}
async function navigate(input,push=true){
  if(!ready){status('Proxy is still starting');return;}
  let url;
  try{url=resolveUrl(input);if(!url)return;}catch(e){alert(e.message);return;}
  let tab=currentTab();if(!tab){tab=makeTab();current=tab.id;}
  loading(true,'the sound of the scramjet and lack of your ear protection instantly destroy your eardrums as you see hummingbirds getting blasted out to search for results…');
  try{
    await switchTransport();ensureFrame(tab);
    tab.url=url;tab.title=shortTitle(url);tab.busy=true;
    if(push){tab.history=tab.history.slice(0,tab.index+1);tab.history.push(url);tab.index=tab.history.length-1;}
    $('home').classList.add('hidden');$('browser').classList.remove('hidden');updateUI();saveData();
    await tab.frame.go(url);
  }catch(e){loading(false);tab.busy=false;status('Navigation failed');alert(`Couldn't open the page: ${e.message}`);}
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
async function init(){
  if(booting)return;booting=true;
  $('engine').value=settings.engine;$('transport').value=settings.transport;$('adblock').checked=settings.adblock;
  drawBookmarks();
  $('scramjetVersion').value=settings.scramjetVersion;
  await refreshTor();
  try{
    if(!('serviceWorker'in navigator))throw Error('Service workers unavailable in this browser');
    if(settings.scramjetVersion==='2'){
      status('Loading Scramjet 2…');
      for(const src of ['/v2-scram/scramjet.js','/v2-controller/controller.api.js','/v2-utils/scramjet-utils.js']){
        await new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=src;tag.onload=resolve;tag.onerror=()=>reject(Error('Could not load '+src));document.head.append(tag);});
      }
      const registration=await navigator.serviceWorker.register('/sw-v2.js',{scope:'/v2/',updateViaCache:'none'});
      if(!registration.active)throw Error('Scramjet 2 service worker did not activate');
      const {default: Transport}=await import(settings.transport==='libcurl'?'/v2-libcurl/index.mjs':'/v2-epoxy/index.mjs');
      const initialRoute=route();
      if(settings.tor&&!torEndpoint)throw Error('Tor is unavailable');
      v2Controller=new window.$scramjetController.Controller({
        serviceworker:registration.active,
        transport:new Transport({wisp:initialRoute.url}),
        config:{prefix:'/v2/p/',scramjetPath:'/v2-scram/scramjet.js',wasmPath:'/v2-scram/scramjet.wasm',injectPath:'/v2-controller/controller.inject.js'}
      });
      await v2Controller.wait();
      activeTransport=initialRoute.name+'|'+initialRoute.url;
      setInterval(()=>{try{registration.active?.postMessage('keepalive');}catch{}},15000);
    }else{
      if(!window.$scramjetLoadController)throw Error('Scramjet library unavailable');
      const {ScramjetController}=window.$scramjetLoadController();
      scramjet=new ScramjetController({prefix:'/service/',files:{wasm:'/scram/scramjet.wasm.wasm',all:'/scram/scramjet.all.js',sync:'/scram/scramjet.sync.js'}});
      status('Registering service worker…');
      const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
      await navigator.serviceWorker.ready;
      if(!registration.active)throw Error('Service worker did not activate');
      status('Starting Scramjet…');
      await scramjet.init();
      const {BareMuxConnection}=window.BareMux||await import('/baremux/index.mjs');
      mux=new BareMuxConnection('/baremux/worker.js');
    }
    await switchTransport();
    ready=true;status('Ready to fly');$('go').disabled=false;
    const valid=Array.isArray(storedTabs)?storedTabs.filter(t=>t&&typeof t.url==='string'):[];
    if(valid.length){valid.forEach(t=>makeTab(t));current=tabs[0].id;}else{current=makeTab().id;}
    updateUI();
    const params=new URLSearchParams(location.search);
    const query=params.get('q');
    if(query!==null&&query.trim()){
      history.replaceState(null,'',location.pathname);
      $('address').value=query;
      await navigate(query);
    }
  }catch(e){
    console.error('HummingProxy setup',e);status('Setup failed');
    $('setupError').textContent='Proxy setup failed: '+(e.message||String(e))+(String(e.message||'').includes('object stores')?' Open Storage Repair to reset Scramjet’s database.':'');$('setupError').classList.remove('hidden');$('repairProxy').classList.remove('hidden');$('go').disabled=true;
  }
}
$('repairProxy').onclick=()=>{location.assign('/repair.html');};
$('searchForm').onsubmit=e=>{e.preventDefault();navigate($('address').value);};
$('browserForm').onsubmit=e=>{e.preventDefault();navigate($('browserAddress').value);};
$('settingsBtn').onclick=()=>{$('settings').classList.toggle('hidden');refreshTor();};
$('closeSettings').onclick=()=>$('settings').classList.add('hidden');
$('engine').onchange=e=>{settings.engine=e.target.value;persist();};
$('adblock').onchange=e=>{settings.adblock=e.target.checked;persist();tabs.forEach(ads);};
$('showBookmarks').onchange=e=>{settings.bookmarksVisible=e.target.checked;persist();drawBookmarks();};
async function changeRoute(key,value){
  const old=settings[key];settings[key]=value;persist();
  try{
    if(ready){await switchTransport();for(const t of tabs){if(t.frame){t.frame.frame.remove();t.frame=null;} }const t=currentTab();if(t?.url)await navigate(t.url,false);}
  }catch(e){settings[key]=old;persist();$('transport').value=settings.transport;$('tor').checked=settings.tor;activeTransport='';alert(e.message);}
}
$('scramjetVersion').onchange=e=>{
  const next=e.target.value;
  if(next===settings.scramjetVersion)return;
  settings.scramjetVersion=next;persist();location.reload();
};
$('transport').onchange=e=>changeRoute('transport',e.target.value);
$('tor').onchange=e=>changeRoute('tor',e.target.checked);
function home(){loading(false);$('home').classList.remove('hidden');$('browser').classList.add('hidden');}
$('homeBtnTop').onclick=home;$('homeBtn').onclick=home;
$('newTab').onclick=()=>createTab();
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
