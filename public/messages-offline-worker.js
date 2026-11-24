/* Only immutable application-owned public assets enter this cache. */
const CACHE = "algt-chat-offline-shell-9662c990878ef63f3f91";
const EXPECTED = {"/messages-offline.html":"1af25411a6b5d5fe09c454056d8b1044f8e29a526385a73eee3b78747f9f457f","/messages-offline.css":"9b26c292989e1d768717b78ef9bc0f8a13e2724721959a6610dfe7aadb89040f","/messages-offline.mjs":"72b9a9a7c147ca09d648d1ce96a2579d70f1e30bf91c08f129059af580c4b1bc"}; // Generated digests of public assets
const PUBLIC_FILES = ["/messages-offline.html","/messages-offline.css","/messages-offline.mjs"];
self.addEventListener("install", event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  for(const path of PUBLIC_FILES){
    const url=new URL(path,self.location.origin);
    const response=await fetch(url,{credentials:"omit",redirect:"error",cache:"reload"});
    const mime=response.headers.get("content-type")||"";
    if(!response.ok || response.url!==url.href || !(path.endsWith(".html")?mime.includes("text/html"):path.endsWith(".css")?mime.includes("text/css"):/javascript/.test(mime)))throw Error("Offline shell asset unavailable");
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await response.clone().arrayBuffer())),v=>v.toString(16).padStart(2,"0")).join("");
    if(digest!==EXPECTED[path])throw Error("Offline shell asset integrity check failed");
    await cache.put(url,response);
  }
  await self.skipWaiting();
})()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith("algt-chat-offline-shell-")&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener("fetch",event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=="GET"||url.origin!==self.location.origin)return;
  if(PUBLIC_FILES.includes(url.pathname)&&!url.search){
    event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url))||fetch(req)));return;
  }
  if(req.mode==="navigate"&&url.pathname==="/messages"){
    event.respondWith(fetch(req).catch(async()=>{const cache=await caches.open(CACHE),shell=await cache.match("/messages-offline.html");if(!shell)throw Error("Offline shell unavailable");
      return new Response(shell.body,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","Permissions-Policy":"camera=(), microphone=(self), geolocation=()","Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'self'; media-src blob:; img-src blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"}});}));
  }
});
