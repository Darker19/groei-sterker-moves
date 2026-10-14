// Inloggen voor cliënten: de therapeut maakt per cliënt een account (gebruikersnaam + wachtwoord).
// Een ingelogde cliënt ziet alleen het eigen schema (zie client() in app.js en 'mijn' in api/index.php).
// accounts: {client_id: {login, aangemaakt, laatst_ingelogd}}, accNieuw: {client_id: {login, wachtwoord}} (alleen direct na maken/resetten)
let accounts={}, accNieuw={}, accFout={};

async function laadAccounts(){
  const r=await Opslag.accounts();
  accounts={};(r.accounts||[]).forEach(a=>accounts[a.client_id]=a);
  render();
}
// voorstel voor de gebruikersnaam: voornaam zonder accenten, met een nummer als die al bestaat
function loginVoorstel(c){
  const basis=zoekNorm(c.name.split(' ')[0]).replace(/[^a-z0-9]/g,'')||'client', bezet=new Set(Object.values(accounts).map(a=>a.login));
  if(!bezet.has(basis)&&basis.length>=3)return basis;
  for(let i=1;;i++)if(!bezet.has(basis+i))return basis+i;
}
const accDatum=d=>d?new Date(d.replace(' ','T')).toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'}):'';

function accountHtml(c){
  if(modus!=='server')return `<div class="acc"><div class="label">Inloggen voor ${esc(c.name.split(' ')[0])}</div>
    <p class="demo" style="margin:0">${modus==='dev'?'Cliënt-accounts zijn niet beschikbaar in het ontwikkelaar-account.':'Cliënt-accounts maak je als je als therapeut bent ingelogd op de server.'}</p></div>`;
  const a=accounts[c.id], nieuw=accNieuw[c.id], fout=accFout[c.id], first=esc(c.name.split(' ')[0]);
  return `<div class="acc"><div class="label">Inloggen voor ${first}</div>
    ${a?`<p class="acc-info">Gebruikersnaam <b>${esc(a.login)}</b> · ${a.laatst_ingelogd?`laatst ingelogd ${accDatum(a.laatst_ingelogd)}`:'nog niet ingelogd'}</p>
      <div class="row"><button type="button" class="btn ghost small" style="flex:0 0 auto" data-act="acc-reset" data-id="${c.id}">Nieuw wachtwoord</button>
        <button type="button" class="btn danger small" style="flex:0 0 auto" data-act="acc-weg" data-id="${c.id}">Account verwijderen</button></div>`
     :`<form class="row acc-maak" data-id="${c.id}"><label class="field" style="flex:1 1 180px;max-width:260px"><span>Gebruikersnaam</span>
        <input id="acc-login-${c.id}" value="${esc(loginVoorstel(c))}" maxlength="40" autocapitalize="none" spellcheck="false"></label>
        <button class="btn small" style="flex:0 0 auto;align-self:flex-end;margin-bottom:4px">Account maken</button></form>
      <p class="demo" style="margin:0">${first} logt dan zelf in en ziet alleen het eigen schema. Gebruik voorlopig alleen nepnamen.</p>`}
    ${fout?`<p class="imp-fout" role="alert">${esc(fout)}</p>`:''}
    ${nieuw?`<div class="acc-ww" role="status"><p style="margin:0">Geef dit door aan ${first} of een ouder:</p>
      <dl><dt>Website</dt><dd>${esc(location.host+location.pathname.replace(/index\.html$/,''))}</dd><dt>Gebruikersnaam</dt><dd class="num">${esc(nieuw.login)}</dd><dt>Wachtwoord</dt><dd class="num">${esc(nieuw.wachtwoord)}</dd></dl>
      <div class="row"><button type="button" class="btn small" style="flex:0 0 auto" data-act="acc-kopieer" data-id="${c.id}">Kopiëren</button>
        <button type="button" class="btn ghost small" style="flex:0 0 auto" data-act="acc-klaar" data-id="${c.id}">Klaar</button></div>
      <small>Je ziet dit wachtwoord maar één keer. Kwijt? Maak een nieuw wachtwoord.</small></div>`:''}
  </div>`;
}

const ACC_FOUT={'ongeldige-login':'Gebruik 3 tot 40 letters of cijfers (punt, streepje en liggend streepje mogen ook).',
  'bestaat-al':'Deze gebruikersnaam is al in gebruik. Kies een andere.',
  'onbekende-client':'De cliënt is nog niet opgeslagen. Probeer het over een paar seconden opnieuw.',
  'geen-verbinding':'Geen verbinding met de server.'};
function accResultaat(id,r){
  if(r.status===200){accNieuw[id]={login:r.login,wachtwoord:r.wachtwoord};delete accFout[id];laadAccounts();return}
  accFout[id]=ACC_FOUT[r.fout]||'Dat lukte niet. Probeer het later opnieuw.';render();
}
document.addEventListener('submit',async ev=>{
  const f=ev.target;if(!f.classList?.contains('acc-maak'))return;ev.preventDefault();
  const id=f.dataset.id, knop=f.querySelector('button');knop.disabled=true;knop.textContent='Bezig…';
  accResultaat(id,await Opslag.accountMaak(id,$('#acc-login-'+id).value.trim().toLowerCase()));
});
document.addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-act]');if(!b||!b.dataset.act.startsWith('acc-'))return;const a=b.dataset.act, id=b.dataset.id;
  if(a==='acc-reset'){
    if(!b.dataset.confirm){b.dataset.confirm=1;b.textContent='Oude wachtwoord vervalt. Zeker?';return}
    b.disabled=true;accResultaat(id,await Opslag.accountReset(id))}
  if(a==='acc-weg'){
    if(!b.dataset.confirm){b.dataset.confirm=1;b.textContent='Zeker weten?';return}
    b.disabled=true;const r=await Opslag.accountWeg(id);
    if(r.status===200){delete accNieuw[id];delete accFout[id];toast('Account verwijderd');laadAccounts()}else accResultaat(id,r)}
  if(a==='acc-kopieer'){const n=accNieuw[id];
    const t=`Website: ${location.origin+location.pathname.replace(/index\.html$/,'')}\nGebruikersnaam: ${n.login}\nWachtwoord: ${n.wachtwoord}`;
    try{await navigator.clipboard.writeText(t);toast('Gekopieerd')}catch(e){toast('Kopiëren lukt niet, schrijf het over')}}
  if(a==='acc-klaar'){delete accNieuw[id];render()}
});

/* ---------- Mijn account (ingelogde cliënt) ---------- */
// Ingeklapt tenzij folded['mijn-acc'] aan staat
function mijnAccountHtml(){
  const open=!!folded['mijn-acc'];
  return `<section class="panel">
    <button class="fold" data-act="fold" data-k="mijn-acc" aria-expanded="${open}">${CHEV}<h2>Mijn account</h2></button>
    ${open?`<form id="mijn-acc-form" class="mijn-acc" autocomplete="on">
      <p class="lede" style="font-size:.92rem;margin:0">Je gebruikersnaam is <b>${esc(gebruiker?.email||'')}</b>. Vul alleen in wat je wilt veranderen.</p>
      <label class="field"><span>Nieuwe gebruikersnaam (mag leeg blijven)</span><input id="ma-login" maxlength="40" autocapitalize="none" spellcheck="false" autocomplete="username"></label>
      <label class="field"><span>Nieuw wachtwoord (minstens 8 tekens)</span><input id="ma-ww" type="password" autocomplete="new-password"></label>
      <label class="field"><span>Nieuw wachtwoord nog een keer</span><input id="ma-ww2" type="password" autocomplete="new-password"></label>
      <label class="field"><span>Je huidige wachtwoord</span><input id="ma-oud" type="password" autocomplete="current-password" required></label>
      <p class="imp-fout" id="ma-fout" role="alert" hidden></p>
      <button class="btn" style="align-self:flex-start">Opslaan</button></form>`:''}
  </section>`;
}
const MA_FOUT={onjuist:'Je huidige wachtwoord klopt niet.','te-vaak':'Te veel pogingen. Probeer het over een kwartier opnieuw.',
  'te-kort':'Kies een wachtwoord van minstens 8 tekens.','ongeldige-login':ACC_FOUT['ongeldige-login'],
  'bestaat-al':'Deze gebruikersnaam is al in gebruik. Kies een andere.','geen-verbinding':'Geen verbinding met de server.'};
document.addEventListener('submit',async ev=>{
  if(ev.target.id!=='mijn-acc-form')return;ev.preventDefault();
  const f=$('#ma-fout'), fout=t=>{f.textContent=t;f.hidden=false};
  const login=$('#ma-login').value.trim().toLowerCase(), ww=$('#ma-ww').value;
  if(!login&&!ww)return fout('Vul een nieuwe gebruikersnaam of een nieuw wachtwoord in.');
  if(ww&&ww.length<8)return fout(MA_FOUT['te-kort']);
  if(ww!==$('#ma-ww2').value)return fout('De twee nieuwe wachtwoorden zijn niet gelijk.');
  const knop=ev.target.querySelector('button');knop.disabled=true;knop.textContent='Bezig…';
  const r=await Opslag.mijnAccount($('#ma-oud').value,login,ww);
  if(r.status!==200){knop.disabled=false;knop.textContent='Opslaan';fout(MA_FOUT[r.fout]||'Dat lukte niet. Probeer het later opnieuw.');return}
  gebruiker.email=r.login;folded['mijn-acc']=false;saveFold();render();
  toast(ww&&login?'Je gebruikersnaam en wachtwoord zijn veranderd':ww?'Je wachtwoord is veranderd':'Je gebruikersnaam is veranderd');
});

/* ---------- Ontwikkelaar-account (therapeut) ---------- */
// devBeheer: null (dicht) of {account, nieuw: {login, wachtwoord}, fout, laden}
let devBeheer=null;
async function devLaad(){const r=await Opslag.devAccount();if(!devBeheer)return;
  devBeheer.laden=false;devBeheer.account=r.account||null;if(r.status!==200)devBeheer.fout=ACC_FOUT[r.fout]||'Laden lukt niet.';render()}
function devHtml(){
  const d=devBeheer, a=d.account, n=d.nieuw;
  return `<div class="scrim" data-act="dev-close"><div class="sheet" role="dialog" aria-label="Ontwikkelaar-account" tabindex="-1">
    <div><div class="label">Praktijk</div><h2>Ontwikkelaar-account</h2>
      <p class="lede" style="font-size:.92rem">Voor wie aan de app werkt. Dit account ziet alle oefeningen en schema's, maar geen echte cliënten:
        alleen drie testcliënten (Testpiet, Testduif en Testpiloot) met verzonnen gegevens. Wijzigingen van de ontwikkelaar worden niet opgeslagen.</p></div>
    ${d.laden?'<p class="empty">Laden…</p>':a?`<p class="acc-info">Gebruikersnaam <b>${esc(a.login)}</b> · ${a.laatst_ingelogd?`laatst ingelogd ${accDatum(a.laatst_ingelogd)}`:'nog niet ingelogd'}</p>
      <div class="row"><button type="button" class="btn ghost small" style="flex:0 0 auto" data-act="dev-reset">Nieuw wachtwoord</button>
        <button type="button" class="btn danger small" style="flex:0 0 auto" data-act="dev-weg">Account verwijderen</button></div>`
     :`<form class="row" id="dev-form"><label class="field" style="flex:1 1 220px"><span>E-mailadres of gebruikersnaam</span>
        <input id="dev-login" maxlength="190" autocapitalize="none" spellcheck="false" required></label>
        <button class="btn small" style="flex:0 0 auto;align-self:flex-end;margin-bottom:4px">Account maken</button></form>`}
    ${d.fout?`<p class="imp-fout" role="alert">${esc(d.fout)}</p>`:''}
    ${n?`<div class="acc-ww" role="status"><dl><dt>Gebruikersnaam</dt><dd class="num">${esc(n.login)}</dd><dt>Wachtwoord</dt><dd class="num">${esc(n.wachtwoord)}</dd></dl>
      <div class="row"><button type="button" class="btn small" style="flex:0 0 auto" data-act="dev-kopieer">Kopiëren</button></div>
      <small>Je ziet dit wachtwoord maar één keer.</small></div>`:''}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" style="flex:0 0 auto" data-act="dev-close">Klaar</button></div>
  </div></div>`;
}
function devResultaat(r){
  if(r.status===200){devBeheer.nieuw={login:r.login,wachtwoord:r.wachtwoord};devBeheer.fout='';devLaad();return}
  devBeheer.fout=ACC_FOUT[r.fout]||'Dat lukte niet. Probeer het later opnieuw.';render();
}
document.addEventListener('submit',async ev=>{
  if(ev.target.id!=='dev-form')return;ev.preventDefault();
  const knop=ev.target.querySelector('button');knop.disabled=true;knop.textContent='Bezig…';
  devResultaat(await Opslag.devMaak($('#dev-login').value.trim().toLowerCase()));
});
document.addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-act]');if(!b||!b.dataset.act.startsWith('dev-'))return;const a=b.dataset.act;
  if(a==='dev-open'){devBeheer={laden:true};render();$('#overlay .sheet')?.focus();devLaad()}
  if(a==='dev-close'){if(b.classList.contains('scrim')&&ev.target!==b)return;devBeheer=null;render()}
  if(a==='dev-reset'){if(!b.dataset.confirm){b.dataset.confirm=1;b.textContent='Oude wachtwoord vervalt. Zeker?';return}
    b.disabled=true;devResultaat(await Opslag.devReset())}
  if(a==='dev-weg'){if(!b.dataset.confirm){b.dataset.confirm=1;b.textContent='Zeker weten?';return}
    b.disabled=true;const r=await Opslag.devWeg();if(r.status===200){devBeheer.nieuw=null;toast('Ontwikkelaar-account verwijderd');devLaad()}else devResultaat(r)}
  if(a==='dev-kopieer'){const n=devBeheer.nieuw;
    try{await navigator.clipboard.writeText(`Website: ${location.origin+location.pathname.replace(/index\.html$/,'')}\nGebruikersnaam: ${n.login}\nWachtwoord: ${n.wachtwoord}`);toast('Gekopieerd')}catch(e){toast('Kopiëren lukt niet, schrijf het over')}}
});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&devBeheer){devBeheer=null;render()}});

/* ---------- Testcliënten (therapeut) ---------- */
// Zet Testpiet, Testduif en Testpiloot met verzonnen voortgang in de praktijk, om de app (en cliënt-accounts) te testen.
// Zelfde opzet als de testcliënten van het ontwikkelaar-account (dev_gegevens in api/lib.php).
const TEST_NAMEN=['Testpiet','Testduif','Testpiloot'];
const heeftTestClienten=()=>TEST_NAMEN.every(n=>S.clients.some(c=>c.name===n));
function voegTestClientenToe(){
  const sch=S.schemas, ind=S.indLijst, undo=snapshot();
  const kies=(i,j)=>{if(!ind.length)return ['',''];const t=ind[i%ind.length];return [t.name,t.subs.length?t.subs[j%t.subs.length]:'']};
  let rnd=7;const r=(a,b)=>{rnd=(rnd*48271)%2147483647;return a+rnd%(b-a+1)};   // vast patroon
  [['Testpiet',6,0,0],['Testduif',16,0,1],['Testpiloot',22,1,0]].forEach(([naam,age,i,j],n)=>{
    if(S.clients.some(c=>c.name===naam))return;
    const [indicatie,subcategorie]=kies(i,j), base=sch.length?sch[n%sch.length]:null;
    const c={id:uid(),name:naam,age,indicatie,subcategorie,schema:base?.id||''};
    if(n===2&&base){   // Testpiloot: persoonlijk schema, één oefening lichter en één dag minder per week
      c.custom={...structuredClone(base),id:'p-'+c.id,client:c.id,base:base.id,days:Math.max(1,(base.days||3)-1)};
      delete c.custom.indicatie;delete c.custom.subcategorie;
      if(c.custom.items[0])c.custom.items[0].reps=Math.max(1,c.custom.items[0].reps-2)}
    S.clients.push(c);
    const s=c.custom||base;if(!s)return;
    for(let d=9;d>=1;d-=2){const datum=new Date(Date.now()-d*864e5).toISOString().slice(0,10);
      s.items.forEach((it,k)=>{if(r(1,10)>8)return;
        (done[c.id+':'+datum]??={})[it.card]=true;
        S.ratings.push({c:c.id,e:it.card,d:datum,hard:Math.min(5,Math.max(1,2+k%3+r(-1,1))),fun:Math.min(5,Math.max(1,4-k%2+r(-1,1)))})})}
  });
  save();render();toast('Testpiet, Testduif en Testpiloot toegevoegd',undo);
}
document.addEventListener('click',ev=>{if(ev.target.closest('[data-act="test-clienten"]'))voegTestClientenToe()});
