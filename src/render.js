/* =========================================================================
   FRONT — render świata na PixiJS + kamera (przewijanie / pinch-zoom).
   Pole rysuje Pixi; HUD jest w DOM (hud.js). Jednostki/budynki/bastion to
   osobne obiekty sceny — gotowe do podmiany na sprite'y (assets.js).
   ========================================================================= */

import * as PIXI from '../vendor/pixi.min.mjs';
import {
  CO, U, B, BASE_X, BASE_Y, CELL, COLS, ROWS, BASE_R, LANE_Y, LANE_HALF, BAS_X,
  STANCES, CAP_R, TERR_MAX, ORE_SIP, EHOLD_X, BAL, HEX, clamp, ringOf, cellAt
} from './config.js';
import { S, SECT, lineX } from './state.js';
import { buildTex, unitTex, tex } from './assets.js';
import { radarLvl, canUp, maxLvl, fits } from './buildings.js';
import { eTerrCtrl } from './sectors.js';
import { bEff } from './enemy.js';

export const app = new PIXI.Application();
export const WV = { x:24, y:150, w:1170, h:356 };     // widoczny wycinek świata
export const cam = { zoom:1, min:0.2, max:3, panX:0, panY:0, _init:false };

const SREF = 12, GB = SREF*3.6;
const glyphTex = {};
let worldRoot, gWorld, worldText, buildLayer, bastionLayer, unitLayer, gOver, ghostG;
let bastionView=null;
const now = () => performance.now();

export async function initPixi(){
  await app.init({ background: CO.bg, antialias:false, resizeTo:window,
                   resolution: Math.min(2, window.devicePixelRatio||1), autoDensity:true });
  document.getElementById('stage').appendChild(app.canvas);

  worldRoot = new PIXI.Container();  app.stage.addChild(worldRoot);
  gWorld    = new PIXI.Graphics();   worldRoot.addChild(gWorld);
  worldText = new PIXI.Container();  worldRoot.addChild(worldText);
  buildLayer= new PIXI.Container();  worldRoot.addChild(buildLayer);
  bastionLayer=new PIXI.Container(); worldRoot.addChild(bastionLayer);
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

/* --------------------------------- KAMERA -------------------------------- */
function bandRect(){
  const sw=app.screen.width, sh=app.screen.height;
  const top = sw<=720 ? 96 : 66;
  const bot = (sw<=720 ? 92 : 100) + 44;
  return { sw, sh, top, bandH: Math.max(60, sh - top - bot) };
}
export function resizeCam(){
  const {sw, sh, bandH}=bandRect();
  const fillH = bandH / WV.h;
  const fitAll= Math.min(sw / WV.w, fillH);
  cam.min = Math.min(fitAll, fillH);
  cam.max = Math.max(fillH*1.8, fitAll*3);
  const portraitish = sw<=900 || sw < sh*1.2;
  const z0 = portraitish ? fillH : fitAll;
  if (!cam._init){ cam.zoom = z0; cam._init=true; }
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
function drawWorld(){
  const g=gWorld; g.clear();
  wtBegin();
  const ly=LANE_Y-LANE_HALF, lh=LANE_HALF*2;

  g.rect(BASE_R,ly,BAS_X+40-BASE_R,lh).fill(CO.dirt);
  g.rect(BASE_R+0.5,ly+0.5,BAS_X+40-BASE_R-1,lh-1).stroke({width:1,color:CO.laneEdge});

  for (const q of SECT){
    const col = q.own===1 ? CO.warn : q.own===-1 ? CO.red : null;
    if (col){ g.rect(q.x-CAP_R, ly, CAP_R*2, lh).fill({color:col, alpha:0.13}); }
    else { g.rect(q.x-CAP_R, ly+0.5, CAP_R*2, lh-1).stroke({width:1,color:CO.gridHi, alpha:0.5}); }
  }
  if (!S.bastion.dead) g.rect(BAS_X-40,ly,80,lh).fill({color:CO.red, alpha:0.17});
  if (!S.bastion.dead) g.rect(S.frontX-1,ly,2,lh).fill({color:'#ffffff', alpha:0.5});

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
    dashV(g, EHOLD_X, ly, ly+lh, CO.red, 0.4);
    wt('MASUJĄ SIĘ — '+massed, EHOLD_X, ly-4, 8, CO.red);
  }
  if (S.si < STANCES.length-1){
    const LX=lineX();
    dashV(g, LX, ly, ly+lh, CO.ok, 0.45);
    wt('LINIA — '+STANCES[S.si].n, LX, ly-4, 8, CO.ok);
  }

  for (const c of S.corpses) g.rect(c.x-c.s/2,c.y-c.s/2,c.s,c.s*0.6).fill({color:c.c, alpha:0.5});

  drawBaseGrid(g);
  wtEnd();
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
  if (bastionView.spr){
    bastionView.spr.visible=true; bastionView.spr.tint=0xffffff;
  } else {
    g.rect(b.x-30,b.y-100,60,200).fill(CO.redD);
    g.rect(b.x-24,b.y-94,48,188).fill(b.flash>0?'#ffffff':CO.red);
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
  const t = unitTex(u.type) || glyphTex[u.type];
  v.spr=new PIXI.Sprite(t); v.spr.anchor.set(0.5);
  const sc=(unitTex(u.type) ? (d.sz*2.6)/Math.max(v.spr.texture.width,1) : d.sz/SREF);
  v._sc=sc; v.addChild(v.spr);
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
  for (const u of S.units){
    const v=ensureUnitView(u), d=U[u.type], s=d.sz, p=u.side==='p';
    const vis   = p || u.nearT>0 || rl>=1;   // radar I: widać ich kształty (kwadraty/prostokąty) na całym polu
    const known = p || (u.seenT>0);          // rozpoznanie typu: w zwarciu (radar I) lub wszędzie (radar II)
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

/* ----------------------------- tracery + fx + ghost ---------------------- */
function drawOver(){
  const g=gOver; g.clear();
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
  if (S.sel && S.sel!=='SELL' && cell){
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
  }
}

// czyści widoki jednostek/budynków (na starcie runu)
export function clearViews(){
  if (unitLayer) unitLayer.removeChildren().forEach(c=>c.destroy({children:true}));
  if (buildLayer) buildLayer.removeChildren().forEach(c=>c.destroy({children:true}));
}

// jedna klatka renderu świata
export function renderFrame(){
  applyCam();
  drawWorld();
  drawBuildings();
  drawBastion();
  drawUnits();
  drawOver();
  drawGhost();
}
