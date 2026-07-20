/* =========================================================================
   FRONT — budynki: stawianie, moc, poziomy, technologia, walidacja kratek.
   ========================================================================= */

import {
  B, U, CO, BASE_X, BASE_Y, CELL, COLS, ROWS, MAXLVL, NOUP, HQ_COST, ORE_RATE,
  BUILD_DIV, BUILD_MIN, BUILD_MAX, BAL, clamp, cellsOf, ringOf, fpOf, plObj
} from './config.js';
import { S, say } from './state.js';
import { boom } from './audio.js';
import { explode } from './effects.js';

// --- technologia / poziomy (czyste helpery na S.buildings) ---
export const hasTech  = t => S.buildings.some(b=>b.type===t && b.powered);
export const radarLvl = () => { let m=0; for (const b of S.buildings) if (b.type==='radar' && b.powered) m=Math.max(m,b.lvl); return Math.min(2,m); };
export const unlocked = t => (B[t].req||[]).every(hasTech);
export const reqText  = t => (B[t].req||[]).map(x=>B[x].name).join(' + ');
export const maxLvl   = () => hasTech('lab') ? MAXLVL+1 : MAXLVL;

export const bSup   = b => B[b.type].sup ? B[b.type].sup + (b.lvl-1)*4 : 0;
export const bDrn   = b => B[b.type].drn ? B[b.type].drn + (b.lvl-1)   : 0;
export const bCount = b => (B[b.type].count||0) + (b.lvl-1);
export const bRate  = () => ORE_RATE;                         // stawka na JEDEN harvester (żyłę) — poziom dokłada harvesterów, nie stawki
export const bHarv  = b => b.lvl + (S.harvBonus||0);          // liczba harvesterów rafinerii (poziom + darmowe z kart)
export const seamsAround = b => { let n=0; for (const [cc,rr] of ringOf(b.type,b.c,b.r)) if (S.grid[rr][cc].seam) n++; return n; };
export const bDmg   = b => B[b.type].atk ? Math.round(B[b.type].atk.dmg*(1+(b.lvl-1)*0.5)) : 0;
export const bReady = b => (b.build||0) <= 0;                 // budowa ukończona?
export const buildSec = t => clamp(Math.round(B[t].cost/BUILD_DIV), BUILD_MIN, BUILD_MAX);
export function canUp(b){
  if (!b || !bReady(b) || NOUP.includes(b.type)) return false;
  if (b.type==='hq') return true;
  // rafineria: harvester na każdy poziom, ale najwyżej tyle, ile przyległych żył
  if (b.type==='refinery') return b.lvl < Math.min(maxLvl(), seamsAround(b));
  return b.lvl < maxLvl();
}
export const upCost = b => b.type==='hq' ? HQ_COST*b.lvl : B[b.type].cost*b.lvl;
export const pBuff  = () => S.hq ? 1 + (S.hq.lvl-1)*BAL.HQ_STEP : 1;
export function upText(b){
  const d=B[b.type];
  if (b.type==='hq') return 'obrażenia i HP +'+Math.round(b.lvl*BAL.HQ_STEP*100)+'%';
  if (d.unit) return (bCount(b)+1)+'× '+U[d.unit].name;
  if (d.sup)  return '+'+(bSup(b)+4)+' mocy';
  if (b.type==='refinery') return '+1 harvester → '+(bHarv(b)+1)+' żyły naraz';
  if (d.atk)  return 'obrażenia '+Math.round(d.atk.dmg*(1+b.lvl*0.5));
  return '';
}

// --- walidacja kratek ---
export function fits(t,c,r){
  const [w,h]=fpOf(t);
  if (c<0||r<0||c+w>COLS||r+h>ROWS) return false;
  for (const [cc,rr] of cellsOf(t,c,r)){
    const g=S.grid[rr][cc];
    if (g.ore>0 || g.b) return false;
  }
  return true;
}
export function roomFor(t){
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) if (fits(t,c,r)) return true;
  return false;
}

// --- stawianie / usuwanie ---
export function mkBuilding(type,c,r,instant=false){
  const d=B[type], [w,h]=d.fp;
  const bt = instant ? 0 : buildSec(type);   // sztab i darowizny z kart stają natychmiast
  const b={type,c,r,lvl:1, x:BASE_X+(c+w/2)*CELL, y:BASE_Y+(r+h/2)*CELL,
           hp:d.hp,maxHp:d.hp, brown:false, powered:false, cd:0, side:'p', flash:0,
           build:bt, buildMax:bt};
  for (const [cc,rr] of cellsOf(type,c,r)){ S.grid[rr][cc].b=b; S.grid[rr][cc].seam=false; }
  S.buildings.push(b); return b;
}
export function clearCells(b){ for (const [cc,rr] of cellsOf(b.type,b.c,b.r)) S.grid[rr][cc].b=null; }

export function killBuilding(b){
  if (b.type!=='hq') say('OBIEKT UTRACONY — '+B[b.type].name,'bad');
  clearCells(b);
  S.buildings.splice(S.buildings.indexOf(b),1);
  if (b._view){ b._view.destroy({children:true}); b._view=null; }
  explode(b.x,b.y,26,B[b.type].col);
  S.shake=Math.max(S.shake,9); boom(0.35);
  if (B[b.type].boom){
    say('REAKTOR EKSPLODOWAŁ','bad');
    explode(b.x,b.y,60,'#fff6c0'); S.shake=Math.max(S.shake,20); boom(0.7);
    const hit=new Set();
    for (const [cc,rr] of ringOf(b.type,b.c,b.r)){
      const o=S.grid[rr][cc].b;
      if (o && !hit.has(o)){ hit.add(o); o.hp-=B[b.type].boom; o.flash=1; }
    }
  }
  recalcPower();
}

// Moc = czysty budżet. Brak → gasną obiekty najdalsze od sztabu.
export function recalcPower(){
  // budynki w budowie są poza siecią: nie dają mocy, nie ciągną, nie zapalają się
  S.supply=0;
  for (const b of S.buildings) if (bReady(b)) S.supply += bSup(b);
  const cand = S.buildings.filter(b=>bReady(b) && bDrn(b)>0);
  const dHQ = b => Math.abs(b.c-S.hq.c)+Math.abs(b.r-S.hq.r);
  cand.sort((a,b)=> dHQ(b)-dHQ(a));
  for (const b of S.buildings) b.brown=false;
  S.drain = cand.reduce((s,b)=>s+bDrn(b),0);
  let over=S.drain-S.supply, i=0, nBrown=0;
  while (over>0 && i<cand.length){
    cand[i].brown=true; over-=bDrn(cand[i]); S.drain-=bDrn(cand[i]); i++; nBrown++;
  }
  for (const b of S.buildings) b.powered = bReady(b) && !b.brown;
  if (nBrown>S.offBrown) say('PRZECIĄŻENIE — '+nBrown+' '+plObj(nBrown)+' WYŁĄCZONE','bad');
  S.offBrown=nBrown;
  const r=radarLvl();
  if (S.hadRadar>r && r===0) say('UTRATA ŁĄCZNOŚCI — WYWIAD OFFLINE','bad');
  if (S.hadRadar<r && r===1) say('RADAR I — WIDZISZ ICH KSZTAŁTY; TYP ROZPOZNASZ W ZWARCIU','good');
  if (S.hadRadar<r && r===2) say('RADAR II — PEŁNA WIDOCZNOŚĆ','good');
  S.hadRadar=r;
}
