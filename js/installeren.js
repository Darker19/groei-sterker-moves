// "Zet Groei Sterker Moves op je beginscherm": een kaartje op het inlogscherm en in de cliëntweergave.
// Android/Chrome: knop die de installatie start. iPhone/iPad: uitleg via Deel → Zet op beginscherm.
// Niet getoond als de app al geïnstalleerd is (geopend vanaf het beginscherm) of na "Niet nu".
let installPrompt=null;
const INSTALL_WEG='rugschema-install-weg';
const alsApp=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const installWeg=()=>{try{return localStorage.getItem(INSTALL_WEG)==='1'}catch(e){return false}};
// opnieuw tekenen om de knop te tonen, maar niet als iemand al iets in het inlogformulier heeft getypt
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;
  if(modus==='client'||(modus==='login'&&!$('#li-email')?.value&&!$('#li-ww')?.value))render()});
addEventListener('appinstalled',()=>{installPrompt=null;render()});

function installHtml(){
  if(alsApp()||installWeg()||(!installPrompt&&!isIOS()))return '';
  return `<div class="installeer" role="note"><img src="img/icon-192.png" alt="" width="48" height="48">
    <div><strong>Zet Groei Sterker Moves op je beginscherm</strong>
      ${installPrompt?'<p>Dan open je je oefeningen met één tik, net als een app.</p>'
        :'<p>Tik op <b>Deel</b> <span aria-hidden="true">(□↑)</span> en kies <b>Zet op beginscherm</b>.</p>'}
      <div class="row">${installPrompt?'<button type="button" class="btn small" data-act="installeer">Installeren</button>':''}
        <button type="button" class="btn ghost small" data-act="installeer-weg">Niet nu</button></div></div></div>`;
}
document.addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-act]');if(!b)return;
  if(b.dataset.act==='installeer'&&installPrompt){installPrompt.prompt();await installPrompt.userChoice.catch(()=>{});installPrompt=null;render()}
  if(b.dataset.act==='installeer-weg'){try{localStorage.setItem(INSTALL_WEG,'1')}catch(e){}b.closest('.installeer')?.remove()}
});
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
