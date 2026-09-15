/* =========================================================================
   FRONT — ruda: generacja żył, wydobycie, odrost, statystyki złóż.
   ========================================================================= */

import { COLS, ROWS, BASE_INCOME, ORE_REGEN, ORE_SIP, ORE_YOUNG, BAL, ringOf } from './config.js';
import { S, say } from './state.js';
import { bRate, bHarv } from './buildings.js';

// Globalny przydział harvesterów do żył (Map: rafineria → lista żył, jedna pozycja
// na harvester). Najpierw ROZKŁADAMY po różnych żyłach — dwie rafinerie przy tym
// samym złożu dzielą je między siebie — a gdy żył mniej niż harvesterów, 2-3
// harvestery wchodzą na jedną żyłę (podwójny/potrójny drenaż). Round-robin po
// rafineriach = równy podział; w rafinerii wybór żyły o najmniejszym obciążeniu,
// remis → najbogatsza. Żyła z 2 harvesterami trafia do listy 2× → drenaż 2×.
export function harvestPlan(){
  const key=(cc,rr)=>rr*100+cc, load=new Map(), refs=[];
  for (const b of S.buildings){
    if (b.type!=='refinery' || !b.powered) continue;
    const veins=[];
    for (const [cc,rr] of ringOf(b.type,b.c,b.r)){ const g=S.grid[rr][cc]; if (g.seam) veins.push({cc,rr,g}); }
    if (veins.length) refs.push({b, veins, slots:bHarv(b), out:[]});
  }
  let progress=true;
  while (progress){
    progress=false;
    for (const rf of refs){
      if (rf.out.length>=rf.slots) continue;
      let best=null, bestLoad=Infinity, bestOre=-1;
      for (const v of rf.veins){
        const l=load.get(key(v.cc,v.rr))||0;
        if (l<bestLoad || (l===bestLoad && v.g.ore>bestOre)){ best=v; bestLoad=l; bestOre=v.g.ore; }
      }
      rf.out.push(best); load.set(key(best.cc,best.rr), bestLoad+1); progress=true;
    }
  }
  const plan=new Map();
  for (const rf of refs) plan.set(rf.b, rf.out);
  return plan;
}

export function genOre(){
  // Dwa osobne pola rudy — strefa górna i dolna — żeby DWIE rafinerie miały
  // sens (jedno pole = jedna rafineria). Wcześniej ruda potrafiła zlać się w
  // jeden klaster: opłacało się postawić jedną raf., a resztę zaorać na gotówkę.
  //
  // WSZYSTKO skaluje się SIATKĄ, bo siatka jest daną misji (misja 1 gra na 5×4,
  // misja 4 na 7×6). Sztywne „2 pola po 4–5 kratek" zjadłoby małą siatkę w całości
  // i nie zostawiło miejsca na rafinerię, która ma z tej rudy ciągnąć.
  const CELLS = COLS*ROWS;
  const nSeeds = CELLS >= 30 ? 2 : 1;              // małe pole = jedno złoże
  const size0  = Math.max(2, Math.min(5, Math.round(CELLS*0.10)));   // 7×6 → 4, 5×4 → 2, 5×3 → 2
  const c0     = Math.min(2, COLS-1);              // kolumny 0–1 rezerwuje sztab
  const seeds=[];
  const far = (c,r) => !seeds.some(s=>Math.abs(s.c-c)+Math.abs(s.r-r)<3);
  const seedIn = (r0,r1) => {
    r0=Math.max(0,Math.min(r0,ROWS-1)); r1=Math.max(r0,Math.min(r1,ROWS-1));
    for (let t=0;t<200;t++){
      const c=c0+(Math.random()*Math.max(1,COLS-c0)|0), r=r0+(Math.random()*(r1-r0+1)|0);
      if (far(c,r)){ seeds.push({c,r}); return; }
    }
  };
  seedIn(0, Math.max(0, Math.floor(ROWS/2)-1));     // pole górne
  if (nSeeds>1) seedIn(Math.ceil(ROWS/2), ROWS-1);  // pole dolne (rozdzielone w pionie)
  // „Mniej, ale dłuższe": każde pole WIĘKSZE i głębsze, więc rafineria ciągnie
  // z niego dłużej, zanim spadnie do sączka.
  for (const s of seeds){
    const cells=[{c:s.c,r:s.r}], size=size0+(Math.random()*2|0);
    for (let t=0;t<40 && cells.length<size;t++){
      const b=cells[(Math.random()*cells.length)|0];
      const d=[[0,1],[0,-1],[1,0],[-1,0]][(Math.random()*4)|0];
      const nc=b.c+d[0], nr=b.r+d[1];
      if (nc<c0||nc>=COLS||nr<0||nr>=ROWS) continue;
      if (cells.some(x=>x.c===nc&&x.r===nr)) continue;
      cells.push({c:nc,r:nr});
    }
    // MŁODA ruda — pola startują głębsze (ORE_YOUNG..+0.20 ≈ 16–36% z 450
    // = ~72–162/kratkę): faza bogata trwa dłużej, a przy netto −1 pole schodzi
    // wolno. Zaoranie i tak ograniczone przez SALV_CAP; odrost spoczynkowy dopełnia.
    const mat = ORE_YOUNG + Math.random()*0.20;
    for (const x of cells){ S.grid[x.r][x.c].ore=Math.round(BAL.ORE_MAX*mat); S.grid[x.r][x.c].seam=true; }
  }
  // placyk pod sztab: kolumny 0–1 zawsze wolne od rudy
  for (let r=0;r<ROWS;r++) for (let c=0;c<Math.min(2,COLS);c++){ S.grid[r][c].ore=0; S.grid[r][c].seam=false; }
  // UWAGA: ensureRefinerySpot NIE jest wołane stąd. Musi zobaczyć siatkę ze
  // SZTABEM na niej, a sztab stawia się dopiero po genOre — inaczej gwarantuje
  // miejsca, które sztab zaraz zajmie (pomiar: 118 na 200 układów dawało się
  // zablokować mimo „gwarancji"). Woła je game.buildField po postawieniu sztabu.
}

/* GWARANCJA: na siatce MUSI istnieć miejsce na rafinerię PRZY ZŁOŻU.

   Na ciasnej siatce misji 1 (5×3 = 15 kratek, z czego cztery bierze sztab)
   losowa żyła potrafiła zająć dokładnie te kratki, które były jedynym miejscem
   na rafinerię 2×2 — i misja o ekonomii stawała się nie do przejścia. Pomiar:
   bot postawił elektrownię i utknął, 4:57 bez rafinerii.

   Zamiast losować do skutku, ZDEJMUJEMY kratki żyły od jej brzegu, aż miejsce
   się znajdzie. Żyła jest wtedy mniejsza, ale misja istnieje.                 */
export function ensureRefinerySpot(){
  // Kotwica = miejsce 2×2 wolne i przylegające do rudy. Kryterium DOKŁADNIE
  // takie, jak sprawdza gra przy stawianiu (fits + oreAround) — inaczej
  // gwarantowalibyśmy co innego, niż gracz potem próbuje zrobić.
  const anchors = () => {
    const out=[];
    for (let r=0;r+2<=ROWS;r++) for (let c=0;c+2<=COLS;c++){
      const cells=[[c,r],[c+1,r],[c,r+1],[c+1,r+1]];
      let clear=true;
      for (const [cc,rr] of cells) if (S.grid[rr][cc].ore>0 || S.grid[rr][cc].b){ clear=false; break; }
      if (!clear) continue;
      let near=false;
      for (const [cc,rr] of ringOf('refinery',c,r)) if (S.grid[rr][cc].ore>0){ near=true; break; }
      if (near) out.push(cells);
    }
    return out;
  };
  /* DWIE ROZŁĄCZNE KOTWICE, nie „dwie kotwice".

     Misja 1 nie ma rozbiórki, więc JEDNO miejsce na rafinerię znaczy, że gracz
     bezpowrotnie blokuje tutorial, stawiając tam elektrownię 1×1. Dwie kotwice
     DZIELĄCE kratkę nie pomagają — jedna elektrownia zabija obie. Dopiero dwa
     rozłączne prostokąty gwarantują, że po dowolnym pojedynczym budynku zostaje
     jeszcze gdzie postawić rafinerię.                                          */
  const twoDisjoint = (a) => {
    for (let i=0;i<a.length;i++) for (let j=i+1;j<a.length;j++){
      const set = new Set(a[i].map(([c,r])=>r*100+c));
      if (!a[j].some(([c,r])=>set.has(r*100+c))) return true;
    }
    return false;
  };

  if (twoDisjoint(anchors())) return;

  /* Na ciasnej siatce ZDEJMOWANIE rudy nie działa: żyła ma dwie–trzy kratki,
     więc nie ma z czego brać (pomiar: 125 na 200 układów dało się zablokować
     mimo „gwarancji"). Trzeba PRZESUNĄĆ ZŁOŻE, nie je zdzierać — ta sama ilość
     rudy, inne miejsce. Losujemy nowe położenie i sprawdzamy; jeśli żadne nie
     spełni warunku, zostawiamy najlepsze z prób. Ruda na 18 kratkach to
     kilkanaście możliwych układów, więc 80 prób z zapasem je pokrywa.          */
  const cells = [];
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) if (S.grid[r][c].seam) cells.push([c,r]);
  const size = Math.max(2, cells.length);
  const clearOre = () => { for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
      if (S.grid[r][c].seam){ S.grid[r][c].seam=false; S.grid[r][c].ore=0; } } };
  const amount = cells.length ? S.grid[cells[0][1]][cells[0][0]].ore : Math.round(BAL.ORE_MAX*ORE_YOUNG);
  const free = (c,r) => { const g=S.grid[r] && S.grid[r][c]; return g && !g.b && !g.seam; };
  const c0 = Math.min(2, COLS-1);
  const seedAt = () => {
    const blob=[];
    for (let t=0;t<60 && !blob.length;t++){
      const c=c0+(Math.random()*Math.max(1,COLS-c0)|0), r=(Math.random()*ROWS)|0;
      if (free(c,r)) blob.push([c,r]);
    }
    if (!blob.length) return false;
    for (let t=0;t<40 && blob.length<size;t++){
      const [bc,br]=blob[(Math.random()*blob.length)|0];
      const [dc,dr]=[[1,0],[-1,0],[0,1],[0,-1]][(Math.random()*4)|0];
      const nc=bc+dc, nr=br+dr;
      if (nc<c0||nc>=COLS||nr<0||nr>=ROWS) continue;
      if (!free(nc,nr) || blob.some(x=>x[0]===nc&&x[1]===nr)) continue;
      blob.push([nc,nr]);
    }
    for (const [c,r] of blob){ S.grid[r][c].seam=true; S.grid[r][c].ore=amount; }
    return true;
  };

  let best=null, bestN=-1;
  for (let t=0;t<80;t++){
    clearOre();
    if (!seedAt()) continue;
    const a = anchors();
    if (twoDisjoint(a)) return;                       // znalezione — zostaw jak jest
    if (a.length > bestN){
      bestN = a.length;
      best = [];
      for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) if (S.grid[r][c].seam) best.push([c,r]);
    }
  }
  clearOre();
  for (const [c,r] of (best||cells)){ S.grid[r][c].seam=true; S.grid[r][c].ore=amount; }
}

// Karta bonus (NOWE ZŁOŻE): dokłada świeżą, bogatą żyłę w wolnym miejscu siatki.
// Comeback-lever, gdy pola się wypaliły — „+1 ruda na planszy" z talii.
export function seedSeam(){
  const empty = (c,r) => { const g=S.grid[r]&&S.grid[r][c]; return g && !g.b && !g.seam && g.ore<=0; };
  const seeds=[];
  const c0=Math.min(2,COLS-1);
  for (let r=0;r<ROWS;r++) for (let c=c0;c<COLS;c++) if (empty(c,r)) seeds.push({c,r});
  if (!seeds.length){ say('BRAK MIEJSCA NA NOWĄ ŻYŁĘ','warn'); return false; }
  const s = seeds[(Math.random()*seeds.length)|0];
  const cells=[{c:s.c,r:s.r}], size=4+(Math.random()*2|0);   // 4–5 kratek, jak pola startowe
  for (let t=0;t<40 && cells.length<size;t++){
    const b=cells[(Math.random()*cells.length)|0];
    const d=[[0,1],[0,-1],[1,0],[-1,0]][(Math.random()*4)|0];
    const nc=b.c+d[0], nr=b.r+d[1];
    if (nc<c0||nc>=COLS||nr<0||nr>=ROWS) continue;
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
  for (const [b, veins] of harvestPlan()){
    for (const {g} of veins) inc += g.ore > 5 ? bRate(b) : ORE_SIP;
  }
  return inc;
}
export function oreBreak(){
  let rich=0, richRate=0, sip=0;
  for (const [b, veins] of harvestPlan()){
    for (const {g} of veins){ if (g.ore>5){ rich++; richRate+=bRate(b); } else sip++; }
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
  for (const [b, veins] of harvestPlan()){   // tylko żyły pod harvesterami; reszta odłogiem (patrz regrow)
    for (const {g} of veins){
      g.pull=true;
      if (g.ore<=0) continue;
      const take=Math.min(g.ore, bRate(b)*dt);
      g.ore-=take; got+=take;
      if (g.ore<=0){ g.ore=0; say('ŻYŁA WYPALONA — ODRASTA ALBO ZABUDUJ','warn'); }
    }
  }
  return got;
}
