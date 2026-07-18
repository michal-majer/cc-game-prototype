/* =========================================================================
   FRONT — ruda: generacja żył, wydobycie, odrost, statystyki złóż.
   ========================================================================= */

import { COLS, ROWS, ORE_REGEN, ORE_YOUNG, BAL, ringOf } from './config.js';
import { S, say } from './state.js';
import { bRate } from './buildings.js';

export function genOre(){
  const seeds=[];
  for (let t=0;t<300 && seeds.length<4;t++){
    const c=2+(Math.random()*5|0), r=(Math.random()*ROWS)|0;
    if (seeds.some(s=>Math.abs(s.c-c)+Math.abs(s.r-r)<2)) continue;
    seeds.push({c,r});
  }
  for (const s of seeds){
    const cells=[{c:s.c,r:s.r}], size=2+(Math.random()*2|0);
    for (let t=0;t<40 && cells.length<size;t++){
      const b=cells[(Math.random()*cells.length)|0];
      const d=[[0,1],[0,-1],[1,0],[-1,0]][(Math.random()*4)|0];
      const nc=b.c+d[0], nr=b.r+d[1];
      if (nc<2||nc>=COLS||nr<0||nr>=ROWS) continue;
      if (cells.some(x=>x.c===nc&&x.r===nr)) continue;
      cells.push({c:nc,r:nr});
    }
    const mat = ORE_YOUNG + Math.random()*(1-ORE_YOUNG);
    for (const x of cells){ S.grid[x.r][x.c].ore=Math.round(BAL.ORE_MAX*mat); S.grid[x.r][x.c].seam=true; }
  }
  for (let r=1;r<=4;r++) for (let c=0;c<=1;c++){ S.grid[r][c].ore=0; S.grid[r][c].seam=false; }
}

export function oreAround(t,c,r){
  let n=0, res=0;
  for (const [cc,rr] of ringOf(t,c,r)){ if (S.grid[rr][cc].ore>0){ n++; res+=S.grid[rr][cc].ore; } }
  return {n,res};
}
export function oreTotal(){
  let n=0;
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) n+=S.grid[r][c].ore;
  return n;
}
export function incomeRate(){
  let inc=3;
  for (const b of S.buildings){
    if (b.type!=='refinery' || !b.powered) continue;
    for (const [cc,rr] of ringOf(b.type,b.c,b.r)){
      const g=S.grid[rr][cc];
      if (!g.seam) continue;
      inc += g.ore > 5 ? bRate(b) : ORE_REGEN;
    }
  }
  return inc;
}
export function oreBreak(){
  let rich=0, richRate=0, sip=0;
  for (const b of S.buildings){
    if (b.type!=='refinery' || !b.powered) continue;
    for (const [cc,rr] of ringOf(b.type,b.c,b.r)){
      const g=S.grid[rr][cc];
      if (!g.seam) continue;
      if (g.ore>5){ rich++; richRate+=bRate(b); } else sip++;
    }
  }
  return {rich, richRate, sip, sipRate:sip*ORE_REGEN};
}
export function seamsAlive(){
  let n=0;
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) if (S.grid[r][c].seam) n++;
  return n;
}
export function seamsTapped(){
  let n=0;
  for (const b of S.buildings){
    if (b.type!=='refinery' || !b.powered) continue;
    for (const [cc,rr] of ringOf(b.type,b.c,b.r)) if (S.grid[rr][cc].seam) n++;
  }
  return n;
}
export function regrow(dt){
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
    const g=S.grid[r][c];
    g.pull=false;
    if (!g.seam || g.b || g.ore>=BAL.ORE_MAX) continue;
    g.ore = Math.min(BAL.ORE_MAX, g.ore + ORE_REGEN*dt);
  }
}
export function extract(dt){
  let got=3*dt;
  for (const b of S.buildings){
    if (b.type!=='refinery' || !b.powered) continue;
    for (const [cc,rr] of ringOf(b.type,b.c,b.r)){
      const g=S.grid[rr][cc];
      if (g.seam) g.pull=true;
      if (g.ore<=0) continue;
      const take=Math.min(g.ore, bRate(b)*dt);
      g.ore-=take; got+=take;
      if (g.ore<=0){ g.ore=0; say('ŻYŁA WYPALONA — ODRASTA ALBO ZABUDUJ','warn'); }
    }
  }
  return got;
}
