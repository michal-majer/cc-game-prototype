/* =========================================================================
   FRONT — CELE NA DROGACH: przejmowanie, zysk, kara za oddanie.

   Kazda droga ma SWOJE cele, a kazdy rodzaj celu daje CO INNEGO (patrz
   SECT_KINDS w config). Dlatego „ktora droge bierzesz" jest decyzja:
   kredyty skaluja wszystko, moc odblokowuje zabudowe, kratki sa zlewem na
   nadwyzke, radar pozwala kontrowac zamiast reagowac, a bateria — jedyna
   rzecz w grze, ktora ZMNIEJSZA nacisk wroga.

   Cel liczy TYLKO jednostki ZE SWOJEJ DROGI. Drogi sa od siebie oddalone,
   wiec walka na gornej nie przejmuje celu na dolnej — bez tego „rozdziel
   sily" nie znaczyloby nic.
   ========================================================================= */

import { CAP_R, CAP_RATE, ETERR_ATK, sectKind, roadName } from './config.js';
import { S, SECT, say } from './state.js';
import { boom, siren } from './audio.js';
import { growGrid } from './campaign.js';

export function resetSect(){ for (const q of SECT){ q.cap=0; q.own=0; q.paid=false; } }

export function updSect(dt){
  for (const q of SECT){
    let p=false, e=false;
    for (const u of S.units){
      if (u.hp<=0 || Math.abs(u.x-q.x)>CAP_R) continue;
      // Cel nalezy do DROGI: liczy sie tylko to, co na niej stoi.
      if (q.road >= 0 && (u.lane|0) !== q.road) continue;
      if (u.side==='p') p=true; else e=true;
      if (p&&e) break;
    }
    if (p && !e) q.cap = Math.min( 100, q.cap + CAP_RATE*dt);
    else if (e && !p) q.cap = Math.max(-100, q.cap - CAP_RATE*dt);
    const o = q.cap>=100 ? 1 : q.cap<=-100 ? -1 : 0;
    if (o!==q.own){
      const K = sectKind(q.kind);
      const where = q.road>=0 ? ' · '+roadName(q.road) : '';
      if (o===1){
        say('▶ '+K.name+' '+q.n+' ZAJĘTY'+where+' — '+K.desc,'good'); boom(0.35);
        /* KAZDY zajety cel daje NOWE KRATKI, raz (FRONT.md §4.3: „zdobyty sektor
           daje nowe kratki, nie tylko kredyty"). To jest ta sama zasada dla
           wszystkich rodzajow — rodzaj decyduje o zysku CIAGLYM (kredyty, moc,
           radar, oslabienie), a kratki sa wspolna nagroda za sam TEREN i zlewem
           na nadwyzke kredytow. SKLAD to cel, ktorego calym sensem sa kratki,
           wiec daje ich dwa razy tyle.                                          */
        if (!q.paid){
          q.paid = true;
          growGrid();
          if (K.give==='kratki') growGrid();
        }
      }
      if (o===-1){
        const eBuff = (secE() - (q.own===-1?1:0) + 1) * ETERR_ATK;
        say('◄ STRACILIŚCIE '+K.name+' '+q.n+where+' · ICH ARMIA ⚔+'+eBuff,'bad');
        siren(); S.shake=Math.max(S.shake,8);
      }
      if (o===0 && q.own===1) say('◄ ODDANY '+K.name+' '+q.n+where,'warn');
      q.own=o;
    }
  }
}

export const secP = () => SECT.filter(q=>q.own===1).length;
export const secE = () => SECT.filter(q=>q.own===-1).length;
// ile ROZNYCH drog ma choc jeden Twoj cel — z tego liczy sie cel „n z 3 drog"
export function roadsHeld(){
  const set = new Set();
  for (const q of SECT) if (q.own===1) set.add(q.road);
  return set.size;
}
// suma zysku danego rodzaju z celow, ktore TRZYMASZ
export function secGive(give){
  let v=0;
  for (const q of SECT){
    if (q.own!==1) continue;
    const K=sectKind(q.kind);
    if (K.give===give) v += K.val;
  }
  return v;
}
export const terrIncome = () => secGive('kredyty');      // kr./s z zajetego terenu
export const sectSupply = () => secGive('moc');          // dodatkowa moc w sieci
export const sectRadar  = () => secGive('radar');        // poziomy radaru z wiez
// ile procent scina produkcje wroga (sufit 0.7, zeby nie dalo sie jej wyzerowac)
export const sectWeaken = () => Math.min(0.7, secGive('oslabia'));

// Nacisk wroga liczy sie UDZIALEM oddanego terenu — to on napedza jego rozbudowe.
export const terrCtrl  = () => SECT.length ? secP()/SECT.length : 0;
export const eTerrCtrl = () => SECT.length ? secE()/SECT.length : 0;
