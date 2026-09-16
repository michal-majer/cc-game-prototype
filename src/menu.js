/* =========================================================================
   FRONT — MENU, WYBÓR MISJI, ODPRAWA, OCENA SZTABU.

   Cały interfejs poza polem walki to DOM (jak reszta HUD-a) — ostry na
   telefonie i klikalny bez trafiania w piksele canvasu.

   Cztery ekrany, jeden overlay:
     main   — tytuł, KAMPANIA / GRA DOWOLNA
     world  — sześć misji świata; zaliczone z OCENĄ SZTABU, następna otwarta
     brief  — odprawa: portret generała i JEDNO ZDANIE zamiast samouczka
     end    — ocena misji i trzy wyjścia: DALEJ / POWTÓRZ / MENU

   Ocena NIE BRAMKUJE postępu — odblokowuje (FRONT.md §5). „Powtórz" wraca do
   PUNKTU KONTROLNEGO misji, nie do początku świata, więc nic nie zachęca do
   grindu pod lepszy wynik.
   ========================================================================= */

import { S } from './state.js';
import { WORLDS, MISSIONS, SKIRMISH } from './missions.js';
import { loadProgress, resetProgress, missionOpen, fmtTime, goalText } from './campaign.js';
import { syncOverlays } from './hud.js';
import { resumeAudio, boom } from './audio.js';

const qs = id => document.getElementById(id);
let API = {};                 // { startMission, restartMission, nextMission, newRun }
let screen = 'main';

export function initMenu(api){
  API = api;
  qs('menu').addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    resumeAudio();
    act(a.dataset.act, a.dataset.arg);
  });
}

function act(what, arg){
  switch (what){
    case 'campaign': screen='world'; render(); break;
    case 'menu':     showMenu(); break;
    case 'freeplay': API.newRun(); break;
    case 'mission':  API.startMission(arg); break;
    case 'go':       hideMenu(); S.ready=false; syncOverlays(); break;   // odprawa → pole (czeka na GOTÓW)
    case 'next':     API.nextMission(); break;
    case 'retry':    API.restartMission(); break;
    case 'wipe':
      if (confirm('Skasować postęp kampanii?')){ resetProgress(); render(); }
      break;
  }
  boom(0.12);
}

/* --------------------------------- EKRANY -------------------------------- */
export function showMenu(){ screen='main'; S.state='menu'; render(); open(true); }
export function showBrief(m){ screen='brief'; S.brief=m; render(); open(true); }
export function showMissionEnd(res){ screen='end'; S.misEnd=res; render(); open(true); }
export function hideMenu(){ open(false); }

function open(v){
  const el = qs('menu');
  el.classList.toggle('hidden', !v);
  if (v){ el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }  // restart przejścia
}

function render(){
  const box = qs('menu-inner');
  box.className = 'menu-inner scr-' + screen;
  box.innerHTML =
      screen==='world' ? worldScreen()
    : screen==='brief' ? briefScreen()
    : screen==='end'   ? endScreen()
    : mainScreen();
}

/* ------------------------------- main ------------------------------------ */
function mainScreen(){
  const p = loadProgress();
  const w = WORLDS[0];
  const done = w.missions.filter(id=>p.done[id]).length;
  const free = p.freeplay;
  return `
    <div class="m-title">FRONT</div>
    <div class="m-sub">${w.name} · ${done}/${w.missions.length} misji</div>
    <div class="m-btns">
      <button class="m-big" data-act="campaign">KAMPANIA</button>
      <button class="m-big ${free?'':'off'}" data-act="${free?'freeplay':''}">
        GRA DOWOLNA${free?'':' · po Świecie I'}</button>
    </div>
    <div class="m-foot">
      <button class="m-mini" data-act="wipe">skasuj postęp</button>
    </div>`;
}

/* ------------------------------- world ----------------------------------- */
function worldScreen(){
  const w = WORLDS[0], p = loadProgress();
  const rows = w.missions.map((id,i)=>{
    const m = MISSIONS[id], r = p.done[id], open = missionOpen(w.id, i);
    const badge = r ? `<span class="m-rate ${r.tag}">${r.word}</span>
                       <span class="m-rnum">${fmtTime(r.sec)} · straty ${r.loss}</span>`
                    : open ? `<span class="m-rate next">NASTĘPNA</span>` : '';
    return `<button class="m-row ${open?'':'lock'} ${r?'done':''}" ${open?`data-act="mission" data-arg="${id}"`:''}>
        <span class="m-n">${m.n}</span>
        <span class="m-col">
          <span class="m-code">${open?m.code:'— — —'}</span>
          <span class="m-teach">${open?m.teach:'zablokowane'}</span>
        </span>
        <span class="m-badge">${badge}</span>
      </button>`;
  }).join('');
  return `
    <div class="m-head"><button class="m-back" data-act="menu">‹ MENU</button>
      <div class="m-h1">${w.name}</div><div class="m-h2">${w.sub}</div></div>
    <div class="m-list">${rows}</div>`;
}

/* ------------------------------- brief ----------------------------------- */
function briefScreen(){
  const m = S.brief || MISSIONS.m1;
  const lines = (m.brief||[]).map(t=>`<li>${t}</li>`).join('');
  return `
    <div class="m-head"><button class="m-back" data-act="menu">‹ MENU</button>
      <div class="m-h1">MISJA ${m.n} — ${m.code}</div>
      <div class="m-h2">${m.teach}</div></div>
    <div class="m-brief">
      <div class="m-portrait"><span>▮</span></div>
      <div class="m-say">
        <div class="m-quote">„${m.gen}"</div>
        <ul class="m-lines">${lines}</ul>
      </div>
    </div>
    <div class="m-goal">CEL — <b>${briefGoal(m)}</b></div>
    <button class="m-big go" data-act="go">DO BOJU ▶</button>`;
}
// Cel na odprawie to DOKŁADNIE ten sam tekst, co w panelu celu w grze —
// osobna kopia rozjechała się i obiecywała co innego, niż misja sprawdzała.
const briefGoal = m => goalText(m);

/* -------------------------------- end ------------------------------------ */
function endScreen(){
  const r = S.misEnd || {};
  const m = r.mission || MISSIONS.m1;
  const w = WORLDS[0];
  const last = w.missions[w.missions.length-1] === m.id;
  const nextM = MISSIONS[w.missions[w.missions.indexOf(m.id)+1]];
  return `
    <div class="m-sub">MISJA ${m.n} — ${m.code}</div>
    <div class="m-word ${r.tag}">${r.word}</div>
    <div class="m-line">${r.line}</div>
    <div class="m-btns">
      ${r.win && !last ? `<button class="m-big" data-act="next">DALEJ — MISJA ${nextM.n}: ${nextM.code} ▶</button>` : ''}
      ${r.win && last  ? `<div class="m-won">ŚWIAT I ZAKOŃCZONY — GRA DOWOLNA OTWARTA</div>` : ''}
      <button class="m-big ${r.win?'alt':''}" data-act="retry">${r.win?'POWTÓRZ':'POWTÓRZ MISJĘ'}</button>
      <button class="m-mini" data-act="menu">MENU</button>
    </div>`;
}
