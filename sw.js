const CACHE_NAME="zip-arcade-games-v1";
const GAME_PREFIX=new URL("__zipgames/",self.registration.scope).pathname;
self.addEventListener("install",event=>{event.waitUntil(self.skipWaiting())});
self.addEventListener("activate",event=>{event.waitUntil((async()=>{await self.clients.claim();})())});
self.addEventListener("fetch",event=>{
 const url=new URL(event.request.url);
 if(!url.pathname.startsWith(GAME_PREFIX))return;
 event.respondWith(new Response("O player local antigo não é usado nesta versão compartilhada.",{status:404,headers:{"Content-Type":"text/plain;charset=utf-8"}}));
});
