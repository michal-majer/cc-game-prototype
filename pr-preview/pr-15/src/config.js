/* =========================================================================
   FRONT — KONFIG / TABELE / STAŁE
   Wszystkie pokrętła balansu w jednym miejscu (jak sekcja CONFIG w oryginale).
   · const  — stałe niezmienne w trakcie gry
   · BAL    — te cztery liczby ruszają KARTY i resetuje resetTables()
   · B / U  — tablice budynków i jednostek; karty mutują ich pola (przez run),
              resetTables() przywraca je z migawek B0/U0 na starcie runu
   ========================================================================= */

// --- drobne utilsy ---
export const HEX   = s => (typeof s === 'number' ? s : parseInt(String(s).replace('#',''), 16));
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// --- wymiary / geometria ---
export const W = 1200, H = 680;
export const COLS = 7, ROWS = 6, CELL = 52;
export const BASE_X = 40, BASE_Y = 176;
export const BASE_R = BASE_X + COLS*CELL;            // 404
export const LANE_Y = 332, LANE_HALF = 130;
export const BAS_X = 1150;
export const FRONT_MIN = BASE_R, FRONT_MAX = BAS_X - 30;
export const EHOLD_X = BAS_X - 110;

// --- AI wroga ---
export const EARTY_CAP = 3;
export const EPUSH_R  = 1.35;
export const EHOLD_R  = 0.85;
export const EPATIENCE = 110;
export const EPAT_MASS = 70;
export const ESCOUT    = 3;
export const ETHINK    = 2;
export const ECOMMIT   = 26;
export const ESHELLED  = 55;

export const STANCES = [
  {n:'OBRONA',    x:BASE_R+60,  d:'pod bunkrami · stos rośnie'},
  {n:'PRZEDPOLE', x:BASE_R+186, d:'1/4 — poza osłoną'},
  {n:'ŚRODEK',    x:BASE_R+373, d:'1/2 — neutralny grunt'},
  {n:'NACISK',    x:BASE_R+576, d:'3/4 — artyleria dosięga BASTIONU'},
  {n:'NATARCIE',  x:BAS_X,      d:'wszystko na bastion'},
];

export const CO = {
  bg:'#0f1315', dirt:'#1a2022', grid:'#232c2f', gridHi:'#2f3b3f', laneEdge:'#39474b',
  ore:'#c9a227', oreDark:'#8a6f1a',
  blue:'#4d9de0', blueD:'#2a5f8a', red:'#e05252', redD:'#8a2f2f',
  txt:'#c8d4d6', dim:'#66787c', warn:'#e8b23a', ok:'#5fd18a',
  panel:'#161c1e', panelHi:'#202a2d', power:'#e8b23a',
  crt:'#7de08a', crtDim:'#2f5c39', crtBg:'#0a0f0b', intel:'#c9a2e8', lock:'#39474b'
};

// --- ruda / bastion / ekonomia ---
// BASE_INCOME — darmowy trickle bez żadnego budynku. Był 3 (podłoga „nigdy nie
// spłukany"), przez co ekonomia sama się niosła. 2 = ledwie oddech; żeby rosnąć
// MUSISZ sięgnąć po rudę albo teren.
export const BASE_INCOME = 2;
// ORE_RATE — ile ciągnie JEDEN harvester z bogatej żyły (>5 rudy). Rafineria I poz.
// = 1 harvester (1 żyła). Ulepszenie = kolejny harvester (kolejna żyła), aż do
// liczby przyległych żył. 6/harvester: I poz. 6/s → II 12/s → III 18/s za rudę.
export const ORE_RATE  = 6;
// Odrost rudy — ROZPRZĘGNIĘTY na dwie prędkości (regrow wybiera po fladze pull):
//  · ORE_REGEN — żyła SPOCZYNKOWA (nietknięta): szybkie odbicie, pusta 0→450 ~90 s.
//  · ORE_SIP   — żyła CZYNNA (pod rafinerią): odrost przy drenażu. 2 (było 1):
//                netto −1/kratkę, więc bogate pole schodzi WOLNO (nie w minutę),
//                a po wypaleniu wciąż sączy ORE_SIP × kratki = solidny KRĘGOSŁUP
//                (nie chudy trickle). Ruda ma nieść ekonomię, nie mini-sztaby.
//                Chcesz świeży zryw — przenieś rafinerię na odrośniętą żyłę.
//                (SALV_CAP pilnuje, by głębsze pola nie dały fortuny z zaorania.)
export const ORE_REGEN = 5;
export const ORE_SIP   = 2;
export const ORE_YOUNG = 0.16;   // głębszy start (0.11→0.16 ≈ 72–162/kratkę): dłuższa faza bogata; zaoranie i tak ograniczone przez SALV_CAP
export const BAS_HP    = 2200;   // twardszy: nie da się wygrać szybką dekapitacją, front trwa dłużej
export const BAS_DMG   = 34;
export const BAS_RANGE = 150;
export const BAS_RATE  = 0.8;
export const BAS_SPL_R = 35;
export const BAS_SPL_N = 3;
export const WAVE_TIME = 30;     // rzadsze fale → mniej jednostek naraz, każda znaczy więcej (patrz waveInterval)
export const TERR_MAX  = 15;     // 5/sektor (było 8): teren to DODATEK do rudy, nie główny przychód — mini-sztaby przestały nieść całą ekonomię
export const ETERR_SEC = 65;
export const SELL_BACK = 0.5;
// Naprawa budynku: koszt = udział brakującego HP × wartość × REPAIR_FRAC.
// Symetria ze złomem (scrap 50% wartości / naprawa 50% brakującej wartości) —
// późną grą to STAŁY sink: utrzymanie ostrzeliwanego frontu kosztuje kredyty.
export const REPAIR_FRAC = 0.5;
// Zaoranie żyły płaci najwyżej z SALV_CAP rudy/kratkę — koniec z „odczekaj aż
// odrośnie do 450 i zaorz na fortunę". Młode pole (≤~140/kratkę) i tak jest niżej.
export const SALV_CAP = 140;
// Czas budowy budynku = koszt / BUILD_DIV, ograniczony do [BUILD_MIN, BUILD_MAX] s.
// Budynek w budowie jest MARTWY (bez mocy, dochodu, produkcji, ognia) — gotówka nie
// zamienia się w działającą bazę na pstryknięcie. Niżej BUILD_DIV = wolniej.
// 35 (było 50): elektrownia 3 s → rafineria 7 s → fabryka 11 s → ciężka fabr. 16 s.
export const BUILD_DIV = 35, BUILD_MIN = 2, BUILD_MAX = 16;
export const MAXLVL    = 3;
export const RAID_PAY  = 0.4;
export const HQ_COST   = 350;
export const CAP_R     = 118;
export const CAP_RATE  = 6;   // wolniejsze przejmowanie (~17 s) → sektor to trwały bój, nie pstryknięcie

// --- BALANS RUCHOMY (karty + resetTables) ---
// EBUILD_EVERY: co ile fal wróg dokłada budynek. Niżej = szybsza eskalacja.
// 0.7 (~1,43 budynku/falę, było 0.85) — przeciwnik był zbyt słaby: gracz z buffem
// sztabu i kartami wygrywa każde starcie i śnieżkuje. Szybsza rozbudowa OOB = fale
// rosną ~40% szybciej, dłużej groźne w mid/late.
export const BAL = { ORE_MAX:450, CLEAR_SALV:0.4, HQ_STEP:0.07, EBUILD_EVERY:0.7 };

// --- budynki ---
export const B = {
  hq:      {name:'SZTAB',        short:'SZTAB', fp:[2,2], cost:0,   hp:1500, col:'#7fb3d9', ico:'★', sup:4, req:[],
            atk:{dmg:30, range:330, rate:0.65}, desc:'broni całej bazy · 330 px'},
  power:   {name:'ELEKTROWNIA',  short:'PRĄD',  fp:[1,1], cost:100, hp:200,  col:'#e8b23a', ico:'⚡', sup:6, req:[],
            desc:'+6 mocy · 1×1'},
  refinery:{name:'RAFINERIA',    short:'RAF.',  fp:[2,2], cost:250, hp:250,  col:'#5fd18a', ico:'$', drn:2, req:[],
            desc:'harvester: +6 kr./s za żyłę · ulepsz = kolejny'},
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
export const BAR = ['power','refinery','barracks','rocket','bunker','workshop','factory',
             'radar','reactor','lab','arty','heavy'];

// --- jednostki ---
export const U = {
  inf:  {name:'Piechota',    hp:60,  dmg:9,  range:26,  spd:26, rate:0.75, sz:4,  strong:['rkt']},
  // dmg 15→12: DPS był za wysoki. Rakietowiec i tak przebija pancerz (ap) oraz
  // dostaje ×2 do pancernych (strong+COUNTER), więc bazowe 15 czyniło go zbyt
  // uniwersalnym młotem. 12 = ~10 DPS bazowo, ~21 vs pancerni — dalej specjalista.
  rkt:  {name:'Rakietowiec', hp:50,  dmg:12, range:74,  spd:22, rate:1.15, sz:4,  strong:['tank','kolos','lazik'], ap:true, proj:200},
  tank: {name:'Czołg',       hp:190, dmg:19, range:36,  spd:34, rate:0.95, sz:8,  strong:['inf'], arm:5},
  lazik:{name:'Łazik',       hp:90,  dmg:11, range:30,  spd:55, rate:0.5,  sz:6,  strong:['arty','inf'], hunt:'arty'},
  arty: {name:'Artyleria',   hp:70,  dmg:24, range:175, spd:15, rate:3.0,  sz:7,  strong:[], spl:3, splR:34, minR:60, proj:150},
  kolos:{name:'Kolos',       hp:430, dmg:32, range:44,  spd:21, rate:1.1,  sz:11, strong:['inf'], arm:6},
};
export const COUNTER   = 2.0;
export const HUNT_LEASH = 150;
export const BACK_MUL  = 0.4;
export const CONTACT = 90;
export const SEEN_HOLD = 2;
export const NOUP = ['lab'];
// klasy dla osobnych ulepszeń gracza (karty): żołnierze vs opancerzeni
export const isSoldier = t => t==='inf' || t==='rkt';
export const isArmored = t => t==='tank' || t==='kolos';

// --- budynki wroga (skład fali) ---
export const EB = {
  barracks:{name:'BARAK',        unit:'inf',  count:1},
  rocket:  {name:'WYRZUTNIA',    unit:'rkt',  count:1},
  workshop:{name:'WARSZTAT',     unit:'lazik',count:1},
  factory: {name:'FABRYKA',      unit:'tank', count:1},
  arty:    {name:'BATERIA ART.', unit:'arty', count:1, desc:'odłamki ×3 · 60–175 px'},
  heavy:   {name:'CIĘŻKA FABR.', unit:'kolos',count:1},
};
export const DOCTRINES = [
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

// --- migawki do resetu (karty mutują U/B; bez tego statystyki przeciekają między runami) ---
const U0 = JSON.parse(JSON.stringify(U));
const B0 = JSON.parse(JSON.stringify(B));
export function resetTables(){
  for (const k in U0){ for (const f in U[k]) delete U[k][f]; Object.assign(U[k], U0[k]); }
  for (const k in B0){ for (const f in B[k]) delete B[k][f]; Object.assign(B[k], B0[k]); }
  BAL.ORE_MAX=450; BAL.CLEAR_SALV=0.4; BAL.HQ_STEP=0.07; BAL.EBUILD_EVERY=0.7;
}

// --- czyste helpery siatki (bez stanu) ---
export const fpOf = t => B[t].fp;
export function cellsOf(t,c,r){
  const [w,h]=fpOf(t), out=[];
  for (let rr=r; rr<r+h; rr++) for (let cc=c; cc<c+w; cc++) out.push([cc,rr]);
  return out;
}
export function ringOf(t,c,r){
  const [w,h]=fpOf(t), out=[];
  for (let rr=r-1; rr<=r+h; rr++) for (let cc=c-1; cc<=c+w; cc++){
    if (rr>=r&&rr<r+h&&cc>=c&&cc<c+w) continue;
    if (rr<0||rr>=ROWS||cc<0||cc>=COLS) continue;
    out.push([cc,rr]);
  }
  return out;
}
export const isHeavy = d => !!(d.arm || d.minR);
export function plObj(n){
  if (n===1) return 'OBIEKT';
  const d=n%10, s=n%100;
  return (d>=2&&d<=4&&!(s>=12&&s<=14)) ? 'OBIEKTY' : 'OBIEKTÓW';
}
export function cellAt(px,py){
  const c=Math.floor((px-BASE_X)/CELL), r=Math.floor((py-BASE_Y)/CELL);
  return (c>=0&&c<COLS&&r>=0&&r<ROWS)?{c,r}:null;
}
