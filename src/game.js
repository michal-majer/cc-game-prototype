/* =========================================================================
   FRONT — punkt wejścia / bootstrap i ŚCIEŻKA MISJI.

   index.html ładuje ten plik jako moduł. Tu tylko: budowa pola pod misję,
   przejścia między misjami i pętla gry. Reszta w modułach src/*.

     missions (dane) → campaign (ramka) → config → state
                              ↓
        (economy, sectors, buildings, enemy, cards, sim)
                              ↓
            render (Pixi) + hud (DOM) + menu (DOM) + input

   Jedna ramka obsługuje kampanię i grę dowolną. `newRun()` (gra dowolna) to
   po prostu `startMission('skirmish')` — nie ma dwóch trybów, jest jeden
   silnik i dwa zestawy danych (FRONT.md §7).
   ========================================================================= */

import { resetTables, DOCTRINES, BAS_HP, BAS_X, LANE_Y, START_MONEY,
         FRONT_MIN, FRONT_MAX, COLS, ROWS, cellAt, setGrid, GRID_MAX_COLS } from './config.js';
import { S, say, SECT } from './state.js';
import { loadAssets } from './assets.js';
import { genOre, oreTotal, ensureRefinerySpot } from './economy.js';
import { resetSect } from './sectors.js';
import { mkBuilding, recalcPower, resetIds } from './buildings.js';
import { openDraft, OPEN, DECK } from './cards.js';
import { rollRun, finishRun, newStat, getMeta, resetMeta } from './meta.js';
import { update, waveInterval } from './sim.js';
import { initPixi, app, cam, WV, screenToWorld, clearViews, renderFrame, fitCam } from './render.js';
import { buildBar, buildStanceSlider, syncOverlays, updateHUD, initMinimap } from './hud.js';
import { initInput, worldTap } from './input.js';
import { MISSIONS, WORLDS, SKIRMISH, worldOf } from './missions.js';
import { applyMission, applyRoadObjectives, applySlots, snapshot, restoreBase, replayCards,
         finishMission, isCampaign, MIS, loadProgress } from './campaign.js';
import { initMenu, showMenu, showBrief, showMissionEnd, hideMenu } from './menu.js';

/* ------------------------- BUDOWA POLA POD MISJĘ -------------------------
   Wszystko, co da się wyczyścić, czyścimy; wszystko, co jest daną misji,
   bierzemy z rekordu. `carry` to migawka z poprzedniej misji (patrz §4.4:
   baza przechodzi MIĘDZY MISJAMI W ŚWIECIE, nie między światami).           */
function buildField(m, carry){
  resetTables();
  resetIds();
  resetSect();
  applyRoadObjectives();          // cele biorą się z DANYCH DRÓG misji
  applySlots();                   // stanowiska ogniowe przed bazą

  S.grid=[];
  for (let r=0;r<ROWS;r++){ S.grid[r]=[]; for(let c=0;c<COLS;c++) S.grid[r][c]={ore:0,seam:false,pull:false,b:null,prevOre:0}; }
  if (m.feats.ore !== false) genOre();
  S.oreStart=Math.max(1, oreTotal());

  S.buildings=[]; S.units=[]; S.fx=[]; S.corpses=[]; S.deaths=[]; S.tracers=[]; S.projs=[]; S.harv=[];
  clearViews();

  // doktryna: kampania podaje ją po NAZWIE (migawka też — mina nr 2 z §10)
  S.doc = (m.enemy && m.enemy.doc && DOCTRINES.find(d=>d.name===m.enemy.doc))
        || DOCTRINES[(Math.random()*DOCTRINES.length)|0];
  S.eBase = (m.enemy && m.enemy.base) ? [...m.enemy.base] : [...S.doc.start];

  S.money = m.money != null ? m.money : START_MONEY;
  S.wave=0; S.frontX=(FRONT_MIN+FRONT_MAX)/2;
  S.deck=[...DECK]; S.draft=null;
  S.shake=0; S.state='play'; S.endReason=''; S.sel=null; S.upSel=null; S.hadRadar=0; S.offBrown=0;
  S.alertCd=0; S.ecoCd=0; S.fieldDead=false; S.newArm=0; S.fullCd=0;
  S.si = Math.min(1, Math.max(0, (m.feats.stance||1)-1));   // start na PRZEDPOLU, gdy suwak istnieje
  S.laneOrder = -1; S.pLaneRR = 0;                           // domyślnie: siły rozdzielone po torach
  S.raidPay=0; S.raidShow=0; S.harvBonus=0; S.pBonus={atkS:0,armS:0,atkA:0,armA:0};
  S.eIntel=[]; S.eStance='hold'; S.ePush=0; S.eHoldT=0;
  S.eDmgWave=0; S.eThink=0; S.eTerrBank=0; S.eCounterCd=0; S.eArmCd=0; S.eBuildN=0; S.eBuildDebt=0;
  S.log=[]; S.logDirty=true; S.ready=false; S.report=null; S.reportJSON='';

  // Warianty pola i eskalacja TYLKO w grze dowolnej. Misje kampanii są autorskie —
  // losowy modyfikator na dopieszczonej misji 1 to nie różnorodność, tylko szum.
  if (!isCampaign()){
    rollRun();
    S.money += S.run.moneyBonus||0;
    if (S.stat) S.stat.inc.karty += S.run.moneyBonus||0;
  } else {
    S.run = { esc:0, mods:[], basHpMul:1, waveMul:1, moneyBonus:0, fogged:false };
    newStat();
  }

  // sztab — z migawki (z poziomem i HP) albo świeży
  if (carry && carry.base && carry.base.buildings.length){
    restoreBase(carry.base, mkBuilding);
    S.money = Math.round(carry.base.money) + (m.grant || 0);
    // §4.2: stały przydział kredytów na start misji, żeby słabsza baza mogła nadrobić
    if (m.money != null) S.money = Math.max(S.money, m.money);
  }
  if (!S.hq || !S.buildings.includes(S.hq)) S.hq = mkBuilding('hq', 0, Math.min(2, ROWS-2), true);
  // DOPIERO TERAZ, ze sztabem na siatce: gwarancja, że rafineria ma gdzie stanąć
  // i że pojedynczy budynek 1×1 nie zablokuje misji (patrz ensureRefinerySpot).
  if (m.feats.ore !== false) ensureRefinerySpot();

  // karty i ulepszenia armii przechodzą MIĘDZY ŚWIATAMI — osobno od bazy (§8)
  if (carry && carry.run){
    replayCards(carry.run.cards);
    S.pBonus = { ...carry.run.pBonus };
    S.harvBonus = carry.run.harvBonus || 0;
    if (S.stat) S.stat.cards = (carry.run.cards||[]).slice();
  }

  S.timer = waveInterval();
  const basHp = Math.round((m.enemy && m.enemy.bastion ? m.enemy.bastion : BAS_HP) * S.run.basHpMul);
  S.bastion = { x:(m.enemy && m.enemy.spawnX ? m.enemy.spawnX+36 : BAS_X), y:LANE_Y,
                hp:basHp, maxHp:basHp, side:'e', cd:0, flash:0, dead:false,
                // bastion jest CELEM tylko tam, gdzie misja o niego gra; indziej to
                // punkt startu fal (mini-baza), którego nie da się bić
                target: (m.goal||{}).kind === 'bastion' };
  recalcPower();

  // Dziennik prowadzi POJEDYNCZYMI linijkami w reakcji na to, co się dzieje —
  // nie wysypuje czternastu naraz na starcie (FRONT.md, misja 1). Na wejściu
  // tylko zdanie generała i cel; reszta przychodzi z gry.
  if (isCampaign()){
    say('MISJA '+m.n+' — '+m.code, 'good');
    say(m.gen, 'intel');
  } else {
    say('KANAŁ 7 OTWARTY','good');
    say('PRZECIWNIK: '+S.doc.name,'intel');
    say(S.doc.tag,'intel');
    say(S.doc.hint,'warn');
    for (const mod of S.run.mods) say('WARIANT · '+mod.name+' — '+mod.desc, mod.tag==='boon'?'good':'warn');
    openDraft(OPEN, 'WYBIERZ OTWARCIE', 'przeciwnik ma doktryne — Ty masz to');
  }
}

/* ------------------------------ ŚCIEŻKA MISJI --------------------------- */
export function startMission(id, carry){
  const m = (id === 'skirmish') ? SKIRMISH : MISSIONS[id];
  if (!m) return;
  applyMission(m);
  buildField(m, carry);
  // PUNKT KONTROLNY na start każdej misji — „powtórz" wraca DO NIEGO,
  // nie do początku świata (FRONT.md §4.1). To on robi kampanię płynną.
  S.checkpoint = { id, carry: carry ? JSON.parse(JSON.stringify(carry)) : null };
  buildBar(); buildStanceSlider();
  fitCam();
  hideMenu();
  if (isCampaign()) showBrief(m); else { S.ready = false; syncOverlays(); }
}
export function restartMission(){
  const cp = S.checkpoint;
  if (!cp) return startMission('skirmish');
  startMission(cp.id, cp.carry);
}
export function nextMission(){
  const m = MIS();
  const w = worldOf(m.id);
  const i = w.missions.indexOf(m.id);
  if (i < 0 || i+1 >= w.missions.length) return showMenu();
  startMission(w.missions[i+1], snapshot());
}
// gra dowolna — ta sama ramka, inne dane
export function newRun(){ startMission('skirmish'); }

async function main(){
  await initPixi();
  try { await loadAssets(); } catch(e){}
  buildBar();
  buildStanceSlider();
  initMinimap();
  initInput();
  initMenu({ startMission, restartMission, nextMission, newRun });

  // pole musi istnieć, zanim menu cokolwiek narysuje — budujemy misję 1 „na sucho"
  applyMission(MISSIONS.m1);
  buildField(MISSIONS.m1, null);
  S.state = 'menu';
  showMenu();

  // hak deweloperski (tylko z ?debug w URL) — podgląd kamery i stanu
  if (location.search.includes('debug')){
    window.__front = { S, SECT, cam, WV, screenToWorld, cellAt, worldTap, newRun,
      startMission, restartMission, nextMission, progress:loadProgress,
      get sel(){return S.sel;}, set sel(v){S.sel=v;},
      get money(){return S.money;}, set money(v){S.money=v;},
      buildings:()=>S.buildings.length, units:()=>S.units.length,
      meta:getMeta, resetMeta, report:()=>S.report,
      state:()=>S.state };
  }

  let last=performance.now(), prevState=S.state;
  app.ticker.add(()=>{
    const nowT=performance.now();
    const raw=Math.min(0.05,(nowT-last)/1000); last=nowT;
    for (let i=0;i<S.speed;i++) update(raw);
    // przejście play → koniec misji: raport i OCENA SZTABU zbierane RAZ
    const ended = S.state==='win' || S.state==='over';
    if (ended && prevState!=='win' && prevState!=='over'){
      const res = finishMission(S.state==='win');
      finishRun();
      if (res) showMissionEnd(res);
    }
    prevState = S.state;
    renderFrame();
    updateHUD();
    syncOverlays();
  });
}
main();
