/* =========================================================================
   FRONT — ruda: generacja żył, wydobycie, odrost, statystyki złóż.
   ========================================================================= */

import { COLS, ROWS, BASE_INCOME, ORE_REGEN, ORE_SIP, ORE_YOUNG, BAL, ringOf } from './config.js';
import { S, say } from './state.js';
import { bRate } from './buildings.js';

export function genOre(){
  // Dwa osobne pola rudy — strefa górna i dolna — żeby DWIE rafinerie miały
  // sens (jedno pole = jedna rafineria). Wcześniej ruda potrafiła zlać się w
  // jeden klaster: opłacało się postawić jedną raf., a resztę zaorać na gotówkę.
  const seeds=[];
  const far = (c,r) => !seeds.some(s=>Math.abs(s.c-c)+Math.abs(s.r-r)<3);
  const seedIn = (r0,r1) => {
    for (let t=0;t<200;t++){
      const c=2+(Math.random()*5|0), r=r0+(Math.random()*(r1-r0+1)|0);
      if (far(c,r)){ seeds.push({c,r}); return; }
    }
  };
  seedIn(0, 2);            // pole górne
  seedIn(ROWS-3, ROWS-1);  // pole dolne (rozdzielone od górnego w pionie)
  // DWA pola — bez losowej trzeciej żyły. „Mniej, ale dłuższe": jedno górne,
  // jedno dolne, każde WIĘKSZE i głębsze, więc rafineria ciągnie z niego dłużej,
  // zanim spadnie do sączka. Dwie rafinerie na dwa pola = pełna decyzja o placem.
  for (const s of seeds){
    const cells=[{c:s.c,r:s.r}], size=4+(Math.random()*2|0);   // 4–5 kratek na żyłę (głębsze pole = dłuższy silnik)
    for (let t=0;t<40 && cells.length<size;t++){
      const b=cells[(Math.random()*cells.length)|0];
      const d=[[0,1],[0,-1],[1,0],[-1,0]][(Math.random()*4)|0];
      const nc=b.c+d[0], nr=b.r+d[1];
      if (nc<2||nc>=COLS||nr<0||nr>=ROWS) continue;
      if (cells.some(x=>x.c===nc&&x.r===nr)) continue;
      cells.push({c:nc,r:nr});
    }
    // MŁODA ruda — pola startują umiarkowanie chude (ORE_YOUNG..+0.20 ≈ 11–31% z 450
    // = ~50–140/kratkę), żeby zaoranie na starcie nie było fortuną, ale głębiej niż
    // wcześniej: silnik trwa dłużej. Odrost spoczynkowy (5/s) i tak dopełnia pole.
    const mat = ORE_YOUNG + Math.random()*0.20;
    for (const x of cells){ S.grid[x.r][x.c].ore=Math.round(BAL.ORE_MAX*mat); S.grid[x.r][x.c].seam=true; }
  }
  for (let r=1;r<=4;r++) for (let c=0;c<=1;c++){ S.grid[r][c].ore=0; S.grid[r][c].seam=false; }
}

// Karta bonus (NOWE ZŁOŻE): dokłada świeżą, bogatą żyłę w wolnym miejscu siatki.
// Comeback-lever, gdy pola się wypaliły — „+1 ruda na planszy" z talii.
export function seedSeam(){
  const empty = (c,r) => { const g=S.grid[r]&&S.grid[r][c]; return g && !g.b && !g.seam && g.ore<=0; };
  const seeds=[];
  for (let r=0;r<ROWS;r++) for (let c=2;c<COLS;c++) if (empty(c,r)) seeds.push({c,r});
  if (!seeds.length){ say('BRAK MIEJSCA NA NOWĄ ŻYŁĘ','warn'); return false; }
  const s = seeds[(Math.random()*seeds.length)|0];
  const cells=[{c:s.c,r:s.r}], size=4+(Math.random()*2|0);   // 4–5 kratek, jak pola startowe
  for (let t=0;t<40 && cells.length<size;t++){
    const b=cells[(Math.random()*cells.length)|0];
    const d=[[0,1],[0,-1],[1,0],[-1,0]][(Math.random()*4)|0];
    const nc=b.c+d[0], nr=b.r+d[1];
    if (nc<2||nc>=COLS||nr<0||nr>=ROWS) continue;
    if (!empty(nc,nr) || cells.some(x=>x.c===nc&&x.r===nr)) continue;
    cells.push({c:nc,r:nr});
  }
  // Świeże złoże z karty jest BOGATE (~55% capa) — to nagroda, ma od razu robić robotę.
  for (const x of cells){ S.grid[x.r][x.c].ore=Math.round(BAL.ORE_MAX*0.55); S.grid[x.r][x.c].seam=true; }
  say('◆ NOWE ZŁOŻE — '+cells.length+' KRATEK RUDY','good');
  return true;
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
  let inc=BASE_INCOME;
  for (const b of S.buildings){
    if (b.type!=='refinery' || !b.powered) continue;
    for (const [cc,rr] of ringOf(b.type,b.c,b.r)){
      const g=S.grid[rr][cc];
      if (!g.seam) continue;
      inc += g.ore > 5 ? bRate(b) : ORE_SIP;
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
  return {rich, richRate, sip, sipRate:sip*ORE_SIP};
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
    const tapped=g.pull;   // czynna w POPRZEDNIEJ klatce (extract ustawia pull po regrow)
    g.pull=false;
    if (!g.seam) continue;
    g.prevOre = g.ore;   // migawka sprzed odrostu — trend (odrost vs wydobycie) liczy render
    if (g.b || g.ore>=BAL.ORE_MAX) continue;
    // czynna żyła odrasta wolno (=drenaż I poz., podtrzymanie + mały sączek),
    // spoczynkowa szybko (odbicie pola, które zostawiłeś w spokoju)
    g.ore = Math.min(BAL.ORE_MAX, g.ore + (tapped?ORE_SIP:ORE_REGEN)*dt);
  }
}
export function extract(dt){
  let got=BASE_INCOME*dt;
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
