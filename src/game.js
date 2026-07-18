/* =========================================================================
   FRONT — port na PixiJS (buildless, ESM)
   Pole walki rysuje Pixi (kamera przewijana + pinch-zoom → działa na telefonie).
   Cały HUD to DOM (index.html / style.css) — ostry i klikalny na dotyk.
   Mechanika 1:1 z oryginału v77: ekonomia, żyły, sektory, wywiad/radar,
   doktryny wroga, karty, artyleria z odłamkami, bastion.

   Rozbudowa:
     · grafika jednostek/budynków → src/assets.js (wrzuć PNG do assets/)
     · dźwięki → src/audio.js (registerSfx)
   ========================================================================= */

import * as PIXI from '../vendor/pixi.min.mjs';
import { boom, siren, setMuted, isMuted, resumeAudio } from './audio.js';
import { loadAssets, unitTex, buildTex, tex } from './assets.js';

const HEX = s => (typeof s === 'number' ? s : parseInt(String(s).replace('#',''), 16));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ========================== KONFIG / TABELE ============================= */
const W = 1200, H = 680;

const COLS = 7, ROWS = 6, CELL = 52;
const BASE_X = 40, BASE_Y = 176;
const BASE_R = BASE_X + COLS*CELL;              // 404
const LANE_Y = 332, LANE_HALF = 130;
const BAS_X = 1150;
const FRONT_MIN = BASE_R, FRONT_MAX = BAS_X - 30;
const EHOLD_X = BAS_X - 110;
let   EBUILD_EVERY = 1.15;
const EARTY_CAP = 3;
const EPUSH_R  = 1.35;
const EHOLD_R  = 0.85;
const EPATIENCE = 110;
const EPAT_MASS = 70;
const ESCOUT    = 3;
const ETHINK    = 2;
const ECOMMIT   = 26;
const ESHELLED  = 55;

const STANCES = [
  {n:'OBRONA',    x:BASE_R+60,  d:'pod bunkrami · stos rośnie'},
  {n:'PRZEDPOLE', x:BASE_R+186, d:'1/4 — poza osłoną'},
  {n:'ŚRODEK',    x:BASE_R+373, d:'1/2 — neutralny grunt'},
  {n:'NACISK',    x:BASE_R+576, d:'3/4 — artyleria dosięga BASTIONU'},
  {n:'NATARCIE',  x:BAS_X,      d:'wszystko na bastion'},
];

const CO = {
  bg:'#0f1315', dirt:'#1a2022', grid:'#232c2f', gridHi:'#2f3b3f', laneEdge:'#39474b',
  ore:'#c9a227', oreDark:'#8a6f1a',
  blue:'#4d9de0', blueD:'#2a5f8a', red:'#e05252', redD:'#8a2f2f',
  txt:'#c8d4d6', dim:'#66787c', warn:'#e8b23a', ok:'#5fd18a',
  panel:'#161c1e', panelHi:'#202a2d', power:'#e8b23a',
  crt:'#7de08a', crtDim:'#2f5c39', crtBg:'#0a0f0b', intel:'#c9a2e8', lock:'#39474b'
};

let   ORE_MAX  = 450;
const ORE_RATE  = 2;
const ORE_REGEN = 0.8;
const ORE_YOUNG = 0.25;
const BAS_HP     = 1500;
const BAS_DMG    = 34;
const BAS_RANGE  = 150;
const BAS_RATE   = 0.8;
const BAS_SPL_R  = 35;
const BAS_SPL_N  = 3;
const WAVE_TIME = 20;
const TERR_MAX = 20;
const ETERR_SEC = 65;
const SELL_BACK = 0.5;
const MAXLVL = 3;
const maxLvl = () => hasTech('lab') ? MAXLVL+1 : MAXLVL;
let   CLEAR_SALV = 0.4;
const RAID_PAY = 0.4;

const B = {
  hq:      {name:'SZTAB',        short:'SZTAB', fp:[2,2], cost:0,   hp:1500, col:'#7fb3d9', ico:'★', sup:4, req:[],
            atk:{dmg:30, range:330, rate:0.65}, desc:'broni całej bazy · 330 px'},
  power:   {name:'ELEKTROWNIA',  short:'PRĄD',  fp:[1,1], cost:100, hp:200,  col:'#e8b23a', ico:'⚡', sup:6, req:[],
            desc:'+6 mocy · 1×1'},
  refinery:{name:'RAFINERIA',    short:'RAF.',  fp:[2,2], cost:200, hp:250,  col:'#5fd18a', ico:'$', drn:2, req:[],
            desc:'+6 kr./s za przyległą rudę'},
  barracks:{name:'BARAK',        short:'BARAK', fp:[1,1], cost:150, hp:200,  col:'#6fa8dc', ico:'i', drn:2, req:[],
            unit:'inf', count:1, desc:'co falę: 1× Piechota · 1×1'},
  rocket:  {name:'WYRZUTNIA',    short:'WYRZ.', fp:[1,2], cost:250, hp:180,  col:'#9b7fd4', ico:'r', drn:2, req:[],
            unit:'rkt', count:1},
  bunker:  {name:'GNIAZDO RAK.',  short:'GNIAZ.',fp:[1,1], cost:180, hp:350,  col:'#8fa3a8', ico:'▲', drn:1, req:['rocket'],
            desc:'rakiety 230 px · przebija pancerz', atk:{dmg:15, range:230, rate:1.0, ap:true}},
  workshop:{name:'WARSZTAT',     short:'WARSZ.',fp:[2,1], cost:200, hp:220,  col:'#d9a04d', ico:'w', drn:2, req:[],
            unit:'lazik', count:1},
  factory: {name:'FABRYKA',      short:'FABR.', fp:[2,2], cost:400, hp:300,  col:'#4d9de0', ico:'T', drn:3, req:['radar'],
            unit:'tank', count:1},
  radar:   {name:'RADAR',        short:'RADAR', fp:[1,2], cost:350, hp:220,  col:'#4dd0d0', ico:'◉', drn:3, req:['refinery'],
            desc:'I: rozpoznasz ich w zwarciu · II: skład fali zawczasu'},
  reactor: {name:'REAKTOR',      short:'REAKT.',fp:[2,2], cost:500, hp:260,  col:'#f2d24b', ico:'☢', sup:36, boom:120,
            req:['radar'], desc:'+36 mocy · wybucha'},
  lab:     {name:'LABORATORIUM', short:'LAB.',  fp:[1,2], cost:500, hp:260,  col:'#b0d04d', ico:'L', drn:3, req:['radar','factory'],
            desc:'artyleria i kolosy · +1 POZIOM wszystkim'},
  arty:    {name:'BATERIA ART.', short:'ART.',  fp:[2,2], cost:500, hp:250,  col:'#d98a4d', ico:'A', drn:4, req:['lab'],
            unit:'arty', count:1, desc:'odłamki ×3 · 60–175 px'},
  heavy:   {name:'CIĘŻKA FABR.', short:'C.FAB.',fp:[2,2], cost:700, hp:420,  col:'#3a7fc0', ico:'K', drn:5, req:['lab'],
            unit:'kolos', count:1},
};
const BAR = ['power','refinery','barracks','rocket','bunker','workshop','factory',
             'radar','reactor','lab','arty','heavy'];

const U = {
  inf:  {name:'Piechota',    hp:60,  dmg:9,  range:26,  spd:26, rate:0.75, sz:4,  strong:['rkt']},
  rkt:  {name:'Rakietowiec', hp:50,  dmg:15, range:74,  spd:22, rate:1.15, sz:4,  strong:['tank','kolos','lazik'], ap:true},
  tank: {name:'Czołg',       hp:190, dmg:19, range:36,  spd:34, rate:0.95, sz:8,  strong:['inf'], arm:5},
  lazik:{name:'Łazik',       hp:90,  dmg:11, range:30,  spd:55, rate:0.5,  sz:6,  strong:['arty','inf'], hunt:'arty'},
  arty: {name:'Artyleria',   hp:70,  dmg:24, range:175, spd:15, rate:3.0,  sz:7,  strong:[], spl:3, splR:34, minR:60},
  kolos:{name:'Kolos',       hp:430, dmg:32, range:44,  spd:21, rate:1.1,  sz:11, strong:['inf'], arm:6},
};
const COUNTER   = 2.0;
const HUNT_LEASH = 150;
const BACK_MUL  = 0.4;
const isHeavy = d => !!(d.arm || d.minR);
const CONTACT = 90;
const SEEN_HOLD = 2;

const EB = {
  barracks:{name:'BARAK',        unit:'inf',  count:1},
  rocket:  {name:'WYRZUTNIA',    unit:'rkt',  count:1},
  workshop:{name:'WARSZTAT',     unit:'lazik',count:1},
  factory: {name:'FABRYKA',      unit:'tank', count:1},
  arty:    {name:'BATERIA ART.', unit:'arty', count:1, desc:'odłamki ×3 · 60–175 px'},
  heavy:   {name:'CIĘŻKA FABR.', unit:'kolos',count:1},
};
const DOCTRINES = [
  { name:'CZERWONA FALA', tag:'Masa piechoty. Zaleją cię liczbą.',
    hint:'Pancerz kosi piechotę. Czołgi i bunkry.',
    start:['barracks','barracks'],
    order:[['barracks'],['barracks'],['barracks'],['rocket'],['barracks'],
           ['barracks'],['factory'],['barracks'],['barracks'],['rocket'],
           ['barracks'],['factory'],['barracks'],['barracks'],['heavy']],
    late:['barracks','barracks','rocket','factory'] },
  { name:'STALOWA PIĘŚĆ', tag:'Doktryna pancerna. Czołgi od pierwszej fali.',
    hint:'Bez rakiet nie masz czym tego przebić.',
    start:['barracks'],
    order:[['factory'],['barracks'],['factory'],['factory'],['barracks'],
           ['factory'],['heavy'],['factory'],['barracks'],['heavy'],
           ['factory'],['factory'],['heavy'],['barracks'],['heavy']],
    late:['factory','heavy','workshop','barracks'] },
  { name:'GRAD', tag:'Artyleria. Rozbiorą cię z dystansu.',
    hint:'Odłamki koszą zbitą masę. Łaziki dopadną baterie.',
    start:['barracks'],
    order:[['rocket'],['arty'],['barracks'],['arty'],['workshop'],
           ['barracks'],['arty'],['rocket'],['arty'],['workshop'],
           ['arty'],['rocket'],['factory'],['arty'],['heavy']],
    late:['arty','rocket','workshop','barracks'] },
];

const U0 = JSON.parse(JSON.stringify(U));
const B0 = JSON.parse(JSON.stringify(B));
function resetTables(){
  for (const k in U0){ for (const f in U[k]) delete U[k][f]; Object.assign(U[k], U0[k]); }
  for (const k in B0){ for (const f in B[k]) delete B[k][f]; Object.assign(B[k], B0[k]); }
  ORE_MAX=450; CLEAR_SALV=0.4; HQ_STEP=0.07; EBUILD_EVERY=1.15;
}
const NOUP = ['lab'];

let   HQ_STEP = 0.07;
const HQ_COST = 350;

// karty (mutują JEDNĄ liczbę)
const DECK = [
  {n:'WETERANI',       k:'WOJSKO', d:'piechota +20% HP (60 → 72)',
   f:()=>{ U.inf.hp=72; }},
  {n:'PANCERZ SPAWANY',k:'WOJSKO', d:'czołg i kolos +2 pancerza',
   f:()=>{ U.tank.arm+=2; U.kolos.arm+=2; }},
  {n:'ZAPALNIKI',      k:'WOJSKO', d:'artyleria: odłamki ×3 → ×4',
   f:()=>{ U.arty.spl=4; }},
  {n:'BENZYNA 100',    k:'WOJSKO', d:'łazik: prędkość 55 → 72',
   f:()=>{ U.lazik.spd=72; }},
  {n:'CELOWNIKI',      k:'WOJSKO', d:'rakietowiec: zasięg 74 → 96',
   f:()=>{ U.rkt.range=96; }},
  {n:'GŁĘBOKI ODWIERT',k:'RUDA',   d:'każda żyła +180 rudy, teraz',
   f:()=>{ ORE_MAX=630; for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
             const g=grid[r][c]; if(g.seam) g.ore=Math.min(ORE_MAX,g.ore+180); } }},
  {n:'SPYCHACZE',      k:'RUDA',   d:'zaoranie żyły daje 70% zamiast 40%',
   f:()=>{ CLEAR_SALV=0.7; }},
  {n:'KOMPRESJA',      k:'RUDA',   d:'elektrownia +3 mocy (6 → 9)',
   f:()=>{ B.power.sup=9; }},
  {n:'MOBILIZACJA',    k:'KRATKI', d:'barak: 2 piechoty zamiast 1, na każdym poziomie',
   f:()=>{ B.barracks.count=2; }},
  {n:'SZTAB POLOWY',   k:'KRATKI', d:'sztab: +10% zamiast +7% na poziom',
   f:()=>{ HQ_STEP=0.10; }},
  {n:'SABOTAŻ',        k:'WRÓG',   d:'bastion −250 HP natychmiast',
   f:()=>{ bastion.maxHp-=250; bastion.hp=Math.max(1,bastion.hp-250);
           explode(bastion.x,bastion.y,30,CO.warn); boom(0.9); shake=Math.max(shake,20); }},
  {n:'BLOKADA',        k:'WRÓG',   d:'ich rozbudowa: co 1,5 fali → co 2,2',
   f:()=>{ EBUILD_EVERY=2.2; }},
];
function gift(t){
  let best=null, bv=-1e9;
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
    if (!fits(t,c,r)) continue;
    const v = (t==='refinery' ? oreAround(t,c,r).n*100 : 0) - (Math.abs(c-hq.c)+Math.abs(r-hq.r));
    if (v>bv){ bv=v; best=[c,r]; }
  }
  if (best) mkBuilding(t, best[0], best[1]);
}
const OPEN = [
  {n:'PANCERNI',      k:'WOJSKO', d:'fabryka bez radaru: czolg od fali 1. Okno do fali 4 — potem rakiety.',
   f:()=>{ gift('factory'); money = 0; say('PANCERNI: masz 4 fale przewagi. Potem zobacza fabryke.','warn'); }},
  {n:'GARNIZON',     k:'WOJSKO', d:'elektrownia i dwa baraki. Zero rudy, zero kasy — bierz sektory.',
   f:()=>{ gift('power'); gift('barracks'); gift('barracks'); money = 0; }},
  {n:'ZWIAD',        k:'WROG',   d:'radar od fali 1: widzisz kazda ich fale. Zero rudy, zero kasy.',
   f:()=>{ gift('power'); gift('radar'); money = 0; }},
  {n:'KWATERMISTRZ', k:'KRATKI', d:'450 kredytow i pusta siatka. Wolna reka, zero tempa.',
   f:()=>{ money = 450; }},
  {n:'SAPERZY',      k:'RUDA',   d:'spychacz placi 70%: zyly to gotowka. 350 kr. na start.',
   f:()=>{ CLEAR_SALV=0.7; money = 350; }},
];

/* ============================== SEKTORY ================================= */
const CAP_R    = 118;
const CAP_RATE = 11;
const SECT = [
  {n:'PRZEDPOLE', x:FRONT_MIN+186, cap:0, own:0},
  {n:'SRODEK',    x:FRONT_MIN+373, cap:0, own:0},
  {n:'NACISK',    x:FRONT_MIN+576, cap:0, own:0},
];
function resetSect(){ for (const q of SECT){ q.cap=0; q.own=0; } }

/* =============================== STAN ================================== */
let grid, buildings, hq, bastion, units, fx, corpses, tracers;
let money, wave, timer, frontX, shake, state, endReason;
let sel=null;
let best=0, newArm=0, speed=1, raidPay=0, raidShow=0;
let log=[], hadRadar=0, doc=null;
let supply=0, drain=0, offBrown=0, oreStart=1, alertCd=0, ecoCd=0, fullCd=0;
let eIntel=[];
let eStance='hold', ePush=0, eHoldT=0, eDmgWave=0, eThink=0, eTerrBank=0, eCounterCd=0, eArmCd=0, eBuildN=0, eBuildDebt=0;
let si=0;
const lineX = () => STANCES[si].x;
let fieldDead=false;
let deck=[], draft=null, draftT='ROZKAZ ZE SZTABU', draftS='';
let ready=false;
// pozycja kursora w świecie (do ghosta budowy na desktopie)
let wmouse={x:0,y:0,over:false};

function say(txt,kind){
  const last=log[log.length-1];
  if (last && last.txt===txt){ last.n=(last.n||1)+1; last.t=0; return; }
  log.push({txt,kind:kind||'info',t:0,n:1});
  if (log.length>7) log.shift();
  logDirty=true;
}

/* ============================ OBRYSY / SIATKA ========================== */
const fpOf = t => B[t].fp;
function cellsOf(t,c,r){
  const [w,h]=fpOf(t), out=[];
  for (let rr=r; rr<r+h; rr++) for (let cc=c; cc<c+w; cc++) out.push([cc,rr]);
  return out;
}
function ringOf(t,c,r){
  const [w,h]=fpOf(t), out=[];
  for (let rr=r-1; rr<=r+h; rr++) for (let cc=c-1; cc<=c+w; cc++){
    if (rr>=r&&rr<r+h&&cc>=c&&cc<c+w) continue;
    if (rr<0||rr>=ROWS||cc<0||cc>=COLS) continue;
    out.push([cc,rr]);
  }
  return out;
}
function roomFor(t){
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) if (fits(t,c,r)) return true;
  return false;
}
function fits(t,c,r){
  const [w,h]=fpOf(t);
  if (c<0||r<0||c+w>COLS||r+h>ROWS) return false;
  for (const [cc,rr] of cellsOf(t,c,r)){
    const g=grid[rr][cc];
    if (g.ore>0 || g.b) return false;
  }
  return true;
}

/* =============================== NOWY RUN =============================== */
function newRun(){
  resetTables();
  resetSect();
  grid=[];
  for (let r=0;r<ROWS;r++){ grid[r]=[]; for(let c=0;c<COLS;c++) grid[r][c]={ore:0,seam:false,pull:false,b:null}; }
  genOre();
  oreStart=oreTotal();
  buildings=[]; units=[]; fx=[]; corpses=[]; tracers=[];
  clearViews();
  hq = mkBuilding('hq', 0, 2);
  bastion = {x:BAS_X, y:LANE_Y, hp:BAS_HP, maxHp:BAS_HP, side:'e', cd:0, flash:0, dead:false};
  doc = DOCTRINES[(Math.random()*DOCTRINES.length)|0];
  eBase = [...doc.start];
  money=200; wave=0; timer=WAVE_TIME; frontX=(FRONT_MIN+FRONT_MAX)/2;
  deck=[...DECK]; draft=null;
  shake=0; state='play'; endReason=''; sel=null; hadRadar=0; offBrown=0; alertCd=0; ecoCd=0; si=0; fieldDead=false; newArm=0; fullCd=0; raidPay=0; raidShow=0; eIntel=[]; eStance='hold'; ePush=0; eHoldT=0; eDmgWave=0; eThink=0; eTerrBank=0; eCounterCd=0; eArmCd=0; eBuildN=0; eBuildDebt=0;
  log=[]; logDirty=true;
  ready=false;
  openDraft(OPEN, 'WYBIERZ OTWARCIE', 'przeciwnik ma doktryne — Ty masz to');
  say('KANAŁ 7 OTWARTY','good');
  say('PRZECIWNIK: '+doc.name,'intel');
  say(doc.tag,'intel');
  say(doc.hint,'warn');
  say('TRZY MINI-SZTABY. Niczyje. Wejdz i odstoj — zostana Twoje.','good');
  say('Teren daje Ci kredyty. Im — budynki.','good');
  say('Oddany grunt płaci im, nie Tobie.','warn');
  say('Laboratorium: +1 poziom wszystkim. Sztab: bez limitu.','good');
  say('Bez radaru widzisz ich dopiero w zwarciu.','warn');
  say('Bastion JEST ich bazą — bij go, a ich fale maleją.','good');
  say('Żyła 450. Kredyty kapią — każdy budynek to decyzja.');
  say('Kratka albo złoże. Nie oba.','warn');
  recalcPower();
  eBase = eBase;               // (no-op — jasność)
  syncDocUI();
}

function genOre(){
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
    for (const x of cells){ grid[x.r][x.c].ore=Math.round(ORE_MAX*mat); grid[x.r][x.c].seam=true; }
  }
  for (let r=1;r<=4;r++) for (let c=0;c<=1;c++){ grid[r][c].ore=0; grid[r][c].seam=false; }
}

/* =============================== BUDYNKI =============================== */
let eBase=[];
function mkBuilding(type,c,r){
  const d=B[type], [w,h]=d.fp;
  const b={type,c,r,lvl:1, x:BASE_X+(c+w/2)*CELL, y:BASE_Y+(r+h/2)*CELL,
           hp:d.hp,maxHp:d.hp, brown:false, powered:false, cd:0, side:'p', flash:0};
  for (const [cc,rr] of cellsOf(type,c,r)){ grid[rr][cc].b=b; grid[rr][cc].seam=false; }
  buildings.push(b); return b;
}
function clearCells(b){ for (const [cc,rr] of cellsOf(b.type,b.c,b.r)) grid[rr][cc].b=null; }

function killBuilding(b){
  if (b.type!=='hq') say('OBIEKT UTRACONY — '+B[b.type].name,'bad');
  clearCells(b);
  buildings.splice(buildings.indexOf(b),1);
  if (b._view){ b._view.destroy({children:true}); b._view=null; }
  explode(b.x,b.y,26,B[b.type].col);
  shake=Math.max(shake,9); boom(0.35);
  if (B[b.type].boom){
    say('REAKTOR EKSPLODOWAŁ','bad');
    explode(b.x,b.y,60,'#fff6c0'); shake=Math.max(shake,20); boom(0.7);
    const hit=new Set();
    for (const [cc,rr] of ringOf(b.type,b.c,b.r)){
      const o=grid[rr][cc].b;
      if (o && !hit.has(o)){ hit.add(o); o.hp-=B[b.type].boom; o.flash=1; }
    }
  }
  recalcPower();
}

function recalcPower(){
  supply=0;
  for (const b of buildings) supply += bSup(b);
  const cand = buildings.filter(b=>bDrn(b)>0);
  const dHQ = b => Math.abs(b.c-hq.c)+Math.abs(b.r-hq.r);
  cand.sort((a,b)=> dHQ(b)-dHQ(a));
  for (const b of buildings) b.brown=false;
  drain = cand.reduce((s,b)=>s+bDrn(b),0);
  let over=drain-supply, i=0, nBrown=0;
  while (over>0 && i<cand.length){
    cand[i].brown=true; over-=bDrn(cand[i]); drain-=bDrn(cand[i]); i++; nBrown++;
  }
  for (const b of buildings) b.powered = !b.brown;
  if (nBrown>offBrown) say('PRZECIĄŻENIE — '+nBrown+' '+plObj(nBrown)+' WYŁĄCZONE','bad');
  offBrown=nBrown;
  const r=radarLvl();
  if (hadRadar>r && r===0) say('UTRATA ŁĄCZNOŚCI — WYWIAD OFFLINE','bad');
  if (hadRadar<r && r===1) say('RADAR I — ROZPOZNAJESZ TO, CO CIĘ BIJE','good');
  if (hadRadar<r && r===2) say('RADAR II — PEŁNA WIDOCZNOŚĆ','good');
  hadRadar=r;
}
function plObj(n){
  if (n===1) return 'OBIEKT';
  const d=n%10, s=n%100;
  return (d>=2&&d<=4&&!(s>=12&&s<=14)) ? 'OBIEKTY' : 'OBIEKTÓW';
}

/* =============================== DRAFT ================================= */
function openDraft(src, tytul, pod){
  const pool=[...(src||deck)], pick=[];
  if (!pool.length) return;
  while (pick.length<3 && pool.length) pick.push(pool.splice((Math.random()*pool.length)|0,1)[0]);
  draft=pick; draftT=tytul||'ROZKAZ ZE SZTABU';
  draftS=pod||('fala '+wave+' · wybierz jedno · [1] [2] [3]');
  state='draft'; siren(); shake=Math.max(shake,8);
  renderCards();
}
function takeCard(c){
  c.f();
  recalcPower();
  deck=deck.filter(x=>x!==c);
  draft=null; state='play';
  say('◆ '+c.n+' — '+c.d,'good');
  boom(0.4);
  syncOverlays();
}

/* ========================= HELPERY POZIOMÓW =========================== */
const bSup   = b => B[b.type].sup ? B[b.type].sup + (b.lvl-1)*4 : 0;
const bDrn   = b => B[b.type].drn ? B[b.type].drn + (b.lvl-1)   : 0;
const bCount = b => (B[b.type].count||0) + (b.lvl-1);
const bRate  = b => ORE_RATE + (b.lvl-1)*3;
const bDmg   = b => B[b.type].atk ? Math.round(B[b.type].atk.dmg*(1+(b.lvl-1)*0.5)) : 0;
const canUp  = b => b && !NOUP.includes(b.type) && (b.type==='hq' || b.lvl < maxLvl());
const upCost = b => b.type==='hq' ? HQ_COST*b.lvl : B[b.type].cost*b.lvl;
const pBuff  = () => hq ? 1 + (hq.lvl-1)*HQ_STEP : 1;
function upText(b){
  const d=B[b.type];
  if (b.type==='hq') return 'obrażenia i HP +'+Math.round(b.lvl*HQ_STEP*100)+'%';
  if (d.unit) return (bCount(b)+1)+'× '+U[d.unit].name;
  if (d.sup)  return '+'+(bSup(b)+4)+' mocy';
  if (b.type==='refinery') return '+'+(bRate(b)+3)+' kr./s za rudę';
  if (d.atk)  return 'obrażenia '+Math.round(d.atk.dmg*(1+b.lvl*0.5));
  return '';
}

/* =============================== RUDA ================================== */
function oreAround(t,c,r){
  let n=0, res=0;
  for (const [cc,rr] of ringOf(t,c,r)){ if (grid[rr][cc].ore>0){ n++; res+=grid[rr][cc].ore; } }
  return {n,res};
}
function oreTotal(){
  let n=0;
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) n+=grid[r][c].ore;
  return n;
}
function incomeRate(){
  let inc=3;
  for (const b of buildings){
    if (b.type!=='refinery' || !b.powered) continue;
    for (const [cc,rr] of ringOf(b.type,b.c,b.r)){
      const g=grid[rr][cc];
      if (!g.seam) continue;
      inc += g.ore > 5 ? bRate(b) : ORE_REGEN;
    }
  }
  return inc;
}
function oreBreak(){
  let rich=0, richRate=0, sip=0;
  for (const b of buildings){
    if (b.type!=='refinery' || !b.powered) continue;
    for (const [cc,rr] of ringOf(b.type,b.c,b.r)){
      const g=grid[rr][cc];
      if (!g.seam) continue;
      if (g.ore>5){ rich++; richRate+=bRate(b); } else sip++;
    }
  }
  return {rich, richRate, sip, sipRate:sip*ORE_REGEN};
}
function seamsAlive(){
  let n=0;
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) if (grid[r][c].seam) n++;
  return n;
}
function seamsTapped(){
  let n=0;
  for (const b of buildings){
    if (b.type!=='refinery' || !b.powered) continue;
    for (const [cc,rr] of ringOf(b.type,b.c,b.r)) if (grid[rr][cc].seam) n++;
  }
  return n;
}
function regrow(dt){
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
    const g=grid[r][c];
    g.pull=false;
    if (!g.seam || g.b || g.ore>=ORE_MAX) continue;
    g.ore = Math.min(ORE_MAX, g.ore + ORE_REGEN*dt);
  }
}
function extract(dt){
  let got=3*dt;
  for (const b of buildings){
    if (b.type!=='refinery' || !b.powered) continue;
    for (const [cc,rr] of ringOf(b.type,b.c,b.r)){
      const g=grid[rr][cc];
      if (g.seam) g.pull=true;
      if (g.ore<=0) continue;
      const take=Math.min(g.ore, bRate(b)*dt);
      g.ore-=take; got+=take;
      if (g.ore<=0){ g.ore=0; say('ŻYŁA WYPALONA — ODRASTA ALBO ZABUDUJ','warn'); }
    }
  }
  return got;
}

/* ============================== SEKTORY ================================ */
function updSect(dt){
  for (const q of SECT){
    let p=false, e=false;
    for (const u of units){
      if (u.hp<=0 || Math.abs(u.x-q.x)>CAP_R) continue;
      if (u.side==='p') p=true; else e=true;
      if (p&&e) break;
    }
    if (p && !e) q.cap = Math.min( 100, q.cap + CAP_RATE*dt);
    else if (e && !p) q.cap = Math.max(-100, q.cap - CAP_RATE*dt);
    const o = q.cap>=100 ? 1 : q.cap<=-100 ? -1 : 0;
    if (o!==q.own){
      if (o===1)  { say('▶ SEKTOR '+q.n+' PRZEJETY','good'); boom(0.35); }
      if (o===-1) { say('◄ STRACILISCIE '+q.n,'bad'); siren(); shake=Math.max(shake,8); }
      q.own=o;
    }
  }
}
const secP = () => SECT.filter(q=>q.own===1).length;
const secE = () => SECT.filter(q=>q.own===-1).length;
function terrCtrl(){ return secP()/SECT.length; }
const terrIncome = () => terrCtrl()*TERR_MAX;
function eTerrCtrl(){ return secE()/SECT.length; }

const hasTech = t => buildings.some(b=>b.type===t && b.powered);
const radarLvl = () => { let m=0; for (const b of buildings) if (b.type==='radar' && b.powered) m=Math.max(m,b.lvl); return Math.min(2,m); };
const unlocked = t => (B[t].req||[]).every(hasTech);
const reqText  = t => (B[t].req||[]).map(x=>B[x].name).join(' + ');

/* =============================== WRÓG ================================== */
function force(side){
  let s=0;
  for (const u of units){
    if (u.side!==side || u.hp<=0) continue;
    const d=U[u.type];
    s += u.hp + (d.dmg/d.rate)*10;
  }
  return s;
}
function pDefense(){
  const LX=lineX();
  let s=0;
  for (const b of buildings){
    const d=B[b.type];
    if (!d.atk || !b.powered) continue;
    if (b.x + d.atk.range < LX - 30) continue;
    s += (bDmg(b)/d.atk.rate)*10 + b.hp*0.3;
  }
  return s;
}
function eRatio(){
  const p = force('p') + pDefense();
  return p<1 ? 99 : force('e')/p;
}
function eDecide(){
  const r = eRatio(), n = units.filter(u=>u.side==='e').length;
  const shelled = eDmgWave > ESHELLED;
  eDmgWave = 0;
  if (!n){ eStance='hold'; eHoldT=0; return; }
  if (shelled){
    if (eStance!=='push'){
      eStance='push';
      say('NIE DAJĄ SIĘ OSTRZELIWAĆ — SZARŻUJĄ','bad');
      siren(); shake=Math.max(shake,10);
    }
    eHoldT=0;
    return;
  }
  if (eStance==='hold'){
    eHoldT += ETHINK;
    const terrPress = Math.max(0.35, 1 - terrCtrl()*0.8);
    const pat = EPATIENCE * Math.max(0.25, 1 - n/EPAT_MASS) * terrPress;
    if (r > EPUSH_R || eHoldT >= pat){
      eStance='push'; eHoldT=0; ePush=ECOMMIT;
      say('▲ SZTURM — RUSZA '+n+' JEDNOSTEK','bad');
      siren(); boom(0.6); shake=Math.max(shake,14);
    }
  } else if (ePush-=ETHINK, ePush<=0 && r < EHOLD_R){
    eStance='hold'; eHoldT=0;
    say('ONI SIĘ COFAJĄ ZA SWOJĄ LINIĘ','good');
  }
}
const bEff = () => bastion.dead ? 0 : Math.max(0, 0.45 + 0.55*(bastion.hp/BAS_HP));
function eComp(){
  const out={}, eff=bEff();
  for (const t of eBase){ const d=EB[t]; out[d.unit]=(out[d.unit]||0)+d.count; }
  for (const k of Object.keys(out)){
    out[k]=Math.round(out[k]*eff);
    if (out[k]<=0) delete out[k];
  }
  return out;
}
function eBuild(){
  eArmCd--;
  const iIdx = eIntel.length-1-ESCOUT;
  const I = iIdx >= 0 ? eIntel[iIdx] : {tanks:0, wheels:0, arty:0};
  const pTanks  = I.tanks;
  const pWheels = I.wheels;
  const eRkt = eBase.filter(t=>t==='rocket').length;
  const eBar = eBase.filter(t=>t==='barracks').length;
  if (pTanks >= 2 && eRkt < pTanks && eArmCd <= 0){
    eBase.push('rocket'); eArmCd = 2; eBuildN++;
    say(radarLvl()>=1 ? 'WYWIAD: ODPOWIADAJA RAKIETAMI' : 'ZA ICH LINIA — DLUGIE RURY', radarLvl()>=1?'intel':'warn');
    return;
  }
  if (pWheels >= 3 && eBar < pWheels*2 && eArmCd <= 0){
    eBase.push('barracks'); eArmCd = 2; eBuildN++;
    say(radarLvl()>=1 ? 'WYWIAD: SYPIA BARAKI — IDA TLUMEM' : 'ZA ICH LINIA — GWAR', radarLvl()>=1?'intel':'warn');
    return;
  }
  eCounterCd--;
  const pArty = I.arty;
  const eArty = eBase.filter(t=>t==='arty').length;
  if (pArty >= 2 && eArty < Math.ceil(pArty/2) && eCounterCd <= 0){
    eBase.push('arty');
    eCounterCd = 3; eBuildN++;
    say(radarLvl()>=1 ? 'WYWIAD: ODPOWIADAJĄ KONTRBATERIĄ' : 'DALEKIE HUKI ZZA ICH LINII',
        radarLvl()>=1?'intel':'warn');
    return;
  }
  let list = eBuildN < doc.order.length ? doc.order[eBuildN]
                                        : [doc.late[(Math.random()*doc.late.length)|0]];
  eBuildN++;
  if (list.includes('arty') && eBase.filter(t=>t==='arty').length >= EARTY_CAP)
    list = ['barracks'];
  for (const t of list){
    eBase.push(t);
    if (radarLvl()>=2) say('WYWIAD: '+EB[t].name,'intel');
  }
}
function spawn(type,side,x,y){
  const d=U[type];
  const hp = side==='p' ? Math.round(d.hp*pBuff()) : d.hp;
  units.push({type,side,x,y,hp,maxHp:hp,cd:Math.random()*d.rate,flash:0});
}
function doWave(){
  wave++;
  for (const b of buildings){
    const d=B[b.type];
    if (!d.unit||!b.powered) continue;
    for (let i=0;i<bCount(b);i++)
      spawn(d.unit,'p', b.x+(Math.random()*10-5), b.y+(Math.random()*20-10));
  }
  if (!bastion.dead){
    const comp=eComp();
    for (const k in comp) for (let i=0;i<comp[k];i++)
      spawn(k,'e', BAS_X-36-Math.random()*36, LANE_Y+(Math.random()*200-100));
  }
  siren(); shake=Math.max(shake,4);
  say('FALA '+wave, 'warn');
  if (wave%5===0) openDraft(deck, 'ROZKAZ ZE SZTABU');
  eIntel.push({
    tanks:  buildings.filter(b=>(b.type==='factory'||b.type==='heavy') && b.powered).length,
    wheels: buildings.filter(b=>b.type==='workshop' && b.powered).length,
    arty:   buildings.filter(b=>b.type==='arty' && b.powered).length,
  });
  eBuildDebt += 1/EBUILD_EVERY;
  while (eBuildDebt >= 1){ eBuildDebt -= 1; eBuild(); }
}

/* ============================ SYMULACJA =============================== */
function dmgTo(t,amount,srcType,ap){
  const S = srcType ? U[srcType] : null;
  let m=1;
  if (S && S.strong && S.strong.includes(t.type)) m=COUNTER;
  let d = amount*m;
  const arm = (U[t.type] && U[t.type].arm) || 0;
  if (arm && !ap && !(S && S.ap)) d = Math.max(1, d-arm);
  t.hp -= d; t.flash=1;
  if (t.side==='e' && U[t.type]) eDmgWave += d;
  if (t===bastion && !t.dead){ const pay=Math.max(0, Math.min(d, t.hp+d))*RAID_PAY; money+=pay; raidPay+=pay; }
  return m;
}
function update(dt){
  if (state!=='play') return;
  if (!ready) return;
  regrow(dt);
  updSect(dt);
  money += extract(dt) + terrIncome()*dt;
  timer -= dt;
  if (Number.isNaN(timer)) timer=WAVE_TIME;
  if (timer<=0){ doWave(); timer=WAVE_TIME; }
  newArm -= dt;
  eTerrBank += eTerrCtrl()*(100/ETERR_SEC)*dt;
  if (eTerrBank>=100){
    eTerrBank-=100;
    eBuild();
    say('◄ ZAJĘLI TWÓJ TEREN — ROZBUDOWUJĄ SIĘ','bad');
    siren(); shake=Math.max(shake,5);
  }
  eThink -= dt;
  if (eThink<=0){ eDecide(); eThink=ETHINK; }
  alertCd -= dt;
  if (alertCd<=0 && units.some(u=>u.side==='e'&&u.x<BASE_R+30)){ say('BAZA POD OSTRZAŁEM','bad'); siren(); alertCd=8; }
  fullCd -= dt;
  if (fullCd<=0 && money>800 && !roomFor('barracks')){
    say('KREDYTY LEŻĄ — BRAK KRATEK. ULEPSZAJ SZTAB.','warn'); fullCd=25;
  }
  ecoCd -= dt;
  if (ecoCd<=0 && wave>0 && seamsTapped()===0 && oreTotal()>0){
    say('MARTWA EKONOMIA — RUDA LEŻY NIETKNIĘTA','bad'); siren(); ecoCd=15;
  }
  if (!fieldDead && seamsAlive()===0 && wave>0){
    fieldDead=true;
    say('▬▬ POLE MARTWE ▬▬','bad');
    say('Nie została ani jedna żyła. Nic nie odrośnie.','warn');
    say('Zostało to, co masz. Rozbierz resztę na armię.','good');
    siren(); boom(0.8); shake=Math.max(shake,18);
  }
  for (const l of log) l.t += dt;

  const pU=units.filter(u=>u.side==='p'), eU=units.filter(u=>u.side==='e');

  for (const b of buildings){
    const d=B[b.type];
    if (!d.atk||!b.powered) continue;
    b.cd -= dt;
    if (b.cd>0) continue;
    let tgt=null, bd=d.atk.range;
    for (const u of eU){ const dist=Math.hypot(u.x-b.x,u.y-b.y); if (dist<bd){ bd=dist; tgt=u; } }
    if (tgt){ dmgTo(tgt,bDmg(b)*pBuff(),null,d.atk.ap); tracers.push({x1:b.x,y1:b.y,x2:tgt.x,y2:tgt.y,t:0.09,c:d.atk.ap?CO.warn:CO.blue}); b.cd=d.atk.rate; }
  }
  if (!bastion.dead){
    bastion.cd -= dt;
    if (bastion.cd<=0){
      let tgt=null, bd=BAS_RANGE;
      for (const u of pU){ const dist=Math.hypot(u.x-bastion.x,u.y-bastion.y); if (dist<bd){ bd=dist; tgt=u; } }
      if (tgt){
        const near = pU.filter(u=>Math.hypot(u.x-tgt.x,u.y-tgt.y)<=BAS_SPL_R)
                       .sort((a,b)=>Math.hypot(a.x-tgt.x,a.y-tgt.y)-Math.hypot(b.x-tgt.x,b.y-tgt.y))
                       .slice(0,BAS_SPL_N);
        for (const u of near) dmgTo(u,BAS_DMG,null);
        tracers.push({x1:bastion.x,y1:bastion.y,x2:tgt.x,y2:tgt.y,t:0.11,c:CO.red,w:2.4});
        explode(tgt.x,tgt.y,14,CO.warn); boom(0.22); shake=Math.max(shake,2);
        bastion.cd=BAS_RATE;
      }
    }
    if (bastion.flash>0) bastion.flash-=dt*6;
  }

  for (const u of units){
    const d=U[u.type];
    let list;
    if (u.side==='p'){ list = eU.slice(); if (!bastion.dead) list.push(bastion); }
    else { list = pU.slice(); if (u.x < BASE_R+40) list = list.concat(buildings); }
    let t=null, bd=340;
    if (d.hunt){
      let hb=1e9;
      for (const o of list){
        if (o.hp<=0 || o.type!==d.hunt) continue;
        const dist=Math.hypot(o.x-u.x,o.y-u.y);
        if (dist<hb){ hb=dist; t=o; }
      }
      if (t) bd=hb;
    }
    if (!t) for (const o of list){
      if (o.hp<=0) continue;
      const dist=Math.hypot(o.x-u.x,o.y-u.y);
      if (dist<bd){ bd=dist; t=o; }
    }
    if (t && bd<=d.range && bd>=(d.minR||0)){
      u.cd -= dt;
      if (u.cd<=0){
        let m=1;
        const out = d.dmg * (u.side==='p'?pBuff():1);
        if (d.spl){
          const foes = (u.side==='p'?eU:pU)
            .filter(o=>o.hp>0 && Math.hypot(o.x-t.x,o.y-t.y)<=d.splR)
            .sort((a,b)=>Math.hypot(a.x-t.x,a.y-t.y)-Math.hypot(b.x-t.x,b.y-t.y))
            .slice(0,d.spl);
          for (const o of foes) m=Math.max(m, dmgTo(o,out,u.type));
          if (t.hp!==undefined && !foes.includes(t)) dmgTo(t,out,u.type);
          explode(t.x,t.y,16,CO.warn); boom(0.13);
        } else {
          m=dmgTo(t,out,u.type);
        }
        tracers.push({x1:u.x,y1:u.y,x2:t.x,y2:t.y,t:m>1?0.13:0.07,
                      c:m>1?'#ffe680':(u.side==='p'?CO.blue:CO.red), w:m>1?2.8:1});
        if (m>1) for (let k=0;k<4;k++){
          const a=Math.random()*6.283, sp=45+Math.random()*70;
          fx.push({x:t.x,y:t.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:0.2,c:'#ffe680',r:2.4});
        }
        u.cd=d.rate;
      }
    } else {
      let vx,vy, sMul=1;
      if (t){
        const dx=t.x-u.x, dy=t.y-u.y, L=Math.hypot(dx,dy)||1;
        const away = (d.minR && bd < d.minR) ? -1 : 1;
        vx=dx/L*away; vy=dy/L*away;
      }
      else { vx = u.side==='p'?1:-1; vy=0; }
      const hunting = d.hunt && t && t.type===d.hunt && t.x <= lineX()+HUNT_LEASH;
      const LIM = lineX() + (hunting ? HUNT_LEASH : 0);
      if (u.side==='p'){
        if (u.x > LIM){ vx = -1; vy = 0; }
        else if (vx>0 && u.x + vx*d.spd*sMul*dt > LIM) vx = 0;
      }
      if (u.side==='e' && eStance==='hold'){
        if (u.x < EHOLD_X){ vx = 1; vy = 0; }
        else if (vx<0 && u.x + vx*d.spd*sMul*dt < EHOLD_X) vx = 0;
      }
      const fwd = u.side==='p' ? 1 : -1;
      if (isHeavy(d) && vx*fwd < 0) sMul = BACK_MUL;
      u.x += vx*d.spd*sMul*dt; u.y += vy*d.spd*sMul*dt;
    }
    if (u.x > BASE_R){
      const lo=LANE_Y-LANE_HALF, hi=LANE_Y+LANE_HALF;
      if (u.y<lo) u.y += Math.min(40*dt, lo-u.y);
      if (u.y>hi) u.y -= Math.min(40*dt, u.y-hi);
    }
    if (u.flash>0) u.flash-=dt*6;
  }

  const rl = radarLvl();
  for (const u of units){
    if (u.side!=='e') continue;
    let near = u.x < BASE_R+60;
    if (!near) for (const o of pU){ if (Math.hypot(o.x-u.x,o.y-u.y)<CONTACT){ near=true; break; } }
    u.nearT = near ? SEEN_HOLD : Math.max(0,(u.nearT||0)-dt);
    if (rl>=2)      u.seenT = SEEN_HOLD;
    else if (rl===1) u.seenT = u.nearT;
    else             u.seenT = 0;
  }

  for (let i=0;i<units.length;i++) for (let j=i+1;j<units.length;j++){
    const a=units[i], b=units[j];
    const dx=b.x-a.x, dy=b.y-a.y, min=U[a.type].sz+U[b.type].sz, d2=dx*dx+dy*dy;
    if (d2>min*min || d2<0.001) continue;
    const dist=Math.sqrt(d2), push=(min-dist)/2/dist;
    a.x-=dx*push; a.y-=dy*push; b.x+=dx*push; b.y+=dy*push;
  }

  for (let i=units.length-1;i>=0;i--){
    const u=units[i];
    if (u.hp>0) continue;
    corpses.push({x:u.x,y:u.y,s:U[u.type].sz,c:u.side==='p'?CO.blueD:CO.redD});
    if (corpses.length>500) corpses.shift();
    explode(u.x,u.y,U[u.type].sz*1.6,u.side==='p'?CO.blue:CO.red);
    if (U[u.type].sz>=8){ boom(0.18); shake=Math.max(shake,3); }
    if (u._view){ u._view.destroy({children:true}); u._view=null; }
    units.splice(i,1);
  }
  for (let i=buildings.length-1;i>=0;i--) if (buildings[i] && buildings[i].hp<=0){
    const b=buildings[i];
    if (b.type==='hq'){ state='over'; endReason='SZTAB ZNISZCZONY'; boom(0.8); shake=24; }
    killBuilding(b);
  }
  if (bastion.hp<=0 && !bastion.dead){
    bastion.dead=true;
    explode(bastion.x,bastion.y,90,CO.red); shake=26; boom(0.9);
    state='win'; endReason='BASTION ZDOBYTY';
  }
  if (state!=='play' && wave>best) best=wave;

  let target;
  if (bastion.dead) target=FRONT_MAX;
  else {
    let maxP=null, minE=null;
    for (const u of pU) if (maxP===null||u.x>maxP) maxP=u.x;
    for (const u of eU) if (minE===null||u.x<minE) minE=u.x;
    target=frontX;
    if (maxP!==null&&minE!==null) target=(maxP+minE)/2;
    else if (maxP!==null) target=maxP;
    else if (minE!==null) target=minE;
  }
  frontX += (Math.max(FRONT_MIN,Math.min(FRONT_MAX,target))-frontX) * Math.min(1,dt*2.5);

  for (let i=fx.length-1;i>=0;i--){
    const p=fx[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=0.94; p.vy*=0.94; p.life-=dt;
    if (p.life<=0) fx.splice(i,1);
  }
  for (let i=tracers.length-1;i>=0;i--){ tracers[i].t-=dt; if (tracers[i].t<=0) tracers.splice(i,1); }
  if (shake>0) shake=Math.max(0, shake-dt*30);
}
function explode(x,y,n,col){
  for (let i=0;i<n;i++){
    const a=Math.random()*6.283, s=20+Math.random()*90;
    fx.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:0.2+Math.random()*0.4,c:col,r:1+Math.random()*2.2});
  }
}

/* ============================ STEROWANIE LINIĄ ========================= */
function setStance(i){
  i=Math.max(0,Math.min(STANCES.length-1,i));
  if (i===si) return;
  const fwd = i>si;
  si=i;
  say((fwd?'LINIA W PRZÓD — ':'ODWRÓT — ')+STANCES[si].n, fwd?'warn':'good');
  if (si===STANCES.length-1){ siren(); shake=Math.max(shake,6); }
}
function toggleStance(){ setStance(si===STANCES.length-1 ? 0 : STANCES.length-1); }

/* ======================================================================= */
/* ============================ RENDER (PIXI) ============================ */
/* ======================================================================= */
const app = new PIXI.Application();
const WV = { x:24, y:150, w:1170, h:356 };        // widoczny wycinek świata
const cam = { zoom:1, min:0.2, max:3, panX:0, panY:0 };
let glyphTex = {};                                // type -> Texture (glif jasny/szary)
const SREF = 12, GB = SREF*3.6;                   // referencyjny rozmiar / półbok tekstury
let worldRoot, gWorld, worldText, buildLayer, bastionLayer, unitLayer, gOver, ghostG;
let logDirty=true;

async function initPixi(){
  await app.init({ background: CO.bg, antialias:false, resizeTo:window,
                   resolution: Math.min(2, window.devicePixelRatio||1), autoDensity:true });
  document.getElementById('stage').appendChild(app.canvas);

  worldRoot = new PIXI.Container();          app.stage.addChild(worldRoot);
  gWorld    = new PIXI.Graphics();           worldRoot.addChild(gWorld);
  worldText = new PIXI.Container();           worldRoot.addChild(worldText);
  buildLayer= new PIXI.Container();           worldRoot.addChild(buildLayer);
  bastionLayer=new PIXI.Container();          worldRoot.addChild(bastionLayer);
  unitLayer = new PIXI.Container();           worldRoot.addChild(unitLayer);
  gOver     = new PIXI.Graphics();            worldRoot.addChild(gOver);
  ghostG    = new PIXI.Graphics();            worldRoot.addChild(ghostG);

  buildGlyphs();
  resizeCam();
  window.addEventListener('resize', resizeCam);
}

// --- glify jednostek jako tekstury (jasny=biały, ciemny=szary → tint per strona)
function drawGlyph(g, type, s){
  const L=0xffffff, D=0x9a9a9a;
  const rect=(x,y,w,h,c)=>{ g.rect(x,y,w,h); g.fill(c); };
  switch(type){
    case 'inf':
      rect(-s*0.5,-s*0.5,s,s*1.5,L); rect(-s*0.35,-s*1.15,s*0.7,s*0.65,L);
      rect(s*0.3,-s*0.25,s*0.7,s*0.22,D); break;
    case 'rkt':
      rect(-s*0.5,-s*0.4,s,s*1.4,L); rect(-s*0.35,-s*1.05,s*0.7,s*0.65,L);
      { const c=new PIXI.Graphics(); c.rect(-s*0.25,-s*2.1,s*0.5,s*2.1).fill(D); c.rect(-s*0.45,-s*2.3,s*0.9,s*0.4).fill(L);
        c.rotation=-0.55; c.x=0; c.y=-s*0.3; g.addChild(c); } break;
    case 'tank':
      rect(-s,-s*0.95,s*2,s*0.3,D); rect(-s,s*0.65,s*2,s*0.3,D);
      rect(-s*0.95,-s*0.7,s*1.9,s*1.4,L); rect(-s*0.45,-s*0.45,s*0.9,s*0.9,D);
      rect(s*0.35,-s*0.14,s*1.1,s*0.28,D); break;
    case 'lazik':
      g.circle(-s*0.55,s*0.55,s*0.34).fill(D); g.circle(s*0.55,s*0.55,s*0.34).fill(D);
      rect(-s*0.9,-s*0.25,s*1.8,s*0.75,L); rect(-s*0.35,-s*0.7,s*0.8,s*0.5,L);
      rect(s*0.2,-s*0.85,s*0.7,s*0.16,D); break;
    case 'arty':
      rect(-s*0.9,s*0.35,s*1.8,s*0.35,D); rect(-s*0.75,-s*0.15,s*1.5,s*0.7,L);
      { const c=new PIXI.Graphics(); c.rect(0,-s*0.16,s*2.9,s*0.32).fill(D); c.rotation=-0.75; c.y=-s*0.1; g.addChild(c);} break;
    case 'kolos':
      rect(-s,-s*1.0,s*2,s*0.34,D); rect(-s,s*0.66,s*2,s*0.34,D);
      rect(-s*0.95,-s*0.75,s*1.9,s*1.5,L); rect(-s*0.5,-s*0.5,s,s,D);
      rect(s*0.4,-s*0.42,s*1.15,s*0.2,D); rect(s*0.4,s*0.22,s*1.15,s*0.2,D); break;
  }
}
function buildGlyphs(){
  for (const type of Object.keys(U)){
    const c=new PIXI.Container();
    const g=new PIXI.Graphics(); c.addChild(g);
    drawGlyph(g, type, SREF);
    const tx=app.renderer.generateTexture({ target:c, frame:new PIXI.Rectangle(-GB,-GB,GB*2,GB*2) });
    glyphTex[type]=tx;
    c.destroy({children:true});
  }
}

// --- kamera ---------------------------------------------------------------
function bandRect(){
  const sw=app.screen.width, sh=app.screen.height;
  const top = sw<=720 ? 96 : 66;
  const bot = (sw<=720 ? 92 : 100) + 44;        // buildbar + suwak
  return { sw, sh, top, bandH: Math.max(60, sh - top - bot) };
}
function resizeCam(){
  const {sw, sh, bandH}=bandRect();
  const fillH = bandH / WV.h;
  const fitAll= Math.min(sw / WV.w, fillH);
  cam.min = Math.min(fitAll, fillH);
  cam.max = Math.max(fillH*1.8, fitAll*3);
  // telefon / pion → wypełnij wysokość i przewijaj w poziomie (żądana funkcja);
  // szeroki desktop → pokaż całe pole naraz (fit-all), a kółko/pinch przybliża.
  const portraitish = sw<=900 || sw < sh*1.2;
  const z0 = portraitish ? fillH : fitAll;
  if (!cam._init){ cam.zoom = z0; cam._init=true; }
  cam.zoom = clamp(cam.zoom, cam.min, cam.max);
  clampCam();
}
function clampCam(){
  const {sw, top, bandH}=bandRect();
  cam.zoom = clamp(cam.zoom, cam.min, cam.max);
  const cw=WV.w*cam.zoom, ch=WV.h*cam.zoom;
  if (cw<=sw) cam.panX = (sw-cw)/2 - WV.x*cam.zoom;
  else cam.panX = clamp(cam.panX, sw-cw-WV.x*cam.zoom, -WV.x*cam.zoom);
  if (ch<=bandH) cam.panY = top + (bandH-ch)/2 - WV.y*cam.zoom;
  else cam.panY = clamp(cam.panY, top+bandH-ch-WV.y*cam.zoom, top-WV.y*cam.zoom);
}
function applyCam(){
  worldRoot.scale.set(cam.zoom);
  let sx=0, sy=0;
  if (shake>0){ sx=(Math.random()-0.5)*shake; sy=(Math.random()-0.5)*shake; }
  worldRoot.x = cam.panX + sx;
  worldRoot.y = cam.panY + sy;
}
function screenToWorld(px,py){
  return { x:(px - worldRoot.x)/cam.zoom, y:(py - worldRoot.y)/cam.zoom };
}

// --- pula tekstów świata --------------------------------------------------
const wtPool=[]; let wtN=0;
function wtBegin(){ wtN=0; }
function wt(str,x,y,size,color,o={}){
  let t=wtPool[wtN];
  if (!t){ t=new PIXI.Text({text:'',style:{fontFamily:'monospace',fontSize:size,fill:color}});
           worldText.addChild(t); wtPool.push(t); }
  const st=t.style;
  if (st.fontSize!==size) st.fontSize=size;
  const f = o.bold?'700':'400'; if (st.fontWeight!==f) st.fontWeight=f;
  if (st.fill!==color) st.fill=color;
  if (t.text!==str) t.text=str;
  t.anchor.set(o.ax==null?0.5:o.ax, o.ay==null?0.5:o.ay);
  t.x=x; t.y=y; t.alpha=o.alpha==null?1:o.alpha; t.visible=true; t.rotation=o.rot||0;
  wtN++;
}
function wtEnd(){ for(let i=wtN;i<wtPool.length;i++) wtPool[i].visible=false; }

// --- rysowanie świata (siatka/sektory/linie/wraki/fx) --------------------
const now = () => performance.now();
function drawWorld(){
  const g=gWorld; g.clear();
  wtBegin();
  const ly=LANE_Y-LANE_HALF, lh=LANE_HALF*2;

  // pas
  g.rect(BASE_R,ly,BAS_X+40-BASE_R,lh).fill(CO.dirt);
  g.rect(BASE_R+0.5,ly+0.5,BAS_X+40-BASE_R-1,lh-1).stroke({width:1,color:CO.laneEdge});

  // strefy sektorów
  for (const q of SECT){
    const col = q.own===1 ? CO.warn : q.own===-1 ? CO.red : null;
    if (col){ g.rect(q.x-CAP_R, ly, CAP_R*2, lh).fill({color:col, alpha:0.13}); }
    else { g.rect(q.x-CAP_R, ly+0.5, CAP_R*2, lh-1).stroke({width:1,color:CO.gridHi, alpha:0.5}); }
  }
  if (!bastion.dead) g.rect(BAS_X-40,ly,80,lh).fill({color:CO.red, alpha:0.17});
  if (!bastion.dead) g.rect(frontX-1,ly,2,lh).fill({color:'#ffffff', alpha:0.5});

  // mini-sztaby + paski przejęcia
  const MS_W=30, MS_H=34;
  for (const q of SECT){
    const known = radarLvl()>=1 || q.own===1;
    const col = !known ? '#5c6a70' : q.own===1 ? CO.warn : q.own===-1 ? CO.red : '#5c6a70';
    const mx=q.x-MS_W/2, my=LANE_Y-MS_H/2;
    g.roundRect(mx,my,MS_W,MS_H,3).fill('#11171a');
    g.roundRect(mx,my,MS_W,MS_H,3).fill({color:col, alpha:q.own?0.30:0.10});
    g.roundRect(mx+0.5,my+0.5,MS_W-1,MS_H-1,3).stroke({width:q.own?2:1,color:col});
    g.rect(mx+3,my+3,MS_W-6,3).fill(col);
    wt(q.own?'★':'□', q.x, LANE_Y, 13, q.own?col:'#7c8a90', {bold:true});
    wt(q.n, q.x, ly-16, 9, q.own?col:CO.dim, {bold:true});
    const bw=64, bx=q.x-bw/2, by=ly-12;
    g.rect(bx,by,bw,5).fill('#0b0f10');
    const f=Math.abs(q.cap)/100*(bw/2);
    if (q.cap>=0) g.rect(q.x,by,f,5).fill(CO.warn); else g.rect(q.x-f,by,f,5).fill(CO.red);
    g.rect(q.x,by,1,5).fill(CO.gridHi);
    if (q.own===1) wt('+'+Math.round(TERR_MAX/SECT.length)+' kr./s', q.x, ly-26, 8, CO.warn, {bold:true});
    else if (q.own===0 && q.cap===0) wt('NICZYJ', q.x, ly-26, 8, CO.dim);
  }

  // ich teren
  const ec=eTerrCtrl();
  if (ec>0.02){
    const ex=BAS_X-ec*(BAS_X-BASE_R);
    g.rect(ex-1,ly,2,26).fill({color:CO.red, alpha:0.55});
    wt('ICH TEREN '+Math.round(ec*100)+'%', ex+42, ly+7, 9, CO.red, {bold:true, ax:0.5});
    g.rect(ex+5,ly+15,76,5).fill('#000000');
    g.rect(ex+5,ly+15,76*(eTerrBank/100),5).fill(CO.red);
  }

  // linia masowania wroga
  const massed = eStance==='hold' ? units.filter(u=>u.side==='e').length : 0;
  if (massed>0){
    dashV(g, EHOLD_X, ly, ly+lh, CO.red, 0.4);
    wt('MASUJĄ SIĘ — '+massed, EHOLD_X, ly-4, 8, CO.red);
  }
  // linia gracza
  if (si < STANCES.length-1){
    const LX=lineX();
    dashV(g, LX, ly, ly+lh, CO.ok, 0.45);
    wt('LINIA — '+STANCES[si].n, LX, ly-4, 8, CO.ok);
  }

  // wraki
  for (const c of corpses) g.rect(c.x-c.s/2,c.y-c.s/2,c.s,c.s*0.6).fill({color:c.c, alpha:0.5});

  // baza: siatka + ruda
  drawBaseGrid(g);

  wtEnd();
}
function dashV(g,x,y0,y1,color,alpha){
  for (let y=y0;y<y1;y+=12){ g.moveTo(x,y).lineTo(x,Math.min(y1,y+6)); }
  g.stroke({width:2,color,alpha});
}
function drawBaseGrid(g){
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
    const x=BASE_X+c*CELL, y=BASE_Y+r*CELL, cell=grid[r][c];
    g.rect(x+1,y+1,CELL-2,CELL-2).fill(CO.grid);
    if (cell.seam && !cell.b){
      const f=cell.ore/ORE_MAX;
      g.rect(x+4,y+4,CELL-8,CELL-8).fill({color:CO.oreDark, alpha:0.20+0.80*f});
      if (cell.ore>0){
        const n=Math.max(1,Math.ceil(6*f));
        for (let i=0;i<n;i++) g.rect(x+9+((i*17+r*7+c*5)%(CELL-22)), y+9+((i*23+c*11+r*3)%(CELL-22)),5,5).fill(CO.ore);
      }
      if (cell.pull){
        if (f<=0.03) wt('SĄCZY +'+ORE_REGEN, x+CELL/2, y+CELL-6, 6, CO.ok);
        else if (f<0.34) wt('SCHYŁEK', x+CELL/2, y+CELL-6, 6, CO.red);
      } else if (f<0.995){
        g.rect(x+7,y+CELL-11,CELL-14,4).fill('#000000');
        g.rect(x+7,y+CELL-11,(CELL-14)*f,4).fill(CO.ore);
        wt('▲ '+Math.round(f*100)+'%', x+CELL/2, y+CELL-15, 6, CO.warn);
      }
    }
  }
  g.rect(BASE_X-0.5,BASE_Y-0.5,COLS*CELL+1,ROWS*CELL+1).stroke({width:1,color:CO.gridHi});
}

// --- budynki --------------------------------------------------------------
function ensureBuildingView(b){
  if (b._view) return b._view;
  const d=B[b.type];
  const v=new PIXI.Container(); v.x=0; v.y=0;
  v.g=new PIXI.Graphics(); v.addChild(v.g);
  const tex=buildTex(b.type);
  if (tex){ v.spr=new PIXI.Sprite(tex); v.spr.anchor.set(0.5); v.addChild(v.spr); }
  v.ico=new PIXI.Text({text:d.ico, style:{fontFamily:'monospace',fontSize:d.fp[0]>1?24:18,fontWeight:'700',fill:'#000'}});
  v.ico.anchor.set(0.5); v.addChild(v.ico);
  v.lab=new PIXI.Text({text:d.short, style:{fontFamily:'monospace',fontSize:8,fontWeight:'700',fill:'#000'}});
  v.lab.anchor.set(0.5,1); v.addChild(v.lab);
  buildLayer.addChild(v); b._view=v; return v;
}
function drawBuildings(){
  for (const b of buildings){
    const v=ensureBuildingView(b), d=B[b.type];
    const [w,h]=d.fp, R={x:BASE_X+b.c*CELL, y:BASE_Y+b.r*CELL, w:w*CELL, h:h*CELL};
    const pulse = b.brown && (now()%600<300);
    const body = b.flash>0 ? '#ffffff' : (b.powered ? d.col : (pulse?'#5c2a2a':'#3d2222'));
    v.g.clear();
    if (v.spr){
      v.spr.x=R.x+R.w/2; v.spr.y=R.y+R.h/2;
      const sc=Math.min((R.w-6)/v.spr.texture.width,(R.h-6)/v.spr.texture.height);
      v.spr.scale.set(sc); v.spr.tint = b.flash>0?0xffffff:(b.powered?0xffffff:0x884444);
    } else {
      v.g.rect(R.x+3,R.y+3,R.w-6,R.h-6).fill(body);
    }
    v.g.rect(R.x+3,R.y+R.h-17,R.w-6,14).fill({color:'#000000', alpha:0.32});
    // ikona
    v.ico.visible=!v.spr; v.ico.x=R.x+R.w/2; v.ico.y=R.y+R.h/2-6;
    v.ico.style.fill = b.powered?'rgba(0,0,0,.6)':'rgba(255,255,255,.25)';
    // etykieta
    let label=d.short, lcol=b.brown?CO.red:'rgba(0,0,0,.6)';
    if (b.brown) label='PRZECIĄŻENIE';
    else if (b.type==='hq' && b.lvl>1){ label='SZTAB +'+Math.round((b.lvl-1)*HQ_STEP*100)+'%'; }
    else if (b.type==='refinery'){
      let seams=0; for (const [cc,rr] of ringOf(b.type,b.c,b.r)) if (grid[rr][cc].seam) seams++;
      if (seams===0){ label='BEZ ZŁOŻA'; lcol=(now()%700<350)?CO.warn:'#6b5320'; }
    }
    v.lab.text=label; v.lab.style.fill=lcol; v.lab.x=R.x+R.w/2; v.lab.y=R.y+R.h-4;
    // poziomy (pipsy)
    if (b.type!=='hq' && (b.lvl>1 || canUp(b))){
      for (let i=0;i<maxLvl();i++)
        v.g.rect(R.x+R.w-10-i*6, R.y+6, 4,4).fill(i<b.lvl?(b.powered?'rgba(0,0,0,.75)':CO.warn):'rgba(255,255,255,.13)');
    }
    // pasek hp
    if (b.hp<b.maxHp){
      v.g.rect(R.x+5,R.y+2,R.w-10,3).fill('#000000');
      v.g.rect(R.x+5,R.y+2,(R.w-10)*Math.max(0,b.hp/b.maxHp),3).fill(CO.ok);
    }
    if (b.flash>0) b.flash-=0.06;
  }
}

// --- bastion --------------------------------------------------------------
let bastionView=null;
function drawBastion(){
  if (!bastionView){
    bastionView=new PIXI.Container(); bastionLayer.addChild(bastionView);
    bastionView.g=new PIXI.Graphics(); bastionView.addChild(bastionView.g);
    const bt=tex('bastion');
    if (bt){ bastionView.spr=new PIXI.Sprite(bt); bastionView.spr.anchor.set(0.5);
             bastionView.spr.x=bastion.x; bastionView.spr.y=bastion.y;
             bastionView.spr.scale.set(200/Math.max(bastionView.spr.texture.height,1));
             bastionView.addChild(bastionView.spr); }
    bastionView.sym=new PIXI.Text({text:'☭', style:{fontFamily:'monospace',fontSize:30,fontWeight:'700',fill:'#000'}});
    bastionView.sym.anchor.set(0.5); bastionView.addChild(bastionView.sym);
    bastionView.hp=new PIXI.Text({text:'', style:{fontFamily:'monospace',fontSize:9,fill:CO.dim}});
    bastionView.hp.anchor.set(0.5); bastionView.addChild(bastionView.hp);
    bastionView.eff=new PIXI.Text({text:'', style:{fontFamily:'monospace',fontSize:9,fontWeight:'700',fill:CO.dim}});
    bastionView.eff.anchor.set(0.5); bastionView.addChild(bastionView.eff);
  }
  const b=bastion, g=bastionView.g; g.clear();
  if (b.dead){
    g.rect(b.x-26,b.y-90,52,180).fill('#1a2620');
    g.rect(b.x-26.5,b.y-90.5,53,181).stroke({width:1,color:CO.crtDim});
    bastionView.sym.visible=false; bastionView.hp.visible=false;
    if (bastionView.spr) bastionView.spr.visible=false;
    bastionView.eff.text='ZDOBYTY'; bastionView.eff.style.fill=CO.ok; bastionView.eff.x=b.x; bastionView.eff.y=b.y;
    return;
  }
  if (bastionView.spr){
    bastionView.spr.visible=true; bastionView.spr.tint=b.flash>0?0xffffff:0xffffff;
  } else {
    g.rect(b.x-30,b.y-100,60,200).fill(CO.redD);
    g.rect(b.x-24,b.y-94,48,188).fill(b.flash>0?'#ffffff':CO.red);
  }
  g.rect(b.x-30,b.y-112,60,7).fill('#000000');
  g.rect(b.x-30,b.y-112,60*Math.max(0,b.hp/b.maxHp),7).fill(CO.red);
  bastionView.sym.visible=!bastionView.spr; bastionView.sym.x=b.x; bastionView.sym.y=b.y+10;
  bastionView.hp.visible=true; bastionView.hp.text=Math.max(0,Math.ceil(b.hp))+' / '+b.maxHp;
  bastionView.hp.x=b.x; bastionView.hp.y=b.y-119;
  const eff=Math.round(bEff()*100);
  bastionView.eff.text='ICH PRODUKCJA '+eff+'%'; bastionView.eff.style.fill=eff<100?CO.ok:CO.dim;
  bastionView.eff.x=b.x; bastionView.eff.y=b.y-129;
  if (raidPay>0.5){ raidShow=Math.min(90, raidShow+raidPay); raidPay=0; }
  raidShow*=0.965;
}

// --- jednostki ------------------------------------------------------------
function ensureUnitView(u){
  if (u._view) return u._view;
  const d=U[u.type];
  const v=new PIXI.Container();
  const tex = unitTex(u.type) || glyphTex[u.type];
  v.spr=new PIXI.Sprite(tex); v.spr.anchor.set(0.5);
  const sc=(unitTex(u.type) ? (d.sz*2.6)/Math.max(v.spr.texture.width,1) : d.sz/SREF);
  v._sc=sc; v.addChild(v.spr);
  // mgła (bryła + ?)
  v.fog=new PIXI.Graphics();
  const s=d.sz;
  v.fog.rect(-s*0.85,-s*0.85,s*1.7,s*1.7).fill('#8a4040');
  v.fog.rect(-s*0.85,-s*0.85,s*1.7,s*0.35).fill('#5c2a2a');
  v.addChild(v.fog);
  if (s>=6){ v.q=new PIXI.Text({text:'?',style:{fontFamily:'monospace',fontSize:Math.round(s*1.1),fontWeight:'700',fill:'rgba(0,0,0,.45)'}}); v.q.anchor.set(0.5); v.fog.addChild(v.q); }
  v.hp=new PIXI.Graphics(); v.addChild(v.hp);
  unitLayer.addChild(v); u._view=v; return v;
}
function drawUnits(){
  const rl=radarLvl();
  for (const u of units){
    const v=ensureUnitView(u), d=U[u.type], s=d.sz, p=u.side==='p';
    const vis   = p || u.nearT>0 || rl>=2;
    const known = p || (u.seenT>0);
    v.visible=vis; if (!vis) continue;
    v.x=u.x; v.y=u.y;
    v.spr.visible=known; v.fog.visible=!known;
    if (known){
      v.spr.scale.set(v._sc * (p?1:-1), v._sc);
      v.spr.tint = u.flash>0 ? 0xffffff : HEX(p?CO.blue:CO.red);
    }
    v.hp.clear();
    if (u.hp<u.maxHp){
      v.hp.rect(-s,-s-7,s*2,2).fill('#000000');
      v.hp.rect(-s,-s-7,s*2*Math.max(0,u.hp/u.maxHp),2).fill(CO.ok);
    }
    if (u.flash>0) u.flash-=0.06;
  }
}

// --- tracery + fx ---------------------------------------------------------
function drawOver(){
  const g=gOver; g.clear();
  for (const t of tracers){
    g.moveTo(t.x1,t.y1).lineTo(t.x2,t.y2).stroke({width:t.w||1, color:t.c, alpha:Math.min(1,t.t/0.07)});
  }
  for (const p of fx){
    g.rect(p.x-p.r/2,p.y-p.r/2,p.r,p.r).fill({color:p.c, alpha:Math.max(0,p.life*2)});
  }
}

// --- ghost budowy ---------------------------------------------------------
function drawGhost(){
  const g=ghostG; g.clear();
  if (state!=='play') return;
  const cell = wmouse.over ? cellAt(wmouse.x,wmouse.y) : null;
  if (sel && sel!=='SELL' && cell){
    const d=B[sel], [w,h]=d.fp;
    const ok = fits(sel,cell.c,cell.r) && money>=d.cost;
    for (let rr=cell.r; rr<cell.r+h; rr++) for (let cc=cell.c; cc<cell.c+w; cc++){
      const bad = cc<0||cc>=COLS||rr<0||rr>=ROWS || (grid[rr]&&grid[rr][cc]&&(grid[rr][cc].ore>0||grid[rr][cc].b));
      g.rect(BASE_X+cc*CELL+3, BASE_Y+rr*CELL+3, CELL-6, CELL-6).fill({color:bad?CO.red:d.col, alpha:0.5});
    }
    g.rect(BASE_X+cell.c*CELL+1, BASE_Y+cell.r*CELL+1, w*CELL-2, h*CELL-2).stroke({width:2,color:ok?d.col:CO.red});
  } else if (sel==='SELL' && cell){
    const g0=grid[cell.r][cell.c];
    if (g0.b){ const R={x:BASE_X+g0.b.c*CELL,y:BASE_Y+g0.b.r*CELL,w:B[g0.b.type].fp[0]*CELL,h:B[g0.b.type].fp[1]*CELL};
      g.rect(R.x+2.5,R.y+2.5,R.w-5,R.h-5).stroke({width:2,color:g0.b.type==='hq'?CO.dim:CO.red}); }
    else if (g0.seam){ g.rect(BASE_X+cell.c*CELL+3,BASE_Y+cell.r*CELL+3,CELL-7,CELL-7).stroke({width:2,color:CO.warn}); }
  }
}

/* ======================================================================= */
/* ============================== HUD (DOM) ============================== */
/* ======================================================================= */
const qs = id => document.getElementById(id);
const KCOL = {WOJSKO:CO.blue, RUDA:CO.ore, KRATKI:CO.ok, 'WRÓG':CO.red, WROG:CO.red};

function buildBar(){
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
  sell.addEventListener('click', ()=>{ sel = sel==='SELL'?null:'SELL'; });
  bar.appendChild(sell);
}
function updateBar(){
  const bar=qs('buildbar');
  for (const el of bar.children){
    const t=el.dataset.type;
    if (t==='SELL'){ el.classList.toggle('on', sel==='SELL'); continue; }
    const d=B[t], lock=!unlocked(t), afford=money>=d.cost;
    el.classList.toggle('lock', lock);
    el.classList.toggle('poor', !lock && !afford);
    el.classList.toggle('on', sel===t);
    el.style.borderColor = sel===t ? d.col : '';
    el.querySelector('.ico').textContent = lock?'▪':d.ico;
    el.querySelector('.ico').style.color = lock?'#2b3538':d.col;
    el.querySelector('.nm').textContent = d.name;
    el.querySelector('.nm').style.color = lock?'#46555a':(afford?CO.txt:CO.dim);
    el.querySelector('.fp').textContent = d.fp[0]+'×'+d.fp[1];
    const costEl=el.querySelector('.cost');
    const descEl=el.querySelector('.desc');
    if (lock){ costEl.textContent='wymaga: '+reqText(t); costEl.style.color='#3d4b4f'; descEl.textContent=''; }
    else {
      let extra = d.sup?' · +'+d.sup+' mocy' : (d.drn?' · −'+d.drn+' mocy':'');
      costEl.textContent = d.cost+' kr.'+extra;
      costEl.style.color = afford?CO.warn:'#5a6467';
      let sub=d.desc||''; if (d.unit) sub='co falę: '+(d.count||1)+'× '+U[d.unit].name;
      descEl.textContent=sub;
    }
  }
}
function onBuildTile(t){
  if (!unlocked(t)){ say('WYMAGA: '+reqText(t).toUpperCase(),'warn'); toast('WYMAGA: '+reqText(t)); return; }
  sel = sel===t ? null : t;
}

function buildStanceSlider(){
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
    const on=i===si, push=i===STANCES.length-1;
    el.classList.toggle('on', on);
    el.classList.toggle('push', push);
    el.querySelector('.sd').textContent = on ? STANCES[i].d : '';
  });
}

function renderCards(){
  const row=qs('cards-row'); row.innerHTML='';
  qs('cards-title').textContent=draftT;
  qs('cards-sub').textContent=draftS;
  (draft||[]).forEach((c,i)=>{
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
function syncOverlays(){
  qs('cards').classList.toggle('hidden', state!=='draft');
  const over = (state==='win'||state==='over');
  qs('end').classList.toggle('hidden', !over);
  if (over){
    const win=state==='win';
    const t=qs('end-title'); t.textContent=win?'ZWYCIĘSTWO':'PRZEGRANA';
    t.className=win?'win':'lose';
    qs('end-reason').textContent=endReason;
    qs('end-stats').textContent=doc.name+' · fala '+wave+' · bastion '+Math.max(0,Math.round(bastion.hp))+'/'+BAS_HP+' · rekord: fala '+best;
  }
  qs('ready').classList.toggle('hidden', !(state==='play' && !ready));
}

let toastT=0;
function toast(msg){
  const box=qs('toasts');
  const el=document.createElement('div'); el.className='toast'; el.textContent=msg;
  box.appendChild(el);
  setTimeout(()=>el.remove(), 2400);
  while (box.children.length>3) box.firstChild.remove();
}

let logShown='', compShown='';
function updateLog(){
  const el=qs('log');
  const html = log.map((l,i)=>{
    const age=log.length-1-i;
    const K={info:CO.crt, good:CO.ok, warn:CO.warn, bad:CO.red, intel:CO.intel};
    const alpha=Math.max(0.3,1-age*0.13);
    const full=l.txt+(l.n>1?' ×'+l.n:'');
    return `<div class="ln" style="color:${K[l.kind]||CO.crt};opacity:${alpha}">&gt;&gt; ${full}</div>`;
  }).join('');
  if (html!==logShown){ el.innerHTML=html; logShown=html; }
}

function syncDocUI(){ /* miejsce na hook doktryny */ }

function updateHUD(){
  // kredyty
  const ir=incomeRate(), ti=terrIncome();
  qs('cr').textContent=Math.floor(money);
  qs('cr-rate').textContent='+'+Math.round(ir+ti)+'/s';
  const lost=TERR_MAX-ti;
  qs('cr-break').textContent='ruda '+Math.round(ir)+' · teren '+Math.round(ti)+(lost>2?' ▼'+Math.round(lost):'');
  // moc
  const over=offBrown>0;
  qs('pw').textContent=drain+' / '+supply;
  qs('pw').style.color = over?CO.bad:CO.power;
  qs('pw-lbl').style.color = over?CO.bad:CO.dim;
  qs('pw-bar').style.width=(supply?Math.min(1,drain/supply)*100:0)+'%';
  qs('pw-bar').style.background = over?CO.bad:CO.power;
  qs('pw-note').textContent = over?(offBrown+' WYŁĄCZONE'):'';
  // ruda
  const ob=oreBreak(), ot=oreTotal(), of=oreStart?ot/oreStart:0, dry=of<0.25&&ob.rich>0;
  qs('ore').textContent=Math.floor(ot);
  qs('ore').style.color = dry?CO.bad:CO.ore;
  qs('ore-bar').style.width=(of*100)+'%';
  qs('ore-bar').style.background = dry?CO.bad:CO.ore;
  let note='', ncol=CO.dim;
  if (seamsAlive()===0){ note='POLE MARTWE — NIC NIE ODROŚNIE'; ncol=CO.bad; }
  else if (seamsTapped()===0){ note='◄ RUDA LEŻY — PRZENIEŚ RAFINERIĘ'; ncol=CO.bad; }
  else if (ob.rich>0){ const net=ob.richRate-ob.rich*ORE_REGEN;
    note='złoża na '+Math.ceil(ot/Math.max(1,net)/WAVE_TIME)+' fal'; ncol=CO.dim; }
  else { note='SĄCZEK +'+ob.sipRate.toFixed(1)+'/s — BEZ KOŃCA'; ncol=CO.ok; }
  qs('ore-note').textContent=note; qs('ore-note').style.color=ncol;
  // fala
  qs('wave').textContent=wave;
  qs('timer').textContent='kontakt 0:'+String(Math.max(0,Math.ceil(timer))).padStart(2,'0');
  qs('timer').style.color = timer<5?CO.bad:CO.dim;
  qs('ebase').textContent='ich baza: '+eBase.length+' ob.';

  // wywiad
  const radar=radarLvl()>=2, comp=eComp();
  qs('intel-title').textContent = radar ? '▌ WYWIAD — '+doc.name+' · FALA '+(wave+1)
    : '▌ BEZ RADARU — POZNASZ ICH W ZWARCIU · '+doc.name;
  qs('intel-title').style.color = radar?CO.intel:CO.bad;
  const compEl=qs('intel-comp');
  let compHTML;
  if (radar){
    const ks=Object.keys(comp);
    compHTML = ks.length ? ks.map(k=>`<span class="u">${U[k].name} ×${comp[k]}</span>`).join('') : '—';
  } else compHTML = '<span style="color:#4a2f2f">∿∿∿ sygnał nierozpoznany ∿∿∿</span>';
  if (compHTML!==compShown){ compEl.innerHTML=compHTML; compShown=compHTML; }
  qs('intel-hint').textContent='⚑ '+doc.hint;
  const eN=units.filter(u=>u.side==='e').length, r=eRatio();
  const intent=qs('intel-intent');
  if (!radar){ intent.textContent='ICH ZAMIARY: ?'; intent.style.color='#4a2f2f'; }
  else if (eStance==='push'){ intent.textContent='▲ SZTURM — IDĄ · '+eN+' · ×'+r.toFixed(2); intent.style.color=CO.bad; }
  else if (eN<6 && !bastion.dead){ intent.textContent='▶ OKNO — ICH STRONA PUSTA · NACIERAJ'; intent.style.color=CO.ok; }
  else if (r<0.75 && !bastion.dead){ intent.textContent='▶ PRZEWAGA ×'+(1/r).toFixed(1)+' — NACIERAJ'; intent.style.color=CO.ok; }
  else { const pat=EPATIENCE*Math.max(0.25,1-eN/EPAT_MASS);
    intent.textContent='masują '+eN+' · ×'+r.toFixed(2)+' · RUSZAJĄ ZA '+Math.max(0,Math.ceil(pat-eHoldT))+' s';
    intent.style.color=eHoldT>pat*0.6?CO.warn:CO.dim; }

  // kontrolki
  const push=si===STANCES.length-1;
  const sb=qs('stance-btn');
  sb.textContent=(push?'▶▶ ':'▮▮ ')+STANCES[si].n;
  sb.classList.toggle('push', push);
  qs('speed-btn').textContent='» '+speed+'×';
  qs('speed-btn').classList.toggle('on', speed>1);
  const armed=newArm>0;
  qs('new-btn').textContent=armed?'PEWNO?':'⟲ NOWA';
  qs('new-btn').classList.toggle('on', armed);
  qs('mute-btn').textContent=isMuted()?'♪ ✕':'♪ WŁ.';

  updateBar();
  updateStanceSlider();
  updateLog();
}

/* ============================ WEJŚCIE / INPUT ========================== */
function cellAt(px,py){
  const c=Math.floor((px-BASE_X)/CELL), r=Math.floor((py-BASE_Y)/CELL);
  return (c>=0&&c<COLS&&r>=0&&r<ROWS)?{c,r}:null;
}
function worldTap(px,py){
  if (state!=='play') return;
  const w=screenToWorld(px,py);
  const cell=cellAt(w.x,w.y);
  if (!cell) return;
  const {c,r}=cell, g=grid[r][c];

  if (sel==='SELL'){
    if (!g.b && g.seam){
      const salv=Math.floor(g.ore*CLEAR_SALV);
      money+=salv; g.ore=0; g.seam=false;
      say(salv>0?'ŻYŁA ZAORANA — ODZYSK '+salv+' kr.':'ŻYŁA ZAORANA — NIE ODROŚNIE','warn');
      explode(BASE_X+(c+0.5)*CELL, BASE_Y+(r+0.5)*CELL, 18, CO.ore); boom(0.2); shake=Math.max(shake,4);
      return;
    }
    const b=g.b; if (!b) return;
    if (b.type==='hq'){ say('SZTABU NIE SPRZEDASZ','warn'); toast('SZTABU NIE SPRZEDASZ'); return; }
    let put=B[b.type].cost; for (let l=1;l<b.lvl;l++) put+=B[b.type].cost*l;
    const back=Math.floor(put*SELL_BACK); money+=back;
    say('ROZEBRANO — '+B[b.type].name+' · +'+back+' kr.','good');
    if (b._view){ b._view.destroy({children:true}); b._view=null; }
    clearCells(b); buildings.splice(buildings.indexOf(b),1);
    explode(b.x,b.y,16,CO.dim); boom(0.14); shake=Math.max(shake,3); recalcPower();
    return;
  }
  if (!sel){
    const b=g.b; if (!b || !canUp(b)) return;
    const cost=upCost(b);
    if (money<cost){ say('BRAK ŚRODKÓW — '+cost+' kr.','warn'); toast('BRAK ŚRODKÓW — '+cost+' kr.'); return; }
    money-=cost; b.lvl++;
    say('ULEPSZONO — '+B[b.type].name+' '+'I'.repeat(b.lvl),'good');
    b.flash=1; explode(b.x,b.y,10,B[b.type].col); boom(0.1); recalcPower();
    return;
  }
  // budowa
  if (fits(sel,c,r)){
    if (!unlocked(sel)){ sel=null; return; }
    if (money<B[sel].cost){ say('BRAK ŚRODKÓW','warn'); toast('BRAK ŚRODKÓW'); return; }
    money-=B[sel].cost; mkBuilding(sel,c,r);
    say('BUDOWA ZAKOŃCZONA — '+B[sel].name,'good'); boom(0.15); recalcPower();
  } else {
    let kill=0; for (const [cc,rr] of cellsOf(sel,c,r)) if (rr>=0&&rr<ROWS&&cc>=0&&cc<COLS&&grid[rr][cc].seam) kill++;
    if (grid[r][c].ore>0 || kill) toast('KRATKA ZAJĘTA PRZEZ ŻYŁĘ');
  }
}

// pointer manager na canvasie (pan / pinch / tap)
function initPointer(){
  const el=app.canvas;
  const pts=new Map();
  let mode='', startX=0, startY=0, moved=false, pinchD=0, pinchZoom=1, pinchMid=null;
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

  el.addEventListener('pointerdown', e=>{
    resumeAudio();
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, {x:e.offsetX, y:e.offsetY});
    if (pts.size===1){ mode='maybe'; startX=e.offsetX; startY=e.offsetY; moved=false; }
    else if (pts.size===2){ mode='pinch';
      const [a,b]=[...pts.values()]; pinchD=dist(a,b); pinchZoom=cam.zoom;
      pinchMid={x:(a.x+b.x)/2, y:(a.y+b.y)/2}; }
  });
  el.addEventListener('pointermove', e=>{
    const P=pts.get(e.pointerId); if (P){ P.x=e.offsetX; P.y=e.offsetY; }
    // ghost na desktopie
    const w=screenToWorld(e.offsetX,e.offsetY);
    wmouse.x=w.x; wmouse.y=w.y; wmouse.over=true;
    if (mode==='pinch' && pts.size>=2){
      const [a,b]=[...pts.values()]; const nd=dist(a,b);
      const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      const wBefore=screenToWorld(mid.x,mid.y);
      cam.zoom=clamp(pinchZoom*(nd/(pinchD||1)), cam.min, cam.max);
      // utrzymaj punkt pod środkiem
      cam.panX = mid.x - wBefore.x*cam.zoom;
      cam.panY = mid.y - wBefore.y*cam.zoom;
      clampCam();
      return;
    }
    if (mode==='maybe' || mode==='pan'){
      const dx=e.offsetX-startX, dy=e.offsetY-startY;
      if (!moved && Math.hypot(dx,dy)>8){ moved=true; mode='pan'; }
      if (mode==='pan'){
        cam.panX+=e.movementX||0; cam.panY+=e.movementY||0; clampCam();
      }
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
  el.addEventListener('pointerleave', ()=>{ wmouse.over=false; });
  // scroll = zoom (desktop)
  el.addEventListener('wheel', e=>{
    e.preventDefault();
    const wBefore=screenToWorld(e.offsetX,e.offsetY);
    cam.zoom=clamp(cam.zoom*(e.deltaY<0?1.12:0.89), cam.min, cam.max);
    cam.panX=e.offsetX-wBefore.x*cam.zoom; cam.panY=e.offsetY-wBefore.y*cam.zoom; clampCam();
  }, {passive:false});
}

function initDOM(){
  buildBar(); buildStanceSlider();
  qs('stance-btn').addEventListener('click', ()=>{ resumeAudio(); toggleStance(); });
  qs('speed-btn').addEventListener('click', ()=>{ speed = speed>=3?1:speed+1; });
  qs('mute-btn').addEventListener('click', ()=>{ setMuted(!isMuted()); });
  qs('new-btn').addEventListener('click', ()=>{ if (state!=='play'||newArm>0) newRun(); else newArm=3; });
  qs('ready').addEventListener('click', ()=>{ resumeAudio(); ready=true; syncOverlays(); });
  qs('end-btn').addEventListener('click', ()=>newRun());
  qs('log-toggle').addEventListener('click', ()=>qs('log').classList.toggle('show'));

  addEventListener('keydown', e=>{
    if (state==='draft'){
      const i={Digit1:0,Digit2:1,Digit3:2}[e.code];
      if (i!==undefined && draft && draft[i]) takeCard(draft[i]);
      return;
    }
    if (e.code==='Escape') sel=null;
    if (e.code==='Space'){ e.preventDefault();
      if (state!=='play'){ newRun(); return; }
      if (!ready){ ready=true; syncOverlays(); return; }
      toggleStance(); return; }
    if (state!=='play') return;
    if (e.code==='Equal'||e.code==='NumpadAdd')  speed=Math.min(3,speed+1);
    if (e.code==='Minus'||e.code==='NumpadSubtract') speed=Math.max(1,speed-1);
    if (e.code==='ArrowRight') setStance(si+1);
    if (e.code==='ArrowLeft')  setStance(si-1);
    const n=+({Digit1:1,Digit2:2,Digit3:3,Digit4:4,Digit5:5}[e.code]||0);
    if (n) setStance(n-1);
  });
}

// utrzymuj widoki jednostek/budynków w synchronizacji (usuwaj martwe widoki)
function clearViews(){
  if (unitLayer) unitLayer.removeChildren().forEach(c=>c.destroy({children:true}));
  if (buildLayer) buildLayer.removeChildren().forEach(c=>c.destroy({children:true}));
}

/* =============================== PĘTLA ================================= */
function renderAll(){
  applyCam();
  drawWorld();
  drawBuildings();
  drawBastion();
  drawUnits();
  drawOver();
  drawGhost();
  updateHUD();
  syncOverlays();
}

async function main(){
  await initPixi();
  try { await loadAssets(); } catch(e){}
  initPointer();
  initDOM();
  newRun();
  // hak deweloperski (tylko z ?debug w URL) — podgląd kamery i stanu
  if (location.search.includes('debug')){
    window.__front = { cam, WV, screenToWorld, cellAt,
      get sel(){return sel;}, set sel(v){sel=v;},
      get money(){return money;}, set money(v){money=v;},
      buildings:()=>buildings.length, units:()=>units.length,
      state:()=>state, worldTap };
  }
  let last=performance.now();
  app.ticker.add(()=>{
    const nowT=performance.now();
    const raw=Math.min(0.05,(nowT-last)/1000); last=nowT;
    for (let i=0;i<speed;i++) update(raw);
    renderAll();
  });
}
main();
