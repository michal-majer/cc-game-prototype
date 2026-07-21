/* =========================================================================
   FRONT — wejście: dotyk/mysz na polu (pan / pinch / tap), przyciski HUD,
   klawiatura. Tap na kratkę = buduj / ulepsz / rozbierz (zależnie od trybu).
   ========================================================================= */

import { B, CELL, BASE_X, BASE_Y, ROWS, COLS, CO, SELL_BACK, REPAIR_FRAC, SALV_CAP, HQ_COST, BAL, cellAt, cellsOf, clamp } from './config.js';
import { S, say } from './state.js';
import { boom, resumeAudio, setMuted, isMuted } from './audio.js';
import { explode } from './effects.js';
import { app, cam, clampCam, screenToWorld } from './render.js';
import { fits, unlocked, canUp, upCost, mkBuilding, recalcPower, clearCells } from './buildings.js';
import { setStance, toggleStance } from './sim.js';
import { takeCard } from './cards.js';
import { toast, syncOverlays } from './hud.js';
import { newRun } from './game.js';

const qs = id => document.getElementById(id);

// wartość włożona w budynek (koszt + ulepszenia) — baza dla złomu i naprawy.
// Sztab ma koszt 0, więc liczymy go po HQ_COST (jak jego ulepszenia).
function investedOf(b){
  const unit = b.type==='hq' ? HQ_COST : B[b.type].cost;
  let put=unit; for (let l=1;l<b.lvl;l++) put+=unit*l;
  return put;
}

// ulepszenie budynku — wołane z drugiego tapnięcia i z przycisku ULEPSZ w panelu
function doUpgrade(b){
  if (b && (b.build||0)>0){ toast('W BUDOWIE'); return; }
  if (!b || !canUp(b)){ toast('MAKS. POZIOM'); return; }
  const cost=upCost(b);
  if (S.money<cost){ say('BRAK ŚRODKÓW — '+cost+' kr.','warn'); toast('BRAK ŚRODKÓW — '+cost+' kr.'); return; }
  S.money-=cost; b.lvl++;
  say('ULEPSZONO — '+B[b.type].name+' '+'I'.repeat(b.lvl),'good');
  b.flash=1; explode(b.x,b.y,10,B[b.type].col); boom(0.1); recalcPower();
}

function worldTap(px,py){
  if (S.state!=='play') return;
  const w=screenToWorld(px,py);
  const cell=cellAt(w.x,w.y);
  if (!cell) return;
  const {c,r}=cell, g=S.grid[r][c];

  if (S.sel==='SELL'){
    if (!g.b && g.seam){
      const salv=Math.floor(Math.min(g.ore, SALV_CAP)*BAL.CLEAR_SALV);   // zaoranie płaci max z SALV_CAP — bez farmy z odrośniętych żył
      S.money+=salv; g.ore=0; g.seam=false;
      say(salv>0?'ŻYŁA ZAORANA — ODZYSK '+salv+' kr.':'ŻYŁA ZAORANA — NIE ODROŚNIE','warn');
      explode(BASE_X+(c+0.5)*CELL, BASE_Y+(r+0.5)*CELL, 18, CO.ore); boom(0.2); S.shake=Math.max(S.shake,4);
      return;
    }
    const b=g.b; if (!b) return;
    if (b.type==='hq'){ say('SZTABU NIE SPRZEDASZ','warn'); toast('SZTABU NIE SPRZEDASZ'); return; }
    const frac=clamp(b.hp/b.maxHp,0,1);          // uszkodzony budynek wart mniej przy rozbiórce: 50% z WARTOŚCI, nie z pełnego kosztu
    const back=Math.floor(investedOf(b)*SELL_BACK*frac); S.money+=back;
    const underC=(b.build||0)>0;
    say((underC?'ANULOWANO BUDOWĘ — ':'ROZEBRANO — ')+B[b.type].name+' · +'+back+' kr.','good');
    if (b._view){ b._view.destroy({children:true}); b._view=null; }
    clearCells(b); S.buildings.splice(S.buildings.indexOf(b),1);
    explode(b.x,b.y,16,CO.dim); boom(0.14); S.shake=Math.max(S.shake,3); recalcPower();
    return;
  }
  if (S.sel==='REPAIR'){
    const b=g.b; if (!b) return;
    if ((b.build||0)>0){ toast('W BUDOWIE'); return; }
    if (b.hp>=b.maxHp){ toast('PEŁNE HP'); return; }
    const miss=1-clamp(b.hp/b.maxHp,0,1);
    const cost=Math.ceil(investedOf(b)*miss*REPAIR_FRAC);   // im bardziej uszkodzony, tym drożej
    if (S.money<cost){ say('BRAK ŚRODKÓW — '+cost+' kr.','warn'); toast('BRAK ŚRODKÓW — '+cost+' kr.'); return; }
    S.money-=cost; b.hp=b.maxHp; b.flash=1;
    say('NAPRAWIONO — '+B[b.type].name+' · −'+cost+' kr.','good');
    explode(b.x,b.y,12,CO.ok); boom(0.12);
    return;
  }
  if (!S.sel){
    const b=g.b;
    if (!b){ S.upSel=null; return; }        // tap w puste pole → zamknij panel ulepszenia
    if (S.upSel!==b){ S.upSel=b; return; }   // 1. tap: pokaż panel (co ulepszy i za ile)
    doUpgrade(b);                            // 2. tap w ten sam budynek: potwierdź
    return;
  }
  // budowa
  if (fits(S.sel,c,r)){
    if (!unlocked(S.sel)){ S.sel=null; return; }
    if (S.money<B[S.sel].cost){ say('BRAK ŚRODKÓW','warn'); toast('BRAK ŚRODKÓW'); return; }
    S.money-=B[S.sel].cost; mkBuilding(S.sel,c,r);
    say('ROZPOCZĘTO BUDOWĘ — '+B[S.sel].name,'good'); boom(0.15); recalcPower();
  } else {
    let kill=0; for (const [cc,rr] of cellsOf(S.sel,c,r)) if (rr>=0&&rr<ROWS&&cc>=0&&cc<COLS&&S.grid[rr][cc].seam) kill++;
    if (S.grid[r][c].ore>0 || kill) toast('KRATKA ZAJĘTA PRZEZ ŻYŁĘ');
  }
}

// pole: pan / pinch / tap
function initPointer(){
  const el=app.canvas;
  const pts=new Map();
  let mode='', startX=0, startY=0, moved=false, pinchD=0, pinchZoom=1;
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

  el.addEventListener('pointerdown', e=>{
    resumeAudio();
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, {x:e.offsetX, y:e.offsetY});
    if (pts.size===1){ mode='maybe'; startX=e.offsetX; startY=e.offsetY; moved=false; }
    else if (pts.size===2){ mode='pinch';
      const [a,b]=[...pts.values()]; pinchD=dist(a,b); pinchZoom=cam.zoom; }
  });
  el.addEventListener('pointermove', e=>{
    const P=pts.get(e.pointerId); if (P){ P.x=e.offsetX; P.y=e.offsetY; }
    const w=screenToWorld(e.offsetX,e.offsetY);
    S.wmouse.x=w.x; S.wmouse.y=w.y; S.wmouse.over=true;
    if (mode==='pinch' && pts.size>=2){
      const [a,b]=[...pts.values()]; const nd=dist(a,b);
      const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      const wBefore=screenToWorld(mid.x,mid.y);
      cam.zoom=clamp(pinchZoom*(nd/(pinchD||1)), cam.min, cam.max);
      cam.panX = mid.x - wBefore.x*cam.zoom;
      cam.panY = mid.y - wBefore.y*cam.zoom;
      clampCam();
      return;
    }
    if (mode==='maybe' || mode==='pan'){
      const dx=e.offsetX-startX, dy=e.offsetY-startY;
      if (!moved && Math.hypot(dx,dy)>8){ moved=true; mode='pan'; }
      if (mode==='pan'){ cam.panX+=e.movementX||0; cam.panY+=e.movementY||0; clampCam(); }
    }
  });
  const up=e=>{
    if (mode==='maybe' && !moved){ worldTap(startX,startY); }
    pts.delete(e.pointerId);
    if (pts.size===0) mode='';
    else if (pts.size===1) mode='pan';
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', ()=>{ S.wmouse.over=false; });
  el.addEventListener('wheel', e=>{
    e.preventDefault();
    const wBefore=screenToWorld(e.offsetX,e.offsetY);
    cam.zoom=clamp(cam.zoom*(e.deltaY<0?1.12:0.89), cam.min, cam.max);
    cam.panX=e.offsetX-wBefore.x*cam.zoom; cam.panY=e.offsetY-wBefore.y*cam.zoom; clampCam();
  }, {passive:false});
}

function initButtons(){
  qs('stance-btn').addEventListener('click', ()=>{ resumeAudio(); toggleStance(); });
  qs('speed-btn').addEventListener('click', ()=>{ S.speed = S.speed>=3?1:S.speed+1; });
  qs('mute-btn').addEventListener('click', ()=>{ setMuted(!isMuted()); });
  qs('new-btn').addEventListener('click', ()=>{ if (S.state!=='play'||S.newArm>0) newRun(); else S.newArm=3; });
  qs('ready').addEventListener('click', ()=>{ resumeAudio(); S.ready=true; syncOverlays(); });
  qs('end-btn').addEventListener('click', ()=>newRun());
  qs('end-copy').addEventListener('click', ()=>{
    const t=S.reportJSON||''; if (!t){ toast('BRAK RAPORTU'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(t).then(()=>toast('RAPORT SKOPIOWANY'), ()=>toast('NIE SKOPIOWANO'));
    else toast('BRAK SCHOWKA — RAPORT W KONSOLI');
  });
  qs('log-toggle').addEventListener('click', ()=>qs('log').classList.toggle('show'));
  qs('up-btn').addEventListener('click', ()=>{ resumeAudio(); doUpgrade(S.upSel); });
  qs('up-close').addEventListener('click', ()=>{ S.upSel=null; });

  addEventListener('keydown', e=>{
    if (S.state==='draft'){
      const i={Digit1:0,Digit2:1,Digit3:2}[e.code];
      if (i!==undefined && S.draft && S.draft[i]) takeCard(S.draft[i]);
      return;
    }
    if (e.code==='Escape'){ S.sel=null; S.upSel=null; }
    if (e.code==='Space'){ e.preventDefault();
      if (S.state!=='play'){ newRun(); return; }
      if (!S.ready){ S.ready=true; syncOverlays(); return; }
      toggleStance(); return; }
    if (S.state!=='play') return;
    if (e.code==='Equal'||e.code==='NumpadAdd')  S.speed=Math.min(3,S.speed+1);
    if (e.code==='Minus'||e.code==='NumpadSubtract') S.speed=Math.max(1,S.speed-1);
    if (e.code==='ArrowRight') setStance(S.si+1);
    if (e.code==='ArrowLeft')  setStance(S.si-1);
    const n=+({Digit1:1,Digit2:2,Digit3:3,Digit4:4,Digit5:5}[e.code]||0);
    if (n) setStance(n-1);
  });
}

export function initInput(){ initPointer(); initButtons(); }
export { worldTap };
