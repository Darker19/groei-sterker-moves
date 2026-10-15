// Nooit via http: anders gaat het wachtwoord leesbaar over internet (vangnet als de server niet zelf doorstuurt)
if(location.protocol==='http:'&&/(^|\.)groei-sterker\.nl$/.test(location.hostname))location.replace('https:'+location.href.slice(5));

// Alle opslag van de app zit in dit ene bestand. De rest van de app gebruikt alleen deze functies:
//   start()            -> {modus, gebruiker, gegevens, afgevinkt, melding}
//                         modus 'server' (therapeut ingelogd), 'client' (cliënt ingelogd), 'dev' (ontwikkelaar: echte oefeningen
//                         en schema's met eigen testcliënten; de server bewaart alleen de testcliënten), 'login' (inloggen nodig)
//                         of 'demo' (geen server: alleen deze browser)
//   login(email, ww)   -> {ok, fout, rol}       uitloggen()
//   laad()             -> {gegevens, afgevinkt} (therapeut, na inloggen)
//   laadMijn()         -> eigen schema van de cliënt;  bewaarVoortgang({datum, afgevinkt, beoordelingen})
//   accounts(), accountMaak(id, login), accountReset(id), accountWeg(id)   cliënt-accounts (therapeut)
//   mijnWachtwoord(oud, wachtwoord)                                         cliënt wijzigt eigen wachtwoord
//   bewaarGegevens(S), bewaarAfgevinkt(d)       opslaan (op de server met een korte vertraging, zodat snelle wijzigingen samen gaan)
//   opStatus(fn)       fn('bezig'|'opgeslagen'|'fout'|'conflict'|'uitgelogd')
// Server: de PHP-API in api/ (Hostnet). Wil je later naar bijvoorbeeld Supabase, dan vervang je alleen dit bestand.
const Opslag=(()=>{
  const KEY='rugschema4', FOLD='rugschema-folded2', API='api/';
  const lees=k=>{try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}};
  const schrijf=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
  let modus='demo', versie=0, statusFn=()=>{}, timer=null, bezig=false, opnieuw=false, wachtend=false;
  let laatste={gegevens:null,afgevinkt:{}}, voortgang=null;

  async function api(actie,data){
    const r=await fetch(API+'?a='+actie,data===undefined?{credentials:'same-origin'}:{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-RugSchema':'1'},body:JSON.stringify(data)});
    let json=null;
    if((r.headers.get('content-type')||'').includes('application/json'))json=await r.json().catch(()=>null);
    if(!json)throw new Error('geen-api');
    return {status:r.status,...json};
  }

  async function laad(){
    const r=await api('gegevens');
    if(r.status===401){modus='login';return null}
    // serverfout (bijv. database of sleutel): niets laden en ook niets opslaan, anders zou de app met lege gegevens verder gaan
    if(r.status!==200){modus='fout';return {fout:r.fout||'serverfout'}}
    versie=r.versie;laatste={gegevens:r.gegevens,afgevinkt:r.afgevinkt||{}};
    return {gegevens:r.gegevens,afgevinkt:r.afgevinkt||{}};
  }

  async function verstuur(){
    if(bezig){opnieuw=true;return}
    bezig=true;opnieuw=false;wachtend=false;statusFn('bezig');
    try{
      const r=modus==='client'?await api('voortgang',voortgang):await api('bewaar',{gegevens:laatste.gegevens,afgevinkt:laatste.afgevinkt,versie});
      if(r.status===200){if(r.versie)versie=r.versie;statusFn('opgeslagen')}
      else if(r.status===409){wachtend=false;statusFn('conflict')}
      else if(r.status===401){modus='login';statusFn('uitgelogd')}
      else{wachtend=true;statusFn('fout')}
    }catch(e){wachtend=true;statusFn('fout')}
    bezig=false;
    if(wachtend&&!opnieuw&&online()){clearTimeout(timer);timer=setTimeout(verstuur,10000)} // zelf opnieuw proberen
    if(opnieuw&&online())verstuur();
  }
  const online=()=>modus==='server'||modus==='client'||modus==='dev';
  function plan(){if(!online())return;wachtend=true;clearTimeout(timer);timer=setTimeout(verstuur,700)}
  // niet weggaan terwijl er nog iets opgeslagen moet worden
  addEventListener('beforeunload',e=>{if(online()&&(wachtend||bezig)){e.preventDefault();e.returnValue=''}});
  async function post(actie,data){try{return await api(actie,data)}catch(e){return {status:0,fout:'geen-verbinding'}}}

  return {
    get modus(){return modus},
    async start(){
      try{
        const s=await api('sessie');
        if(s.status===503)return {modus:'demo',...demoGegevens(),melding:s.fout==='niet-ingesteld'?'De server is nog niet ingesteld.':'De database is niet bereikbaar.'};
        if(!s.ingelogd){modus='login';return {modus}}
        if(s.rol==='client'){modus='client';return {modus,gebruiker:{naam:s.naam,email:s.email}}}
        modus=s.rol==='ontwikkelaar'?'dev':'server';const g=await laad();
        return g?{modus,gebruiker:{naam:s.naam,email:s.email},...g}:{modus:'login'};
      }catch(e){return {modus:'demo',...demoGegevens()}} // geen server (GitHub Pages-preview of lokaal): alleen deze browser
    },
    async login(email,wachtwoord){
      try{
        const r=await api('login',{email,wachtwoord});
        if(r.status===200){modus={client:'client',ontwikkelaar:'dev'}[r.rol]||'server';return {ok:true,rol:r.rol,gebruiker:{naam:r.naam,email:r.email}}}
        return {ok:false,fout:r.fout};
      }catch(e){return {ok:false,fout:'geen-verbinding'}}
    },
    async uitloggen(){try{await api('uitloggen',{})}catch(e){} modus='login';versie=0},
    laad,
    async laadMijn(){const r=await post('mijn');if(r.status===401||r.status===403){modus='login';return null}return r.status===200?r:{fout:r.fout||'serverfout'}},
    bewaarVoortgang:v=>{voortgang=v;plan()},
    accounts:()=>post('accounts'),
    accountMaak:(client_id,login)=>post('account-maak',{client_id,login}),
    accountReset:client_id=>post('account-reset',{client_id}),
    accountWeg:client_id=>post('account-weg',{client_id}),
    mijnWachtwoord:(oud,wachtwoord)=>post('mijn-wachtwoord',{oud,wachtwoord}),
    devAccount:()=>post('dev-account'),
    devMaak:login=>post('dev-maak',{login}),
    devReset:()=>post('dev-reset',{}),
    devWeg:()=>post('dev-weg',{}),
    opStatus:fn=>{statusFn=fn},
    laadGegevens:()=>{const s=lees(KEY);return s&&s.cards?s:null},
    // server en ontwikkelaar: naar de server (die bij de ontwikkelaar alleen de testcliënten bewaart); alleen de demo bewaart in de browser
    bewaarGegevens:s=>{if(modus==='server'||modus==='dev'){laatste.gegevens=s;plan()}else if(modus==='demo')schrijf(KEY,s)},
    laadAfgevinkt:()=>lees(KEY+'-done')||{},
    bewaarAfgevinkt:d=>{if(modus==='server'||modus==='dev'){laatste.afgevinkt=d;plan()}else if(modus==='demo')schrijf(KEY+'-done',d)},
    laadIngeklapt:()=>lees(FOLD),
    bewaarIngeklapt:f=>schrijf(FOLD,f),
    wisAlles:()=>{try{[KEY,KEY+'-done'].forEach(k=>localStorage.removeItem(k))}catch(e){}}
  };
  function demoGegevens(){modus='demo';return {gegevens:lees(KEY),afgevinkt:lees(KEY+'-done')||{}}}
})();
