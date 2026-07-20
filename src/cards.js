/* =========================================================================
   FRONT — talia (ROZKAZ ZE SZTABU co 3 fale) + otwarcia (fala 0).
   Twarda zasada: żadna karta nie rusza `fp` (obrysu) — zmiana w locie
   zostawiłaby zablokowaną dziurę. resetTables() (config) czyści mutacje U/B
   między runami.
   ========================================================================= */

import { ROWS, COLS, BAL, B, U, CO } from './config.js';
import { S, say } from './state.js';
import { boom, siren } from './audio.js';
import { explode } from './effects.js';
import { mkBuilding, recalcPower, fits } from './buildings.js';
import { oreAround, seedSeam } from './economy.js';
import { renderCards, syncOverlays } from './hud.js';

export const DECK = [
  {n:'WETERANI',       k:'WOJSKO', d:'piechota +20% HP (60 → 72)',
   f:()=>{ U.inf.hp=72; }},
  // --- osobne, POWTARZALNE tory ulepszeń (tylko Twoja armia) ---
  {n:'DRYL BOJOWY',    k:'WOJSKO', d:'żołnierze (piech.+rak.) +2 atak · można wielokrotnie', repeat:true,
   f:()=>{ S.pBonus.atkS+=2; }},
  {n:'KAMIZELKI',      k:'WOJSKO', d:'żołnierze (piech.+rak.) +2 pancerz · można wielokrotnie', repeat:true,
   f:()=>{ S.pBonus.armS+=2; }},
  {n:'DZIAŁA GŁÓWNE',   k:'WOJSKO', d:'opancerzeni (czołg+kolos) +4 atak · można wielokrotnie', repeat:true,
   f:()=>{ S.pBonus.atkA+=4; }},
  {n:'DODATKOWE PŁYTY', k:'WOJSKO', d:'opancerzeni (czołg+kolos) +2 pancerz · można wielokrotnie', repeat:true,
   f:()=>{ S.pBonus.armA+=2; }},
  {n:'ZAPALNIKI',      k:'WOJSKO', d:'artyleria: odłamki ×3 → ×4',
   f:()=>{ U.arty.spl=4; }},
  {n:'BENZYNA 100',    k:'WOJSKO', d:'łazik: prędkość 55 → 72',
   f:()=>{ U.lazik.spd=72; }},
  {n:'CELOWNIKI',      k:'WOJSKO', d:'rakietowiec: zasięg 74 → 96',
   f:()=>{ U.rkt.range=96; }},
  {n:'GŁĘBOKI ODWIERT',k:'RUDA',   d:'każda żyła +180 rudy, teraz',
   f:()=>{ BAL.ORE_MAX=630; for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
             const g=S.grid[r][c]; if(g.seam) g.ore=Math.min(BAL.ORE_MAX,g.ore+180); } }},
  {n:'SPYCHACZE',      k:'RUDA',   d:'zaoranie żyły daje 70% zamiast 40%',
   f:()=>{ BAL.CLEAR_SALV=0.7; }},
  {n:'NOWE ZŁOŻE',     k:'RUDA',   d:'świeża bogata żyła (~5 kratek) w wolnym miejscu',
   f:()=>{ seedSeam(); }},
  {n:'BRYGADY GÓRNICZE',k:'RUDA',  d:'każda rafineria +1 harvester za darmo (o ile ma wolną żyłę)',
   f:()=>{ S.harvBonus=(S.harvBonus||0)+1; }},
  {n:'KOMPRESJA',      k:'RUDA',   d:'elektrownia +3 mocy (6 → 9)',
   f:()=>{ B.power.sup=9; }},
  {n:'MOBILIZACJA',    k:'KRATKI', d:'barak i wyrzutnia: 2 jednostki zamiast 1, na każdym poziomie',
   f:()=>{ B.barracks.count=2; B.rocket.count=2; }},
  {n:'SZTAB POLOWY',   k:'KRATKI', d:'sztab: +10% zamiast +7% na poziom',
   f:()=>{ BAL.HQ_STEP=0.10; }},
  {n:'SABOTAŻ',        k:'WRÓG',   d:'bastion −250 HP natychmiast',
   f:()=>{ S.bastion.maxHp-=250; S.bastion.hp=Math.max(1,S.bastion.hp-250);
           explode(S.bastion.x,S.bastion.y,30,CO.warn); boom(0.9); S.shake=Math.max(S.shake,20); }},
  {n:'BLOKADA',        k:'WRÓG',   d:'ich rozbudowa: co 0,7 fali → co 2,2',
   f:()=>{ BAL.EBUILD_EVERY=2.2; }},
];

// stawia budynek za darmo tam, gdzie ma sens (rafineria → ruda, reszta → przy sztabie)
export function gift(t){
  let best=null, bv=-1e9;
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
    if (!fits(t,c,r)) continue;
    const v = (t==='refinery' ? oreAround(t,c,r).n*100 : 0) - (Math.abs(c-S.hq.c)+Math.abs(r-S.hq.r));
    if (v>bv){ bv=v; best=[c,r]; }
  }
  if (best) mkBuilding(t, best[0], best[1], true);   // darowizny z kart stają natychmiast
}
export const OPEN = [
  {n:'PANCERNI',      k:'WOJSKO', d:'fabryka bez radaru: czolg od fali 1. Okno do fali 4 — potem rakiety.',
   f:()=>{ gift('factory'); S.money = 0; say('PANCERNI: masz 4 fale przewagi. Potem zobacza fabryke.','warn'); }},
  {n:'GARNIZON',     k:'WOJSKO', d:'elektrownia i dwa baraki. Zero rudy, zero kasy — bierz sektory.',
   f:()=>{ gift('power'); gift('barracks'); gift('barracks'); S.money = 0; }},
  {n:'ZWIAD',        k:'WROG',   d:'radar od fali 1: widzisz kazda ich fale. Zero rudy, zero kasy.',
   f:()=>{ gift('power'); gift('radar'); S.money = 0; }},
  {n:'KWATERMISTRZ', k:'KRATKI', d:'450 kredytow i pusta siatka. Wolna reka, zero tempa.',
   f:()=>{ S.money = 450; }},
  {n:'SAPERZY',      k:'RUDA',   d:'spychacz placi 70%: zyly to gotowka. 350 kr. na start.',
   f:()=>{ BAL.CLEAR_SALV=0.7; S.money = 350; }},
];

export function openDraft(src, tytul, pod){
  const pool=[...(src||S.deck)], pick=[];
  if (!pool.length) return;
  while (pick.length<3 && pool.length) pick.push(pool.splice((Math.random()*pool.length)|0,1)[0]);
  // Gwarancja toru armii: karty powtarzalne (dmg/pancerz) to jedyny tor skalowania
  // jednostek, odkąd sztab ich nie mnoży. Jeśli losowy draft ich nie trafił, a talia
  // wciąż je ma — wstaw jedną, by ścieżka ulepszeń armii ZAWSZE była na stole.
  // Otwarcia (OPEN) nie mają kart repeat → to no-op.
  if (!pick.some(c=>c.repeat)){
    const rep=pool.filter(c=>c.repeat);
    if (rep.length) pick[pick.length-1]=rep[(Math.random()*rep.length)|0];
  }
  S.draft=pick; S.draftT=tytul||'ROZKAZ ZE SZTABU';
  S.draftS=pod||('fala '+S.wave+' · wybierz jedno · [1] [2] [3]');
  S.state='draft'; siren(); S.shake=Math.max(S.shake,8);
  renderCards();
}
export function takeCard(c){
  c.f();
  recalcPower();               // karty stawiają budynki i ruszają moc
  if (!c.repeat) S.deck=S.deck.filter(x=>x!==c);   // powtarzalne tory zostają w talii
  S.draft=null; S.state='play';
  say('◆ '+c.n+' — '+c.d,'good');
  boom(0.4);
  syncOverlays();
}
