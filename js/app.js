// ═══ ESTADO GLOBAL ═══════════════════════════════
let bens=[],asis=[],curBenId=null,pendingAsi={},curAsiMes='Enero26';

// ═══ HELPER: buscar ben por ID o folio ═══════════
// Uso: getBen(a.benId) — resuelve por id exacto primero, luego por folio
function getBen(benId){
  const direct=bens.find(b=>b.id===benId);
  if(direct)return direct;
  const folio=String(benId.split('_')[0]);
  return bens.find(b=>b.folio===folio)||null;
}

// ═══ SUPABASE ════════════════════════════════════
async function sbGet(t,p=''){
  const r=await fetch(SB_URL+'/rest/v1/'+t+(p?'?'+p:''),
    {headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY}});
  if(!r.ok)throw new Error(await r.text());
  return r.json();
}
async function sbPatch(t,filter,data){
  const r=await fetch(SB_URL+'/rest/v1/'+t+'?'+filter,
    {method:'PATCH',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,
      'Content-Type':'application/json','Prefer':'return=representation'},
    body:JSON.stringify(data)});
  if(!r.ok)throw new Error(await r.text());
  return r.json().catch(()=>[]);
}
async function sbPost(t,data){
  const r=await fetch(SB_URL+'/rest/v1/'+t,
    {method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,
      'Content-Type':'application/json','Prefer':'return=representation'},
    body:JSON.stringify(data)});
  if(!r.ok)throw new Error(await r.text());
  return r.json().catch(()=>[]);
}
async function guardarAsistencia(benId,mes,acts){
  // Try PATCH first (update existing), then POST (insert new)
  const patchResult=await sbPatch('asistencias',
    `ben_id=eq.${encodeURIComponent(benId)}&mes=eq.${encodeURIComponent(mes)}`,
    {acts,fecha:new Date().toISOString().slice(0,10)});
  if(patchResult&&patchResult.length>0)return patchResult;
  // No existing record — insert
  const bid=getBen(benId);
  const rowId=benId+'_'+mes;
  return sbPost('asistencias',{id:rowId,ben_id:benId,mes,acts,fecha:new Date().toISOString().slice(0,10)});
}

// ═══ UTILS ═══════════════════════════════════════
function bgGen(g){
  const m={'G28':'b-g28','G29':'b-g29','G30':'b-g30','G31':'b-g31','G32':'b-g32',
    'CA5':'b-ca5','CA6':'b-ca6','Facilitadores':'b-fac'};
  return m[g]||(g&&g.startsWith('CA')?'b-ca':'b-g');
}
function tipoBadge(tipo){
  return tipo==='CA'?'b-ca':tipo==='Facilitadores'?'b-fac':'b-g';
}
function showL(t='Cargando...'){document.getElementById('loading').classList.add('show');document.getElementById('loading-txt').textContent=t;}
function hideL(){document.getElementById('loading').classList.remove('show');}
function toast(msg,type='ok',ms=3000){
  const el=document.getElementById('toast');el.textContent=msg;
  el.className='toast show '+(type==='error'?'terr':type==='success'?'tok':'');
  setTimeout(()=>el.className='toast',ms);
}
function updTop(){
  const act=bens.filter(b=>!b.baja).length;
  const ses=asis.reduce((s,a)=>s+Object.values(a.acts||{}).reduce((x,v)=>x+(+v||0),0),0);
  const cnt=new Set(bens.filter(b=>!b.baja).map(b=>b.centro)).size;
  document.getElementById('ts-act').textContent=act;
  document.getElementById('ts-ses').textContent=ses;
  document.getElementById('ts-cnt').textContent=cnt;
}
function isActSched(gen,mes,act){
  const sa=(MONTH_SCHED[gen]&&MONTH_SCHED[gen][mes])||[];
  return sa.some(s=>act===s||act.substring(0,8)===s.substring(0,8));
}
function cM(id,e){if(e&&!e.target.classList.contains('mbg'))return;document.getElementById(id).style.display='none';}

// ═══ INIT ════════════════════════════════════════
async function init(){
  showL('Cargando datos...');
  try{
    const rb=await sbGet('beneficiarios','select=*&order=folio.asc&limit=2000');
    // NORMALIZE: folio always STRING, tipo/gen correct, Facilitadores by folio
    bens=rb.map(b=>{
      const folio=String(b.folio||'');
      const isFac=FAC_FOLIOS.has(folio);
      let tipo=b.tipo||'G';
      let gen=b.gen||'G29';
      if(isFac){ tipo='Facilitadores'; gen='Facilitadores'; }
      else if(tipo==='GRAMO'||tipo==='gramo') tipo='G';
      else if(tipo==='California'||tipo==='california') tipo='CA';
      if(!isFac&&(gen==='GRAMO'||gen==='gramo'||gen==='nan'||gen==='')) gen='G29';
      const centro=(b.centro||'').trim().toUpperCase()==='RIBERAS DEL BRAVO'?'RIBERAS DEL BRAVO':(b.centro||'');
      return{...b,folio,tipo,gen,centro,
        fechaAlta:b.fecha_alta,fechaBaja:b.fecha_baja,motivoBaja:b.motivo_baja,bajaNota:b.baja_nota};
    });
    const ra=await sbGet('asistencias','select=*&limit=10000');
    asis=ra.map(a=>{
      // Normalize mes
      let mes=a.mes||'';
      if(mes==='26 de febrero'||mes==='febrero 2026') mes='Febrero26';
      else if(mes==='26 de enero'||mes==='enero 2026') mes='Enero26';
      else if(mes==='26 de marzo'||mes==='marzo 2026') mes='Marzo26';
      return{...a,benId:a.ben_id,mes,acts:a.acts||};
    });
    hideL();updTop();renderInicio();
  }catch(e){hideL();toast('❌ '+e.message.substring(0,120),'error');}
}

// ═══ NAV ═════════════════════════════════════════
const NAV_IDS=['inicio','beneficiarios','asistencias','historial','unicos','resumen','cronograma','periodos','reportes'];
const NAV_FNS={
  inicio:renderInicio,
  beneficiarios:()=>{renderBenF();renderBen();},
  asistencias:renderAsiInit,
  historial:()=>{renderHistF();renderHistS();renderHist();},
  unicos:renderUnicos,
  resumen:renderResumen,
  cronograma:renderCrono,
  periodos:renderPerI,
  reportes:renderRepI
};
function nav(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('on'));
  document.getElementById('v-'+id).classList.add('on');
  document.querySelectorAll('.ni').forEach((n,i)=>n.classList.toggle('on',NAV_IDS[i]===id));
  if(NAV_FNS[id])NAV_FNS[id]();
}

// ═══ INICIO ══════════════════════════════════════
function renderInicio(){
  const act=bens.filter(b=>!b.baja);
  const ses=asis.reduce((s,a)=>s+Object.values(a.acts||{}).reduce((x,v)=>x+(+v||0),0),0);
  document.getElementById('sr-inicio').innerHTML=`
    <div class="sc"><div class="sc-l">Beneficiarios activos</div><div class="sc-v">${act.length}</div><div class="sc-s">G:${act.filter(b=>b.tipo==='G').length} CA:${act.filter(b=>b.tipo==='CA').length} Fac:${act.filter(b=>b.tipo==='Facilitadores').length}</div></div>
    <div class="sc or"><div class="sc-l">Bajas</div><div class="sc-v">${bens.filter(b=>b.baja).length}</div></div>
    <div class="sc"><div class="sc-l">Sesiones T1</div><div class="sc-v">${ses}</div></div>
    <div class="sc dk"><div class="sc-l">Centros</div><div class="sc-v">${new Set(act.map(b=>b.centro)).size}</div></div>`;
  const cm={};act.forEach(b=>{cm[b.centro]=(cm[b.centro]||0)+1;});
  const sorted=Object.entries(cm).sort((a,b)=>b[1]-a[1]).slice(0,10);const mx=sorted[0]?sorted[0][1]:1;
  document.getElementById('dash-centros').innerHTML=sorted.map(([c,n])=>`<div class="bar-row"><span style="font-size:11.5px;min-width:170px;color:var(--t2)">${c||'—'}</span><div class="bar-w"><div class="bar-f" style="width:${Math.round(n/mx*100)}%"></div></div><span style="font-size:12px;font-weight:700;font-family:var(--mo);min-width:24px;text-align:right;color:var(--rj)">${n}</span></div>`).join('');
  const gm={};act.forEach(b=>{gm[b.gen]=(gm[b.gen]||0)+1;});
  document.getElementById('dash-gens').innerHTML=GEN_ORDER.filter(g=>gm[g]).map(g=>`<div class="bar-row"><span class="badge ${bgGen(g)}" style="min-width:56px">${g}</span><div class="bar-w"><div class="bar-f" style="width:${Math.round(gm[g]/act.length*100)}%;background:${g.startsWith('CA')?'var(--or)':g==='Facilitadores'?'#827717':'var(--rj)'}"></div></div><span style="font-size:12px;font-weight:700;font-family:var(--mo)">${gm[g]}</span></div>`).join('');
}

// ═══ BENEFICIARIOS ════════════════════════════════
function setBenV(v){
  document.getElementById('vb-lista').style.display=v==='lista'?'':'none';
  document.getElementById('vb-nuevo').style.display=v==='nuevo'?'':'none';
  if(v==='nuevo') updBenOpc();
  else {renderBenF();renderBen();}
}
function updBenOpc(){
  const t=document.getElementById('bf-tipo').value;
  document.getElementById('bf-gen').innerHTML=(t==='G'?GENS_G:CICLOS_CA).map(g=>`<option>${g}</option>`).join('');
  document.getElementById('bf-centro').innerHTML=(t==='G'?CENTROS_G:['CA5','CA6','CA7','CA8']).map(c=>`<option>${c}</option>`).join('');
}
function renderBenF(){
  const gens=[...new Set(bens.map(b=>b.gen))].filter(Boolean).sort();
  const centros=[...new Set(bens.map(b=>b.centro))].filter(Boolean).sort();
  const fg=document.getElementById('ben-gen'),gv=fg.value;
  fg.innerHTML='<option value="">Todas las gen.</option>'+gens.map(g=>`<option${g===gv?' selected':''}>${g}</option>`).join('');
  const fc=document.getElementById('ben-centro'),cv=fc.value;
  fc.innerHTML='<option value="">Todos los centros</option>'+centros.map(c=>`<option${c===cv?' selected':''}>${c}</option>`).join('');
}
function renderBen(){
  const q=(document.getElementById('ben-q').value||'').toLowerCase().trim();
  const gen=document.getElementById('ben-gen').value;
  const centro=document.getElementById('ben-centro').value;
  const status=document.getElementById('ben-status').value;
  let data=bens.filter(b=>{
    if(status==='activo'&&b.baja)return false;
    if(status==='baja'&&!b.baja)return false;
    if(gen&&b.gen!==gen)return false;
    if(centro&&b.centro!==centro)return false;
    if(q&&!(`${b.nombre} ${b.apat} ${b.amat} ${b.folio}`).toLowerCase().includes(q))return false;
    return true;
  });
  data.sort((a,b)=>{const fa=parseInt(a.folio)||9999,fb=parseInt(b.folio)||9999;return fa-fb;});
  document.getElementById('ben-cnt').textContent=`(${data.length} de ${bens.length})`;
  const body=document.getElementById('ben-body'),empty=document.getElementById('ben-empty');
  if(!data.length){body.innerHTML='';empty.style.display='';return;}
  empty.style.display='none';
  body.innerHTML=data.map(b=>`<tr>
    <td style="font-family:var(--mo);font-size:11px;color:var(--t3)">${b.folio||'—'}</td>
    <td style="cursor:pointer;color:var(--rj);font-weight:600" onclick="openBenM('${b.id}')">${b.nombre}</td>
    <td>${b.apat||'—'}</td><td>${b.amat||'—'}</td>
    <td><span class="badge ${tipoBadge(b.tipo)}">${b.tipo}</span></td>
    <td style="font-size:11px">${b.centro||'—'}</td>
    <td><span class="badge ${bgGen(b.gen)}">${b.gen||'—'}</span></td>
    <td style="text-align:center">${b.edad||'—'}</td>
    <td>${b.sexo||'—'}</td>
    <td>${b.baja?'<span class="badge b-baj">Baja</span>':'<span class="badge b-act">Activo</span>'}</td>
    <td><button class="btn btn-xs" onclick="openBenM('${b.id}')">Ver</button></td>
  </tr>`).join('');
}
async function guardarBen(){
  const nom=(document.getElementById('bf-nombre').value||'').trim().toUpperCase();
  if(!nom){alert('El nombre es requerido.');return;}
  const tipo=document.getElementById('bf-tipo').value;
  const gen=document.getElementById('bf-gen').value;
  const folio=String(document.getElementById('bf-folio').value.trim());
  const newBen={id:folio+'_'+tipo+'_'+gen+'_'+folio,folio,tipo,gen,
    centro:document.getElementById('bf-centro').value,nombre:nom,
    apat:(document.getElementById('bf-apat').value||'').trim().toUpperCase(),
    amat:(document.getElementById('bf-amat').value||'').trim().toUpperCase(),
    edad:document.getElementById('bf-edad').value,
    sexo:document.getElementById('bf-sexo').value,
    municipio:document.getElementById('bf-mpio').value,
    colonia:(document.getElementById('bf-colonia').value||'').trim().toUpperCase(),
    baja:false,fecha_alta:new Date().toISOString().slice(0,10)};
  showL('Guardando...');
  try{
    await sbPost('beneficiarios',newBen);
    bens.push({...newBen,fechaAlta:newBen.fecha_alta});
    hideL();updTop();toast('✅ Guardado','success');setBenV('lista');
  }catch(e){hideL();toast('❌ '+e.message.substring(0,80),'error');}
}
function openBenM(id){
  curBenId=id;const b=bens.find(x=>x.id===id);if(!b)return;
  document.getElementById('mb-t').textContent=`${b.nombre} ${b.apat||''} ${b.amat||''}`;
  const ses=asis.filter(a=>a.benId===id).reduce((s,a)=>s+Object.values(a.acts||{}).reduce((x,v)=>x+(+v||0),0),0);
  const meses=[...new Set(asis.filter(a=>a.benId===id).map(a=>a.mes))];
  const hist=meses.map(m=>{
    const reg=asis.find(a=>a.benId===id&&a.mes===m);if(!reg)return'';
    const chips=Object.entries(reg.acts||{}).filter(([k,v])=>+v>0).map(([k,v])=>`<span class="chip">${k}: ${v}</span>`).join('');
    return`<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:3px">${m}</div>${chips||'—'}</div>`;
  }).join('');
  document.getElementById('mb-b').innerHTML=`
    <div class="ig" style="margin-bottom:12px">
      <div><div class="il">Folio</div><div class="iv">${b.folio}</div></div>
      <div><div class="il">Tipo</div><div class="iv"><span class="badge ${tipoBadge(b.tipo)}">${b.tipo}</span></div></div>
      <div><div class="il">Generación</div><div class="iv"><span class="badge ${bgGen(b.gen)}">${b.gen}</span></div></div>
      <div><div class="il">Centro</div><div class="iv">${b.centro||'—'}</div></div>
      <div><div class="il">Edad / Sexo</div><div class="iv">${b.edad||'—'} · ${b.sexo||'—'}</div></div>
      <div><div class="il">Colonia</div><div class="iv">${b.colonia||'—'}</div></div>
      ${b.baja?`<div><div class="il">Baja</div><div class="iv" style="color:var(--rj)">${b.fechaBaja||'—'} — ${b.motivoBaja||'—'}</div></div>`:''}
    </div>
    <div style="background:var(--rjl);border-left:3px solid var(--rj);border-radius:7px;padding:10px 14px;display:flex;gap:24px;margin-bottom:12px">
      <div><div class="il">Sesiones totales</div><div style="font-size:22px;font-weight:700;font-family:var(--mo);color:var(--rj)">${ses}</div></div>
      <div><div class="il">Meses con registro</div><div style="font-size:22px;font-weight:700;font-family:var(--mo)">${meses.length}</div></div>
    </div>
    ${hist?`<div><div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--t3);margin-bottom:8px">Historial</div>${hist}</div>`:''}`;
  const btn=document.getElementById('mb-baja');
  btn.textContent=b.baja?'↩ Reactivar':'🚫 Dar de baja';
  document.getElementById('m-ben').style.display='';
}
function abrirEdicion(){
  const b=bens.find(x=>x.id===curBenId);if(!b)return;
  document.getElementById('edit-nom').textContent=`${b.nombre} ${b.apat||''}`;
  document.getElementById('edit-nombre').value=b.nombre||'';
  document.getElementById('edit-apat').value=b.apat||'';
  document.getElementById('edit-amat').value=b.amat||'';
  document.getElementById('edit-edad').value=b.edad||'';
  document.getElementById('edit-sexo').value=b.sexo||'Femenino';
  document.getElementById('edit-colonia').value=b.colonia||'';
  cM('m-ben');document.getElementById('m-edit').style.display='';
}
async function guardarEdicion(){
  const b=bens.find(x=>x.id===curBenId);if(!b)return;
  const nombre=(document.getElementById('edit-nombre').value||'').trim().toUpperCase();
  if(!nombre){alert('El nombre es requerido.');return;}
  const data={nombre,
    apat:(document.getElementById('edit-apat').value||'').trim().toUpperCase(),
    amat:(document.getElementById('edit-amat').value||'').trim().toUpperCase(),
    edad:document.getElementById('edit-edad').value,
    sexo:document.getElementById('edit-sexo').value,
    colonia:(document.getElementById('edit-colonia').value||'').trim().toUpperCase()};
  showL('Guardando...');
  try{
    await sbPatch('beneficiarios','id=eq.'+encodeURIComponent(b.id),data);
    Object.assign(b,data);
    hideL();cM('m-edit');toast('✅ Actualizado','success');renderBen();
  }catch(e){hideL();toast('❌ '+e.message.substring(0,80),'error');}
}
function toggleBaja(){
  const b=bens.find(x=>x.id===curBenId);if(!b)return;
  if(b.baja){
    if(!confirm(`¿Reactivar a ${b.nombre} ${b.apat||''}?`))return;
    showL('Reactivando...');
    sbPatch('beneficiarios','id=eq.'+encodeURIComponent(b.id),{baja:false,fecha_baja:null,motivo_baja:null})
      .then(()=>{b.baja=false;b.motivoBaja=null;b.fechaBaja=null;hideL();cM('m-ben');renderBen();updTop();toast('✅ Reactivado','success');})
      .catch(e=>{hideL();toast('❌ '+e.message,'error');});
  }else{
    cM('m-ben');
    document.getElementById('baja-nom').textContent=`${b.nombre} ${b.apat||''}`;
    document.getElementById('baja-obs').value='';
    document.getElementById('m-baja').style.display='';
  }
}
function confirmBaja(){
  const b=bens.find(x=>x.id===curBenId);if(!b)return;
  const mot=document.getElementById('baja-mot').value,obs=document.getElementById('baja-obs').value;
  const fd=new Date().toISOString().slice(0,10);
  showL('Registrando baja...');
  sbPatch('beneficiarios','id=eq.'+encodeURIComponent(b.id),{baja:true,motivo_baja:mot,baja_nota:obs,fecha_baja:fd})
    .then(()=>{b.baja=true;b.motivoBaja=mot;b.bajaNota=obs;b.fechaBaja=fd;hideL();cM('m-baja');renderBen();updTop();toast('✅ Baja registrada','success');})
    .catch(e=>{hideL();toast('❌ '+e.message,'error');});
}

// ═══ CAPTURA ASISTENCIAS ═════════════════════════
function renderAsiInit(){
  const gens=[...new Set(bens.filter(b=>!b.baja).map(b=>b.gen))].filter(Boolean).sort();
  const centros=[...new Set(bens.filter(b=>!b.baja).map(b=>b.centro))].filter(Boolean).sort();
  ['asi-gen','asi-centro'].forEach((id,i)=>{
    const el=document.getElementById(id),cv=el.value;
    el.innerHTML='<option value="">'+(i===0?'Todas las gen.':'Todos los centros')+'</option>'+(i===0?gens:centros).map(v=>`<option${v===cv?' selected':''}>${v}</option>`).join('');
  });
  document.getElementById('asi-mes').innerHTML=MESES.map(m=>`<option${m===curAsiMes?' selected':''}>${m}</option>`).join('');
  pendingAsi={};renderAsiTab();
}
function renderAsiTab(){
  const q=(document.getElementById('asi-q')?.value||'').toLowerCase().trim();
  const gen=document.getElementById('asi-gen').value;
  const centro=document.getElementById('asi-centro').value;
  curAsiMes=document.getElementById('asi-mes').value||'Enero26';
  let benList=bens.filter(b=>{
    if(b.baja)return false;
    if(gen&&b.gen!==gen)return false;
    if(centro&&b.centro!==centro)return false;
    if(q&&!(`${b.nombre} ${b.apat||''} ${b.amat||''} ${b.folio}`).toLowerCase().includes(q))return false;
    return true;
  }).sort((a,b)=>{const fa=parseInt(a.folio)||9999,fb=parseInt(b.folio)||9999;return fa-fb;});
  const wrap=document.getElementById('asi-cap-wrap');
  const info=document.getElementById('asi-info');
  if(!benList.length){wrap.innerHTML='<div class="es" style="padding:2rem"><div class="es-i">👥</div><div>Sin beneficiarios</div></div>';info.style.display='none';return;}
  info.style.display='';
  info.textContent=`${benList.length} beneficiarios · ${curAsiMes} · Captura sesiones y presiona "Guardar en Supabase"`;
  const getVal=(benId,act)=>{
    if(pendingAsi[benId]&&pendingAsi[benId][act]!==undefined)return pendingAsi[benId][act];
    const reg=asis.find(a=>a.benId===benId&&a.mes===curAsiMes);
    return reg&&reg.acts[act]?reg.acts[act]:0;
  };
  const buildTable=(bList,acts,label)=>{
    const header=acts.map(a=>`<th class="act-hdr" title="${a}">${a}</th>`).join('');
    const rows=bList.map(b=>{
      const exclReg=asis.find(a=>a.benId===b.id&&a.mes===curAsiMes);
      const exclPend=EXCLUSIVOS.find(ex=>pendingAsi[b.id]&&(pendingAsi[b.id][ex]||0)>0);
      const exclExist=exclReg&&EXCLUSIVOS.find(ex=>(exclReg.acts[ex]||0)>0);
      const hasExcl=exclPend||exclExist;
      const rowTotal=acts.reduce((s,a)=>s+(+getVal(b.id,a)||0),0);
      const cells=acts.map(a=>{
        const v=getVal(b.id,a)||0;
        const sched=isActSched(b.gen,curAsiMes,a);
        const exclBlocked=EXCLUSIVOS.includes(a)&&hasExcl&&hasExcl!==a;
        const blocked=!sched||exclBlocked;
        return`<td><input class="ses-in${v>0?' hv':''}${blocked?' blk':''}" type="number" min="0" max="99" value="${v||''}" placeholder="${blocked?'—':'0'}" ${blocked?'disabled':''}" data-ben="${b.id}" data-act="${a}" oninput="onAsiInput(this)"></td>`;
      }).join('');
      return`<tr><td class="scol"><div style="font-weight:700;font-size:12px">${b.nombre} ${b.apat||''} ${b.amat||''}</div><div class="bi">${b.folio} · ${b.gen} · ${b.centro}</div></td>${cells}<td class="cap-sum" id="sum-${b.id}">${rowTotal||'—'}</td></tr>`;
    }).join('');
    const colTotals=acts.map(a=>`<td style="text-align:center;font-weight:700;font-size:11px;font-family:var(--mo);color:var(--or)">${bList.reduce((s,b)=>s+(+getVal(b.id,a)||0),0)||''}</td>`).join('');
    return(label?`<div class="cap-plbl">${label}</div>`:'')+
      `<div class="cap-wrap"><table class="cap-table">
        <thead><tr><th class="scol" style="min-width:240px;z-index:4">Beneficiario</th>${header}<th style="min-width:52px;background:var(--rjd);color:#fff">Total</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="background:var(--ng2)"><td class="scol" style="font-weight:700;font-size:11px;color:var(--or);background:var(--ng3)">TOTALES</td>${colTotals}<td style="text-align:center;font-weight:700;font-family:var(--mo);color:var(--or);background:var(--ng3)">${bList.reduce((s,b)=>s+acts.reduce((t,a)=>t+(+getVal(b.id,a)||0),0),0)||''}</td></tr></tfoot>
      </table></div>`;
  };
  const hasG=benList.some(b=>b.tipo==='G'||b.tipo==='Facilitadores');
  const hasCA=benList.some(b=>b.tipo==='CA');
  let html='';
  if(hasG&&hasCA){
    html+=buildTable(benList.filter(b=>b.tipo==='G'||b.tipo==='Facilitadores'),ACTS_G,'⚡ Programa Generación (G)');
    html+=buildTable(benList.filter(b=>b.tipo==='CA'),ACTS_CA,'🎯 Programa Centro de Apoyo (CA)');
  }else if(hasCA){html+=buildTable(benList,ACTS_CA,'');}
  else{html+=buildTable(benList,ACTS_G,'');}
  wrap.innerHTML=html;
}
function onAsiInput(el){
  const benId=el.dataset.ben,act=el.dataset.act,val=+el.value||0;
  el.classList.toggle('hv',val>0);
  if(!pendingAsi[benId])pendingAsi[benId]={};
  pendingAsi[benId][act]=val;
  if(EXCLUSIVOS.includes(act)&&val>0){
    EXCLUSIVOS.filter(e=>e!==act).forEach(other=>{
      const inp=document.querySelector(`input[data-ben="${benId}"][data-act="${other}"]`);
      if(inp){inp.value='';inp.disabled=true;inp.classList.add('blk');inp.classList.remove('hv');if(pendingAsi[benId])pendingAsi[benId][other]=0;}
    });
  }
  const b=bens.find(x=>x.id===benId);if(!b)return;
  const acts=b.tipo==='CA'?ACTS_CA:ACTS_G;
  const tot=acts.reduce((s,a)=>{const i=document.querySelector(`input[data-ben="${benId}"][data-act="${a}"]`);return s+(i?+i.value||0:0);},0);
  const el2=document.getElementById('sum-'+benId);if(el2)el2.textContent=tot||'—';
}
async function guardarAsi(){
  const entries=Object.entries(pendingAsi).filter(([,acts])=>Object.values(acts).some(v=>+v>0));
  if(!entries.length){toast('No hay cambios que guardar');return;}
  showL(`Guardando ${entries.length} registro(s)...`);
  let ok=0,err=0;
  for(const[benId,newActs] of entries){
    try{
      const ex=asis.find(a=>a.benId===benId&&a.mes===curAsiMes);
      const cleanActs=Object.fromEntries(Object.entries(ex?{...ex.acts,...newActs}:newActs).filter(([k,v])=>+v>0));
      await guardarAsistencia(benId,curAsiMes,cleanActs);
      if(ex){ex.acts=cleanActs;}else{asis.push({id:benId+'_'+curAsiMes,benId,mes:curAsiMes,acts:cleanActs});}
      ok++;
    }catch(e){err++;console.error(benId,e.message);}
  }
  pendingAsi={};hideL();updTop();
  toast(`✅ ${ok} guardado${ok!==1?'s':''}${err?' · ⚠ '+err+' error(es)':''}`,err?'error':'success');
  renderAsiTab();
}

// ═══ HISTORIAL ════════════════════════════════════
function renderHistS(){
  const tot=asis.length;
  const ses=asis.reduce((s,a)=>s+Object.values(a.acts||{}).reduce((x,v)=>x+(+v||0),0),0);
  const uBens=new Set(asis.map(a=>a.benId)).size;
  document.getElementById('sr-hist').innerHTML=`
    <div class="sc"><div class="sc-l">Registros</div><div class="sc-v">${tot}</div></div>
    <div class="sc"><div class="sc-l">Sesiones</div><div class="sc-v">${ses}</div></div>
    <div class="sc vd"><div class="sc-l">Beneficiarios</div><div class="sc-v">${uBens}</div></div>
    <div class="sc dk"><div class="sc-l">Meses</div><div class="sc-v">${new Set(asis.map(a=>a.mes)).size}</div></div>`;
}
function renderHistF(){
  const gens=[...new Set(bens.map(b=>b.gen))].filter(Boolean).sort();
  const centros=[...new Set(bens.map(b=>b.centro))].filter(Boolean).sort();
  ['hist-gen','hist-centro'].forEach((id,i)=>{
    const el=document.getElementById(id),cv=el.value;
    el.innerHTML='<option value="">'+(i===0?'Todas las gen.':'Todos los centros')+'</option>'+(i===0?gens:centros).map(v=>`<option${v===cv?' selected':''}>${v}</option>`).join('');
  });
  const fm=document.getElementById('hist-mes'),mv=fm.value;
  fm.innerHTML='<option value="">Todos los meses</option>'+MESES.map(m=>`<option${m===mv?' selected':''}>${m}</option>`).join('');
}
function renderHist(){
  const q=(document.getElementById('hist-q').value||'').toLowerCase().trim();
  const gen=document.getElementById('hist-gen').value;
  const centro=document.getElementById('hist-centro').value;
  const mes=document.getElementById('hist-mes').value;
  const data=asis.filter(a=>{
    const b=getBen(a.benId);
    if(!b)return false;
    if(gen&&b.gen!==gen)return false;
    if(centro&&b.centro!==centro)return false;
    if(mes&&a.mes!==mes)return false;
    if(q&&!(`${b.nombre||''} ${b.apat||''} ${b.amat||''} ${b.folio||''}`).toLowerCase().includes(q))return false;
    return true;
  }).slice(0,300);
  const body=document.getElementById('hist-body'),empty=document.getElementById('hist-empty');
  if(!data.length){body.innerHTML='';empty.style.display='';return;}
  empty.style.display='none';
  body.innerHTML=data.map(a=>{
    const b=getBen(a.benId)||{};
    const ses=Object.values(a.acts||{}).reduce((s,v)=>s+(+v||0),0);
    const chips=Object.entries(a.acts||{}).filter(([k,v])=>+v>0).map(([k,v])=>`<span class="chip">${k}: ${v}</span>`).join('');
    return`<tr>
      <td style="font-family:var(--mo);font-size:11px;color:var(--t3)">${b.folio||'—'}</td>
      <td style="font-weight:600;color:var(--rj)">${b.nombre||'?'} ${b.apat||''}</td>
      <td><span class="badge ${tipoBadge(b.tipo||'G')}">${b.tipo||'—'}</span></td>
      <td style="font-size:11px">${b.centro||'—'}</td>
      <td><span class="badge ${bgGen(b.gen)}">${b.gen||'—'}</span></td>
      <td><span style="font-family:var(--mo);font-size:10.5px;background:var(--ng);color:var(--or);padding:2px 8px;border-radius:100px">${a.mes}</span></td>
      <td style="max-width:320px">${chips||'—'}</td>
      <td style="text-align:center;font-weight:700;font-family:var(--mo);color:var(--rj)">${ses}</td>
    </tr>`;
  }).join('');
}

// ═══ BENEFICIARIOS ÚNICOS ═════════════════════════
function renderUnicos(){
  const tipo=document.getElementById('uniq-tipo').value||'G';
  const genFil=document.getElementById('uniq-gen').value;
  const acts=tipo==='G'?ACTS_G:ACTS_CA;
  // Include Facilitadores in G view
  const bensTipo=bens.filter(b=>{
    const matchTipo=b.tipo===tipo||(tipo==='G'&&b.tipo==='Facilitadores');
    return matchTipo&&(!genFil||b.gen===genFil);
  });
  const gens=[...new Set(bens.filter(b=>b.tipo===tipo||(tipo==='G'&&b.tipo==='Facilitadores')).map(b=>b.gen))].filter(Boolean).sort();
  const fg=document.getElementById('uniq-gen'),gv=fg.value;
  fg.innerHTML='<option value="">Todas las gen.</option>'+gens.map(g=>`<option${g===gv?' selected':''}>${g}</option>`).join('');
  // Build benId set — match by both id and benId from asis
  const benIdSet=new Set(bensTipo.map(b=>b.id));
  // First appearance per ben x activity
  const firstTri={};
  asis.forEach(a=>{
    const b=getBen(a.benId);
    if(!b)return;
    if(!benIdSet.has(b.id))return;
    const tri=MES_TRI[a.mes];if(!tri)return;
    Object.entries(a.acts||{}).forEach(([act,val])=>{
      if(+val>0){
        const k=b.id+'|'+act;
        if(!firstTri[k]||tri<firstTri[k])firstTri[k]=tri;
      }
    });
  });
  const counts={};
  acts.forEach(a=>{counts[a]={1:new Set(),2:new Set(),3:new Set(),4:new Set(),5:new Set(),6:new Set()};;});
  Object.entries(firstTri).forEach(([k,tri])=>{
    const[benId,act]=k.split('|');
    if(counts[act])counts[act][tri].add(benId);
  });
  const globalBens=new Set(Object.keys(firstTri).map(k=>k.split('|')[0]));
  document.getElementById('uniq-head').innerHTML=`<tr>
    <th style="min-width:240px">Actividad</th>
    ${[1,2,3,4,5,6].map(t=>`<th style="text-align:center">T${t}<br><span style="font-weight:400;font-size:9px">${TRI_LABEL[t].replace(/^T\d /,'')}</span></th>`).join('')}
    <th style="text-align:center;background:var(--ng2);color:var(--or)">GLOBAL</th>
  </tr>`;
  document.getElementById('uniq-body').innerHTML=acts.map(a=>{
    const c=counts[a];
    const cells=[1,2,3,4,5,6].map(t=>{
      const n=c[t].size;
      return n>0?`<td style="text-align:center;font-weight:700;font-family:var(--mo);color:var(--rjd);padding:6px 10px;border-bottom:1px solid var(--g2)">${n}</td>`:
        `<td style="text-align:center;color:var(--t3);padding:6px 10px;border-bottom:1px solid var(--g2)">—</td>`;
    }).join('');
    const gn=new Set(Object.keys(firstTri).filter(k=>k.split('|')[1]===a).map(k=>k.split('|')[0])).size;
    return`<tr><td style="font-size:11.5px;font-weight:500;padding:6px 12px;border-bottom:1px solid var(--g2)">${a}</td>${cells}<td style="text-align:center;font-weight:700;font-family:var(--mo);color:var(--ord);background:var(--orl);padding:6px 10px;border-bottom:1px solid var(--g2)">${gn||'—'}</td></tr>`;
  }).join('');
  const triTotals=[1,2,3,4,5,6].map(t=>{const s=new Set();acts.forEach(a=>counts[a][t].forEach(b=>s.add(b)));return s.size;});
  document.getElementById('uniq-foot').innerHTML=`<tr style="background:var(--ng);border-top:2px solid var(--or)">
    <td style="padding:8px 12px;font-weight:700;font-size:12px;color:var(--or);font-family:var(--mo)">▸ TOTAL GLOBAL</td>
    ${triTotals.map(n=>`<td style="text-align:center;font-weight:700;font-family:var(--mo);color:var(--or);padding:8px 10px">${n||'—'}</td>`).join('')}
    <td style="text-align:center;font-weight:700;font-family:var(--mo);color:#fff;background:var(--or);padding:8px 10px">${globalBens.size||'—'}</td>
  </tr>`;
}
function expUnicosXLSX(){
  const tipo=document.getElementById('uniq-tipo').value||'G';
  const genFil=document.getElementById('uniq-gen').value;
  const acts=tipo==='G'?ACTS_G:ACTS_CA;
  const bensTipo=bens.filter(b=>(b.tipo===tipo||(tipo==='G'&&b.tipo==='Facilitadores'))&&(!genFil||b.gen===genFil));
  const benIdSet=new Set(bensTipo.map(b=>b.id));
  const firstTri={};
  asis.forEach(a=>{
    const b=getBen(a.benId);if(!b||!benIdSet.has(b.id))return;
    const tri=MES_TRI[a.mes];if(!tri)return;
    Object.entries(a.acts||{}).forEach(([act,val])=>{if(+val>0){const k=b.id+'|'+act;if(!firstTri[k]||tri<firstTri[k])firstTri[k]=tri;}});
  });
  const counts={};
  acts.forEach(a=>{counts[a]={1:new Set(),2:new Set(),3:new Set(),4:new Set(),5:new Set(),6:new Set()};;});
  Object.entries(firstTri).forEach(([k,tri])=>{const[benId,act]=k.split('|');if(counts[act])counts[act][tri].add(benId);});
  const rows=[['Actividad','T1','T2','T3','T4','T5','T6','GLOBAL']];
  acts.forEach(a=>{
    const c=counts[a];
    const g=new Set(Object.keys(firstTri).filter(k=>k.split('|')[1]===a).map(k=>k.split('|')[0])).size;
    rows.push([a,c[1].size,c[2].size,c[3].size,c[4].size,c[5].size,c[6].size,g]);
  });
  const ws=XLSX.utils.aoa_to_sheet(rows);const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,`Únicos ${tipo}`);
  XLSX.writeFile(wb,`unicos_${tipo}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ═══ RESUMEN DE ASISTENCIAS ═══════════════════════
function renderResumen(){
  const triFilter=document.getElementById('res-tri').value;
  const progFilter=document.getElementById('res-prog').value;
  // Filter bens
  let filtBens=bens;
  if(progFilter==='G') filtBens=bens.filter(b=>b.tipo==='G'||b.tipo==='Facilitadores');
  else if(progFilter==='CA') filtBens=bens.filter(b=>b.tipo==='CA');
  // Filter asis
  let filtAsis=asis;
  if(triFilter){const t=+triFilter;filtAsis=asis.filter(a=>MES_TRI[a.mes]===t);}
  // Build act -> gen -> Set<benId>
  const actGenBens={};
  filtAsis.forEach(a=>{
    const b=getBen(a.benId);
    if(!b)return;
    if(progFilter==='G'&&b.tipo==='CA')return;
    if(progFilter==='CA'&&b.tipo!=='CA')return;
    const gen=b.gen;
    Object.entries(a.acts||{}).forEach(([act,val])=>{
      if(+val>0){
        if(!actGenBens[act])actGenBens[act]={};
        if(!actGenBens[act][gen])actGenBens[act][gen]=new Set();
        actGenBens[act][gen].add(b.id);
      }
    });
  });
  const genSet=new Set(filtBens.map(b=>b.gen));
  const gens=GEN_ORDER.filter(g=>genSet.has(g));
  const acts=ACTS_ALL_32.filter(a=>actGenBens[a]);
  Object.keys(actGenBens).forEach(a=>{if(!ACTS_ALL_32.includes(a)&&!acts.includes(a))acts.push(a);});
  document.getElementById('res-head').innerHTML=`<tr>
    <th style="min-width:240px;position:sticky;left:0;z-index:3;background:var(--ng)">Actividad</th>
    ${gens.map(g=>`<th style="text-align:center;background:var(--ng);min-width:80px"><span style="background:${GEN_BG[g]||'#eee'};color:${GEN_COLOR[g]||'#333'};padding:2px 8px;border-radius:100px;font-size:10px;font-weight:700">${g}</span></th>`).join('')}
    <th style="text-align:center;background:var(--ng2);color:var(--or);min-width:70px">TOTAL</th>
  </tr>`;
  if(!acts.length){
    document.getElementById('res-body').innerHTML='<tr><td colspan="99" style="text-align:center;padding:3rem;color:var(--t3)">Sin datos para los filtros seleccionados</td></tr>';
    document.getElementById('res-foot').innerHTML='';return;
  }
  const colTotals=Object.fromEntries(gens.map(g=>[g,new Set()]));
  const globalTotal=new Set();
  document.getElementById('res-body').innerHTML=acts.map((act,idx)=>{
    const rowBg=idx%2===0?'#fff':'#fafafa';
    const genData=actGenBens[act]||{};
    const rowTotal=new Set(Object.values(genData).flatMap(s=>[...s]));
    gens.forEach(g=>{(genData[g]||new Set()).forEach(b=>colTotals[g].add(b));});
    rowTotal.forEach(b=>globalTotal.add(b));
    const cells=gens.map(g=>{
      const n=(genData[g]||new Set()).size;
      return n>0?`<td style="text-align:center;padding:7px 10px;border-bottom:1px solid var(--g2)"><span style="background:${GEN_BG[g]||'#eee'};color:${GEN_COLOR[g]||'#333'};border-radius:6px;padding:2px 8px;font-weight:700;font-family:var(--mo);font-size:12px">${n}</span></td>`:
        `<td style="text-align:center;padding:7px 10px;border-bottom:1px solid var(--g2);color:var(--t3)">—</td>`;
    }).join('');
    return`<tr style="background:${rowBg}"><td style="padding:7px 12px;font-size:11.5px;font-weight:500;border-bottom:1px solid var(--g2);position:sticky;left:0;background:${rowBg};z-index:1">${act}</td>${cells}<td style="text-align:center;padding:7px 10px;border-bottom:1px solid var(--g2);font-weight:700;font-family:var(--mo);color:var(--rjd);background:var(--rjl)">${rowTotal.size||'—'}</td></tr>`;
  }).join('');
  document.getElementById('res-foot').innerHTML=`<tr style="background:var(--ng);border-top:2px solid var(--or)">
    <td style="padding:8px 12px;font-weight:700;color:var(--or);font-family:var(--mo);position:sticky;left:0;background:var(--ng);z-index:1">▸ TOTAL BENEFICIARIOS</td>
    ${gens.map(g=>`<td style="text-align:center;padding:8px 10px;font-weight:700;font-family:var(--mo);color:${GEN_COLOR[g]||'#fff'}">${colTotals[g].size||'—'}</td>`).join('')}
    <td style="text-align:center;padding:8px 10px;font-weight:700;font-family:var(--mo);color:#fff;background:var(--or)">${globalTotal.size||'—'}</td>
  </tr>`;
}
function expResumenXLSX(){
  const triFilter=document.getElementById('res-tri').value;
  const progFilter=document.getElementById('res-prog').value;
  let filtBens=bens;
  if(progFilter==='G') filtBens=bens.filter(b=>b.tipo==='G'||b.tipo==='Facilitadores');
  else if(progFilter==='CA') filtBens=bens.filter(b=>b.tipo==='CA');
  let filtAsis=asis;
  if(triFilter){const t=+triFilter;filtAsis=asis.filter(a=>MES_TRI[a.mes]===t);}
  const actGenBens={};
  filtAsis.forEach(a=>{
    const b=getBen(a.benId);
    if(!b)return;
    if(progFilter==='G'&&b.tipo==='CA')return;
    if(progFilter==='CA'&&b.tipo!=='CA')return;
    Object.entries(a.acts||{}).forEach(([act,val])=>{
      if(+val>0){
        if(!actGenBens[act])actGenBens[act]={};
        if(!actGenBens[act][b.gen])actGenBens[act][b.gen]=new Set();
        actGenBens[act][b.gen].add(b.id);
      }
    });
  });
  const genSet=new Set(filtBens.map(b=>b.gen));
  const gens=GEN_ORDER.filter(g=>genSet.has(g));
  const acts=ACTS_ALL_32.filter(a=>actGenBens[a]);
  const triLabel=triFilter?['','T1','T2','T3','T4','T5','T6'][+triFilter]:'Todo';
  const rows1=[['Actividad',...gens,'TOTAL']];
  acts.forEach(act=>{
    const gd=actGenBens[act]||{};
    const tot=new Set(Object.values(gd).flatMap(s=>[...s])).size;
    rows1.push([act,...gens.map(g=>(gd[g]||new Set()).size||''),tot||'']);
  });
  const colT=gens.map(g=>new Set(acts.flatMap(a=>[...(actGenBens[a]?.[g]||[])])).size);
  const grand=new Set(acts.flatMap(a=>Object.values(actGenBens[a]||{}).flatMap(s=>[...s]))).size;
  rows1.push(['TOTAL',...colT,grand]);
  const rows2=[['Folio','Nombre','A. Paterno','A. Materno','Tipo','Gen','Centro',...acts]];
  filtBens.sort((a,b)=>parseInt(a.folio)-parseInt(b.folio)).forEach(b=>{
    const bAsis=filtAsis.filter(a=>{const bn=getBen(a.benId);return bn&&bn.id===b.id;});
    const atot={};bAsis.forEach(a=>Object.entries(a.acts||{}).forEach(([act,val])=>{if(+val>0)atot[act]=(atot[act]||0)+(+val);}));
    if(!Object.values(atot).some(v=>v>0))return;
    rows2.push([b.folio,b.nombre,b.apat,b.amat,b.tipo,b.gen,b.centro,...acts.map(a=>atot[a]||'')]);
  });
  const wb=XLSX.utils.book_new();
  const ws1=XLSX.utils.aoa_to_sheet(rows1);ws1['!cols']=[{wch:35},...gens.map(()=>({wch:12})),{wch:10}];
  const ws2=XLSX.utils.aoa_to_sheet(rows2);ws2['!cols']=[{wch:7},{wch:20},{wch:14},{wch:14},{wch:14},{wch:8},{wch:22},...acts.map(()=>({wch:10}))];
  XLSX.utils.book_append_sheet(wb,ws1,'Resumen');
  XLSX.utils.book_append_sheet(wb,ws2,'Detalle por beneficiario');
  XLSX.writeFile(wb,`resumen_${triLabel}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ═══ CRONOGRAMA ═══════════════════════════════════
function renderCrono(){
  const genFil=document.getElementById('cro-gen').value;
  const mesFil=document.getElementById('cro-mes').value;
  const gens=genFil?[genFil]:['G28','G29','G30','G31','G32','CA5','CA6'];
  const mesArr=mesFil?[mesFil]:MESES;
  let html='';
  gens.forEach(gen=>{
    const gs=MONTH_SCHED[gen];if(!gs)return;
    const col=GEN_COLOR[gen]||'#555',bg=GEN_BG[gen]||'#f9f9f9';
    const meses=mesArr.filter(m=>gs[m]&&gs[m].length>0);if(!meses.length)return;
    html+=`<div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:.75rem">
      <div style="background:var(--ng);padding:10px 16px;display:flex;align-items:center;gap:10px;border-bottom:2px solid ${col}">
        <span style="font-weight:700;font-size:13px;font-family:var(--mo);color:${col};background:rgba(255,255,255,.1);padding:3px 10px;border-radius:100px">${gen}</span>
        <span style="font-size:11px;color:rgba(255,255,255,.45)">${meses.length} mes${meses.length!==1?'es':''} con actividades</span>
      </div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11.5px">
        <thead><tr>
          <th style="background:#2a2a2a;color:rgba(255,255,255,.7);padding:7px 12px;text-align:left;font-size:10px;text-transform:uppercase;border-right:1px solid rgba(255,255,255,.1)">Mes</th>
          <th style="background:#2a2a2a;color:rgba(255,255,255,.7);padding:7px 12px;text-align:center;font-size:10px;text-transform:uppercase;width:40px;border-right:1px solid rgba(255,255,255,.1)">Tri</th>
          <th style="background:#2a2a2a;color:rgba(255,255,255,.7);padding:7px 12px;text-align:left;font-size:10px;text-transform:uppercase">Actividades programadas</th>
        </tr></thead><tbody>`;
    meses.forEach((mes,idx)=>{
      const acts=gs[mes]||[];const tri='T'+(MES_TRI[mes]||'?');
      const chips=acts.map(a=>`<span style="display:inline-flex;align-items:center;background:${bg};color:${col};border:1px solid ${col}40;border-radius:100px;padding:2px 9px;font-size:10.5px;font-weight:500;margin:2px">${a}</span>`).join('');
      html+=`<tr style="border-bottom:1px solid #f0f0f0;background:${idx%2===0?'#fff':'#fafafa'}">
        <td style="padding:8px 12px;font-weight:600;white-space:nowrap;border-right:1px solid #f0f0f0">${mes}</td>
        <td style="padding:8px 12px;text-align:center;font-family:var(--mo);font-size:11px;font-weight:700;color:${col};border-right:1px solid #f0f0f0">${tri}</td>
        <td style="padding:6px 12px">${chips}</td>
      </tr>`;
    });
    html+=`</tbody></table></div></div>`;
  });
  document.getElementById('crono-body').innerHTML=html||'<div class="es"><div class="es-i">📋</div><div>Sin actividades para los filtros seleccionados</div></div>';
}

// ═══ PERIODOS ═════════════════════════════════════
function renderPerI(){
  document.getElementById('per-tri').innerHTML='<option value="">Todos</option>'+PERIODOS.map(p=>`<option value="${p.t}">T${p.t} — ${p.per}</option>`).join('');
  const gens=[...new Set(PERIODOS.flatMap(p=>p.rows.map(r=>r.gen)))].sort();
  document.getElementById('per-gen').innerHTML='<option value="">Todas</option>'+gens.map(g=>`<option>${g}</option>`).join('');
  renderPer();
}
function renderPer(){
  const tri=document.getElementById('per-tri').value,gen=document.getElementById('per-gen').value;
  document.getElementById('per-body').innerHTML=(tri?PERIODOS.filter(p=>p.t==tri):PERIODOS).map(p=>{
    const rows=p.rows.filter(r=>!gen||r.gen===gen);if(!rows.length)return'';
    return`<div class="card" style="margin-bottom:.75rem">
      <div style="background:var(--ng);color:#fff;padding:9px 14px;display:flex;align-items:center;font-size:12px;font-weight:700;border-left:4px solid var(--rj)">
        <span style="color:var(--or)">T${p.t}</span>&nbsp;— ${p.per}
        <span style="margin-left:auto;font-size:10px;color:var(--or);font-family:var(--mo)">Rev: ${p.rev} · Ent: ${p.ent}</span>
      </div>
      <div class="tw"><table><thead><tr><th>Gen</th><th>Actividad</th><th>MV Asistencia</th><th>MV Foto 1</th><th>MV Foto 2</th><th>MV Producto</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td><span class="badge ${bgGen(r.gen)}">${r.gen}</span></td><td style="font-size:11.5px">${r.act}</td><td style="font-size:11px;color:var(--t2)">${r.mv1||'—'}</td><td style="font-size:11px;color:var(--t2)">${r.mv2||'—'}</td><td style="font-size:11px;color:var(--t2)">${r.mv3||'—'}</td><td style="font-size:11px;color:var(--t2)">${r.mv4||'—'}</td></tr>`).join('')}</tbody></table></div></div>`;
  }).join('');
}

// ═══ REPORTES ═════════════════════════════════════
function renderRepI(){
  const centros=[...new Set(bens.map(b=>b.centro))].filter(Boolean).sort();
  const gens=[...new Set(bens.map(b=>b.gen))].filter(Boolean).sort();
  document.getElementById('rep-cen').innerHTML='<option value="">Todos</option>'+centros.map(c=>`<option>${c}</option>`).join('');
  document.getElementById('rep-gen').innerHTML='<option value="">Todas</option>'+gens.map(g=>`<option>${g}</option>`).join('');
  const act=bens.filter(b=>!b.baja);
  document.getElementById('sr-rep').innerHTML=`
    <div class="sc"><div class="sc-l">Total</div><div class="sc-v">${bens.length}</div></div>
    <div class="sc"><div class="sc-l">Activos</div><div class="sc-v">${act.length}</div></div>
    <div class="sc or"><div class="sc-l">Bajas</div><div class="sc-v">${bens.filter(b=>b.baja).length}</div></div>
    <div class="sc dk"><div class="sc-l">Retención</div><div class="sc-v">${bens.length?Math.round(act.length/bens.length*100):0}%</div></div>`;
  const sx={};act.forEach(b=>{sx[b.sexo||'NE']=(sx[b.sexo||'NE']||0)+1;});
  document.getElementById('rep-sexo').innerHTML=Object.entries(sx).map(([s,n])=>`<div class="bar-row"><span style="font-size:12px">${s}</span><div class="bar-w"><div class="bar-f" style="width:${Math.round(n/act.length*100)}%"></div></div><span style="font-family:var(--mo);font-size:12px;font-weight:700;color:var(--rj)">${n}</span></div>`).join('');
  renderRepBajas();renderRepCentro();
}
function renderRepBajas(){
  const cen=document.getElementById('rep-cen').value,gen=document.getElementById('rep-gen').value;
  const bajas=bens.filter(b=>b.baja&&(!cen||b.centro===cen)&&(!gen||b.gen===gen));
  document.getElementById('rep-baj-t').textContent=`Bajas (${bajas.length})`;
  const body=document.getElementById('rep-baj-body'),empty=document.getElementById('rep-baj-empty');
  if(!bajas.length){body.innerHTML='';empty.style.display='';return;}empty.style.display='none';
  body.innerHTML=bajas.map(b=>{
    const ses=asis.filter(a=>a.benId===b.id).reduce((s,a)=>s+Object.values(a.acts||{}).reduce((x,v)=>x+(+v||0),0),0);
    return`<tr><td style="font-family:var(--mo);font-size:11px">${b.folio}</td><td style="font-weight:600">${b.nombre} ${b.apat}</td><td><span class="badge ${tipoBadge(b.tipo)}">${b.tipo}</span></td><td style="font-size:11px">${b.centro}</td><td><span class="badge ${bgGen(b.gen)}">${b.gen}</span></td><td style="font-size:11px;color:var(--rj)">${b.fechaBaja||'—'}</td><td style="font-size:11px">${b.motivoBaja||'—'}</td><td style="text-align:center;font-family:var(--mo);font-weight:700">${ses}</td></tr>`;
  }).join('');
}
function renderRepCentro(){
  const cm={};
  bens.forEach(b=>{const k=b.centro+'|'+b.gen;if(!cm[k])cm[k]={c:b.centro,g:b.gen,a:0,bj:0,s:0};b.baja?cm[k].bj++:cm[k].a++;});
  asis.forEach(a=>{const b=getBen(a.benId);if(!b)return;const k=b.centro+'|'+b.gen;if(cm[k])cm[k].s+=Object.values(a.acts||{}).reduce((s,v)=>s+(+v||0),0);});
  document.getElementById('rep-cen-body').innerHTML=Object.values(cm).sort((a,b)=>b.a-a.a).map(r=>`<tr><td style="font-size:11.5px">${r.c||'—'}</td><td><span class="badge ${bgGen(r.g)}">${r.g}</span></td><td style="text-align:center;font-weight:700;color:var(--rj)">${r.a}</td><td style="text-align:center;color:var(--t3)">${r.bj}</td><td style="text-align:center;font-family:var(--mo)">${r.s}</td><td style="text-align:center;font-family:var(--mo)">${r.a?Math.round(r.s/r.a):0}</td></tr>`).join('');
}

// ═══ EXPORTS ══════════════════════════════════════
function expBenXLSX(){
  const data=[...bens].sort((a,b)=>parseInt(a.folio)-parseInt(b.folio)).map(b=>({'Folio':b.folio,'Tipo':b.tipo,'Generación':b.gen,'Centro':b.centro,'Nombre':b.nombre,'A. Paterno':b.apat,'A. Materno':b.amat,'Edad':b.edad,'Sexo':b.sexo,'Municipio':b.municipio,'Colonia':b.colonia,'Estatus':b.baja?'Baja':'Activo','Fecha Alta':b.fechaAlta||'','Fecha Baja':b.fechaBaja||'','Motivo':b.motivoBaja||''}));
  const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Beneficiarios');
  XLSX.writeFile(wb,`beneficiarios_${new Date().toISOString().slice(0,10)}.xlsx`);
}
function expAsiXLSX(){
  const wb=XLSX.utils.book_new();
  [['G',ACTS_G],['CA',ACTS_CA]].forEach(([tipo,acts])=>{
    const bl=[...bens.filter(b=>b.tipo===tipo||(tipo==='G'&&b.tipo==='Facilitadores'))].sort((a,b)=>parseInt(a.folio)-parseInt(b.folio));
    if(!bl.length)return;
    const r0=Array(10).fill('');MESES.forEach(m=>{r0.push(m);for(let i=1;i<acts.length;i++)r0.push('');});
    const r1=['Folio','Generación','Centro','Nombre','A. Paterno','A. Materno','Edad','Sexo','Municipio','Colonia'];
    MESES.forEach(()=>acts.forEach(a=>r1.push(a)));
    const rows=[r0,r1];
    bl.forEach(b=>{
      const r=[b.folio,b.gen,b.centro,b.nombre,b.apat,b.amat,b.edad,b.sexo,b.municipio,b.colonia];
      MESES.forEach(mes=>{const a=asis.find(x=>{const bn=getBen(x.benId);return bn&&bn.id===b.id&&x.mes===mes;});acts.forEach(act=>r.push(a&&a.acts[act]?a.acts[act]:''));});
      rows.push(r);
    });
    const ws=XLSX.utils.aoa_to_sheet(rows);
    ws['!merges']=[];MESES.forEach((m,mi)=>{const cs=10+mi*acts.length;ws['!merges'].push({s:{r:0,c:cs},e:{r:0,c:cs+acts.length-1}});});
    XLSX.utils.book_append_sheet(wb,ws,tipo==='CA'?'Base CA':'Base G');
  });
  XLSX.writeFile(wb,`asistencias_${new Date().toISOString().slice(0,10)}.xlsx`);
}
function expRepXLSX(){
  const cen=document.getElementById('rep-cen').value,gen=document.getElementById('rep-gen').value;
  const data=bens.filter(b=>b.baja&&(!cen||b.centro===cen)&&(!gen||b.gen===gen)).map(b=>{
    const ses=asis.filter(a=>a.benId===b.id).reduce((s,a)=>s+Object.values(a.acts||{}).reduce((x,v)=>x+(+v||0),0),0);
    return{'Folio':b.folio,'Nombre':b.nombre,'A. Paterno':b.apat,'Tipo':b.tipo,'Centro':b.centro,'Gen':b.gen,'Fecha Baja':b.fechaBaja||'','Motivo':b.motivoBaja||'','Sesiones':ses};
  });
  if(!data.length){alert('Sin bajas.');return;}
  const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Bajas');
  XLSX.writeFile(wb,`bajas_${new Date().toISOString().slice(0,10)}.xlsx`);
}

init();
