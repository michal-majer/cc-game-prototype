/* =========================================================================
   FRONT — sektory: trzy mini-sztaby na korytarzu. Zdobyte płacą kredyty,
   oddane napędzają rozbudowę wroga.
   ========================================================================= */

import { CAP_R, CAP_RATE, TERR_MAX, ETERR_ATK } from './config.js';
import { S, SECT, say } from './state.js';
import { growGrid } from './campaign.js';
import { boom, siren } from './audio.js';

export function resetSect(){ for (const q of SECT){ q.cap=0; q.own=0; } }

export function updSect(dt){
  for (const q of SECT){
    let p=false, e=false;
    for (const u of S.units){
      if (u.hp<=0 || Math.abs(u.x-q.x)>CAP_R) continue;
      // Sektor torowy (q.lane >= 0) liczy tylko to, co stoi NA JEGO TORZE —
      // „przejmij środek" znaczy „wygraj na dwóch z trzech torów" (FRONT.md §2.5).
      if (q.lane >= 0 && (u.lane|0) !== q.lane) continue;
      if (u.side==='p') p=true; else e=true;
      if (p&&e) break;
    }
    if (p && !e) q.cap = Math.min( 100, q.cap + CAP_RATE*dt);
    else if (e && !p) q.cap = Math.max(-100, q.cap - CAP_RATE*dt);
    const o = q.cap>=100 ? 1 : q.cap<=-100 ? -1 : 0;
    if (o!==q.own){
      // Bonus wroga za sektory (ETERR_ATK/szt.) liczy się z secE() PO tej zmianie —
      // say() leci przed q.own=o, więc wynikową liczbę ich sztabów składam ręcznie:
      // aktualne minus stary wkład tego pola plus nowy. (Neutralne→gracz NIE osłabia
      // wroga — wtedy oba wkłady = 0 i bonus zostaje bez zmian.)
      const eBuff = (secE() - (q.own===-1?1:0) + (o===-1?1:0)) * ETERR_ATK;
      if (o===1)  { say('▶ SEKTOR '+q.n+' PRZEJETY · ICH ARMIA ⚔+'+eBuff,'good'); boom(0.35); growGrid(); }
      if (o===-1) { say('◄ STRACILISCIE '+q.n+' · ICH ARMIA ⚔+'+eBuff,'bad'); siren(); S.shake=Math.max(S.shake,8); }
      q.own=o;
    }
  }
}
export const secP = () => SECT.filter(q=>q.own===1).length;
export const secE = () => SECT.filter(q=>q.own===-1).length;
// Misje 1–2 nie mają sektorów w ogóle (SECT puste) — bez tej osłony
// terrCtrl() zwracało 0/0 = NaN i zatruwało S.money na pierwszej klatce.
export const terrCtrl   = () => SECT.length ? secP()/SECT.length : 0;
export const terrIncome = () => terrCtrl()*TERR_MAX;
export const eTerrCtrl  = () => SECT.length ? secE()/SECT.length : 0;
