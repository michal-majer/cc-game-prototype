/* =========================================================================
   FRONT — WIZUALNE HARVESTERY. Jeden pojazd na każdy aktywny harvester
   rafinerii: wyjeżdża do przydzielonej żyły, kopie, wraca objuczony, zrzuca
   i znów rusza. Czysto kosmetyczne — ekonomię liczy harvestPlan (economy.js),
   tu tylko ją POKAZUJEMY. Przydział żył stabilny: harvester trzyma swoją żyłę,
   dopóki jest w planie; zwalnia ją dopiero, gdy z planu wypadnie.
   ========================================================================= */

import { S } from './state.js';
import { BASE_X, BASE_Y, CELL } from './config.js';
import { harvestPlan } from './economy.js';

const SPD = 95;                 // px/s — tempo jazdy
const MINE_T = 0.7, DUMP_T = 0.4;
const cc = (c,r) => ({ x:BASE_X+(c+0.5)*CELL, y:BASE_Y+(r+0.5)*CELL });

export function updHarvesters(dt){
  const plan = harvestPlan();
  // rafinerie poza planem (bez mocy / w budowie / zburzone) tracą harvestery
  for (const b of S.buildings) if (b.type==='refinery' && !plan.has(b)) b._harv=null;

  for (const [ref, veins] of plan){
    const cells = veins.map(v=>({c:v.cc, r:v.rr}));
    ref._harv = ref._harv || [];
    // zachowaj harvestery, których żyła wciąż w planie (stabilnie), resztę zwolnij
    const used = new Set();
    for (const h of ref._harv){
      const k = h.vc ? h.vc.r*100+h.vc.c : -1;
      if (h.vc && !used.has(k) && cells.some(c=>c.c===h.vc.c && c.r===h.vc.r)) used.add(k);
      else h.vc=null;
    }
    if (ref._harv.length > cells.length) ref._harv.length = cells.length;
    while (ref._harv.length < cells.length)
      ref._harv.push({ ref, x:ref.x, y:ref.y, ang:0, state:'toVein', timer:0, vc:null });
    const free = cells.filter(c=>!used.has(c.r*100+c.c));
    let fi=0;
    for (const h of ref._harv) if (!h.vc) h.vc = free[fi++] || cells[0];
  }

  const out=[];
  for (const b of S.buildings) if (b._harv) for (const h of b._harv) out.push(h);
  for (const h of out){
    if (h.state==='mining' || h.state==='dumping'){
      h.timer-=dt;
      if (h.timer<=0) h.state = h.state==='mining' ? 'toBase' : 'toVein';
      continue;
    }
    const g = (h.state==='toVein') ? cc(h.vc.c,h.vc.r) : { x:h.ref.x, y:h.ref.y };
    const dx=g.x-h.x, dy=g.y-h.y, d=Math.hypot(dx,dy)||1, step=SPD*dt;
    h.ang = Math.atan2(dy,dx);
    if (d<=step){
      h.x=g.x; h.y=g.y;
      if (h.state==='toVein'){ h.state='mining'; h.timer=MINE_T; }
      else { h.state='dumping'; h.timer=DUMP_T; }
    } else { h.x+=dx/d*step; h.y+=dy/d*step; }
  }
  S.harv = out;
}
