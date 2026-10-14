// Service worker zodat RugSchema als app op het beginscherm kan.
// Bewaart bewust niets: elke keer de nieuwste versie en de echte gegevens van de server.
// Alleen als er geen internet is, krijgt de cliënt een nette melding in plaats van een browserfout.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.mode!=='navigate')return;
  e.respondWith(fetch(e.request).catch(()=>new Response(
    '<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>RugSchema</title><body style="font:16px/1.5 system-ui,sans-serif;background:#ffdecc;color:#1f1f1f;display:grid;place-items:center;min-height:90vh;margin:0;padding:16px;text-align:center">'+
    '<div><h1 style="font-size:1.4rem">Geen internet</h1><p>RugSchema heeft internet nodig. Probeer het zo opnieuw.</p>'+
    '<button onclick="location.reload()" style="font:600 1rem system-ui;background:#f9b18a;border:0;border-radius:999px;padding:11px 22px">Opnieuw proberen</button></div>',
    {headers:{'Content-Type':'text/html; charset=utf-8'}})));
});
