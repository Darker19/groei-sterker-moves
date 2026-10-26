// Importeren uit Excel (.xlsx, .xls, .ods of .csv). Twee soorten:
//  - Oefeningen ('oef'): één rij per oefening. Kolommen: Oefening, Categorie, Sets, Herhalingen, Vasthouden (s), Rust (s), Instructie, Schema, ID.
//    Oefening en Categorie zijn verplicht (bij een bestaande kaart mag Categorie leeg: die blijft dan hetzelfde).
//    ID is de interne id van de kaart (alleen zichtbaar in Excel). Staat die erin, dan is hij leidend: zo kan de naam worden gewijzigd.
//    Met Schema komt de kaart meteen in dat schema; "(geen)" of leeg = geen schema; een onbekend schema wordt aangemaakt.
//  - Schema's ('sch'): één rij per oefening in een schema. Kolommen: Schema, Per week, Weken, Oefening, Sets, Herhalingen, Vasthouden (s), Rust (s), Schema-ID, Oefening-ID.
//    De oefening moet al in de kaartenbak staan. Lege dosering = de standaard van de kaart. Leeg schema = zelfde als de rij erboven.
//    Schema-ID en Oefening-ID zijn leidend boven de naam (een andere schemanaam bij een bekend Schema-ID = hernoemen).
// Het voorbeeldbestand is een export van alle huidige oefeningen en schema's, met hun ID's.
// Het Excel-programma (SheetJS, js/vendor) wordt pas geladen als het importvenster opengaat.

let imp=null; // {soort:'oef'|'sch', fase:'kies'|'laden'|'check', bestand, rijen, fout}

const IMP_KOLOMMEN={
  oef:{
    name:['oefening','naam','training','oefeningnaam','naamoefening'],
    cat:['categorie','soort','type'],
    sets:['sets','set'], reps:['herhalingen','herh','reps','herhaling'],
    hold:['vasthouden','vasthoudtijd','hold','vast'], rest:['rust','rusttijd','pauze'],
    note:['instructie','uitleg','opmerking','notitie','instructies'],
    schema:['schema','schemas','fase'], id:['id','oefeningid','kaartid']
  },
  sch:{
    schema:['schema','schemanaam','fase'],
    days:['perweek','keerperweek','xperweek','frequentie','dagen'], weeks:['weken','aantalweken','duur'],
    oef:['oefening','oefeningen','kaart','naam'],
    sets:['sets','set'], reps:['herhalingen','herh','reps','herhaling'],
    hold:['vasthouden','vasthoudtijd','hold','vast'], rest:['rust','rusttijd','pauze'],
    schemaId:['schemaid'], oefId:['oefeningid','kaartid']
  }
};
const IMP_MAX=500, IMP_GEEN='(geen)';
const IMP_TEKST={
  oef:{titel:'Oefeningen importeren',bestand:'GroeiSterkerMoves-oefeningen-voorbeeld.xlsx',
    uitleg:'Eén rij per oefening, met de kolommen <b>Oefening</b>, <b>Categorie</b>, Sets, Herhalingen, Vasthouden (s), Rust (s), Instructie, Schema en ID. Oefening en Categorie zijn verplicht. Het voorbeeldbestand bevat alle huidige oefeningen; met de ID kun je ook een naam wijzigen.'},
  sch:{titel:"Schema's importeren",bestand:'GroeiSterkerMoves-schemas-voorbeeld.xlsx',
    uitleg:'Eén rij per oefening in een schema, met de kolommen <b>Schema</b>, Per week, Weken, <b>Oefening</b>, Sets, Herhalingen, Vasthouden (s), Rust (s), Schema-ID en Oefening-ID. De oefeningen moeten al in de kaartenbak staan. Het voorbeeldbestand bevat alle huidige schema\'s.'}
};

function laadXlsx(){
  if(window.XLSX)return Promise.resolve(window.XLSX);
  return laadXlsx.p||(laadXlsx.p=new Promise((ok,nee)=>{
    const s=document.createElement('script');s.src='js/vendor/xlsx.full.min.js';
    s.onload=()=>ok(window.XLSX);s.onerror=()=>{laadXlsx.p=null;nee(new Error('Excel-lezer kon niet laden'))};
    document.head.append(s);
  }));
}

const impNorm=v=>String(v??'').toLowerCase().replace(/\(.*?\)/g,'').replace(/[^a-zà-ÿ0-9]/g,'');
// Bestaande categorie (ook bij een begin van de naam, minstens 3 tekens), anders een nieuwe met die naam
const impCat=v=>{const n=impNorm(v);if(!n)return null;
  const al=cats().find(c=>impNorm(c)===n)||cats().find(c=>n.length>=3&&impNorm(c).startsWith(n));
  if(al)return {name:al,nieuw:false};
  const t=String(v).trim().replace(/\s+/g,' ');return {name:t.charAt(0).toUpperCase()+t.slice(1),nieuw:true}};
const impCatBestaat=naam=>cats().find(c=>c.toLowerCase()===naam.toLowerCase());
const impGetal=v=>{if(v===''||v==null)return null;const n=Math.round(+String(v).replace(',','.'));return Number.isFinite(n)&&n>=0?n:false};
const impKaart=naam=>S.cards.find(c=>impNorm(c.name)===impNorm(naam));
const impSchema=naam=>S.schemas.find(s=>impNorm(s.name)===impNorm(naam));
const impKaartId=id=>id?S.cards.find(c=>String(c.id)===id):null;
const impSchemaId=id=>id?S.schemas.find(s=>String(s.id)===id):null;
const impGeen=v=>['geen','','-'].includes(impNorm(v))||String(v).trim()==='—';
const VELD={sets:'Sets',reps:'Herhalingen',hold:'Vasthouden',rest:'Rust',days:'Per week',weeks:'Weken'};
const impDose=(r,b,c)=>{const v=f=>r[f]??b?.[f]??c?.[f]??{sets:3,reps:10,hold:0,rest:30}[f];
  return `${v('sets')}×${v('reps')}${v('hold')?` · ${v('hold')}s`:''}${v('rest')?` · rust ${v('rest')}s`:''}`};

// Zoekt de kopregel en geeft per kolomsoort het kolomnummer
function impKoppen(tabel,soort,verplicht){
  const K=IMP_KOLOMMEN[soort];
  const kop=tabel.findIndex(r=>verplicht.every(k=>r.some(c=>K[k].includes(impNorm(c)))));
  if(kop<0)return null;
  const kol={};tabel[kop].forEach((c,i)=>{const n=impNorm(c);for(const [k,namen] of Object.entries(K))if(kol[k]==null&&namen.includes(n))kol[k]=i});
  const data=tabel.slice(kop+1).map((r,i)=>({r,nr:kop+i+2})).filter(({r})=>r.some(c=>String(c).trim()!==''));
  return {kol,data};
}
function impGetallen(rij,cel,velden){
  for(const f of velden){const g=impGetal(cel(f));if(g===false)rij.let.push(`${VELD[f]} "${cel(f)}" is geen getal`);rij[f]=g===false?null:g}
}

/* ---------- Oefeningen ---------- */
function impVerwerkOef(tabel){
  const k=impKoppen(tabel,'oef',['name']);
  if(!k)return {fout:'Geen kolom "Oefening" gevonden. Gebruik het voorbeeldbestand als begin.'};
  if(!k.data.length)return {fout:'Het bestand bevat geen oefeningen onder de kopregel.'};
  if(k.data.length>IMP_MAX)return {fout:`Het bestand heeft ${k.data.length} rijen; het maximum is ${IMP_MAX}.`};
  const gezien={};
  const rijen=k.data.map(({r,nr})=>{
    const cel=x=>k.kol[x]==null?'':String(r[k.kol[x]]??'').trim();
    const rij={nr,name:cel('name'),id:cel('id'),let:[],schemas:cel('schema').split(';').map(s=>s.trim()).filter(s=>s&&!impGeen(s))};
    if(!rij.name){rij.status='fout';rij.let.push('Naam ontbreekt');return rij}
    const cat=impCat(cel('cat'));
    rij.cat=cat?.name||null;rij.nieuweCat=!!cat?.nieuw;
    impGetallen(rij,cel,['sets','reps','hold','rest']);
    rij.note=cel('note')||null;
    // de ID is leidend; een onbekende ID (bijv. een verwijderde kaart) valt terug op de naam
    const viaId=impKaartId(rij.id);
    if(rij.id&&!viaId)rij.let.push('ID onbekend: op naam gezocht');
    rij.bestaat=viaId||impKaart(rij.name);
    if(viaId&&viaId.name!==rij.name){
      const ander=impKaart(rij.name);
      if(ander&&ander!==viaId){rij.status='fout';rij.let.push(`Naam is al in gebruik bij een andere oefening (ID ${ander.id})`);return rij}
      rij.oud=viaId.name;
    }
    const n=rij.bestaat?'id:'+rij.bestaat.id:impNorm(rij.name);
    if(gezien[n]){rij.status='extra';rij.van=gezien[n];return rij}
    if(!rij.bestaat&&!rij.cat){rij.status='fout';rij.let.push('Categorie ontbreekt (verplicht bij een nieuwe oefening)');return rij}
    gezien[n]=rij;
    // een bestaande kaart zonder verschil (bijv. een ongewijzigde rij uit het voorbeeldbestand) is 'gelijk'
    const c=rij.bestaat, anders=c&&(rij.oud!=null||rij.cat&&rij.cat!==c.cat||['sets','reps','hold','rest'].some(f=>rij[f]!=null&&rij[f]!==c[f])
      ||rij.note&&rij.note!==c.note||rij.schemas.some(x=>!impSchema(x)?.items.some(i=>i.card===c.id)));
    rij.status=!c?'nieuw':anders?'bijwerken':'gelijk';
    return rij;
  });
  return {rijen};
}
function impTellingOef(rijen){
  const t={nieuw:0,bijwerken:0,gelijk:0,fout:0,koppel:0,schemas:new Set(),cats:new Set()};
  rijen.forEach(r=>{if(r.status in t)t[r.status]++;
    if((r.status==='nieuw'||r.status==='bijwerken')&&r.nieuweCat)t.cats.add(r.cat.toLowerCase());
    if(r.status!=='fout'&&r.status!=='gelijk')r.schemas.forEach(n=>{const s=impSchema(n),c=(r.van||r).bestaat;
      if(!s||!c||!s.items.some(i=>i.card===c.id))t.koppel++;if(!s)t.schemas.add(n.toLowerCase())})});
  t.ok=t.nieuw+t.bijwerken+rijen.filter(r=>r.status==='extra').length;
  return t;
}
function impToepassenOef(){
  const nieuw={}, t=impTellingOef(imp.rijen);
  let toegevoegd=0;
  // eerst de nieuwe categorieën aanmaken (één keer per naam, hoofdletters maken niet uit)
  for(const r of imp.rijen){
    if(r.status==='fout'||r.status==='extra'||!r.cat)continue;
    const al=impCatBestaat(r.cat);
    if(al)r.cat=al;else S.cats.push({name:r.cat,color:vrijeKleur()});
  }
  for(const r of imp.rijen){
    if(r.status==='fout')continue;
    const bron=r.status==='extra'?r.van:r;
    let c=bron.kaart;
    if(!c){
      c=bron.bestaat;
      if(c){ // alleen ingevulde velden overschrijven
        if(bron.oud!=null)c.name=bron.name;
        if(bron.cat)c.cat=bron.cat;
        for(const f of ['sets','reps','hold','rest'])if(bron[f]!=null)c[f]=bron[f];
        if(bron.note)c.note=bron.note;
      }else{
        c={id:uid(),name:bron.name,cat:bron.cat,sets:bron.sets??3,reps:bron.reps??10,hold:bron.hold??0,rest:bron.rest??30,note:bron.note||''};
        S.cards.push(c);
      }
      bron.kaart=c;
    }
    for(const n of r.schemas){
      let s=impSchema(n)||nieuw[impNorm(n)];
      if(!s){s={id:uid(),name:n,days:3,weeks:4,items:[]};S.schemas.push(s);nieuw[impNorm(n)]=s}
      if(!s.items.some(i=>i.card===c.id)){s.items.push({card:c.id,sets:c.sets,reps:c.reps,hold:c.hold,rest:c.rest});toegevoegd++}
    }
  }
  imp.rijen.forEach(r=>delete r.kaart);
  return [t.nieuw&&`${t.nieuw} nieuw`,t.cats.size&&`${t.cats.size} nieuwe categorie${t.cats.size===1?'':'ën'}`,t.bijwerken&&`${t.bijwerken} bijgewerkt`,toegevoegd&&`${toegevoegd}× in schema`];
}

/* ---------- Schema's ---------- */
function impVerwerkSch(tabel){
  const k=impKoppen(tabel,'sch',['schema','oef']);
  if(!k)return {fout:'Geen kolommen "Schema" en "Oefening" gevonden. Gebruik het voorbeeldbestand voor schema\'s als begin.'};
  if(!k.data.length)return {fout:'Het bestand bevat geen regels onder de kopregel.'};
  if(k.data.length>IMP_MAX)return {fout:`Het bestand heeft ${k.data.length} rijen; het maximum is ${IMP_MAX}.`};
  let vorig={schema:'',id:''};const gezien={};
  const rijen=k.data.map(({r,nr})=>{
    const cel=x=>k.kol[x]==null?'':String(r[k.kol[x]]??'').trim();
    const rij={nr,schema:cel('schema'),schemaId:cel('schemaId'),oef:cel('oef'),oefId:cel('oefId'),let:[]};
    if(!rij.schema&&!rij.schemaId){rij.schema=vorig.schema;rij.schemaId=vorig.id}
    impGetallen(rij,cel,['days','weeks','sets','reps','hold','rest']);
    // Schema-ID is leidend; een onbekende ID valt terug op de naam
    const viaId=impSchemaId(rij.schemaId);
    if(rij.schemaId&&!viaId)rij.let.push('Schema-ID onbekend: op naam gezocht');
    if(!rij.schema&&viaId)rij.schema=viaId.name;
    if(!rij.schema){rij.status='fout';rij.let.push('Schemanaam ontbreekt');return rij}
    vorig={schema:rij.schema,id:rij.schemaId};
    rij.bestaatSch=viaId||impSchema(rij.schema);
    if(viaId&&viaId.name!==rij.schema){
      const ander=impSchema(rij.schema);
      if(ander&&ander!==viaId){rij.status='fout';rij.let.push(`Naam is al in gebruik bij een ander schema (ID ${ander.id})`);return rij}
      rij.oudSch=viaId.name;
    }
    if(!rij.oef&&!rij.oefId){
      if(rij.days!=null||rij.weeks!=null||rij.oudSch){rij.status='instelling';return rij}
      rij.status='fout';rij.let.push('Oefening ontbreekt');return rij}
    const kaartId=impKaartId(rij.oefId);
    if(rij.oefId&&!kaartId)rij.let.push('Oefening-ID onbekend: op naam gezocht');
    rij.kaart=kaartId||impKaart(rij.oef);
    if(!rij.kaart){rij.status='fout';rij.let.push('Staat niet in de kaartenbak: importeer of maak eerst de oefening');return rij}
    rij.oef=rij.kaart.name;
    const sl=(rij.bestaatSch?'id:'+rij.bestaatSch.id:impNorm(rij.schema))+'|'+rij.kaart.id;
    if(gezien[sl]){rij.status='fout';rij.let.push(`Staat al in rij ${gezien[sl]}`);return rij}
    gezien[sl]=nr;
    const it=rij.bestaatSch?.items.find(i=>i.card===rij.kaart.id);
    const dose=['sets','reps','hold','rest'].some(f=>rij[f]!=null&&rij[f]!==it?.[f]);
    rij.item=it;rij.status=!it?'toevoegen':dose?'bijwerken':'al';
    return rij;
  });
  return {rijen};
}
function impTellingSch(rijen){
  const t={toevoegen:0,bijwerken:0,al:0,fout:0,instelling:0,schemas:new Set(),hernoemd:new Set()};
  rijen.forEach(r=>{if(r.status in t)t[r.status]++;if(r.status!=='fout'&&!r.bestaatSch)t.schemas.add(impNorm(r.schema));
    if(r.status!=='fout'&&r.oudSch)t.hernoemd.add(r.bestaatSch.id)});
  t.ok=t.toevoegen+t.bijwerken+t.instelling+t.hernoemd.size+rijen.filter(r=>r.status==='al'&&(r.days!=null&&r.days!==r.bestaatSch?.days||r.weeks!=null&&r.weeks!==r.bestaatSch?.weeks)).length;
  return t;
}
function impToepassenSch(){
  const t=impTellingSch(imp.rijen), nieuw={};
  let toegevoegd=0, bijgewerkt=0;
  for(const r of imp.rijen){
    if(r.status==='fout')continue;
    let s=r.bestaatSch||impSchema(r.schema)||nieuw[impNorm(r.schema)];
    if(!s){s={id:uid(),name:r.schema,days:3,weeks:4,items:[]};S.schemas.push(s);nieuw[impNorm(r.schema)]=s}
    if(r.oudSch)s.name=r.schema;
    if(r.days!=null)s.days=Math.max(1,Math.min(7,r.days));
    if(r.weeks!=null)s.weeks=Math.max(1,r.weeks);
    if(!r.kaart)continue;
    let it=s.items.find(i=>i.card===r.kaart.id);
    if(!it){it={card:r.kaart.id,sets:r.kaart.sets,reps:r.kaart.reps,hold:r.kaart.hold,rest:r.kaart.rest};s.items.push(it);toegevoegd++}
    else if(r.status==='bijwerken')bijgewerkt++;
    for(const f of ['sets','reps','hold','rest'])if(r[f]!=null)it[f]=r[f];
  }
  return [t.schemas.size&&`${t.schemas.size} nieuw schema`,t.hernoemd.size&&`${t.hernoemd.size} hernoemd`,toegevoegd&&`${toegevoegd} oefening${toegevoegd===1?'':'en'} toegevoegd`,bijgewerkt&&`${bijgewerkt} dosering${bijgewerkt===1?'':'en'} bijgewerkt`];
}

/* ---------- Bestand lezen en toepassen ---------- */
async function impBestand(file){
  const soort=imp.soort;
  imp={soort,fase:'laden',bestand:file.name};render();
  try{
    const X=await laadXlsx();
    const wb=X.read(await file.arrayBuffer(),{type:'array'});
    const voorkeur=soort==='sch'?['schemas','schema']:['oefeningen'];
    const blad=wb.Sheets[wb.SheetNames.find(n=>voorkeur.includes(impNorm(n)))||wb.SheetNames[0]];
    const tabel=X.utils.sheet_to_json(blad,{header:1,defval:'',raw:true});
    const res=soort==='sch'?impVerwerkSch(tabel):impVerwerkOef(tabel);
    imp={soort,fase:res.fout?'kies':'check',bestand:file.name,...res};
  }catch(e){imp={soort,fase:'kies',bestand:file.name,fout:'Dit bestand kan niet gelezen worden. Kies een Excel-bestand (.xlsx) of een CSV-bestand.'}}
  render();$('#overlay .sheet')?.focus();
}
function impToepassen(){
  const undo=snapshot();
  const delen=imp.soort==='sch'?impToepassenSch():impToepassenOef();
  imp=null;save();render();
  toast(`Geïmporteerd: ${delen.filter(Boolean).join(', ')||'niets veranderd'}`,undo);
}

/* ---------- Voorbeeldbestanden ---------- */
// Zet keuzelijsten (gegevensvalidatie) in een werkblad. SheetJS kan dat zelf niet schrijven, dus voegen we
// het stukje XML toe in het xlsx-bestand (een zip). Andere waarden blijven toegestaan (showErrorMessage=0).
function impKeuzelijsten(X,data,blad,lijsten){
  const zip=X.CFB.read(new Uint8Array(data),{type:'array'}), f=X.CFB.find(zip,`/xl/worksheets/sheet${blad}.xml`);
  const dv=lijsten.map(([bereik,bron])=>`<dataValidation type="list" allowBlank="1" showErrorMessage="0" sqref="${bereik}"><formula1>${bron}</formula1></dataValidation>`).join('');
  f.content=new TextEncoder().encode(new TextDecoder().decode(f.content).replace('</sheetData>',`</sheetData><dataValidations count="${lijsten.length}">${dv}</dataValidations>`));
  f.size=f.content.length;
  return X.CFB.write(zip,{type:'array',fileType:'zip',compression:true});
}
// Bladen: [naam, rijen, kolombreedtes]; lijsten: kolommen voor het blad "Lijsten"; keuze: [[bereik in blad 1, kolomletter in Lijsten]]
// De keuzelijst groeit mee (OFFSET+COUNTA): wat je onderaan een kolom in "Lijsten" toevoegt, staat meteen in de keuzelijst.
function impMaakBestand(X,naam,bladen,lijsten,keuze){
  const wb=X.utils.book_new();
  for(const [n,rijen,breed] of bladen){const b=X.utils.aoa_to_sheet(rijen);b['!cols']=breed.map(w=>({wch:w}));X.utils.book_append_sheet(wb,b,n)}
  const n=Math.max(...lijsten.map(l=>l[1].length));
  const lb=X.utils.aoa_to_sheet([lijsten.map(l=>l[0]),...Array.from({length:n},(_,i)=>lijsten.map(l=>l[1][i]??''))]);
  lb['!cols']=lijsten.map(()=>({wch:36}));X.utils.book_append_sheet(wb,lb,'Lijsten');
  let data=X.write(wb,{type:'array',bookType:'xlsx'});
  try{data=impKeuzelijsten(X,data,1,keuze.map(([bereik,kol])=>[bereik,`OFFSET(Lijsten!$${kol}$2,0,0,MAX(1,COUNTA(Lijsten!$${kol}:$${kol})-1),1)`]))}
  catch(e){/* zonder keuzelijsten is het bestand nog steeds bruikbaar */}
  const url=URL.createObjectURL(new Blob([data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=Object.assign(document.createElement('a'),{href:url,download:naam});
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function impVoorbeeld(soort){
  laadXlsx().then(X=>{
    const ct=cats(), sch=[IMP_GEEN,...S.schemas.map(s=>s.name)], R=IMP_MAX+1;
    const datum=new Date().toLocaleDateString('sv'), naam=b=>b.replace('voorbeeld',datum);
    if(soort==='sch'){
      const k=S.cards.map(c=>c.name), ex=i=>k[i%Math.max(k.length,1)]||'';
      // alle huidige schema's: één rij per oefening, Per week en Weken op de eerste rij; een leeg schema krijgt één rij zonder oefening
      const huidig=S.schemas.flatMap(sc=>{const it=sc.items.map(i=>[i,S.cards.find(c=>c.id===i.card)]).filter(([,c])=>c);
        return it.length?it.map(([i,c],n)=>[sc.name,n?'':sc.days,n?'':sc.weeks,c.name,i.sets,i.reps,i.hold,i.rest,sc.id,c.id])
          :[[sc.name,sc.days,sc.weeks,'','','','','',sc.id,'']]});
      const rijen=[['Schema','Per week','Weken','Oefening','Sets','Herhalingen','Vasthouden (s)','Rust (s)','Schema-ID','Oefening-ID'],
        ...(huidig.length?huidig:[['Voorbeeld · Fase A',3,4,ex(0),3,10,5,30],['Voorbeeld · Fase A','','',ex(1),'','','',''],['Voorbeeld · Fase A','','',ex(2),2,8,'',45],
        ['Voorbeeld · Fase B',2,6,ex(3),'','','',''],['Voorbeeld · Fase B','','',ex(4),3,12,3,45]])];
      const uitleg=[['Kolom','Uitleg'],
        ['Schema','Verplicht. Bestaat het schema al (zelfde Schema-ID of zelfde naam), dan worden de oefeningen eraan toegevoegd; anders wordt het aangemaakt. Leeg = zelfde schema als de rij erboven. Zet een nieuw schema onderaan in het blad Lijsten, dan staat het meteen in de keuzelijst.'],
        ['Per week, Weken','Hoe vaak per week en hoeveel weken. Hoeft maar op één rij per schema. Leeg bij een nieuw schema = 3× per week, 4 weken.'],
        ['Oefening','Verplicht. Kies uit de lijst: de oefening moet al in de kaartenbak staan.'],
        ['Sets, Herhalingen, Vasthouden (s), Rust (s)','Dosering in dit schema. Leeg = de standaard van de oefeningkaart. Staat de oefening al in het schema, dan worden alleen de ingevulde velden aangepast.'],
        ['Schema-ID, Oefening-ID','Interne codes van de app; niet aanpassen. Ze zijn leidend boven de naam: met hetzelfde Schema-ID en een andere naam wordt het schema hernoemd. Laat ze leeg bij een nieuw schema of als je een oefening op naam kiest.']];
      impMaakBestand(X,naam(IMP_TEKST.sch.bestand),[["Schema's",rijen,[30,9,7,32,6,12,15,9,11,11]],['Uitleg',uitleg,[40,110]]],
        [["Schema's",S.schemas.map(s=>s.name)],['Oefeningen',k]],[[`A2:A${R}`,'A'],[`D2:D${R}`,'B']]);
      return;
    }
    const cat=(naam,i)=>impCatBestaat(naam)||ct.find(c=>impNorm(c).startsWith(impNorm(naam)))||ct[i%ct.length];
    // alle huidige oefeningen met hun schema's en interne ID
    const huidig=S.cards.map(c=>[c.name,c.cat,c.sets,c.reps,c.hold,c.rest,c.note||'',
      S.schemas.filter(x=>x.items.some(i=>i.card===c.id)).map(x=>x.name).join('; ')||IMP_GEEN,c.id]);
    const rijen=[['Oefening','Categorie','Sets','Herhalingen','Vasthouden (s)','Rust (s)','Instructie','Schema','ID'],...(huidig.length?huidig:[
      ['Bekkenkantelen in rugligging',cat('Mobiliteit',0),3,10,5,30,'Rustig ademen, onderrug zacht tegen de mat.',S.schemas[0]?.name||IMP_GEEN],
      ['Bird-dog',cat('Stabiliteit',1),3,8,8,45,'Bekken stil houden, niet doorzakken.',S.schemas[1]?.name||IMP_GEEN],
      ['Glute bridge',cat('Kracht',2),3,12,3,45,'Billen aanspannen bovenin.',S.schemas.slice(1,3).map(x=>x.name).join('; ')||IMP_GEEN],
      ['Wandelen',cat('Conditie',3),1,1,0,0,'15 minuten in eigen tempo.',IMP_GEEN]])];
    const uitleg=[['Kolom','Uitleg'],['Oefening','Verplicht. Bestaat de oefening al (zelfde ID, of zonder ID dezelfde naam), dan wordt de kaart bijgewerkt. Met een ID kun je zo ook de naam wijzigen.'],
      ['Categorie',`Verplicht bij een nieuwe oefening. Kies uit de lijst (${ct.join(', ')}) of typ een nieuwe naam: die categorie wordt dan aangemaakt. Zet je een nieuwe categorie onderaan in het blad Lijsten, dan staat hij meteen in de keuzelijst. Bij een bestaande oefening mag hij leeg blijven.`],
      ['Sets, Herhalingen','Hele getallen. Leeg bij een nieuwe kaart = 3 sets, 10 herhalingen.'],
      ['Vasthouden (s), Rust (s)','Seconden. Leeg bij een nieuwe kaart = 0 en 30.'],['Instructie','Tekst die het kind ziet.'],
      ['Schema',`Optioneel. Kies ${IMP_GEEN} (of laat leeg) voor geen schema, kies een schema uit de lijst, of typ een nieuwe naam: dat schema wordt dan aangemaakt (ook via het blad Lijsten, dan staat het meteen in de keuzelijst). Meerdere schema's scheiden met ;. Een schema dat hier niet meer staat, blijft wel aan de oefening gekoppeld (ontkoppelen doe je in de app).`],
      ['ID','Interne code van de app; niet aanpassen. Hiermee herkent de app de oefening, ook als je de naam wijzigt. Laat leeg bij een nieuwe oefening.']];
    impMaakBestand(X,naam(IMP_TEKST.oef.bestand),[['Oefeningen',rijen,[30,16,6,12,15,9,45,44,10]],['Uitleg',uitleg,[24,110]]],
      [['Categorieën',ct],["Schema's",sch]],[[`B2:B${R}`,'A'],[`H2:H${R}`,'B']]);
  }).catch(()=>toast('Voorbeeldbestand kon niet worden gemaakt'));
}

/* ---------- Venster ---------- */
function importHtml(){
  const T=IMP_TEKST[imp.soort], kop=`<div><div class="label">Importeren uit Excel</div><h2>${T.titel}</h2></div>`;
  if(imp.fase==='laden')return `<div class="scrim"><div class="sheet" role="dialog" aria-label="${T.titel}" tabindex="-1">${kop}<p class="empty">${esc(imp.bestand)} wordt gelezen…</p></div></div>`;
  if(imp.fase==='kies')return `<div class="scrim" data-act="imp-close"><div class="sheet" role="dialog" aria-label="${T.titel}" tabindex="-1">${kop}
    <p class="lede" style="font-size:.92rem;margin:0">${T.uitleg} Je ziet eerst wat er verandert voordat er iets wordt opgeslagen.</p>
    <label class="imp-drop"><input type="file" id="imp-file" accept=".xlsx,.xls,.ods,.csv"><span class="imp-drop-icon" aria-hidden="true">⇪</span><b>Kies een Excel-bestand</b><span>of sleep het hierheen</span></label>
    ${imp.fout?`<p class="imp-fout" role="alert">${imp.bestand?`<b>${esc(imp.bestand)}:</b> `:''}${esc(imp.fout)}</p>`:''}
    <div class="row" style="justify-content:space-between;align-items:center"><button type="button" class="btn ghost small" style="flex:0 0 auto" data-act="imp-voorbeeld" data-soort="${imp.soort}">⤓ Voorbeeldbestand downloaden</button>
      <button type="button" class="btn ghost" style="flex:0 0 auto" data-act="imp-close">Annuleren</button></div></div></div>`;
  const sch=imp.soort==='sch', t=sch?impTellingSch(imp.rijen):impTellingOef(imp.rijen);
  const chip=(n,tekst,cls='')=>n?`<span class="chip ${cls}">${n} ${tekst}</span>`:'';
  const chips=sch
    ?chip(t.schemas.size,t.schemas.size===1?'nieuw schema':"nieuwe schema's")+chip(t.hernoemd.size,'hernoemd')+chip(t.toevoegen,'toevoegen')+chip(t.bijwerken,'dosering bijwerken')+chip(t.al,'al in schema')+chip(t.fout,'overgeslagen','warn')
    :chip(t.nieuw,`nieuwe kaart${t.nieuw===1?'':'en'}`)+chip(t.bijwerken,'bijwerken')+chip(t.gelijk,'ongewijzigd')+chip(t.koppel,'× in schema')+chip(t.schemas.size,'nieuw schema')+chip(t.cats.size,`nieuwe categorie${t.cats.size===1?'':'ën'}`)+chip(t.fout,'overgeslagen','warn');
  const LABEL={nieuw:'Nieuw',bijwerken:'Bijwerken',gelijk:'Ongewijzigd',extra:'Extra schema',fout:'Overgeslagen',toevoegen:'Toevoegen',al:'Staat er al',instelling:'Instellingen'};
  const kopRij=sch?'<th>Rij</th><th>Schema</th><th>Oefening</th><th>Dosering</th><th>Status</th>':'<th>Rij</th><th>Oefening</th><th>Categorie</th><th>Dosering</th><th>Schema</th><th>Status</th>';
  const status=r=>`<td><span class="imp-st">${LABEL[r.status]}</span>${r.let.length?`<small>${r.let.map(esc).join('<br>')}</small>`:''}</td>`;
  const rij=sch
    ?r=>`<tr class="st-${r.status}"><td class="num">${r.nr}</td>
        <td>${esc(r.schema)||'<i>leeg</i>'}${r.schema&&!r.bestaatSch?' <span class="badge">nieuw</span>':''}${r.oudSch?`<small class="imp-was">was: ${esc(r.oudSch)}</small>`:''}${r.days!=null||r.weeks!=null?`<small class="imp-inst">${[r.days!=null&&r.days+'× per week',r.weeks!=null&&r.weeks+' weken'].filter(Boolean).join(' · ')}</small>`:''}</td>
        <td>${esc(r.oef)}</td><td class="num">${r.kaart?impDose(r,r.item,r.kaart):''}</td>${status(r)}</tr>`
    :r=>{const b=r.status==='extra'?r.van:r, c=b.bestaat, cat=b.cat||c?.cat||'';
      return `<tr class="st-${r.status}"><td class="num">${r.nr}</td><td>${esc(r.name)||'<i>leeg</i>'}${r.oud!=null?`<small class="imp-was">was: ${esc(r.oud)}</small>`:''}</td>
        <td>${r.status==='fout'||!cat?'':`<span class="cat" style="--cat:${b.nieuweCat&&!impCatBestaat(cat)?'var(--muted)':catColor(impCatBestaat(cat)||cat)}">${esc(cat)}</span>${b.nieuweCat&&!impCatBestaat(cat)?' <span class="badge">nieuw</span>':''}`}</td>
        <td class="num">${r.status==='fout'?'':impDose(b,null,c)}</td>
        <td>${r.schemas.map(n=>`${esc(n)}${impSchema(n)?'':' <span class="badge">nieuw</span>'}`).join('<br>')}</td>${status(r)}</tr>`};
  return `<div class="scrim" data-act="imp-close"><div class="sheet wide" role="dialog" aria-label="Import controleren" tabindex="-1">${kop}
    <p class="lede" style="font-size:.92rem;margin:0">${esc(imp.bestand)} · ${imp.rijen.length} rij${imp.rijen.length===1?'':'en'}. Controleer en klik op Importeren.</p>
    <div class="chips">${chips}</div>
    <div class="imp-tabel"><table><thead><tr>${kopRij}</tr></thead><tbody>${imp.rijen.map(rij).join('')}</tbody></table></div>
    ${!sch&&t.bijwerken?`<p class="demo" style="margin:0">Bij bestaande kaarten worden alleen de ingevulde velden overschreven. De dosering in schema's waar de kaart al in staat, blijft hetzelfde.</p>`:''}
    ${sch&&t.bijwerken?`<p class="demo" style="margin:0">Bij oefeningen die al in het schema staan, worden alleen de ingevulde doseringsvelden aangepast.</p>`:''}
    <div class="row" style="justify-content:space-between;align-items:center">
      <button type="button" class="btn ghost small" style="flex:0 0 auto" data-act="imp-opnieuw">Ander bestand</button>
      <span style="flex:0 0 auto;display:flex;gap:8px"><button type="button" class="btn ghost" data-act="imp-close">Annuleren</button>
      <button type="button" class="btn" data-act="imp-go" ${t.ok?'':'disabled'}>Importeren</button></span></div></div></div>`;
}

document.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
  if(a==='imp-open'){imp={soort:b.dataset.soort||'oef',fase:'kies'};render();$('#overlay .sheet')?.focus()}
  if(a==='imp-close'){if(b.classList.contains('scrim')&&ev.target!==b)return;if(imp?.fase==='laden')return;imp=null;render()}
  if(a==='imp-opnieuw'){imp={soort:imp.soort,fase:'kies'};render()}
  if(a==='imp-voorbeeld')impVoorbeeld(b.dataset.soort||'oef');
  if(a==='imp-go'&&imp?.rijen)impToepassen();
});
document.addEventListener('change',ev=>{if(ev.target.id==='imp-file'&&ev.target.files[0])impBestand(ev.target.files[0])});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&imp&&imp.fase!=='laden'){imp=null;render()}});
document.addEventListener('dragover',ev=>{const z=ev.target.closest?.('.imp-drop');if(z)z.classList.add('over')});
document.addEventListener('dragleave',ev=>{ev.target.closest?.('.imp-drop')?.classList.remove('over')});
