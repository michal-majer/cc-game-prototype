/* =========================================================================
   FRONT — STAN GRY
   Jeden współdzielony obiekt S. Wszystkie moduły czytają i piszą S.*,
   dzięki czemu stan jest w jednym miejscu, a moduły zostają bezstanowe.
   ========================================================================= */

import { STANCES, FRONT_MIN } from './config.js';

export const S = {
  // pole / obiekty
  grid:null, buildings:[], hq:null, bastion:null,
  units:[], fx:[], corpses:[], tracers:[], projs:[],
  // ekonomia / czas
  money:0, wave:0, timer:0, frontX:0,
  // prezentacja / faza
  shake:0, state:'play', endReason:'', sel:null,
  // meta / kontrolki
  best:0, newArm:0, speed:1, raidPay:0, raidShow:0,
  // dziennik / doktryna
  log:[], logDirty:true, hadRadar:0, doc:null,
  // moc / ekonomia pochodna
  supply:0, drain:0, offBrown:0, oreStart:1, alertCd:0, ecoCd:0, fullCd:0,
  // wróg
  eBase:[], eIntel:[], eStance:'hold', ePush:0, eHoldT:0, eDmgWave:0, eThink:0,
  eTerrBank:0, eCounterCd:0, eArmCd:0, eBuildN:0, eBuildDebt:0,
  // linia / draft / wejście
  si:0, fieldDead:false, deck:[], draft:null, draftT:'ROZKAZ ZE SZTABU', draftS:'',
  ready:false, wmouse:{x:0,y:0,over:false},
};

// trzy mini-sztaby na korytarzu (pozycje z config, cap/own to stan runtime)
export const SECT = [
  {n:'PRZEDPOLE', x:FRONT_MIN+186, cap:0, own:0},
  {n:'SRODEK',    x:FRONT_MIN+373, cap:0, own:0},
  {n:'NACISK',    x:FRONT_MIN+576, cap:0, own:0},
];

export const lineX = () => STANCES[S.si].x;

// dziennik zdarzeń — zwija powtórki, trzyma ostatnie 7
export function say(txt, kind){
  const last = S.log[S.log.length-1];
  if (last && last.txt===txt){ last.n=(last.n||1)+1; last.t=0; return; }
  S.log.push({ txt, kind:kind||'info', t:0, n:1 });
  if (S.log.length>7) S.log.shift();
  S.logDirty = true;
}
