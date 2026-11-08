// Sessiescherm: de therapeut kiest wie er vandaag is, daarna staat de tablet op een eigen scherm waar die kinderen
// hun oefeningen afvinken. De therapeut blijft ingelogd; terug naar het praktijkoverzicht kan alleen met haar wachtwoord.
// Bij het herladen van de pagina gaat de tablet terug naar dit scherm. Afvinken gaat naar dezelfde plek als bij een kind
// met een eigen account (client_dagen), dus er ontstaat geen conflict met wat op een ander apparaat wordt bewerkt.
const KIOSK_STIL_MS=3*60*1000, KIOSK_SLOT_STIL_MS=60*1000;   // na zoveel stilstand terug naar de namenlijst
let kiosk=null;        // {ids:[cliënt-id's], kind:cliënt-id of null, slot:false|{bezig,fout}}
let sessieKies=null;   // {ids:[...]} zolang de therapeut de sessie inricht
let kioskLaatst=Date.now(), schermSlot=null;

const kioskActief=()=>!!kiosk&&['server','dev','demo'].includes(modus);
const kioskKan=c=>!!effective(c);
function herstelSessie(){
  const ids=(Opslag.laadSessie()||[]).filter(id=>S.clients.some(c=>c.id===id));
  kiosk=ids.length?{ids,kind:null,slot:false}:null;
}
function sessieWissen(){kiosk=null;sessieKies=null;Opslag.bewaarSessieLijst(null);schermUit()}

// Voornaam; bij dezelfde voornaam komt de eerste letter van de rest erachter
function kioskNaam(c){
  const delen=c.name.trim().split(/\s+/), dubbel=kiosk.ids.some(id=>{
    const x=S.clients.find(k=>k.id===id);return x&&x.id!==c.id&&x.name.trim().split(/\s+/)[0]===delen[0]});
  return dubbel&&delen[1]?`${delen[0]} ${delen[1][0]}.`:delen[0];
}
function kioskStand(c){
  const s=effective(c), items=s?s.items.filter(it=>card(it.card)):[], d=done[c.id+':'+today()]||{};
  return {n:items.filter(it=>d[it.card]).length,tot:items.length};
}

/* ---------- Inrichten ---------- */
function sessieKiesHtml(){
  const lijst=S.clients.filter(c=>past([c.name],zoek.sessie)).sort((a,b)=>a.name.localeCompare(b.name,'nl'));
  const n=sessieKies.ids.length;
  return `<div class="scrim" data-act="sk-sluit"><div class="sheet" role="dialog" aria-label="Sessie inrichten">
    <div><h2>Wie is er vandaag?</h2><p class="lede" style="font-size:.92rem">Kies de kinderen die er zijn. Zij zien daarna alleen hun eigen oefeningen en van elkaar alleen de voornaam.</p></div>
    ${S.clients.length?zoekVeld('sessie','Zoek een kind'):''}
    <div class="link-list sessie-lijst">${lijst.map(c=>{const kan=kioskKan(c), aan=sessieKies.ids.includes(c.id);
      return `<button type="button" class="link-row" data-act="sk-kind" data-id="${esc(c.id)}" aria-pressed="${aan}" ${kan?'':'disabled'}>
        <span class="link-check" aria-hidden="true">${aan?'✓':'+'}</span>
        <span class="link-name">${esc(c.name)}<small>${kan?esc(effective(c).name):'Nog geen schema'}</small></span></button>`}).join('')
      ||`<p class="empty">${S.clients.length?'Geen kinderen gevonden.':'Er zijn nog geen cliënten.'}</p>`}</div>
    <div class="row" style="justify-content:space-between;align-items:center">
      <button type="button" class="btn ghost" style="flex:0 0 auto" data-act="sk-sluit">Sluiten</button>
      <button type="button" class="btn" style="flex:0 0 auto" id="sk-start" data-act="sk-start" ${n?'':'disabled'}>${startTekst(n)}</button></div>
  </div></div>`;
}
const startTekst=n=>n?`Start sessie met ${n} ${n===1?'kind':'kinderen'}`:'Kies eerst wie er zijn';

async function sessieStart(){
  const ids=sessieKies.ids.filter(id=>S.clients.some(c=>c.id===id));if(!ids.length)return;
  Opslag.bewaarSessieLijst(ids);sessieKies=null;
  // de nieuwste gegevens ophalen (bijv. schema's die op de laptop zijn aangepast), behalve als hier nog iets opgeslagen moet worden
  if((modus==='server'||modus==='dev')&&!Opslag.opslaanBezig){
    try{
      const g=await Opslag.laad();
      if(!g){modus='login';gebruiker=null;render();return}
      if(g.fout){modus='fout';render();return}
      gebruikGegevens(g.gegevens,g.afgevinkt);kioskOpen();return;
    }catch(e){/* geen verbinding: verder met wat er al is */}
  }
  herstelSessie();kioskOpen();
}
function kioskOpen(){kioskLaatst=Date.now();scrollTo(0,0);render()}

/* ---------- Het scherm voor de kinderen ---------- */
function kioskHtml(){
  if(kiosk.kind)return client();
  const kinderen=kiosk.ids.map(id=>S.clients.find(c=>c.id===id)).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name,'nl'));
  return `<div class="kiosk">
    <h1>Wie gaat er oefenen?</h1><p class="lede">Tik op je naam.</p>
    <div class="kiosk-namen">${kinderen.map(c=>{const {n,tot}=kioskStand(c), klaar=tot&&n===tot;
      return `<button type="button" class="kiosk-kind ${klaar?'klaar':''}" data-act="kiosk-kind" data-id="${esc(c.id)}">
        <span class="kiosk-naam">${esc(kioskNaam(c))}</span>
        <span class="kiosk-stand num">${klaar?'✓ Alles gedaan':`${n} van ${tot} gedaan`}</span></button>`}).join('')}</div>
    <div class="kiosk-voet"><button type="button" class="btn ghost small" data-act="kiosk-slot">🔒 Sessie beheren</button></div>
  </div>`;
}
const kioskTerugHtml=()=>`<div class="kiosk-terug"><button type="button" class="btn ghost" data-act="kiosk-terug">‹ Klaar, terug naar de namen</button></div>`;
function kioskOverlay(){
  if(!kiosk.slot)return '';
  const demo=modus==='demo', f=kiosk.slot.fout;
  return `<div class="scrim"><form class="sheet" id="kiosk-form" role="dialog" aria-label="Sessie beheren" autocomplete="off">
    <h2>Sessie beheren</h2>
    <p class="lede" style="margin:0">${demo?'In de demo is hier geen wachtwoord nodig.':'Vul het wachtwoord van de therapeut in om de sessie te stoppen of aan te passen.'}</p>
    <p class="imp-fout" role="alert" ${f?'':'hidden'}>${esc(f||'')}</p>
    ${demo?'':`<label class="field"><span>Wachtwoord</span><input id="kiosk-ww" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" required></label>`}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" style="flex:0 0 auto" data-act="kiosk-slot-weg">Annuleren</button>
      <button class="btn" style="flex:0 0 auto" ${kiosk.slot.bezig?'disabled':''}>${kiosk.slot.bezig?'Bezig…':'Doorgaan'}</button></div>
  </form></div>`;
}
const SLOT_FOUT={onjuist:'Dat wachtwoord klopt niet.','te-vaak':'Te veel pogingen. Probeer het over een kwartier opnieuw.','geen-verbinding':'Geen verbinding met de server. Controleer het internet.'};
function kioskVerlaat(){
  const ids=kiosk.ids;sessieWissen();sessieKies={ids};view='ther';zoek.sessie='';render();
}

// Wat een kind invult, gaat per kind apart naar de server. In de demo blijft het in deze browser.
function sessieBewaar(){
  if(modus==='demo'){Opslag.bewaarGegevens(S);Opslag.bewaarAfgevinkt(done);return}
  const c=kiosk.kind, d=today();if(!c)return;
  Opslag.bewaarSessie({client_id:c,datum:d,afgevinkt:done[c+':'+d]||{},beoordelingen:S.ratings.filter(r=>r.c===c&&r.d===d).map(({e,hard,fun})=>({e,hard,fun}))});
}

/* ---------- Scherm aan houden (kan niet op elk apparaat; dan gaat het gewoon door zonder) ---------- */
async function schermAan(){
  if(schermSlot||!navigator.wakeLock||document.visibilityState!=='visible')return;
  schermSlot='bezig';
  try{const l=await navigator.wakeLock.request('screen');
    if(!kioskActief()){l.release();schermSlot=null;return}
    schermSlot=l;l.addEventListener('release',()=>{if(schermSlot===l)schermSlot=null})}
  catch(e){schermSlot=null}
}
function schermUit(){if(schermSlot&&schermSlot!=='bezig')schermSlot.release().catch(()=>{});schermSlot=null}
document.addEventListener('visibilitychange',()=>{if(kioskActief())schermAan()});

/* ---------- Na stilstand terug naar de namen, zodat het volgende kind niet de oefeningen van het vorige ziet ---------- */
['pointerdown','keydown'].forEach(t=>document.addEventListener(t,()=>{kioskLaatst=Date.now()},{passive:true}));
setInterval(()=>{
  if(!kioskActief())return;
  const stil=Date.now()-kioskLaatst;
  if(kiosk.slot&&stil>KIOSK_SLOT_STIL_MS){kiosk.slot=false;render()}
  // de stopwatch loopt: dan is er iemand bezig met een oefening
  else if(kiosk.kind&&stil>KIOSK_STIL_MS&&!sw.run){kiosk.kind=null;swStop();render();scrollTo(0,0)}
},5000);
function swStop(){clearInterval(sw.h);Object.assign(sw,{start:0,acc:0,run:false})}

document.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-act]');if(!b)return;
  const a=b.dataset.act;
  if(a==='sessie-open'){sessieKies={ids:[]};zoek.sessie='';render();return}
  if(a==='sk-sluit'){if(b.classList.contains('scrim')&&ev.target!==b)return;sessieKies=null;render();return}
  if(a==='sk-kind'){
    // alleen deze regel bijwerken, zodat de lijst niet terugspringt naar boven
    const id=b.dataset.id, aan=!sessieKies.ids.includes(id);
    sessieKies.ids=aan?[...sessieKies.ids,id]:sessieKies.ids.filter(x=>x!==id);
    b.setAttribute('aria-pressed',aan);b.querySelector('.link-check').textContent=aan?'✓':'+';
    const st=$('#sk-start');st.disabled=!sessieKies.ids.length;st.textContent=startTekst(sessieKies.ids.length);return}
  if(a==='sk-start'){sessieStart();return}
  if(!kioskActief())return;
  if(a==='kiosk-kind'){kiosk.kind=b.dataset.id;activeClient=kiosk.kind;swStop();kioskOpen();return}
  if(a==='kiosk-terug'){kiosk.kind=null;swStop();kioskOpen();return}
  if(a==='kiosk-slot'){kiosk.slot={};render();$('#kiosk-ww')?.focus();return}
  if(a==='kiosk-slot-weg'){kiosk.slot=false;render();return}
});
document.addEventListener('submit',async ev=>{
  if(ev.target.id!=='kiosk-form'||!kioskActief())return;
  ev.preventDefault();
  if(modus==='demo'){kioskVerlaat();return}
  const ww=$('#kiosk-ww').value;kiosk.slot={bezig:true};render();
  const r=await Opslag.ontgrendel(ww);
  if(!kioskActief())return;
  if(r.status===200){kioskVerlaat();return}
  if(r.status===401&&r.fout==='niet-ingelogd'){modus='login';gebruiker=null;render();return}
  kiosk.slot={fout:SLOT_FOUT[r.fout]||'Dat lukte niet. Probeer het later opnieuw.'};render();$('#kiosk-ww')?.focus();
});
