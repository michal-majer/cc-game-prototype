/* =========================================================================
   FRONT — punkt wejścia / bootstrap.
   index.html ładuje ten plik jako moduł. Tu tylko: newRun (start runu),
   inicjalizacja Pixi/HUD/wejścia i pętla gry. Reszta w modułach src/*.

     config → state → (economy, sectors, buildings, enemy, cards, sim)
                                    ↓
                          render (Pixi) + hud (DOM) + input
   ========================================================================= */

import { resetTables, DOCTRINES, BAS_HP, BAS_X, LANE_Y,
         FRONT_MIN, FRONT_MAX, COLS, ROWS, cellAt } from './config.js';
import { S, say, SECT } from './state.js';
import { loadAssets } from './assets.js';
import { genOre, oreTotal } from './economy.js';
import { resetSect } from './sectors.js';
import { mkBuilding, recalcPower } from './buildings.js';
import { openDraft, OPEN, DECK } from './cards.js';
import { update, waveInterval } from './sim.js';
import { initPixi, app, cam, WV, screenToWorld, clearViews, renderFrame } from './render.js';
import { buildBar, buildStanceSlider, syncOverlays, updateHUD } from './hud.js';
import { initInput, worldTap } from './input.js';

export function newRun(){
  resetTables();
  resetSect();
  S.grid=[];
  for (let r=0;r<ROWS;r++){ S.grid[r]=[]; for(let c=0;c<COLS;c++) S.grid[r][c]={ore:0,seam:false,pull:false,b:null,prevOre:0}; }
  genOre();
  S.oreStart=oreTotal();
  S.buildings=[]; S.units=[]; S.fx=[]; S.corpses=[]; S.tracers=[];
  clearViews();
  S.hq = mkBuilding('hq', 0, 2);
  S.bastion = {x:BAS_X, y:LANE_Y, hp:BAS_HP, maxHp:BAS_HP, side:'e', cd:0, flash:0, dead:false};
  S.doc = DOCTRINES[(Math.random()*DOCTRINES.length)|0];
  S.eBase = [...S.doc.start];
  S.money=200; S.wave=0; S.timer=waveInterval(); S.frontX=(FRONT_MIN+FRONT_MAX)/2;
  S.deck=[...DECK]; S.draft=null;
  S.shake=0; S.state='play'; S.endReason=''; S.sel=null; S.hadRadar=0; S.offBrown=0;
  S.alertCd=0; S.ecoCd=0; S.si=0; S.fieldDead=false; S.newArm=0; S.fullCd=0;
  S.raidPay=0; S.raidShow=0; S.eIntel=[]; S.eStance='hold'; S.ePush=0; S.eHoldT=0;
  S.eDmgWave=0; S.eThink=0; S.eTerrBank=0; S.eCounterCd=0; S.eArmCd=0; S.eBuildN=0; S.eBuildDebt=0;
  S.log=[]; S.logDirty=true; S.ready=false;

  openDraft(OPEN, 'WYBIERZ OTWARCIE', 'przeciwnik ma doktryne — Ty masz to');
  say('KANAŁ 7 OTWARTY','good');
  say('PRZECIWNIK: '+S.doc.name,'intel');
  say(S.doc.tag,'intel');
  say(S.doc.hint,'warn');
  say('TRZY MINI-SZTABY. Niczyje. Wejdz i odstoj — zostana Twoje.','good');
  say('Teren daje Ci kredyty. Im — budynki.','good');
  say('Oddany grunt płaci im, nie Tobie.','warn');
  say('Laboratorium: +1 poziom wszystkim. Sztab: bez limitu.','good');
  say('Bez radaru widzisz ich dopiero w zwarciu.','warn');
  say('Bastion JEST ich bazą — bij go, a ich fale maleją.','good');
  say('Żyła 450. Kredyty kapią — każdy budynek to decyzja.');
  say('Kratka albo złoże. Nie oba.','warn');
  recalcPower();
}

async function main(){
  await initPixi();
  try { await loadAssets(); } catch(e){}
  buildBar();
  buildStanceSlider();
  initInput();
  newRun();

  // hak deweloperski (tylko z ?debug w URL) — podgląd kamery i stanu
  if (location.search.includes('debug')){
    window.__front = { S, SECT, cam, WV, screenToWorld, cellAt, worldTap, newRun,
      get sel(){return S.sel;}, set sel(v){S.sel=v;},
      get money(){return S.money;}, set money(v){S.money=v;},
      buildings:()=>S.buildings.length, units:()=>S.units.length,
      state:()=>S.state };
  }

  let last=performance.now();
  app.ticker.add(()=>{
    const nowT=performance.now();
    const raw=Math.min(0.05,(nowT-last)/1000); last=nowT;
    for (let i=0;i<S.speed;i++) update(raw);
    renderFrame();
    updateHUD();
    syncOverlays();
  });
}
main();
