/* Service worker "red primero": siempre intenta bajar la versión más nueva y solo usa la copia guardada si no hay internet.
   Sube V (rr-v4, rr-v5…) cuando quieras forzar que todos los teléfonos descarten lo viejo. */
const V='rr-v3';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  for(const k of await caches.keys())if(k!==V)await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(u.origin!==location.origin)return;            // Supabase y otros dominios: sin tocar
  e.respondWith((async()=>{
    try{
      const n=await fetch(r.mode==='navigate'?r:new Request(r,{cache:'no-store'}));
      if(n&&n.status===200){try{(await caches.open(V)).put(r,n.clone())}catch(_){}}
      return n;
    }catch(_){
      return (await caches.match(r,{ignoreSearch:true}))||(r.mode==='navigate'&&await caches.match('index.html'))||Response.error();
    }
  })());
});
