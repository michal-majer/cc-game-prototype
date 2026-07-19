/* =========================================================================
   FRONT — sektory: trzy mini-sztaby na korytarzu. Zdobyte płacą kredyty,
   oddane napędzają rozbudowę wroga.
   ========================================================================= */

import { CAP_R, CAP_RATE, TERR_MAX } from './config.js';
import { S, SECT, say } from './state.js';
import { boom, siren } from './audio.js';

export function resetSect(){ for (const q of SECT){ q.cap=0; q.own=0; } }

export function updSect(dt){
  for (const q of SECT){
    let p=false, e=false;
    for (const u of S.units){
      if (u.hp<=0 || Math.abs(u.x-q.x)>CAP_R) continue;
      if (u.side==='p') p=true; else e=true;
      if (p&&e) break;
    }
    if (p && !e) q.cap = Math.min( 100, q.cap + CAP_RATE*dt);
    else if (e && !p) q.cap = Math.max(-100, q.cap - CAP_RATE*dt);
    const o = q.cap>=100 ? 1 : q.cap<=-100 ? -1 : 0;
    if (o!==q.own){
      if (o===1)  { say('▶ SEKTOR '+q.n+' PRZEJETY','good'); boom(0.35); }
      if (o===-1) { say('◄ STRACILISCIE '+q.n,'bad'); siren(); S.shake=Math.max(S.shake,8); }
      q.own=o;
    }
  }
}
export const secP = () => SECT.filter(q=>q.own===1).length;
export const secE = () => SECT.filter(q=>q.own===-1).length;
export const terrCtrl   = () => secP()/SECT.length;
export const terrIncome = () => terrCtrl()*TERR_MAX;
export const eTerrCtrl  = () => secE()/SECT.length;
