/* =========================================================================
   FRONT — META: eskalacja między runami, WARIANTY POLA (modyfikatory),
   metryki runu i RAPORT KOŃCOWY do analizy.

   Dwa cele:
   · „za łatwo" — eskalacja: z każdym ukończonym runem front się zaostrza
     (bastion twardszy, wróg buduje szybciej, więcej wariantów naraz). Trzymane
     w localStorage („front.meta"), więc rośnie POWOLI przez wiele podejść.
   · „powtarzalnie" — warianty: co run losujemy 1–3 modyfikatory zmieniające
     reguły (twardszy bastion, szybsze fale, mgła wojny, cięższe pancerze…),
     więc każdy run gra inaczej, mimo tych samych trzech doktryn wroga.

   Wszystko, co modyfikatory ruszają, resetuje się co run: U/B/BAL czyści
   resetTables() (config), S.* czyści newRun(), a skalary siedzą w S.run.
   ========================================================================= */

import { U, B, BAL, BAS_HP } from './config.js';
import { S, SECT } from './state.js';
import { oreTotal, seamsAlive } from './economy.js';

const LS_KEY = 'front.meta';

function loadMeta(){
  try {
    const m = JSON.parse(localStorage.getItem(LS_KEY));
    if (m && typeof m === 'object') return { runs:0, wins:0, esc:0, history:[], ...m };
  } catch(e){}
  return { runs:0, wins:0, esc:0, history:[] };
}
function saveMeta(m){ try { localStorage.setItem(LS_KEY, JSON.stringify(m)); } catch(e){} }

// Dobór budynku do STARTOWEJ bazy wroga (modyfikatory przyczółka/żył): z puli
// `late` doktryny, ale BEZ ciężkiej fabryki. Kolos (430 HP) w 1. fali to nie
// „trudniej" — to ściana nie do przebicia, nim gracz w ogóle ma czym. Heavy
// należy do późnej gry (order dokłada go dopiero ~15. buildem); reszta puli
// (fabryki, warsztaty, baraki, arty) i tak dokłada nacisku na starcie.
function eStartPick(){
  const pool = S.doc.late.filter(t => t !== 'heavy');
  return pool[(Math.random()*pool.length)|0];
}

/* --------------------------- WARIANTY POLA -------------------------------
   apply() odpala się w newRun PO resetTables i PO resecie S.* — mutuje tabele
   (U/B/BAL: czyszczone co run), S.eBase, S.pBonus/S.harvBonus oraz skalary
   S.run.*. Nic nie przecieka między runami poza tym, co reset i tak przywraca.
   Tagi: 'hard' = trudniej · 'twist' = zmienia charakter · 'boon' = sprzyja.  */
export const MODIFIERS = [
  // — trudniej —
  { id:'okopy', name:'OKOPANY BASTION', tag:'hard', w:3,
    desc:'Bastion +40% HP — dłuższe oblężenie.',
    apply:()=>{ S.run.basHpMul *= 1.4; } },
  { id:'blitz', name:'BŁYSKAWICZNY FRONT', tag:'hard', w:3,
    desc:'Fale nadchodzą o 20% szybciej.',
    apply:()=>{ S.run.waveMul *= 0.8; } },
  { id:'rozbudowa', name:'PRZYSPIESZONA ROZBUDOWA', tag:'hard', w:3,
    desc:'Wróg rozbudowuje się o 30% częściej.',
    apply:()=>{ BAL.EBUILD_EVERY *= 0.7; } },
  { id:'przyczolek', name:'PRZYCZÓŁEK WROGA', tag:'hard', w:2,
    desc:'Wróg zaczyna z dwoma budynkami więcej.',
    apply:()=>{ for (let i=0;i<2;i++) S.eBase.push(eStartPick()); } },

  // — twisty (zmieniają charakter walki, zwykle też trudniej) —
  { id:'pancerze', name:'CIĘŻKIE PANCERZE', tag:'twist', w:2,
    desc:'Czołgi i kolosy +2 pancerz — bez broni ppanc. nie przebijesz.',
    apply:()=>{ U.tank.arm += 2; U.kolos.arm += 2; } },
  { id:'grad', name:'GRAD OGNIA', tag:'twist', w:2,
    desc:'Artyleria rażąca +12 px szerzej — zbita masa ginie.',
    apply:()=>{ U.arty.splR += 12; } },
  { id:'szturm', name:'SZYBKI FRONT', tag:'twist', w:2,
    desc:'Wszystkie jednostki +12% prędkości — starcia rozstrzygają się szybciej.',
    apply:()=>{ for (const k in U) U[k].spd = Math.round(U[k].spd * 1.12); } },
  { id:'mgla', name:'MGŁA WOJNY', tag:'twist', w:2,
    desc:'Radar II niedostępny — skład fali poznasz tylko w zwarciu.',
    apply:()=>{ S.run.fogged = true; } },
  { id:'zyzne', name:'ŻYZNE ZŁOŻA', tag:'twist', w:2,
    desc:'Żyły +40% rudy, ale wróg startuje z +1 budynkiem.',
    apply:()=>{
      BAL.ORE_MAX = Math.round(BAL.ORE_MAX * 1.4);
      for (let r=0;r<S.grid.length;r++) for (let c=0;c<S.grid[r].length;c++){
        const g=S.grid[r][c]; if (g.seam) g.ore = Math.min(BAL.ORE_MAX, Math.round(g.ore*1.4));
      }
      S.eBase.push(eStartPick());
    } },

  // — sprzyjające (rzadsze; ich waga maleje z eskalacją) —
  { id:'zaopatrzenie', name:'ZAOPATRZENIE', tag:'boon', w:1,
    desc:'Zaczynasz z +200 kredytów.',
    apply:()=>{ S.run.moneyBonus += 200; } },
  { id:'gornicy', name:'BRYGADY GÓRNICZE', tag:'boon', w:1,
    desc:'Każda rafineria +1 harvester za darmo.',
    apply:()=>{ S.harvBonus = (S.harvBonus||0) + 1; } },
  { id:'weterani', name:'ZAPRAWIENI W BOJU', tag:'boon', w:1,
    desc:'Twoi żołnierze zaczynają z +2 do ataku.',
    apply:()=>{ S.pBonus.atkS += 2; } },
];

// Losowanie z wagą: warianty 'hard' rosną z eskalacją, 'boon' maleją — im dłużej
// grasz, tym częściej wypada coś trudnego, a rzadziej prezent.
function weightedPick(pool, esc){
  const w = pool.map(m=>{
    let x = m.w;
    if (m.tag==='hard')  x *= 1 + esc*0.12;
    if (m.tag==='boon')  x *= Math.max(0.3, 1 - esc*0.06);
    return x;
  });
  let total=0; for (const x of w) total+=x;
  let r = Math.random()*total;
  for (let i=0;i<pool.length;i++){ r -= w[i]; if (r<=0) return pool[i]; }
  return pool[pool.length-1];
}

/* --------------------------- START RUNU ----------------------------------
   Woła newRun PO resecie S.* (i po ustawieniu S.doc / S.eBase / S.grid).
   Ustawia skalary S.run i S.stat, nakłada eskalację i losuje warianty.       */
export function rollRun(){
  const meta = loadMeta();
  const esc = meta.esc || 0;
  S.run = { esc, mods:[], basHpMul:1, waveMul:1, moneyBonus:0, fogged:false };

  // bazowa eskalacja — powoli, z każdym runem: bastion twardszy, wróg buduje szybciej
  S.run.basHpMul *= 1 + Math.min(0.6, esc*0.03);
  BAL.EBUILD_EVERY *= 1 - Math.min(0.3, esc*0.02);

  // liczba wariantów rośnie z eskalacją: 1 → 2 (od esc 3) → 3 (od esc 6)
  const nMods = Math.min(3, 1 + Math.floor(esc/3));
  const pool = MODIFIERS.slice();
  for (let i=0; i<nMods && pool.length; i++){
    const m = weightedPick(pool, esc);
    pool.splice(pool.indexOf(m), 1);
    m.apply();
    S.run.mods.push({ id:m.id, name:m.name, desc:m.desc, tag:m.tag });
  }

  // metryki runu (zbierane hookami w sim/buildings/cards przez S.stat.*)
  S.stat = {
    t0: (typeof performance!=='undefined' ? performance.now() : 0),
    built:{}, builtTotal:0, lost:0, cards:[],
    eKill:0, pKill:0, peakE:0, basDmg:0,
  };
  return S.run;
}

/* --------------------------- KONIEC RUNU ---------------------------------
   Woła game.js przy przejściu play → win/over. Buduje raport, drukuje go do
   konsoli (pełny obiekt do analizy), dopisuje do historii w localStorage,
   podbija eskalację i wykłada S.report/S.reportJSON dla HUD-a.               */
export function finishRun(){
  const win = S.state === 'win';
  const now = (typeof performance!=='undefined' ? performance.now() : 0);
  const st  = S.stat || {};
  const dur = st.t0 ? Math.round((now - st.t0)/1000) : 0;
  const hp    = Math.max(0, Math.round(S.bastion.hp));
  const maxHp = Math.round(S.bastion.maxHp);
  const basPct = maxHp ? Math.round(100*(1 - hp/maxHp)) : 0;
  const eBase = {}; for (const t of S.eBase) eBase[t] = (eBase[t]||0)+1;

  const report = {
    ts: new Date().toISOString(),
    result: win ? 'ZWYCIĘSTWO' : 'PORAŻKA',
    reason: S.endReason,
    doctrine: S.doc.name,
    esc: S.run ? S.run.esc : 0,
    mods: (S.run ? S.run.mods : []).map(m=>m.name),
    wave: S.wave, best: S.best,
    durationSec: dur,
    bastionHp: hp, bastionMax: maxHp, bastionDestroyedPct: basPct,
    bastionDamageDealt: Math.round(st.basDmg||0),
    money: Math.floor(S.money),
    buildingsBuilt: st.built||{}, buildingsBuiltTotal: st.builtTotal||0, buildingsLost: st.lost||0,
    cards: st.cards||[],
    enemyKilled: st.eKill||0, playerKilled: st.pKill||0, peakEnemyOnField: st.peakE||0,
    enemyBase: eBase, enemyBuildings: S.eBase.length,
    army: { atkS:S.pBonus.atkS, armS:S.pBonus.armS, atkA:S.pBonus.atkA, armA:S.pBonus.armA },
    sectorsOwned: SECT.filter(s=>s.own===1).length,
    oreStart: Math.round(S.oreStart), oreLeft: Math.round(oreTotal()), seamsLeft: seamsAlive(),
  };

  // meta / eskalacja — win podbija mocniej (skoro dałeś radę, front rośnie szybciej)
  const meta = loadMeta();
  meta.runs = (meta.runs||0) + 1;
  if (win) meta.wins = (meta.wins||0) + 1;
  meta.esc  = (meta.esc||0) + (win ? 2 : 1);
  meta.history = meta.history || [];
  meta.history.push(report);
  if (meta.history.length > 30) meta.history = meta.history.slice(-30);
  saveMeta(meta);

  const mm = String(Math.floor(dur/60)), ss = String(dur%60).padStart(2,'0');

  // pełny raport do konsoli — do analizy „jak poszło"
  try {
    console.groupCollapsed('%cFRONT · RAPORT RUNU · '+report.result+' · fala '+report.wave,
      'color:'+(win?'#5fd18a':'#e05252')+';font-weight:bold');
    console.log('doktryna:', report.doctrine, '· eskalacja:', report.esc,
                '· warianty:', report.mods.join(', ') || '—');
    console.log('czas:', mm+':'+ss, '· powód:', report.reason);
    console.log('bastion zniszczony:', basPct+'%', '('+hp+'/'+maxHp+')',
                '· obrażenia zadane bastionowi:', report.bastionDamageDealt);
    console.log('zabici — wróg:', report.enemyKilled, '· Twoi:', report.playerKilled,
                '· szczyt wroga na polu:', report.peakEnemyOnField);
    console.log('budynki postawione:'); console.table(report.buildingsBuilt);
    console.log('karty:', report.cards.join(', ') || '—');
    console.log('ich baza:', report.enemyBase);
    console.log('meta:', { runs:meta.runs, wins:meta.wins, esc:meta.esc });
    console.log('pełny obiekt:', report);
    console.groupEnd();
  } catch(e){ console.log('FRONT · RAPORT RUNU', report); }

  // dla HUD (ekran końca)
  S.report = [
    'CZAS '+mm+':'+ss+' · FALA '+report.wave+' · REKORD '+report.best,
    'BASTION '+basPct+'% zniszczony ('+hp+'/'+maxHp+')',
    'ZABICI: wróg '+report.enemyKilled+' · Twoi '+report.playerKilled+' · szczyt wroga '+report.peakEnemyOnField,
    'BUDYNKI: postawione '+report.buildingsBuiltTotal+' · stracone '+report.buildingsLost+' · ich baza '+report.enemyBuildings+' ob.',
    'ARMIA: żoł. ⚔+'+report.army.atkS+' ⛊+'+report.army.armS+' · panc. ⚔+'+report.army.atkA+' ⛊+'+report.army.armA,
    'KARTY: '+(report.cards.join(', ') || '—'),
    'ESKALACJA '+report.esc+' · runów '+meta.runs+' · zwycięstw '+meta.wins,
    'Pełny raport w konsoli (F12) · historia: localStorage „front.meta"',
  ];
  S.reportJSON = JSON.stringify(report, null, 2);
  return report;
}

// pomocnicze — dostępne z ?debug (window.__front) i z konsoli
export function getMeta(){ return loadMeta(); }
export function resetMeta(){ saveMeta({ runs:0, wins:0, esc:0, history:[] }); }
