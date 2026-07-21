/* =========================================================================
   FRONT — przeciwnik: ocena sił, decyzja szturm/odwrót, bastion jako baza,
   skład fali i kontra celująca w to, co boli.
   ========================================================================= */

import {
  U, B, EB, EARTY_CAP, EPUSH_R, EHOLD_R, EPATIENCE, EPAT_MASS, ESCOUT,
  ETHINK, ECOMMIT, ESHELLED, BAS_HP, EHOLD_X, EPUSH_MIN
} from './config.js';
import { S, SECT, say, lineX } from './state.js';
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
// Gdzie wróg trzyma linię w postawie 'hold'. DAWNIEJ: sztywne EHOLD_X pod
// bastionem (1040) — za wszystkimi mini-sztabami, więc wróg nigdy się o nie
// nie bił. Potem: wychodził na najbardziej wysunięty (ku GRACZOWI) sektor,
// którego jeszcze nie trzyma — ale to znaczyło lunięcie od razu na PRZEDPOLE
// tuż pod sztab gracza, w jego artylerię: dostawał ostrzał i szarżował na bazę,
// „za dużo pushując". TERAZ konsoliduje teren OD SWOJEJ strony na zewnątrz:
// bierze najpierw sektor przy własnej bazie (NACISK), potem ŚRODEK, na końcu
// PRZEDPOLE. Trzyma się na froncie SWOJEGO kontrolowanego bloku — jeden sektor
// dalej, nie na drugim końcu pola. Realnie zdobywa mini-sztaby zamiast
// nadziewać się na obronę gracza.
//   · podłoga = linia gracza (bez szturmu nie wejdzie za jego front),
//   · sufit   = EHOLD_X (nigdy nie zostawia bastionu bez osłony).
export function eHoldX(){
  let x = null;
  for (let i = SECT.length-1; i >= 0; i--){  // od bazy wroga (prawa) ku frontowi (lewa)
    const q = SECT[i];
    if (q.own !== -1){ x = q.x; break; }      // pierwszy sektor od TYŁU jeszcze nie ich = cel
  }
  if (x === null) x = SECT[0].x;              // trzymają wszystkie → broń najdalej wysuniętego
  return Math.min(EHOLD_X, Math.max(x, lineX()));
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
    // Dwie osobne przesłanki do szturmu na bazę:
    //   · r > EPUSH_R    — realna PRZEWAGA SIŁ: przebije obronę, dosięgnie budynku.
    //   · cierpliwość    — ale TYLKO gdy uzbierał MASĘ (n >= EPUSH_MIN) I NIE JEST
    //     SŁABSZY (r >= EHOLD_R). Wcześniej garstka nadziewała się na bazę „z nudów",
    //     a nawet po dodaniu progu masy wróg wciąż ruszał z cierpliwości, gdy GRACZ
    //     miał wyraźną przewagę (r niskie) — szarżował na silniejszą obronę i ginął
    //     bez sensu. Było to też niespójne z odwrotem (EHOLD_R): zaczynał push, który
    //     natychmiast chciał przerwać. Teraz gdy jesteś silniejszy (r < EHOLD_R) wróg
    //     NIE naciera z cierpliwości — trzyma linię, kontestuje mini-sztaby i STACKUJE,
    //     aż uzbiera siłę na realne przebicie (r urośnie) albo urośnie z terenu.
    const massPush = S.eHoldT >= pat && n >= EPUSH_MIN && r >= EHOLD_R;
    if (r > EPUSH_R || massPush){
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
  const I = iIdx >= 0 ? S.eIntel[iIdx] : {tanks:0, wheels:0, arty:0, rkts:0};
  const pTanks  = I.tanks;
  const pWheels = I.wheels;
  const pRkts   = I.rkts || 0;
  const pInf    = I.inf || 0;
  const eRkt = S.eBase.filter(t=>t==='rocket').length;
  const eBar = S.eBase.filter(t=>t==='barracks').length;
  const eWork = S.eBase.filter(t=>t==='workshop').length;
  if (pTanks >= 2 && eRkt < pTanks && S.eArmCd <= 0){
    S.eBase.push('rocket'); S.eArmCd = 2; S.eBuildN++;
    say(radarLvl()>=1 ? 'WYWIAD: ODPOWIADAJA RAKIETAMI' : 'ZA ICH LINIA — DLUGIE RURY', radarLvl()>=1?'intel':'warn');
    return;
  }
  // Kontra na masówkę rakiet gracza: piechota. Rakietowiec (50 HP) obrywa ×2 od
  // piechoty — to jego naturalny pogromca (TTK 2,1 s vs 6,0 s w drugą stronę).
  // DAWNIEJ wywiad liczył czołgi/warsztaty/artylerię, ale NIE rakiety, więc ściana
  // wyrzutni nie prowokowała odpowiedzi i STALOWA PIĘŚĆ w kółko nadziewała czołgi na
  // rakiety. Pierwsza łata dała barak 1:1 do wyrzutni — ale to WCIĄŻ za mało: piechota
  // to krucha masówka, a rakieta elitą; równa liczba ginie na ekranie pancerki, nim
  // dosięgnie rur. Teraz enemy celuje w ~1,5 baraka na wyrzutnię (pRkts + połowa) —
  // piechota realnie PRZELICZA rakiety i karze ich spam, gdy pancerka związuje front.
  if (pRkts >= 2 && eBar < pRkts + Math.ceil(pRkts/2) && S.eArmCd <= 0){
    S.eBase.push('barracks'); S.eArmCd = 2; S.eBuildN++;
    say(radarLvl()>=1 ? 'WYWIAD: SYPIA PIECHOTE POD RAKIETY' : 'ZA ICH LINIA — TUPOT BUTOW', radarLvl()>=1?'intel':'warn');
    return;
  }
  // Kontra na masówkę PIECHOTY gracza: łaziki. Łazik ma strong:['inf'] (×2 przez
  // COUNTER) + pancerz, który ścina drobne trafienia żołnierzy — to naturalny
  // pogromca blobu piechoty (jeden łazik czyści ~3–4 żołnierzy). DAWNIEJ wywiad
  // liczył czołgi/warsztaty/artylerię/rakiety, ale NIE piechotę, więc ściana baraków
  // nie prowokowała żadnej odpowiedzi i spam piechoty przechodził bezkarnie. Teraz
  // enemy dosypuje warsztat na każde ~2 baraki — łaziki kontrują tupot butów.
  if (pInf >= 3 && eWork < Math.ceil(pInf/2) && S.eArmCd <= 0){
    S.eBase.push('workshop'); S.eArmCd = 2; S.eBuildN++;
    say(radarLvl()>=1 ? 'WYWIAD: WYSYLAJA LAZIKI POD PIECHOTE' : 'ZA ICH LINIA — WARKOT SILNIKOW', radarLvl()>=1?'intel':'warn');
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
