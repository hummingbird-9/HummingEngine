/* Scramjet classic service worker. Must be served at /sw.js. */
importScripts('/scram/scramjet.all.js');
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
self.addEventListener('fetch', (event) => {
  event.respondWith((async () => {
    await scramjet.loadConfig();
    return scramjet.route(event) ? scramjet.fetch(event) : fetch(event.request);
  })());
});
