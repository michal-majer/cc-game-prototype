/* =========================================================================
   FRONT — HUD (DOM overlay). Wszystkie odczyty stanu → do #elementów.
   Pasek budowy, suwak linii, karty, dziennik, overlaye końca gry.
   ========================================================================= */

import {
  CO, B, U, BAR, STANCES, TERR_MAX, WAVE_TIME, ORE_SIP, BAS_HP, EPATIENCE, EPAT_MASS
} from './config.js';
import { S, say } from './state.js';
import { isMuted } from './audio.js';
import { incomeRate, oreBreak, oreTotal, seamsAlive, seamsTapped } from './economy.js';
import { terrIncome } from './sectors.js';
import { radarLvl, unlocked, reqText, canUp, upCost, upText } from './buildings.js';
import { eComp, eRatio } from './enemy.js';
import { takeCard } from './cards.js';
import { setStance } from './sim.js';

const qs = id => document.getElementById(id);
const KCOL = {WOJSKO:CO.blue, RUDA:CO.ore, KRATKI:CO.ok, 'WRÓG':CO.red, WROG:CO.red};
let logShown='', compShown='';

/* --------------------------- pasek budowy -------------------------------- */
export function buildBar(){
  const bar=qs('buildbar'); bar.innerHTML='';
  for (const t of BAR){
    const el=document.createElement('div'); el.className='tile'; el.dataset.type=t;
    el.innerHTML=`<span class="ico"></span><span class="nm"></span><span class="fp"></span>`+
                 `<span class="cost"></span><span class="desc"></span>`;
    el.addEventListener('click', ()=>onBuildTile(t));
    bar.appendChild(el);
  }
  const sell=document.createElement('div'); sell.className='tile sell'; sell.dataset.type='SELL';
  sell.innerHTML=`<span class="ico">✂</span><span class="nm">ROZBIÓRKA</span>`+
                 `<span class="cost warn">zwrot 50%</span><span class="desc">obiekty 50% · żyły 40%</span>`;
  sell.addEventListener('click', ()=>{ S.sel = S.sel==='SELL'?null:'SELL'; S.upSel=null; });
  bar.appendChild(sell);
}
function updateBar(){
  const bar=qs('buildbar');
  for (const el of bar.children){
    const t=el.dataset.type;
    if (t==='SELL'){ el.classList.toggle('on', S.sel==='SELL'); continue; }
    const d=B[t], lock=!unlocked(t), afford=S.money>=d.cost;
    el.classList.toggle('lock', lock);
    el.classList.toggle('poor', !lock && !afford);
    el.classList.toggle('on', S.sel===t);
    el.style.borderColor = S.sel===t ? d.col : '';
    el.querySelector('.ico').textContent = lock?'▪':d.ico;
    el.querySelector('.ico').style.color = lock?'#2b3538':d.col;
    el.querySelector('.nm').textContent = d.name;
    el.querySelector('.nm').style.color = lock?'#46555a':(afford?CO.txt:CO.dim);
    el.querySelector('.fp').textContent = d.fp[0]+'×'+d.fp[1];
    const costEl=el.querySelector('.cost'), descEl=el.querySelector('.desc');
    if (lock){ costEl.textContent='wymaga: '+reqText(t); costEl.style.color='#3d4b4f'; descEl.textContent=''; }
    else {
      const extra = d.sup?' · +'+d.sup+' mocy' : (d.drn?' · −'+d.drn+' mocy':'');
      costEl.textContent = d.cost+' kr.'+extra;
      costEl.style.color = afford?CO.warn:'#5a6467';
      let sub=d.desc||''; if (d.unit) sub='co falę: '+(d.count||1)+'× '+U[d.unit].name;
      descEl.textContent=sub;
    }
  }
}
function onBuildTile(t){
  if (!unlocked(t)){ say('WYMAGA: '+reqText(t).toUpperCase(),'warn'); toast('WYMAGA: '+reqText(t)); return; }
  S.sel = S.sel===t ? null : t; S.upSel=null;
}

/* --------------------------- suwak linii --------------------------------- */
export function buildStanceSlider(){
  const s=qs('stance-slider'); s.innerHTML='';
  STANCES.forEach((st,i)=>{
    const el=document.createElement('div'); el.className='seg';
    el.innerHTML=`<span class="sn">${st.n}</span><span class="sd"></span>`;
    el.addEventListener('click', ()=>setStance(i));
    s.appendChild(el);
  });
}
function updateStanceSlider(){
  const s=qs('stance-slider');
  [...s.children].forEach((el,i)=>{
    const on=i===S.si, push=i===STANCES.length-1;
    el.classList.toggle('on', on);
    el.classList.toggle('push', push);
    el.querySelector('.sd').textContent = on ? STANCES[i].d : '';
  });
}

/* ------------------------------- karty ----------------------------------- */
export function renderCards(){
  const row=qs('cards-row'); row.innerHTML='';
  qs('cards-title').textContent=S.draftT;
  qs('cards-sub').textContent=S.draftS;
  (S.draft||[]).forEach((c,i)=>{
    const col=KCOL[c.k]||CO.txt;
    const el=document.createElement('div'); el.className='card';
    el.style.borderTopColor=col;
    el.innerHTML=`<div class="k" style="color:${col}">${c.k}</div>`+
                 `<div class="n">${c.n}</div><div class="d">${c.d}</div>`+
                 `<div class="num">[${i+1}]</div>`;
    el.addEventListener('click', ()=>takeCard(c));
    row.appendChild(el);
  });
  syncOverlays();
}
export function syncOverlays(){
  qs('cards').classList.toggle('hidden', S.state!=='draft');
  const over = (S.state==='win'||S.state==='over');
  qs('end').classList.toggle('hidden', !over);
  if (over){
    const win=S.state==='win';
    const t=qs('end-title'); t.textContent=win?'ZWYCIĘSTWO':'PRZEGRANA'; t.className=win?'win':'lose';
    qs('end-reason').textContent=S.endReason;
    qs('end-stats').textContent=S.doc.name+' · fala '+S.wave+' · bastion '+Math.max(0,Math.round(S.bastion.hp))+'/'+BAS_HP+' · rekord: fala '+S.best;
  }
  qs('ready').classList.toggle('hidden', !(S.state==='play' && !S.ready));
}

/* ------------------------------- toast / log ----------------------------- */
export function toast(msg){
  const box=qs('toasts');
  const el=document.createElement('div'); el.className='toast'; el.textContent=msg;
  box.appendChild(el);
  setTimeout(()=>el.remove(), 2400);
  while (box.children.length>3) box.firstChild.remove();
}
function updateLog(){
  const el=qs('log');
  const html = S.log.map((l,i)=>{
    const age=S.log.length-1-i;
    const K={info:CO.crt, good:CO.ok, warn:CO.warn, bad:CO.red, intel:CO.intel};
    const alpha=Math.max(0.3,1-age*0.13);
    const full=l.txt+(l.n>1?' ×'+l.n:'');
    return `<div class="ln" style="color:${K[l.kind]||CO.crt};opacity:${alpha}">&gt;&gt; ${full}</div>`;
  }).join('');
  if (html!==logShown){ el.innerHTML=html; logShown=html; }
}

/* ------------------------------- pełny HUD ------------------------------- */
export function updateHUD(){
  // kredyty
  const ir=incomeRate(), ti=terrIncome();
  qs('cr').textContent=Math.floor(S.money);
  qs('cr-rate').textContent='+'+Math.round(ir+ti)+'/s';
  const lost=TERR_MAX-ti;
  qs('cr-break').textContent='ruda '+Math.round(ir)+' · teren '+Math.round(ti)+(lost>2?' ▼'+Math.round(lost):'');
  // moc
  const over=S.offBrown>0;
  qs('pw').textContent=S.drain+' / '+S.supply;
  qs('pw').style.color = over?CO.bad:CO.power;
  qs('pw-lbl').style.color = over?CO.bad:CO.dim;
  qs('pw-bar').style.width=(S.supply?Math.min(1,S.drain/S.supply)*100:0)+'%';
  qs('pw-bar').style.background = over?CO.bad:CO.power;
  qs('pw-note').textContent = over?(S.offBrown+' WYŁĄCZONE'):'';
  // ruda
  const ob=oreBreak(), ot=oreTotal(), of=S.oreStart?ot/S.oreStart:0, dry=of<0.25&&ob.rich>0;
  qs('ore').textContent=Math.floor(ot);
  qs('ore').style.color = dry?CO.bad:CO.ore;
  qs('ore-bar').style.width=(Math.min(1,of)*100)+'%';   // odrost może przebić start — nie przelewaj paska
  qs('ore-bar').style.background = dry?CO.bad:CO.ore;
  let note='', ncol=CO.dim;
  if (seamsAlive()===0){ note='POLE MARTWE — NIC NIE ODROŚNIE'; ncol=CO.bad; }
  else if (seamsTapped()===0){ note='◄ RUDA LEŻY — PRZENIEŚ RAFINERIĘ'; ncol=CO.bad; }
  else if (ob.rich>0){ const net=ob.richRate-ob.rich*ORE_SIP;
    if (net<=0.5){ note='złoża się utrzymują — odrost nadąża'; ncol=CO.ok; }
    else { note='złoża na '+Math.ceil(ot/net/WAVE_TIME)+' fal'; ncol=CO.dim; } }
  else { note='SĄCZEK +'+ob.sipRate.toFixed(1)+'/s — BEZ KOŃCA'; ncol=CO.ok; }
  qs('ore-note').textContent=note; qs('ore-note').style.color=ncol;
  // fala
  qs('wave').textContent=S.wave;
  qs('timer').textContent='kontakt 0:'+String(Math.max(0,Math.ceil(S.timer))).padStart(2,'0');
  qs('timer').style.color = S.timer<5?CO.bad:CO.dim;
  qs('ebase').textContent='ich baza: '+S.eBase.length+' ob.';

  // wywiad
  const radar=radarLvl()>=2, comp=eComp();
  qs('intel-title').textContent = radar ? '▌ WYWIAD — '+S.doc.name+' · FALA '+(S.wave+1)
    : '▌ BEZ RADARU — POZNASZ ICH W ZWARCIU · '+S.doc.name;
  qs('intel-title').style.color = radar?CO.intel:CO.bad;
  const compEl=qs('intel-comp');
  let compHTML;
  if (radar){
    const ks=Object.keys(comp);
    compHTML = ks.length ? ks.map(k=>`<span class="u">${U[k].name} ×${comp[k]}</span>`).join('') : '—';
  } else compHTML = '<span style="color:#4a2f2f">∿∿∿ sygnał nierozpoznany ∿∿∿</span>';
  if (compHTML!==compShown){ compEl.innerHTML=compHTML; compShown=compHTML; }
  qs('intel-hint').textContent='⚑ '+S.doc.hint;
  const eN=S.units.filter(u=>u.side==='e').length, r=eRatio();
  const intent=qs('intel-intent');
  if (!radar){ intent.textContent='ICH ZAMIARY: ?'; intent.style.color='#4a2f2f'; }
  else if (S.eStance==='push'){ intent.textContent='▲ SZTURM — IDĄ · '+eN+' · ×'+r.toFixed(2); intent.style.color=CO.bad; }
  else if (eN<6 && !S.bastion.dead){ intent.textContent='▶ OKNO — ICH STRONA PUSTA · NACIERAJ'; intent.style.color=CO.ok; }
  else if (r<0.75 && !S.bastion.dead){ intent.textContent='▶ PRZEWAGA ×'+(1/r).toFixed(1)+' — NACIERAJ'; intent.style.color=CO.ok; }
  else { const pat=EPATIENCE*Math.max(0.25,1-eN/EPAT_MASS);
    intent.textContent='masują '+eN+' · ×'+r.toFixed(2)+' · RUSZAJĄ ZA '+Math.max(0,Math.ceil(pat-S.eHoldT))+' s';
    intent.style.color=S.eHoldT>pat*0.6?CO.warn:CO.dim; }
  // bieżące ulepszenia Twojej armii (karty)
  const pb=S.pBonus;
  qs('intel-army').textContent = (pb.atkS||pb.armS||pb.atkA||pb.armA)
    ? '▐ TWOI — żołnierze ⚔+'+pb.atkS+' ⛊+'+pb.armS+'  ·  opancerzeni ⚔+'+pb.atkA+' ⛊+'+pb.armA : '';

  // kontrolki
  const push=S.si===STANCES.length-1, sb=qs('stance-btn');
  sb.textContent=(push?'▶▶ ':'▮▮ ')+STANCES[S.si].n;
  sb.classList.toggle('push', push);
  qs('speed-btn').textContent='» '+S.speed+'×';
  qs('speed-btn').classList.toggle('on', S.speed>1);
  const armed=S.newArm>0;
  qs('new-btn').textContent=armed?'PEWNO?':'⟲ NOWA';
  qs('new-btn').classList.toggle('on', armed);
  qs('mute-btn').textContent=isMuted()?'♪ ✕':'♪ WŁ.';

  updateBar();
  updateStanceSlider();
  updateLog();
  updateUpgradePanel();
}

/* ---- panel ulepszenia budynku (po tapnięciu; koszt + efekt kolejnego poziomu) ---- */
function updateUpgradePanel(){
  const el=qs('upgrade');
  const b = (S.state==='play' && !S.sel && S.upSel && S.buildings.includes(S.upSel)) ? S.upSel : null;
  if (!b){ el.classList.add('hidden'); if (S.upSel && !S.buildings.includes(S.upSel)) S.upSel=null; return; }
  el.classList.remove('hidden');
  qs('up-name').textContent = B[b.type].name+' '+'I'.repeat(b.lvl);
  const can = canUp(b), btn=qs('up-btn');
  if (can){
    const cost=upCost(b), afford=S.money>=cost;
    qs('up-eff').textContent = '▲ '+upText(b);
    qs('up-eff').style.color = CO.ok;
    btn.style.display=''; btn.textContent='ULEPSZ · '+cost+' kr';
    btn.classList.toggle('poor', !afford);
  } else {
    qs('up-eff').textContent = 'MAKS. POZIOM';
    qs('up-eff').style.color = CO.dim;
    btn.style.display='none';
  }
}
