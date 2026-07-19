/* =========================================================================
   FRONT — przeciwnik: ocena sił, decyzja szturm/odwrót, bastion jako baza,
   skład fali i kontra celująca w to, co boli.
   ========================================================================= */

import {
  U, B, EB, EARTY_CAP, EPUSH_R, EHOLD_R, EPATIENCE, EPAT_MASS, ESCOUT,
  ETHINK, ECOMMIT, ESHELLED, BAS_HP
} from './config.js';
import { S, say, lineX } from './state.js';
import { boom, siren } from './audio.js';
import { bDmg, radarLvl } from './buildings.js';
import { terrCtrl } from './sectors.js';

// siła = Σ (HP + DPS×10), liczona tym samym wzorem po obu stronach
export function force(side){
  let s=0;
  for (const u of S.units){
    if (u.side!==side || u.hp<=0) continue;
    const d=U[u.type];
    s += u.hp + (d.dmg/d.rate)*10;
  }
  return s;
}
// bunkry/sztab liczą się tylko jeśli realnie dosięgają Twojej linii
export function pDefense(){
  const LX=lineX();
  let s=0;
  for (const b of S.buildings){
    const d=B[b.type];
    if (!d.atk || !b.powered) continue;
    if (b.x + d.atk.range < LX - 30) continue;
    s += (bDmg(b)/d.atk.rate)*10 + b.hp*0.3;
  }
  return s;
}
export function eRatio(){
  const p = force('p') + pDefense();
  return p<1 ? 99 : force('e')/p;
}
export function eDecide(){
  const r = eRatio(), n = S.units.filter(u=>u.side==='e').length;
  const shelled = S.eDmgWave > ESHELLED;
  S.eDmgWave = 0;
  if (!n){ S.eStance='hold'; S.eHoldT=0; return; }
  if (shelled){
    if (S.eStance!=='push'){
      S.eStance='push';
      say('NIE DAJĄ SIĘ OSTRZELIWAĆ — SZARŻUJĄ','bad');
      siren(); S.shake=Math.max(S.shake,10);
    }
    S.eHoldT=0;
    return;
  }
  if (S.eStance==='hold'){
    S.eHoldT += ETHINK;
    const terrPress = Math.max(0.35, 1 - terrCtrl()*0.8);
    const pat = EPATIENCE * Math.max(0.25, 1 - n/EPAT_MASS) * terrPress;
    if (r > EPUSH_R || S.eHoldT >= pat){
      S.eStance='push'; S.eHoldT=0; S.ePush=ECOMMIT;
      say('▲ SZTURM — RUSZA '+n+' JEDNOSTEK','bad');
      siren(); boom(0.6); S.shake=Math.max(S.shake,14);
    }
  } else if (S.ePush-=ETHINK, S.ePush<=0 && r < EHOLD_R){
    S.eStance='hold'; S.eHoldT=0;
    say('ONI SIĘ COFAJĄ ZA SWOJĄ LINIĘ','good');
  }
}
// Bastion JEST ich bazą: uszkodzony trwale osłabia produkcję (podłoga 0.45).
export const bEff = () => S.bastion.dead ? 0 : Math.max(0, 0.45 + 0.55*(S.bastion.hp/BAS_HP));
export function eComp(){
  const out={}, eff=bEff();
  for (const t of S.eBase){ const d=EB[t]; out[d.unit]=(out[d.unit]||0)+d.count; }
  for (const k of Object.keys(out)){
    out[k]=Math.round(out[k]*eff);
    if (out[k]<=0) delete out[k];
  }
  return out;
}
export function eBuild(){
  S.eArmCd--;
  const iIdx = S.eIntel.length-1-ESCOUT;
  const I = iIdx >= 0 ? S.eIntel[iIdx] : {tanks:0, wheels:0, arty:0};
  const pTanks  = I.tanks;
  const pWheels = I.wheels;
  const eRkt = S.eBase.filter(t=>t==='rocket').length;
  const eBar = S.eBase.filter(t=>t==='barracks').length;
  if (pTanks >= 2 && eRkt < pTanks && S.eArmCd <= 0){
    S.eBase.push('rocket'); S.eArmCd = 2; S.eBuildN++;
    say(radarLvl()>=1 ? 'WYWIAD: ODPOWIADAJA RAKIETAMI' : 'ZA ICH LINIA — DLUGIE RURY', radarLvl()>=1?'intel':'warn');
    return;
  }
  if (pWheels >= 3 && eBar < pWheels*2 && S.eArmCd <= 0){
    S.eBase.push('barracks'); S.eArmCd = 2; S.eBuildN++;
    say(radarLvl()>=1 ? 'WYWIAD: SYPIA BARAKI — IDA TLUMEM' : 'ZA ICH LINIA — GWAR', radarLvl()>=1?'intel':'warn');
    return;
  }
  S.eCounterCd--;
  const pArty = I.arty;
  const eArty = S.eBase.filter(t=>t==='arty').length;
  if (pArty >= 2 && eArty < Math.ceil(pArty/2) && S.eCounterCd <= 0){
    S.eBase.push('arty');
    S.eCounterCd = 3; S.eBuildN++;
    say(radarLvl()>=1 ? 'WYWIAD: ODPOWIADAJĄ KONTRBATERIĄ' : 'DALEKIE HUKI ZZA ICH LINII',
        radarLvl()>=1?'intel':'warn');
    return;
  }
  let list = S.eBuildN < S.doc.order.length ? S.doc.order[S.eBuildN]
                                            : [S.doc.late[(Math.random()*S.doc.late.length)|0]];
  S.eBuildN++;
  if (list.includes('arty') && S.eBase.filter(t=>t==='arty').length >= EARTY_CAP)
    list = ['barracks'];
  for (const t of list){
    S.eBase.push(t);
    if (radarLvl()>=2) say('WYWIAD: '+EB[t].name,'intel');
  }
}
