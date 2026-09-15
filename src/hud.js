/* =========================================================================
   FRONT — HUD (DOM overlay). Wszystkie odczyty stanu → do #elementów.
   Pasek budowy, suwak linii, karty, dziennik, overlaye końca gry.
   ========================================================================= */

import {
  CO, B, U, BAR, STANCES, TERR_MAX, WAVE_TIME, ORE_SIP, EPATIENCE, EPAT_MASS
} from './config.js';
import { S, say, SECT } from './state.js';
import { isMuted } from './audio.js';
import { incomeRate, oreBreak, oreTotal, seamsAlive, seamsTapped } from './economy.js';
import { terrIncome } from './sectors.js';
import { radarLvl, unlocked, reqText, canUp, upCost, upText } from './buildings.js';
import { eComp, eRatio } from './enemy.js';
import { takeCard } from './cards.js';
import { setStance, setArmyLane } from './sim.js';
import { MIS, feat, isCampaign, goalText, goalNow, goalDone } from './campaign.js';
import { maxLanes, BASE_X, BASE_Y, BASE_R, CELL, COLS, ROWS, LANE_Y, LANE_HALF,
         fieldX1, CAP_R } from './config.js';
import { cam, viewport, panTo, fieldEnd } from './render.js';

const qs = id => document.getElementById(id);
const KCOL = {WOJSKO:CO.blue, RUDA:CO.ore, KRATKI:CO.ok, 'WRÓG':CO.red, WROG:CO.red};
let logShown='', compShown='';

/* --------------------------- pasek budowy -------------------------------- */
export function buildBar(){
  const bar=qs('buildbar'); bar.innerHTML='';
  // Pasek pokazuje TYLKO to, co misja odblokowała. Misja 1 ma na nim dwa budynki,
  // nie trzynaście — odblokowania rozłożone na całą kampanię (FRONT.md §4.5).
  const list = MIS().unlock ? BAR.filter(t => MIS().unlock.includes(t)) : BAR;
  for (const t of list){
    const el=document.createElement('div'); el.className='tile'; el.dataset.type=t;
    el.innerHTML=`<span class="ico"></span><span class="nm"></span><span class="fp"></span>`+
                 `<span class="cost"></span><span class="desc"></span>`;
    el.addEventListener('click', ()=>onBuildTile(t));
    bar.appendChild(el);
  }
  if (feat('sell')){
  const sell=document.createElement('div'); sell.className='tile sell'; sell.dataset.type='SELL';
  sell.innerHTML=`<span class="ico">✂</span><span class="nm">ROZBIÓRKA</span>`+
                 `<span class="cost warn">zwrot ≤50%</span><span class="desc">obiekty 50% wartości (wg HP) · żyły 40%</span>`;
  sell.addEventListener('click', ()=>{ S.sel = S.sel==='SELL'?null:'SELL'; S.upSel=null; });
  bar.appendChild(sell);
  }
  if (feat('repair')){
  const rep=document.createElement('div'); rep.className='tile repair'; rep.dataset.type='REPAIR';
  rep.innerHTML=`<span class="ico">✚</span><span class="nm">NAPRAWA</span>`+
                `<span class="cost warn">wg braków HP</span><span class="desc">przywraca pełne HP · drożej im większe uszkodzenie</span>`;
  rep.addEventListener('click', ()=>{ S.sel = S.sel==='REPAIR'?null:'REPAIR'; S.upSel=null; });
  bar.appendChild(rep);
  }
}
function updateBar(){
  const bar=qs('buildbar');
  for (const el of bar.children){
    const t=el.dataset.type;
    if (t==='SELL'){ el.classList.toggle('on', S.sel==='SELL'); continue; }
    if (t==='REPAIR'){ el.classList.toggle('on', S.sel==='REPAIR'); continue; }
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
  const n = feat('stance') || 0;
  s.classList.toggle('hidden', n < 2);
  STANCES.slice(0, Math.max(0,n)).forEach((st,i)=>{
    const el=document.createElement('div'); el.className='seg';
    el.innerHTML=`<span class="sn">${st.n}</span><span class="sd"></span>`;
    el.addEventListener('click', ()=>setStance(i));
    s.appendChild(el);
  });
}
function updateStanceSlider(){
  const s=qs('stance-slider');
  const n = s.children.length;
  [...s.children].forEach((el,i)=>{
    const on=i===S.si, push=i===n-1 && n===STANCES.length;
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
// elementy HUD-a, które w menu mają zniknąć razem z polem walki
const CHROME = ['topbar','intel','log','log-toggle','stance-slider','buildbar','objective','lanes','minimap'];
export function syncOverlays(){
  const inMenu = S.state==='menu';
  for (const id of CHROME){ const el=qs(id); if (el) el.classList.toggle('off', inMenu); }
  qs('cards').classList.toggle('hidden', S.state!=='draft');
  const over = (S.state==='win'||S.state==='over');
  // W kampanii ekran końca robi menu (OCENA SZTABU) — stary raport runu zostaje
  // grze dowolnej, gdzie mierzy warianty i eskalację.
  qs('end').classList.toggle('hidden', !over || isCampaign());
  if (over && !isCampaign()){
    const win=S.state==='win';
    const t=qs('end-title'); t.textContent=win?'ZWYCIĘSTWO':'PRZEGRANA'; t.className=win?'win':'lose';
    qs('end-reason').textContent=S.endReason;
    const mods = (S.run && S.run.mods.length) ? ' · '+S.run.mods.map(m=>m.name).join(' + ') : '';
    qs('end-stats').textContent=S.doc.name+mods;
    const rep=qs('end-report');
    if (rep) rep.innerHTML = (S.report||[]).map(l=>`<div class="rl">${l}</div>`).join('');
  }
  qs('ready').classList.toggle('hidden', !(S.state==='play' && !S.ready));
}

/* -------------------------------- MINIMAPA -------------------------------
   Mapa jest dużo większa od ekranu, więc gracz musi mieć CAŁOŚĆ na jednym
   pasku: gdzie stoi front, kto trzyma które mini-sztaby, gdzie jest jego baza
   i gdzie akurat patrzy kamera. Bez tego przewijanie jest zgadywaniem.

   Rysowane w 2D canvasie, nie w Pixi: minimapa należy do HUD-a, a HUD jest
   w DOM — dzięki temu nie wchodzi w kamerę świata ani w jej zoom.
   Klik / przeciągnięcie = przewiń tam (i zwolnij prowadzenie kamery).        */
let mmCv=null, mmCtx=null;
export function initMinimap(){
  mmCv = qs('minimap'); if (!mmCv) return;
  mmCtx = mmCv.getContext('2d');
  const jump = e => {
    const r = mmCv.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left)/r.width));
    panTo(mmX2world(f), LANE_Y);
  };
  let down=false;
  mmCv.addEventListener('pointerdown', e=>{ down=true; mmCv.setPointerCapture(e.pointerId); jump(e); });
  mmCv.addEventListener('pointermove', e=>{ if (down) jump(e); });
  mmCv.addEventListener('pointerup',   ()=>{ down=false; });
  mmCv.addEventListener('pointercancel',()=>{ down=false; });
}
// świat ↔ minimapa: pasek pokrywa BAZĘ i cały korytarz
const mmX0 = () => BASE_X - 20;
const mmX1 = () => fieldEnd();
const mmX2world = f => mmX0() + (mmX1()-mmX0())*f;

function drawMinimap(){
  if (!mmCtx) return;
  const el = mmCv;
  const wCss = el.clientWidth, hCss = el.clientHeight;
  if (!wCss || !hCss) return;
  const dpr = Math.min(2, window.devicePixelRatio||1);
  if (el.width !== Math.round(wCss*dpr) || el.height !== Math.round(hCss*dpr)){
    el.width = Math.round(wCss*dpr); el.height = Math.round(hCss*dpr);
  }
  const g = mmCtx;
  g.setTransform(dpr,0,0,dpr,0,0);
  g.clearRect(0,0,wCss,hCss);

  const x0=mmX0(), x1=mmX1(), sx = wCss/(x1-x0);
  const X = wx => (wx-x0)*sx;
  const midY = hCss/2;
  const hy = v => midY + v*(hCss*0.42)/Math.max(1,LANE_HALF);   // pion: korytarz na całą wysokość paska

  g.fillStyle='#070b0c'; g.fillRect(0,0,wCss,hCss);
  // korytarz — jaśniejszy od tła, inaczej pasek jest czarnym prostokątem
  g.fillStyle='#33423f';
  g.fillRect(X(BASE_R), hy(-LANE_HALF), X(fieldX1())-X(BASE_R), hy(LANE_HALF)-hy(-LANE_HALF));
  g.strokeStyle='#4b5f5c'; g.lineWidth=1;
  g.strokeRect(X(BASE_R)+0.5, hy(-LANE_HALF)+0.5, X(fieldX1())-X(BASE_R)-1, hy(LANE_HALF)-hy(-LANE_HALF)-1);
  // baza
  g.fillStyle='#3c5566';
  g.fillRect(X(BASE_X), hy(-LANE_HALF*0.7), Math.max(3, COLS*CELL*sx), hy(LANE_HALF*0.7)-hy(-LANE_HALF*0.7));
  // mini-sztaby: kolor = kto trzyma. Sektor TOROWY rysuje się w swoim torze,
  // inaczej trzy sektory środka zlewają się w jedną plamę.
  const nLanes = Math.max(1, maxLanes());
  for (const q of SECT){
    const lane = q.lane>=0;
    const cy = lane ? (-LANE_HALF + (2*LANE_HALF/nLanes)*(q.lane+0.5)) : 0;
    const hh = lane ? (LANE_HALF/nLanes)*0.8 : LANE_HALF*0.8;
    g.fillStyle = q.own===1 ? CO.warn : q.own===-1 ? CO.red : '#4a5a5e';
    g.fillRect(X(q.x)-Math.max(1.5,CAP_R*sx/2), hy(cy-hh), Math.max(3,CAP_R*sx), hy(cy+hh)-hy(cy-hh));
  }
  // przyczółek / bastion wroga
  if (S.bastion && !S.bastion.dead){
    g.fillStyle = CO.red;
    g.fillRect(X(S.bastion.x)-2, hy(-LANE_HALF*0.7), 4, hy(LANE_HALF*0.7)-hy(-LANE_HALF*0.7));
  }
  // jednostki jako punkty — jedyna rzecz, która mówi „walka jest TAM"
  for (const u of S.units){
    if (u.hp<=0) continue;
    g.fillStyle = u.side==='p' ? '#7dc0ff' : '#ff8a7a';
    g.fillRect(X(u.x)-1.2, hy(u.y-LANE_Y)-1.2, 2.8, 2.8);
  }
  // linia frontu
  g.fillStyle='#ffffff'; g.fillRect(X(S.frontX)-0.5, 0, 1.4, hCss);
  // okno widoku — to ono mówi graczowi, którą część mapy właśnie widzi
  const vp = viewport();
  g.strokeStyle = cam.follow ? CO.ok : '#dfe8ea';
  g.lineWidth = 1.4;
  g.strokeRect(X(vp.x)+0.7, 1.4, Math.max(8, vp.w*sx)-1.4, hCss-2.8);
}

/* ------------------------- cel misji + rozkaz torowy ---------------------- */
function updateObjective(){
  const el=qs('objective');
  if (!isCampaign() || S.state==='menu'){ el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const [now, target] = goalNow(), done = goalDone();
  el.classList.toggle('done', done);
  qs('obj-lbl').textContent = 'CEL — MISJA '+MIS().n;
  qs('obj-txt').textContent = goalText();
  qs('obj-bar').style.width = Math.min(100, target? 100*now/target : 0)+'%';
  qs('obj-bar').style.background = done ? CO.ok : CO.warn;
  qs('obj-num').textContent = done ? '✔ OSIĄGNIĘTY' : now+' / '+target;
}
// Rozkaz torowy pokazuje się TYLKO tam, gdzie tory istnieją — przy kształcie '1'
// przycisków nie ma, bo nie ma czego rozdzielać.
function updateLanes(){
  const el=qs('lanes');
  const n = maxLanes();
  if (n<2 || S.state!=='play'){ el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  [...el.children].forEach(b=>{
    const l=+b.dataset.lane;
    b.style.display = (l>=n) ? 'none' : '';
    b.classList.toggle('on', S.laneOrder===l);
  });
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

// Wysokość paska górnego trafia do CSS jako --top-h, żeby panele (wywiad, cel)
// wieszały się POD nim, a nie na zgadywanych 100 px. Na telefonie pasek zawija
// się w dwa wiersze i każda sztywna liczba była tam błędna.
let topHShown = -1;
function syncTopH(){
  const tb = qs('topbar'); if (!tb) return;
  const h = tb.offsetHeight;
  if (h && h !== topHShown){
    topHShown = h;
    document.documentElement.style.setProperty('--top-h', h + 'px');
  }
}

/* ------------------------------- pełny HUD ------------------------------- */
export function updateHUD(){
  syncTopH();
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

  // wywiad — panel istnieje tylko w misjach, które dały radar (w 1–2 byłby ikoną)
  qs('intel').classList.toggle('hidden', !feat('radar'));
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
  const stN = feat('stance')||0;
  const push=stN>=2 && S.si===stN-1, sb=qs('stance-btn');
  sb.classList.toggle('hidden', stN < 2);
  sb.textContent=(push?'▶▶ ':'▮▮ ')+STANCES[S.si].n;
  sb.classList.toggle('push', push);
  qs('speed-btn').textContent='» '+S.speed+'×';
  qs('speed-btn').classList.toggle('on', S.speed>1);
  const armed=S.newArm>0;
  qs('new-btn').textContent = isCampaign() ? '☰ MENU' : (armed?'PEWNO?':'⟲ NOWA');
  qs('new-btn').classList.toggle('on', armed);
  qs('mute-btn').textContent=isMuted()?'♪ ✕':'♪ WŁ.';

  updateBar();
  updateStanceSlider();
  updateLog();
  updateUpgradePanel();
  updateObjective();
  updateLanes();
  updateCamBtns();
  drawMinimap();
}

function updateCamBtns(){
  qs('cam-front').classList.toggle('on', cam.follow==='front');
  qs('cam-base').classList.toggle('on', cam.follow==='base');
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
