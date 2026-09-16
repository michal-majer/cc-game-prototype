/* =========================================================================
   FRONT — render świata na PixiJS + kamera (przewijanie / pinch-zoom).
   Pole rysuje Pixi; HUD jest w DOM (hud.js). Jednostki/budynki/bastion to
   osobne obiekty sceny — gotowe do podmiany na sprite'y (assets.js).
   ========================================================================= */

import * as PIXI from '../vendor/pixi.min.mjs';
import {
  CO, U, B, BASE_X, BASE_Y, CELL, COLS, ROWS, BASE_R, LANE_Y, LANE_HALF, BAS_X,
  STANCES, CAP_R, TERR_MAX, ORE_SIP, BAL, HEX, clamp, ringOf, cellAt,
  lanesAt, laneCY, corridorHalf, shapeId, fieldX1, LANE_HALF as LH,
  roadY, roadHalf, roadCount, roadName, splitX, mergeX, fieldHalf, sectKind, ROAD_GAP, ROAD_W
} from './config.js';
import { S, SECT, lineX } from './state.js';
import { buildTex, unitTex, unitSheet, tex, tileTex, markTex, hasTiles } from './assets.js';
import { shellMark } from './sim.js';
import { radarLvl, canUp, maxLvl, fits, canMove, fitsMoved, moveCost } from './buildings.js';
import { eTerrCtrl } from './sectors.js';
import { bEff, eHoldX } from './enemy.js';

export const app = new PIXI.Application();
// Prostokąt świata — LICZONY PER MISJA (measureWorld), nie stała. Mapa jest
// dużo większa od ekranu; to jest obszar, po którym kamera się przewija.
export const WV = { x:0, y:0, w:1170, h:356 };
export const cam = { zoom:1, min:0.2, max:3, panX:0, panY:0,
                     // 'front' = jedź za linią styku · 'base' = trzymaj bazę
                     // '' = wolne przewijanie (ustawia się samo po chwyceniu pola)
                     follow:'front', _init:false };

const SREF = 12, GB = SREF*3.6;
const TEAM_P = 0xa3c9ff, TEAM_E = 0xff6f5c;   // zabarwienie sprite'ów jednostek: gracz niebieski / wróg czerwony
const glyphTex = {};
let worldRoot, groundLayer, gWorld, worldText, buildLayer, harvG, bastionLayer, deathLayer, unitLayer, gOver, ghostG;
let groundKey = '';
let bastionView=null;
const now = () => performance.now();

export async function initPixi(){
  await app.init({ background: CO.bg, antialias:false, resizeTo:window,
                   resolution: Math.min(2, window.devicePixelRatio||1), autoDensity:true });
  document.getElementById('stage').appendChild(app.canvas);

  worldRoot = new PIXI.Container();  app.stage.addChild(worldRoot);
  groundLayer=new PIXI.Container();  worldRoot.addChild(groundLayer);   // kafle terenu pod wszystkim
  gWorld    = new PIXI.Graphics();   worldRoot.addChild(gWorld);
  worldText = new PIXI.Container();  worldRoot.addChild(worldText);
  buildLayer= new PIXI.Container();  worldRoot.addChild(buildLayer);
  harvG     = new PIXI.Graphics();   worldRoot.addChild(harvG);   // harvestery nad budynkami
  bastionLayer=new PIXI.Container(); worldRoot.addChild(bastionLayer);
  deathLayer= new PIXI.Container();  worldRoot.addChild(deathLayer);   // ginące ciała pod żywymi
  unitLayer = new PIXI.Container();  worldRoot.addChild(unitLayer);
  gOver     = new PIXI.Graphics();   worldRoot.addChild(gOver);
  ghostG    = new PIXI.Graphics();   worldRoot.addChild(ghostG);

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
    glyphTex[type]=app.renderer.generateTexture({ target:c, frame:new PIXI.Rectangle(-GB,-GB,GB*2,GB*2) });
    c.destroy({children:true});
  }
}

/* ------------------------------ KAFLE TERENU -----------------------------
   Budowane RAZ na misję (klucz: misja + kształt + siatka), nie co klatkę —
   to kilkaset sprite'ów. Wariant kafla dobiera assets.tileTex po pozycji,
   więc pole wygląda tak samo po powrocie z menu.

   Bez pliku z kaflami hasTiles() jest false i wszystko zostaje po staremu:
   płaskie wypełnienie z gWorld. Grafika NIE jest warunkiem grywalności.     */
function buildGround(){
  const key = (S.mission?S.mission.id:'-')+'|'+shapeId()+'|'+COLS+'x'+ROWS+'|'+fieldEnd();
  if (key === groundKey) return;
  groundKey = key;
  groundLayer.removeChildren().forEach(c=>c.destroy());
  if (!hasTiles('ziemia')) return;

  const T = CELL;                                  // kafel rysowany w skali kratki bazy
  const put = (t, x, y) => {
    const sp = new PIXI.Sprite(t);
    sp.width = T; sp.height = T; sp.x = x; sp.y = y;
    groundLayer.addChild(sp);
  };
  // 1) trakty — kafle idą TYLKO tam, gdzie pole jest przejezdne: gardło, każda
  //    droga osobno, lej. Pustka między drogami zostaje pustką (to ona je rozdziela).
  const END=fieldEnd(), x0=splitX(), x1=Math.min(mergeX(), END);
  const strip = (xa, xb, yFn, hFn) => {
    for (let x = xa; x < xb; x += T){
      const cx = x + T/2, cy0 = yFn(cx), half = hFn(cx);
      for (let y = cy0 - half; y < cy0 + half; y += T){
        const cy = y + T/2, d = Math.abs(cy - cy0);
        if (d > half) continue;
        const gx = Math.round(x/T), gy = Math.round(y/T);
        put(tileTex(d > half - T ? 'trawa' : 'ziemia', gx, gy), x, y - T/2);
      }
    }
  };
  if (!isFinite(x0) || roadCount()<2) strip(BASE_R, END, AXIS, corridorHalf);
  else {
    strip(BASE_R, x0, AXIS, corridorHalf);
    for (let i=0;i<roadCount();i++) strip(x0, x1, x=>roadY(i,x), roadHalf);
    if (x1 < END) strip(x1, END, AXIS, corridorHalf);
  }
  // 2) baza — skalny placyk pod siatką
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++)
    put(tileTex('skala', c+900, r+900), BASE_X + c*T, BASE_Y + r*T);
}

/* ================================= KAMERA ================================
   Mapa jest DUŻO WIĘKSZA OD EKRANU i przewijana. To zmienia rolę kamery:
   dawniej dobierała zoom tak, by ZMIEŚCIĆ CAŁE POLE — co przy polu 3 200 px
   znaczyłoby, że jednostki mają kilka pikseli i nic nie widać.

   Teraz kamera jest OKNEM:
     · domyślny zoom wypełnia pasmo W PIONIE (cały korytarz widać od góry
       do dołu), a w poziomie się przewija — to jest „zoom taktyczny",
     · zoom OUT sięga do całego pola (cam.min), żeby dało się rzucić okiem
       na całość, ale to jest wybór gracza, nie stan domyślny,
     · kamera SAMA JEDZIE ZA FRONTEM (cam.follow), bo na dużej mapie gracz
       inaczej gubi walkę; chwycenie pola przełącza ją w tryb wolny,
       a przyciski ⌖ FRONT / ⌂ BAZA wracają do prowadzenia.

   Bez prowadzenia kamery duża mapa jest karą, nie funkcją: baza jest po lewej,
   walka po prawej, a gracz musiałby przewijać w tę i we w tę przy każdej fali. */
/* Pasmo, w którym mieszka pole walki. MIERZONE Z DOM, nie zgadywane liczbami:
   HUD zawija się inaczej na każdej szerokości (na telefonie pasek górny bierze
   dwa wiersze), a zgadywane 96/66 px raz było za mało, raz za dużo — panele
   nachodziły na siebie i na pole. Górna granica to spód paska górnego, dolna
   to szczyt dolnego stosu (minimapa → suwak → pasek budowy).                  */
function bandRect(){
  const sw=app.screen.width, sh=app.screen.height;
  const tb=document.getElementById('topbar'), mm=document.getElementById('minimap');
  const top  = (tb && tb.offsetHeight ? tb.offsetHeight : 66) + 4;
  const botY = (mm && mm.offsetTop ? mm.offsetTop - 8 : sh - 180);
  return { sw, sh, top, bandH: Math.max(60, botY - top) };
}
// prawa krawędź świata (koniec korytarza + margines na przyczółek)
export const fieldEnd = () => fieldX1() + 60;

// Zmierz prostokąt świata bieżącej misji: baza + korytarz + marginesy.
// Korytarz bywa wyższy niż siatka bazy (trzy tory) albo niższy (jeden tor),
// więc bierzemy obwiednię obu.
function measureWorld(){
  const fh = fieldHalf();
  const top = Math.min(BASE_Y - 28, LANE_Y - fh - 44);
  const bot = Math.max(BASE_Y + ROWS*CELL + 28, LANE_Y + fh + 44);
  WV.x = BASE_X - 28;
  WV.y = top;
  WV.w = Math.max(400, fieldEnd() - WV.x);
  WV.h = Math.max(200, bot - top);
}

// Ile świata ma być widać w POZIOMIE na starcie. Na szerokim ekranie zoom
// ogranicza wysokość korytarza (widać go całego), ale na telefonie samo
// „wypełnij pasmo w pionie" dawało 380 px świata na ekranie — 10% mapy, czyli
// gracz nie widzi nawet sąsiedniego toru. Wtedy wygrywa szerokość.
const TAC_W = 1150;
export function resizeCam(){
  measureWorld();
  const {sw, bandH}=bandRect();
  const zFill = bandH / WV.h;                  // cały świat w pionie
  const zAll  = Math.min(sw / WV.w, zFill);    // całe pole na ekranie (na dużej mapie: mało)
  // Zoom domyślny: Twoja droga i ZAPOWIEDŹ sąsiednich. Pokazywanie wszystkich
  // trzech naraz (zFill) robi z jednostek piksele, a pokazywanie jednej odcina
  // informację, że obok toczy się druga walka.
  const zRoad = roadCount()>1 ? bandH / (ROAD_GAP*1.8 + ROAD_W) : zFill;
  cam.min = Math.min(zAll * 0.85, zFill);
  cam.max = Math.max(zFill * 2.8, 2.2);
  // `camBase` — misja bez pola do oglądania (misja 1 to sama rozbudowa bazy).
  // Domyślny zoom liczony pod korytarz zostawiał trzy czwarte ekranu pustego.
  const zBase = bandH / (ROWS*CELL * 1.55);
  if (!cam._init){ cam.zoom = S.camBase ? zBase : Math.min(zRoad, sw / TAC_W); cam._init=true; }
  cam.zoom = clamp(cam.zoom, cam.min, cam.max);
  clampCam();
}
export function clampCam(){
  const {sw, top, bandH}=bandRect();
  cam.zoom = clamp(cam.zoom, cam.min, cam.max);
  const cw=WV.w*cam.zoom, ch=WV.h*cam.zoom;
  if (cw<=sw) cam.panX = (sw-cw)/2 - WV.x*cam.zoom;
  else cam.panX = clamp(cam.panX, sw-cw-WV.x*cam.zoom, -WV.x*cam.zoom);
  if (ch<=bandH) cam.panY = top + (bandH-ch)/2 - WV.y*cam.zoom;
  else cam.panY = clamp(cam.panY, top+bandH-ch-WV.y*cam.zoom, top-WV.y*cam.zoom);
}

// Punkt, na którym kamera ma się trzymać w trybie prowadzonym.
function followPoint(){
  if (cam.follow==='base') return { x: BASE_X + COLS*CELL/2, y: BASE_Y + ROWS*CELL/2 };
  // Gdy gracz skupił armię na JEDNEJ drodze, kamera jedzie TĄ drogą. „Całość na
  // górną" jest wtedy jednym rozkazem, a nie rozkazem plus szukaniem jej wzrokiem.
  const r = (S.laneOrder != null && S.laneOrder >= 0) ? S.laneOrder : -1;
  return { x: S.frontX, y: r >= 0 ? roadY(r, S.frontX) : LANE_Y };
}
// Prowadzenie kamery — wygładzone, żeby front „niósł" widok, a nie szarpał nim.
function updateCam(dt){
  if (!cam.follow) return;
  const {sw, top, bandH}=bandRect();
  const p = followPoint();
  const k = Math.min(1, dt*3.2);
  cam.panX += ((sw/2 - p.x*cam.zoom) - cam.panX) * k;
  cam.panY += ((top + bandH/2 - p.y*cam.zoom) - cam.panY) * k;
  clampCam();
}
// wywoływane z input.js: chwycenie pola przerywa prowadzenie
export function freeCam(){ cam.follow=''; }
export function setFollow(mode){
  cam.follow = mode;
  if (mode){                      // skok bez animacji, żeby przycisk działał od razu
    const {sw, top, bandH}=bandRect();
    const p = followPoint();
    cam.panX = sw/2 - p.x*cam.zoom;
    cam.panY = top + bandH/2 - p.y*cam.zoom;
    clampCam();
  }
}
/* Nowa misja = nowe pole: przelicz zoom i patrz NA BAZĘ.
   Na dużej mapie to nie kosmetyka: przed pierwszą falą gracz nic nie robi poza
   budowaniem, a buduje w bazie — kamera ustawiona na front pokazywałaby wtedy
   pusty kawałek korytarza, a siatkę trzymałaby za ekranem. Na pierwszej fali
   kamera sama przechodzi na front (autoFollowFront), o ile gracz nie wziął jej
   w swoje ręce. */
export function fitCam(keepZoom){
  // keepZoom — przejście MIĘDZY misjami: plansza rośnie, ale widok nie skacze.
  // Przy wejściu z menu zoom liczy się od zera, bo pole może być inne o rząd.
  if (!keepZoom) cam._init=false;
  resizeCam();
  setFollow('base');
}
// Woła sim przy pierwszej fali. Nie nadpisuje decyzji gracza: jeśli sam przewinął
// pole albo wybrał ⌂ BAZA po starcie, zostaje jak chciał.
export function autoFollowFront(){ if (cam.follow==='base') setFollow('front'); }
// dla minimapy: widoczny wycinek świata w px świata
export function viewport(){
  const {sw, top, bandH}=bandRect();
  return { x:(0-cam.panX)/cam.zoom, y:(top-cam.panY)/cam.zoom,
           w:sw/cam.zoom, h:bandH/cam.zoom };
}
// przewiń tak, by dany punkt świata był na środku (klik w minimapę)
export function panTo(wx, wy){
  const {sw, top, bandH}=bandRect();
  cam.follow='';
  cam.panX = sw/2 - wx*cam.zoom;
  if (wy != null) cam.panY = top + bandH/2 - wy*cam.zoom;
  clampCam();
}
function applyCam(){
  worldRoot.scale.set(cam.zoom);
  let sx=0, sy=0;
  if (S.shake>0){ sx=(Math.random()-0.5)*S.shake; sy=(Math.random()-0.5)*S.shake; }
  worldRoot.x = cam.panX + sx;
  worldRoot.y = cam.panY + sy;
}
export function screenToWorld(px,py){
  return { x:(px - worldRoot.x)/cam.zoom, y:(py - worldRoot.y)/cam.zoom };
}

/* --------------------------- pula tekstów świata ------------------------- */
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

/* ------------------------ świat: siatka/sektory/linie -------------------- */
function dashV(g,x,y0,y1,color,alpha){
  for (let y=y0;y<y1;y+=12){ g.moveTo(x,y).lineTo(x,Math.min(y1,y+6)); }
  g.stroke({width:2,color,alpha});
}
// Cel siedzi NA SWOJEJ DRODZE — pozycja policzona raz w campaign.applyRoadObjectives.
const secY = q => (q.y != null ? q.y : LANE_Y);
const secH = q => roadHalf(q.x);
function drawWorld(){
  const g=gWorld; g.clear();
  wtBegin();
  const fh=fieldHalf(), ly=LANE_Y-fh, lh=fh*2;

  drawCorridor(g);

  // Sektor torowy siedzi w SWOIM torze — jego pole i marker liczą się tylko tam.
  for (const q of SECT){
    const cy = secY(q), hh = secH(q);
    const K = sectKind(q.kind);
    const col = q.own===1 ? CO.warn : q.own===-1 ? CO.red : null;
    if (col){ g.rect(q.x-CAP_R, cy-hh, CAP_R*2, hh*2).fill({color:col, alpha:0.13}); }
    else { g.rect(q.x-CAP_R, cy-hh+0.5, CAP_R*2, hh*2-1).stroke({width:1,color:K.col, alpha:0.35}); }
  }
  if (!S.bastion.dead && S.bastion.target) g.rect(BAS_X-40,ly,80,lh).fill({color:CO.red, alpha:0.17});
  if (!S.bastion.dead) g.rect(S.frontX-1,LANE_Y-corridorHalf(S.frontX),2,corridorHalf(S.frontX)*2).fill({color:'#ffffff', alpha:0.5});

  const MS_W=30, MS_H=34;
  for (const q of SECT){
    // CEL JEST ZAWSZE ROZPOZNANY. Radar ukrywa SKŁAD FAL wroga, nie ukształtowanie
    // terenu — a wybór drogi ma być decyzją podjętą Z WIEDZĄ, co na której jest.
    // Ukrycie tego za radarem zamieniłoby „którą drogą" w rzut monetą.
    const K = sectKind(q.kind);
    const col = q.own===1 ? CO.warn : q.own===-1 ? CO.red : K.col;
    // Etykiety celu trzymają się JEGO drogi — drogi są oddalone, więc opisy
    // sąsiadów nie mają jak na siebie nachodzić.
    const qy = secY(q), lane = q.road>=0;
    const mx=q.x-MS_W/2, my=qy-MS_H/2;
    const yName = lane ? qy-MS_H/2-16 : qy-secH(q)-16;
    const yBar  = lane ? qy-MS_H/2-11 : qy-secH(q)-12;
    const yInfo = lane ? qy+MS_H/2+15 : qy-secH(q)-26;
    g.roundRect(mx,my,MS_W,MS_H,3).fill('#11171a');
    g.roundRect(mx,my,MS_W,MS_H,3).fill({color:col, alpha:q.own?0.30:0.10});
    g.roundRect(mx+0.5,my+0.5,MS_W-1,MS_H-1,3).stroke({width:q.own?2:1,color:col});
    g.rect(mx+3,my+3,MS_W-6,3).fill(col);
    wt(K.ico, q.x, qy, 14, q.own?col:K.col, {bold:true});
    wt(q.n, q.x, yName, 9, q.own?col:CO.dim, {bold:true});
    const bw=64, bx=q.x-bw/2, by=yBar;
    g.rect(bx,by,bw,5).fill('#0b0f10');
    const f=Math.abs(q.cap)/100*(bw/2);
    if (q.cap>=0) g.rect(q.x,by,f,5).fill(CO.warn); else g.rect(q.x-f,by,f,5).fill(CO.red);
    g.rect(q.x,by,1,5).fill(CO.gridHi);
    // ZYSK tego celu widać zawsze — to on jest powodem, żeby wybrać tę drogę
    wt(K.desc, q.x, yInfo, 8, q.own===1?CO.warn:K.col, {bold:q.own===1, alpha:q.own===1?1:0.8});
  }

  const ec=eTerrCtrl();
  if (ec>0.02){
    const ex=BAS_X-ec*(BAS_X-BASE_R);
    g.rect(ex-1,ly,2,26).fill({color:CO.red, alpha:0.55});
    wt('ICH TEREN '+Math.round(ec*100)+'%', ex+42, ly+7, 9, CO.red, {bold:true, ax:0.5});
    g.rect(ex+5,ly+15,76,5).fill('#000000');
    g.rect(ex+5,ly+15,76*(S.eTerrBank/100),5).fill(CO.red);
  }

  const massed = S.eStance==='hold' ? S.units.filter(u=>u.side==='e').length : 0;
  if (massed>0){
    const hx = eHoldX();
    dashV(g, hx, ly, ly+lh, CO.red, 0.4);
    wt('TRZYMAJĄ TEREN — '+massed, hx, ly-17, 8, CO.red);
  }
  const stN = (S.mission && S.mission.feats) ? (S.mission.feats.stance||0) : STANCES.length;
  if (stN >= 2 && S.si < stN-1){
    const LX=lineX();
    dashV(g, LX, ly, ly+lh, CO.ok, 0.45);
    wt('LINIA — '+STANCES[S.si].n, LX, ly-4, 8, CO.ok);
  }

  for (const c of S.corpses) g.rect(c.x-c.s/2,c.y-c.s/2,c.s,c.s*0.6).fill({color:c.c, alpha:0.5});

  drawBaseGrid(g);
  wtEnd();
}
/* Pasmo wzdłuż DOWOLNEJ osi: górna krawędź w prawo, dolna w lewo. Jeden helper
   obsługuje gardło, każdą drogę osobno i lej — dzięki temu kształt pola jest
   WIDAĆ (gracz czyta przepustowość z terenu, nie z komunikatu), a rozwidlenie
   i zbieg biorą się same z tego, że roadY na końcach wraca do wspólnej osi.  */
function bandPoly(x0, x1, step, yFn, hFn){
  const top=[], bot=[];
  const put=x=>{ const y=yFn(x), h=hFn(x); top.push(x,y-h); bot.push(x,y+h); };
  for (let x=x0; x<x1; x+=step) put(x);
  put(x1);
  const out=top.slice();
  for (let i=bot.length-2;i>=0;i-=2) out.push(bot[i], bot[i+1]);
  return out;
}
const AXIS = () => LANE_Y;
function drawBand(g, poly, fill){
  g.poly(poly).fill(fill);
  g.poly(poly).stroke({width:2, color:CO.laneEdge});
}
/* Pole to GARDŁO → osobne DROGI → LEJ. Drogi rysują się jako niezależne trakty
   z pustką między nimi, bo takie mają być: walka na górnej nie ma przelewać się
   na dolną, inaczej „rozdziel siły" nic nie znaczy.                           */
function drawCorridor(g){
  const END=fieldEnd(), x0=splitX(), x1=Math.min(mergeX(), END);
  const fh=fieldHalf();
  g.rect(BASE_R, LANE_Y-fh, END-BASE_R, fh*2).fill({color:'#0b0f11', alpha:0.55});  // pobocze
  if (!isFinite(x0) || roadCount()<2){
    drawBand(g, bandPoly(BASE_R, END, 26, AXIS, corridorHalf), '#212a2c');
    return;
  }
  drawBand(g, bandPoly(BASE_R, x0, 22, AXIS, corridorHalf), '#212a2c');            // gardło
  for (let i=0;i<roadCount();i++)                                                  // drogi
    drawBand(g, bandPoly(x0, x1, 18, x=>roadY(i,x), roadHalf), '#212a2c');
  if (x1 < END)
    drawBand(g, bandPoly(x1, END, 22, AXIS, corridorHalf), '#212a2c');             // lej
  // nazwa drogi u jej wlotu — rozkaz „całość na GÓRNĄ" musi mieć odpowiednik w polu
  for (let i=0;i<roadCount();i++){
    const lx = x0 + (x1-x0)*0.10;
    wt(roadName(i), lx, roadY(i, lx) - roadHalf(lx) - 12, 11, '#6e8085', {bold:true});
  }
}
function drawBaseGrid(g){
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
    const x=BASE_X+c*CELL, y=BASE_Y+r*CELL, cell=S.grid[r][c];
    g.rect(x+1,y+1,CELL-2,CELL-2).fill(CO.grid);
    if (cell.seam && !cell.b){
      const f=cell.ore/BAL.ORE_MAX;
      g.rect(x+4,y+4,CELL-8,CELL-8).fill({color:CO.oreDark, alpha:0.20+0.80*f});
      if (cell.ore>0){
        const n=Math.max(1,Math.ceil(6*f));
        for (let i=0;i<n;i++) g.rect(x+9+((i*17+r*7+c*5)%(CELL-22)), y+9+((i*23+c*11+r*3)%(CELL-22)),5,5).fill(CO.ore);
      }
      if (cell.pull){
        const net = cell.ore - (cell.prevOre==null?cell.ore:cell.prevOre);   // odrost − wydobycie w tej klatce
        if (f>=0.97)        wt('▲ PEŁNA',        x+CELL/2, y+CELL-6, 6, CO.ok);   // odrost utrzymuje żyłę na maksie
        else if (net>1e-6)  wt('▲ ODRASTA',      x+CELL/2, y+CELL-6, 6, CO.ok);   // odrost > wydobycie — rośnie
        else if (f<=0.03)   wt('SĄCZY +'+ORE_SIP, x+CELL/2, y+CELL-6, 6, CO.ok);
        else                wt('SCHYŁEK',        x+CELL/2, y+CELL-6, 6, CO.red);  // wydobycie > odrost — spada
      } else if (f<0.995){
        g.rect(x+7,y+CELL-11,CELL-14,4).fill('#000000');
        g.rect(x+7,y+CELL-11,(CELL-14)*f,4).fill(CO.ore);
        wt('▲ '+Math.round(f*100)+'%', x+CELL/2, y+CELL-15, 6, CO.warn);
      }
    }
  }
  g.rect(BASE_X-0.5,BASE_Y-0.5,COLS*CELL+1,ROWS*CELL+1).stroke({width:1,color:CO.gridHi});
}

/* -------------------------------- budynki -------------------------------- */
function ensureBuildingView(b){
  if (b._view) return b._view;
  const d=B[b.type];
  const v=new PIXI.Container(); v.x=0; v.y=0;
  v.g=new PIXI.Graphics(); v.addChild(v.g);
  const t=buildTex(b.type);
  if (t){ v.spr=new PIXI.Sprite(t); v.spr.anchor.set(0.5); v.addChild(v.spr); }
  v.ico=new PIXI.Text({text:d.ico, style:{fontFamily:'monospace',fontSize:d.fp[0]>1?24:18,fontWeight:'700',fill:'#000'}});
  v.ico.anchor.set(0.5); v.addChild(v.ico);
  v.lab=new PIXI.Text({text:d.short, style:{fontFamily:'monospace',fontSize:8,fontWeight:'700',fill:'#000'}});
  v.lab.anchor.set(0.5,1); v.addChild(v.lab);
  buildLayer.addChild(v); b._view=v; return v;
}
function drawBuildings(){
  for (const b of S.buildings){
    const v=ensureBuildingView(b), d=B[b.type];
    const [w,h]=d.fp, R={x:BASE_X+b.c*CELL, y:BASE_Y+b.r*CELL, w:w*CELL, h:h*CELL};
    const pulse = b.brown && (now()%600<300);
    const building = (b.build||0)>0;
    const body = b.flash>0 ? '#ffffff' : building ? '#28323a' : (b.powered ? d.col : (pulse?'#5c2a2a':'#3d2222'));
    v.g.clear();
    if (v.spr){
      v.spr.x=R.x+R.w/2; v.spr.y=R.y+R.h/2;
      const sc=Math.min((R.w-6)/v.spr.texture.width,(R.h-6)/v.spr.texture.height);
      v.spr.scale.set(sc);
      v.spr.tint = b.flash>0?0xffffff:(building?0x4a5a66:(b.powered?0xffffff:0x884444));
      v.spr.alpha = building?0.45:1;
    } else {
      v.g.rect(R.x+3,R.y+3,R.w-6,R.h-6).fill(body);
    }
    v.g.rect(R.x+3,R.y+R.h-17,R.w-6,14).fill({color:'#000000', alpha:0.32});
    v.ico.visible=!v.spr; v.ico.x=R.x+R.w/2; v.ico.y=R.y+R.h/2-6;
    v.ico.style.fill = b.powered?'rgba(0,0,0,.6)':'rgba(255,255,255,.25)';
    let label=d.short, lcol=b.brown?CO.red:'rgba(0,0,0,.6)';
    if (building){ label='W BUDOWIE '+Math.ceil(b.build)+'s'; lcol=CO.warn; }
    else if (b.brown) label='PRZECIĄŻENIE';
    else if (b.type==='hq' && b.lvl>1){ label='SZTAB +'+Math.round((b.lvl-1)*BAL.HQ_STEP*100)+'%'; }
    else if (b.type==='refinery'){
      let seams=0; for (const [cc,rr] of ringOf(b.type,b.c,b.r)) if (S.grid[rr][cc].seam) seams++;
      if (seams===0){ label='BEZ ZŁOŻA'; lcol=(now()%700<350)?CO.warn:'#6b5320'; }
    }
    v.lab.text=label; v.lab.style.fill=lcol; v.lab.x=R.x+R.w/2; v.lab.y=R.y+R.h-4;
    if (b.type!=='hq' && (b.lvl>1 || canUp(b))){
      for (let i=0;i<maxLvl();i++)
        v.g.rect(R.x+R.w-10-i*6, R.y+6, 4,4).fill(i<b.lvl?(b.powered?'rgba(0,0,0,.75)':CO.warn):'rgba(255,255,255,.13)');
    }
    if (b.hp<b.maxHp){
      v.g.rect(R.x+5,R.y+2,R.w-10,3).fill('#000000');
      v.g.rect(R.x+5,R.y+2,(R.w-10)*Math.max(0,b.hp/b.maxHp),3).fill(CO.ok);
    }
    if (building){                                   // pasek postępu budowy (środek kafla)
      const p = b.buildMax>0 ? 1-b.build/b.buildMax : 1;
      v.g.rect(R.x+5, R.y+R.h/2-3, R.w-10, 5).fill('#000000');
      v.g.rect(R.x+5, R.y+R.h/2-3, (R.w-10)*p, 5).fill(CO.warn);
    }
    if (b.flash>0) b.flash-=0.06;
  }
}

/* -------------------------------- bastion -------------------------------- */
// Emblemat wroga: biały klin przecinający poziomą belkę, w czerwonym kole.
// (wymyślony — zero symboli totalitarnych, patrz spec cz. III §11)
function drawEmblem(g, cx, cy){
  g.circle(cx, cy, 16).fill('#7a2323');
  g.circle(cx, cy, 16).stroke({width:1.5, color:'#4a1414'});
  g.rect(cx-13, cy-2.5, 26, 5).fill('#f0eee6');                 // belka
  g.poly([cx-9,cy-9, cx+4,cy, cx-9,cy+9]).fill('#f0eee6');      // klin
}
function drawBastion(){
  if (!bastionView){
    bastionView=new PIXI.Container(); bastionLayer.addChild(bastionView);
    bastionView.g=new PIXI.Graphics(); bastionView.addChild(bastionView.g);
    const bt=tex('bastion');
    if (bt){ bastionView.spr=new PIXI.Sprite(bt); bastionView.spr.anchor.set(0.5);
             bastionView.spr.x=S.bastion.x; bastionView.spr.y=S.bastion.y;
             bastionView.spr.scale.set(200/Math.max(bastionView.spr.texture.height,1));
             bastionView.addChild(bastionView.spr); }
    bastionView.hp=new PIXI.Text({text:'', style:{fontFamily:'monospace',fontSize:9,fill:CO.dim}});
    bastionView.hp.anchor.set(0.5); bastionView.addChild(bastionView.hp);
    bastionView.eff=new PIXI.Text({text:'', style:{fontFamily:'monospace',fontSize:9,fontWeight:'700',fill:CO.dim}});
    bastionView.eff.anchor.set(0.5); bastionView.addChild(bastionView.eff);
  }
  const b=S.bastion, g=bastionView.g; g.clear();
  if (b.dead){
    g.rect(b.x-26,b.y-90,52,180).fill('#1a2620');
    g.rect(b.x-26.5,b.y-90.5,53,181).stroke({width:1,color:CO.crtDim});
    bastionView.hp.visible=false;
    if (bastionView.spr) bastionView.spr.visible=false;
    bastionView.eff.text='ZDOBYTY'; bastionView.eff.style.fill=CO.ok; bastionView.eff.x=b.x; bastionView.eff.y=b.y;
    return;
  }
  // Misje 1–5: to nie bastion, tylko MINI-BAZA — punkt, z którego startują fale.
  // Rysujemy ją mniejszą i bez paska HP, żeby gracz nie szukał celu, którego nie ma.
  if (!b.target){
    const h=corridorHalf(b.x);
    if (bastionView.spr) bastionView.spr.visible=false;
    g.rect(b.x-16,b.y-h*0.55,32,h*1.1).fill(CO.redD);
    g.rect(b.x-11,b.y-h*0.5,22,h).fill(CO.red);
    g.rect(b.x-16,b.y-h*0.55-9,32,6).fill(CO.redD);
    bastionView.hp.visible=false;
    bastionView.eff.text='ICH PRZYCZÓŁEK'; bastionView.eff.style.fill=CO.red;
    bastionView.eff.x=b.x-52; bastionView.eff.y=b.y-h*0.55-20;
    return;
  }
  if (bastionView.spr){
    bastionView.spr.visible=true; bastionView.spr.tint=0xffffff;
  } else {
    const bh=Math.max(60, corridorHalf(b.x));     // bastion wypełnia LEJ, nie wystaje poza pole
    g.rect(b.x-30,b.y-bh,60,bh*2).fill(CO.redD);
    g.rect(b.x-24,b.y-bh+6,48,bh*2-12).fill(b.flash>0?'#ffffff':CO.red);
    drawEmblem(g, b.x, b.y);
  }
  g.rect(b.x-30,b.y-112,60,7).fill('#000000');
  g.rect(b.x-30,b.y-112,60*Math.max(0,b.hp/b.maxHp),7).fill(CO.red);
  bastionView.hp.visible=true; bastionView.hp.text=Math.max(0,Math.ceil(b.hp))+' / '+b.maxHp;
  bastionView.hp.x=b.x; bastionView.hp.y=b.y-119;
  const eff=Math.round(bEff()*100);
  bastionView.eff.text='ICH PRODUKCJA '+eff+'%'; bastionView.eff.style.fill=eff<100?CO.ok:CO.dim;
  bastionView.eff.x=b.x; bastionView.eff.y=b.y-129;
  if (S.raidPay>0.5){ S.raidShow=Math.min(90, S.raidShow+S.raidPay); S.raidPay=0; }
  S.raidShow*=0.965;
}

/* ------------------------------- jednostki ------------------------------- */
function ensureUnitView(u){
  if (u._view) return u._view;
  const d=U[u.type];
  const v=new PIXI.Container();
  const sh = unitSheet(u.type);                 // arkusz klatek (animacja) albo null
  const t = (sh ? sh.clips[Object.keys(sh.clips)[0]][0] : unitTex(u.type)) || glyphTex[u.type];
  v.spr=new PIXI.Sprite(t);
  let sc;
  if (sh){
    v.sheet=sh; v.spr.anchor.set(sh.anchor[0], sh.anchor[1]);
    v._clip=null; v._fi=0; v._ft=0; v._done=false;   // stan animacji
    sc=(d.sz*2.9)/Math.max(sh.fw,1);              // klatka arkusza -> ~sz*2.9 px
  } else {
    v.spr.anchor.set(0.5);
    sc=(unitTex(u.type) ? (d.sz*2.6)/Math.max(v.spr.texture.width,1) : d.sz/SREF);
  }
  v._sc=sc; v.addChild(v.spr);
  if (sh){ v.muz=new PIXI.Graphics(); v.muz.blendMode='add'; v.addChild(v.muz); }  // błysk wystrzału (glow)
  v.fog=new PIXI.Graphics();
  const s=d.sz;
  v.fog.rect(-s*0.85,-s*0.85,s*1.7,s*1.7).fill('#8a4040');
  v.fog.rect(-s*0.85,-s*0.85,s*1.7,s*0.35).fill('#5c2a2a');
  v.addChild(v.fog);
  if (s>=6){ v.q=new PIXI.Text({text:'?',style:{fontFamily:'monospace',fontSize:Math.round(s*1.1),fontWeight:'700',fill:'rgba(0,0,0,.45)'}}); v.q.anchor.set(0.5); v.fog.addChild(v.q); }
  v.hp=new PIXI.Graphics(); v.addChild(v.hp);
  unitLayer.addChild(v); u._view=v; return v;
}
// dobór klipu animacji po stanie jednostki: strzela > idzie > stoi
function pickClip(sh, u){
  const c=sh.clips;
  if (u.fireT>0 && c.shoot) return c.shoot;
  if (u.moveT>0 && c.walk)  return c.walk;
  return c.idle || c.walk || c.shoot;
}
function animSheet(v, u, dt){
  const clip=pickClip(v.sheet, u);
  if (clip!==v._clip){ v._clip=clip; v._fi=0; v._ft=0; v._done=false; }
  if (!v._done){
    v._ft += dt;
    const step=1/(clip.fps||8);
    while (v._ft>=step){
      v._ft-=step; v._fi++;
      if (v._fi>=clip.length){
        if (clip.once){ v._fi=clip.length-1; v._done=true; break; }
        v._fi=0;
      }
    }
  }
  v.spr.texture = clip[v._fi];
}
function drawUnits(dt){
  const rl=radarLvl();
  for (const u of S.units){
    const v=ensureUnitView(u), d=U[u.type], s=d.sz, p=u.side==='p';
    const vis   = p || u.nearT>0 || rl>=1;   // radar I: widać ich kształty (kwadraty/prostokąty) na całym polu
    const known = p || (u.seenT>0);          // rozpoznanie typu: w zwarciu (każdy poziom) lub wszędzie (radar II)
    v.visible=vis; if (!vis) continue;
    v.x=u.x; v.y=u.y;
    v.spr.visible=known; v.fog.visible=!known;
    if (v.muz) v.muz.clear();
    if (known){
      v.spr.scale.set(v._sc * (p?1:-1), v._sc);
      if (v.sheet){
        animSheet(v, u, dt);
        // zabarwienie na stronę: gracz niebieski / wróg czerwony (trafiony = biały błysk)
        v.spr.tint = u.flash>0 ? 0xffffff : (p ? TEAM_P : TEAM_E);
        if (u.muzT>0) drawMuzzle(v.muz, u.muzT, p, s);   // błysk z lufy tuż po strzale
      } else {
        v.spr.tint = u.flash>0 ? 0xffffff : HEX(p?CO.blue:CO.red);
      }
    }
    v.hp.clear();
    if (known){                                   // pasek zdrowia nad głową — zawsze widoczny (jak w referencji)
      const f=Math.max(0, u.hp/u.maxHp), bw=Math.max(s*2.4, 9), bx=-bw/2, by=-s-8;
      v.hp.rect(bx-0.6,by-0.6,bw+1.2,3.2).fill({color:'#0b0f10', alpha:0.85});
      v.hp.rect(bx,by,bw*f,2).fill(f>0.5?CO.ok : f>0.25?CO.warn : CO.red);
    }
    if (u.flash>0) u.flash-=0.06;
  }
}

// błysk wystrzału: chunky żółta gwiazda z białym rdzeniem (jak w referencji) — addytywnie
// Błysk NA WYLOCIE LUFY: czysta 4-ramienna iskra (sparkle) z poświatą i białym
// rdzeniem, jak w referencji. Ramię poziome dłuższe (wzdłuż strzału). cx≈przód sylwetki.
function drawMuzzle(g, muzT, p, s){
  const a=Math.min(1, muzT/0.16), dir=p?1:-1;
  const cx=dir*s*1.25, cy=-s*0.05, R=s*(0.55+0.28*a);      // drobny, zwarty błysk
  g.poly([cx-dir*R*1.0,cy, cx,cy-R*0.26, cx+dir*R*1.5,cy, cx,cy+R*0.26]).fill({color:0xffcb3a, alpha:0.95*a}); // ramię poziome (do przodu)
  g.poly([cx,cy-R*0.85, cx+R*0.24,cy, cx,cy+R*0.85, cx-R*0.24,cy]).fill({color:0xffcb3a, alpha:0.9*a});        // ramię pionowe
  g.circle(cx,cy,R*0.5).fill({color:0xffe680, alpha:0.98*a});                        // gorący rdzeń
  g.circle(cx,cy,R*0.26).fill({color:0xffffff, alpha:a});                            // biały środek
}

/* ------------------------------ animacja śmierci ------------------------- */
// Jednorazowe ciało odgrywające klip „die" w miejscu zgonu, potem zanika.
// Zasilane z S.deaths (sim tylko zgłasza zgon — bez zmian w kolizjach/celowaniu).
const deathFx=[];
function spawnDeath(rec){
  const sh=unitSheet(rec.type), clip=sh && sh.clips.die;
  if (!clip) return;
  const spr=new PIXI.Sprite(clip[0]); spr.anchor.set(0.5, 1);          // dół-środek: ciało na ziemi
  const sc=(U[rec.type].sz*3.0)/Math.max(clip[0].height,1);
  spr.scale.set(sc*(rec.p?1:-1), sc);
  spr.x=rec.x; spr.y=rec.y + U[rec.type].sz;
  spr.tint = rec.p?TEAM_P:TEAM_E;
  deathLayer.addChild(spr);
  deathFx.push({spr, clip, fi:0, ft:0, t:0});
  if (deathFx.length>60){ const old=deathFx.shift(); old.spr.destroy(); }   // limit ciał na polu
  // obłoczek kurzu w miejscu upadku (kilka ciemnych drobin)
  const s=U[rec.type].sz;
  for (let k=0;k<6;k++){
    const ang=Math.PI + (k/5-0.5)*2.2, sp=18+((k*37)%22);
    S.fx.push({x:rec.x, y:rec.y+s*0.5, vx:Math.cos(ang)*sp, vy:-Math.abs(Math.sin(ang))*sp*0.6,
               life:0.35, c:k%3?'#4a4038':'#6b2b26', r:1.8+((k*13)%3)});
  }
}
function drawDeaths(dt){
  if (S.deaths && S.deaths.length){ for (const r of S.deaths) spawnDeath(r); S.deaths.length=0; }
  for (let i=deathFx.length-1;i>=0;i--){
    const f=deathFx[i], clip=f.clip, fps=clip.fps||8; f.t+=dt;
    if (f.fi<clip.length-1){                            // przewiń klatki raz i zatrzymaj na trupie
      f.ft+=dt; const step=1/fps;
      while (f.ft>=step && f.fi<clip.length-1){ f.ft-=step; f.fi++; }
      f.spr.texture=clip[f.fi];
    }
    const hold=(clip.length-1)/fps + 1.4;              // trup LEŻY dłużej (jak na polu bitwy), potem zanika
    if (f.t>hold) f.spr.alpha=Math.max(0, 1-(f.t-hold)/0.7);
    if (f.t>hold+0.7){ f.spr.destroy(); deathFx.splice(i,1); }
  }
}

/* ----------------------------- tracery + fx + ghost ---------------------- */
function drawOver(){
  const g=gOver; g.clear();
  // ZAPOWIEDŹ OSTRZAŁU — bez niej to podatek losowy, z nią decyzja:
  // ewakuować tor (przerzut rozkazem) czy przyjąć i odbudować.
  const sm=shellMark();
  if (sm){
    const pulse=0.35+0.35*Math.sin(now()/90);
    g.circle(sm.x, sm.y, sm.r).fill({color:CO.red, alpha:0.10});
    g.circle(sm.x, sm.y, sm.r).stroke({width:2, color:CO.red, alpha:pulse});
    g.circle(sm.x, sm.y, sm.r*(1-Math.min(1,sm.t/3))).stroke({width:1, color:CO.warn, alpha:0.8});
    g.moveTo(sm.x-sm.r,sm.y).lineTo(sm.x+sm.r,sm.y)
     .moveTo(sm.x,sm.y-sm.r).lineTo(sm.x,sm.y+sm.r).stroke({width:1,color:CO.red,alpha:pulse});
  }
  for (const t of S.tracers){
    g.moveTo(t.x1,t.y1).lineTo(t.x2,t.y2).stroke({width:t.w||1, color:t.c, alpha:Math.min(1,t.t/0.07)});
  }
  for (const p of S.projs){
    const shell = !!U[p.src].spl;
    const col = p.side==='p' ? CO.blue : CO.red;
    const dx=p.tx-p.x, dy=p.ty-p.y, L=Math.hypot(dx,dy)||1;
    g.moveTo(p.x-dx/L*9, p.y-dy/L*9).lineTo(p.x,p.y)
     .stroke({width: shell?2.4:1.8, color:col, alpha:0.55});
    g.circle(p.x, p.y, shell?3:2.2).fill({color: shell?CO.warn:col});
  }
  for (const p of S.fx){
    g.rect(p.x-p.r/2,p.y-p.r/2,p.r,p.r).fill({color:p.c, alpha:Math.max(0,p.life*2)});
  }
}
function drawGhost(){
  const g=ghostG; g.clear();
  if (S.state!=='play') return;
  const cell = S.wmouse.over ? cellAt(S.wmouse.x,S.wmouse.y) : null;
  /* PRZESUŃ: chwycony budynek świeci, a pod kursorem widać, czy się zmieści.
     Bez tego „dwa tapnięcia" byłyby zgadywaniem, co jest w ręku.            */
  if (S.sel==='MOVE'){
    const b=S.moveSel;
    if (b){
      const [bw,bh]=B[b.type].fp;
      g.rect(BASE_X+b.c*CELL+2, BASE_Y+b.r*CELL+2, bw*CELL-4, bh*CELL-4)
       .stroke({width:2, color:CO.warn, alpha:0.9});
      if (cell){
        const ok = fitsMoved(b,cell.c,cell.r) && S.money>=moveCost(b);
        for (let rr=cell.r; rr<cell.r+bh; rr++) for (let cc=cell.c; cc<cell.c+bw; cc++){
          const bad = cc<0||cc>=COLS||rr<0||rr>=ROWS ||
            (S.grid[rr]&&S.grid[rr][cc]&&(S.grid[rr][cc].ore>0||(S.grid[rr][cc].b&&S.grid[rr][cc].b!==b)));
          g.rect(BASE_X+cc*CELL+3, BASE_Y+rr*CELL+3, CELL-6, CELL-6)
           .fill({color:bad?CO.red:B[b.type].col, alpha:0.45});
        }
        g.rect(BASE_X+cell.c*CELL+1, BASE_Y+cell.r*CELL+1, bw*CELL-2, bh*CELL-2)
         .stroke({width:2, color: ok?B[b.type].col:CO.red});
      }
    } else if (cell){
      const bb=S.grid[cell.r][cell.c].b;
      if (bb) g.rect(BASE_X+bb.c*CELL+2, BASE_Y+bb.r*CELL+2,
                     B[bb.type].fp[0]*CELL-4, B[bb.type].fp[1]*CELL-4)
               .stroke({width:2, color: canMove(bb)?CO.warn:CO.dim});
    }
    return;
  }
  /* SZYK — podgląd przy stawianiu budynku, który WYSTAWIA jednostki. Kolumna
     kratki decyduje, jak głęboko stanie żołnierz, więc gracz musi to widzieć
     PRZED postawieniem, a nie wyczytać z zachowania armii. Prawa kolumna
     (najbliżej korytarza) świeci najmocniej i ma obwódkę: to pierwsza linia. */
  if (S.sel && B[S.sel] && B[S.sel].unit){
    for (let c=0;c<COLS;c++){
      const przod = COLS>1 ? c/(COLS-1) : 1;          // 0 = tył, 1 = pierwsza linia
      g.rect(BASE_X+c*CELL+1, BASE_Y+1, CELL-2, ROWS*CELL-2)
       .fill({color:CO.blue, alpha:0.04+0.26*przod});
    }
    g.rect(BASE_X+(COLS-1)*CELL+1, BASE_Y+1, CELL-2, ROWS*CELL-2)
     .stroke({width:2, color:CO.ok, alpha:0.75});
  }
  /* Warunek MUSI pytać o `B[S.sel]`, nie wyliczać trybów po nazwie. Stało tu
     `S.sel!=='SELL'`, więc przy włączonej NAPRAWIE (i każdym przyszłym trybie)
     leciało `B['REPAIR'].fp` → TypeError CO KLATKĘ, czyli martwy render.       */
  if (S.sel && B[S.sel] && cell){
    const d=B[S.sel], [w,h]=d.fp;
    const ok = fits(S.sel,cell.c,cell.r) && S.money>=d.cost;
    for (let rr=cell.r; rr<cell.r+h; rr++) for (let cc=cell.c; cc<cell.c+w; cc++){
      const bad = cc<0||cc>=COLS||rr<0||rr>=ROWS || (S.grid[rr]&&S.grid[rr][cc]&&(S.grid[rr][cc].ore>0||S.grid[rr][cc].b));
      g.rect(BASE_X+cc*CELL+3, BASE_Y+rr*CELL+3, CELL-6, CELL-6).fill({color:bad?CO.red:d.col, alpha:0.5});
    }
    g.rect(BASE_X+cell.c*CELL+1, BASE_Y+cell.r*CELL+1, w*CELL-2, h*CELL-2).stroke({width:2,color:ok?d.col:CO.red});
  } else if (S.sel==='SELL' && cell){
    const g0=S.grid[cell.r][cell.c];
    if (g0.b){ const R={x:BASE_X+g0.b.c*CELL,y:BASE_Y+g0.b.r*CELL,w:B[g0.b.type].fp[0]*CELL,h:B[g0.b.type].fp[1]*CELL};
      g.rect(R.x+2.5,R.y+2.5,R.w-5,R.h-5).stroke({width:2,color:g0.b.type==='hq'?CO.dim:CO.red}); }
    else if (g0.seam){ g.rect(BASE_X+cell.c*CELL+3,BASE_Y+cell.r*CELL+3,CELL-7,CELL-7).stroke({width:2,color:CO.warn}); }
  } else if (S.sel==='REPAIR' && cell){
    const bb=S.grid[cell.r][cell.c].b;
    if (bb){ const R={x:BASE_X+bb.c*CELL,y:BASE_Y+bb.r*CELL,w:B[bb.type].fp[0]*CELL,h:B[bb.type].fp[1]*CELL};
      g.rect(R.x+2.5,R.y+2.5,R.w-5,R.h-5).stroke({width:2,color: bb.hp<bb.maxHp?CO.ok:CO.dim}); }
  }
}

// czyści widoki jednostek/budynków (na starcie runu)
export function clearViews(){
  if (unitLayer) unitLayer.removeChildren().forEach(c=>c.destroy({children:true}));
  if (buildLayer) buildLayer.removeChildren().forEach(c=>c.destroy({children:true}));
  if (deathLayer) deathLayer.removeChildren().forEach(c=>c.destroy({children:true}));
  deathFx.length=0;
}

// jedna klatka renderu świata
// harvestery: mały pojazd-strzałka; bursztynowy = objuczony rudą, stalowy = pusty
function drawHarvesters(){
  const g=harvG; g.clear();
  for (const h of S.harv){
    const loaded = h.state==='toBase' || h.state==='dumping';
    const a=h.ang||0, ca=Math.cos(a), sa=Math.sin(a);
    const P=[[6,0],[-5,-4],[-2,0],[-5,4]].map(([px,py])=>[h.x+px*ca-py*sa, h.y+px*sa+py*ca]);
    g.poly(P.flat()).fill(loaded ? CO.ore : '#8fb7cf');
    g.poly(P.flat()).stroke({width:1, color:'#0b0f11', alpha:0.7});
    if (loaded) g.circle(h.x-ca*2, h.y-sa*2, 2).fill('#ffe4a0');           // ładunek
    else if (h.state==='mining' && (now()%320<160)) g.circle(h.x+ca*6, h.y+sa*6, 1.7).fill(CO.warn);  // iskry kopania
  }
}
let _animLast = now();
export function renderFrame(){
  const t=now(), adt=Math.min(0.05,(t-_animLast)/1000); _animLast=t;  // dt do animacji sprite'ów (czas realny)
  updateCam(adt);
  applyCam();
  buildGround();
  drawWorld();
  drawBuildings();
  drawHarvesters();
  drawBastion();
  drawDeaths(adt);
  drawUnits(adt);
  drawOver();
  drawGhost();
}
