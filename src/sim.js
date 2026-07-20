/* =========================================================================
   FRONT — rdzeń symulacji: obrażenia, spawn, fala, krok update(dt), linia.
   Przyspieszenie robi się podkrokami update() (patrz pętla w game.js),
   nie większym dt — balans na 3× jest identyczny jak na 1×.
   ========================================================================= */

import {
  U, B, CO, BASE_R, LANE_Y, LANE_HALF, BAS_X, FRONT_MIN, FRONT_MAX,
  BAS_HP, BAS_DMG, BAS_RANGE, BAS_RATE, BAS_SPL_R, BAS_SPL_N, WAVE_TIME, ETERR_SEC,
  COUNTER, HUNT_LEASH, BACK_MUL, CONTACT, SEEN_HOLD, RAID_PAY, ETHINK, STANCES,
  isHeavy, isSoldier, isArmored, BAL
} from './config.js';
import { S, say, lineX } from './state.js';
import { boom, siren } from './audio.js';
import { explode } from './effects.js';
import { regrow, extract, oreTotal, seamsAlive, seamsTapped } from './economy.js';
import { updHarvesters } from './harvesters.js';
import { updSect, terrIncome, eTerrCtrl } from './sectors.js';
import { eDecide, eBuild, eComp, eHoldX } from './enemy.js';
import { bDmg, bCount, pBuff, radarLvl, killBuilding, roomFor, recalcPower } from './buildings.js';
import { openDraft } from './cards.js';

// Odstęp do następnej fali. Wolniejszy początek: pierwsze fale rzadziej, żeby
// garść jednostek realnie biła się o mini-sztaby, zanim ruszy masa. Rozpędza
// się do WAVE_TIME (fala 0: +20 s → fala 5+: 0). Trzymaj < 60 s (format HUD 0:SS).
export function waveInterval(){
  return WAVE_TIME + Math.max(0, 5 - S.wave) * 4;
}

// bonusy TYLKO gracza (karty) — atak/pancerz osobno dla klas
export const pAtk = t => isArmored(t)?S.pBonus.atkA : isSoldier(t)?S.pBonus.atkS : 0;
export const pArm = t => isArmored(t)?S.pBonus.armA : isSoldier(t)?S.pBonus.armS : 0;

export function dmgTo(t, amount, srcType, ap){
  const src = srcType ? U[srcType] : null;
  let m=1;
  if (src && src.strong && src.strong.includes(t.type)) m=COUNTER;
  let d = amount*m;
  const arm = ((U[t.type] && U[t.type].arm) || 0) + (t.side==='p' ? pArm(t.type) : 0);
  if (arm && !ap && !(src && src.ap)) d = Math.max(1, d-arm);
  t.hp -= d; t.flash=1;
  if (t.side==='e' && U[t.type]) S.eDmgWave += d;
  if (t===S.bastion && !t.dead){ const pay=Math.max(0, Math.min(d, t.hp+d))*RAID_PAY; S.money+=pay; S.raidPay+=pay; }
  return m;
}

export function spawn(type,side,x,y){
  const d=U[type];
  // Sztab NIE mnoży już HP polowej armii — przetrwałość Twoich jednostek idzie z
  // kart (pArm) i z Lab (poziomy). Sztab skaluje tylko obronę bazy (patrz dmgFrom
  // budynków niżej), więc jego upgrade przestał być globalnym snowballem armii.
  const hp = d.hp;
  S.units.push({type,side,x,y,hp,maxHp:hp,cd:Math.random()*d.rate,flash:0,fireT:0,moveT:0,muzT:0});
}

export function doWave(){
  S.wave++;
  for (const b of S.buildings){
    const d=B[b.type];
    if (!d.unit||!b.powered) continue;
    for (let i=0;i<bCount(b);i++)
      spawn(d.unit,'p', b.x+(Math.random()*10-5), b.y+(Math.random()*20-10));
  }
  if (!S.bastion.dead){
    const comp=eComp();
    for (const k in comp) for (let i=0;i<comp[k];i++)
      spawn(k,'e', BAS_X-36-Math.random()*36, LANE_Y+(Math.random()*200-100));
  }
  siren(); S.shake=Math.max(S.shake,4);
  say('FALA '+S.wave, 'warn');
  // Rozkaz co 3 fale (było 5): przy krótkiej grze karty — jedyny tor skalowania
  // armii — musiały pojawiać się częściej, inaczej run kończył się, nim tor dmg/pancerz
  // realnie urósł. openDraft dodatkowo GWARANTUJE kartę armii w każdym drafcie.
  if (S.wave%3===0) openDraft(S.deck, 'ROZKAZ ZE SZTABU');
  S.eIntel.push({
    tanks:  S.buildings.filter(b=>(b.type==='factory'||b.type==='heavy') && b.powered).length,
    wheels: S.buildings.filter(b=>b.type==='workshop' && b.powered).length,
    arty:   S.buildings.filter(b=>b.type==='arty' && b.powered).length,
    rkts:   S.buildings.filter(b=>b.type==='rocket' && b.powered).length,
  });
  // Leciutki oddech na 1. fali, potem PEŁNE tempo już od 2. Poprzednie S.wave/5
  // zamrażało wroga do ~fali 5 (3 budynki na fali 4 = 2 piechoty + czołg, żenada).
  // Teraz wróg realnie rośnie od startu, a i tak walczy garść, nim ruszy masa.
  const earlyRamp = Math.min(1, 0.6 + S.wave*0.2);   // fala1: 0.8 → fala2+: 1.0
  S.eBuildDebt += earlyRamp/BAL.EBUILD_EVERY;
  while (S.eBuildDebt >= 1){ S.eBuildDebt -= 1; eBuild(); }
}

export function update(dt){
  if (S.state!=='play') return;
  if (!S.ready) return;
  regrow(dt);
  updSect(dt);
  // budowa: budynki dochodzą do gotowości; ukończony włącza się do sieci (moc/ogień/produkcja)
  let built=false;
  for (const b of S.buildings){
    if (b.build>0){
      b.build=Math.max(0, b.build-dt);
      if (b.build<=0){ built=true; b.flash=1; say('BUDOWA UKOŃCZONA — '+B[b.type].name,'good'); boom(0.15); }
    }
  }
  if (built) recalcPower();
  S.money += extract(dt) + terrIncome()*dt;
  updHarvesters(dt);   // wizualne pojazdy jeżdżące do żył (kosmetyka nad harvestPlan)
  S.timer -= dt;
  if (Number.isNaN(S.timer)) S.timer=waveInterval();
  if (S.timer<=0){ doWave(); S.timer=waveInterval(); }
  S.newArm -= dt;
  S.eTerrBank += eTerrCtrl()*(100/ETERR_SEC)*dt;
  if (S.eTerrBank>=100){
    S.eTerrBank-=100;
    eBuild();
    say('◄ ZAJĘLI TWÓJ TEREN — ROZBUDOWUJĄ SIĘ','bad');
    siren(); S.shake=Math.max(S.shake,5);
  }
  S.eThink -= dt;
  if (S.eThink<=0){ eDecide(); S.eThink=ETHINK; }
  S.alertCd -= dt;
  if (S.alertCd<=0 && S.units.some(u=>u.side==='e'&&u.x<BASE_R+30)){ say('BAZA POD OSTRZAŁEM','bad'); siren(); S.alertCd=8; }
  S.fullCd -= dt;
  if (S.fullCd<=0 && S.money>800 && !roomFor('barracks')){
    say('KREDYTY LEŻĄ — BRAK KRATEK. ULEPSZAJ SZTAB.','warn'); S.fullCd=25;
  }
  S.ecoCd -= dt;
  if (S.ecoCd<=0 && S.wave>0 && seamsTapped()===0 && oreTotal()>0){
    say('MARTWA EKONOMIA — RUDA LEŻY NIETKNIĘTA','bad'); siren(); S.ecoCd=15;
  }
  if (!S.fieldDead && seamsAlive()===0 && S.wave>0){
    S.fieldDead=true;
    say('▬▬ POLE MARTWE ▬▬','bad');
    say('Nie została ani jedna żyła. Nic nie odrośnie.','warn');
    say('Zostało to, co masz. Rozbierz resztę na armię.','good');
    siren(); boom(0.8); S.shake=Math.max(S.shake,18);
  }
  for (const l of S.log) l.t += dt;

  const pU=S.units.filter(u=>u.side==='p'), eU=S.units.filter(u=>u.side==='e');

  for (const b of S.buildings){
    const d=B[b.type];
    if (!d.atk||!b.powered) continue;
    b.cd -= dt;
    if (b.cd>0) continue;
    let tgt=null, bd=d.atk.range;
    for (const u of eU){ const dist=Math.hypot(u.x-b.x,u.y-b.y); if (dist<bd){ bd=dist; tgt=u; } }
    // Działa bazy (sztab, bunkry) — JEDYNE miejsce, gdzie pBuff() jeszcze działa:
    // upgrade sztabu podbija ogień obrony bazy, nie polowej armii.
    if (tgt){ dmgTo(tgt,bDmg(b)*pBuff(),null,d.atk.ap); S.tracers.push({x1:b.x,y1:b.y,x2:tgt.x,y2:tgt.y,t:0.09,c:d.atk.ap?CO.warn:CO.blue}); b.cd=d.atk.rate; }
  }
  if (!S.bastion.dead){
    S.bastion.cd -= dt;
    if (S.bastion.cd<=0){
      let tgt=null, bd=BAS_RANGE;
      for (const u of pU){ const dist=Math.hypot(u.x-S.bastion.x,u.y-S.bastion.y); if (dist<bd){ bd=dist; tgt=u; } }
      if (tgt){
        const near = pU.filter(u=>Math.hypot(u.x-tgt.x,u.y-tgt.y)<=BAS_SPL_R)
                       .sort((a,b)=>Math.hypot(a.x-tgt.x,a.y-tgt.y)-Math.hypot(b.x-tgt.x,b.y-tgt.y))
                       .slice(0,BAS_SPL_N);
        for (const u of near) dmgTo(u,BAS_DMG,null);
        S.tracers.push({x1:S.bastion.x,y1:S.bastion.y,x2:tgt.x,y2:tgt.y,t:0.11,c:CO.red,w:2.4});
        explode(tgt.x,tgt.y,14,CO.warn); boom(0.22); S.shake=Math.max(S.shake,2);
        S.bastion.cd=BAS_RATE;
      }
    }
    if (S.bastion.flash>0) S.bastion.flash-=dt*6;
  }

  const eHold = eHoldX();   // linia, na której wróg trzyma się w postawie 'hold' (mini-sztaby)
  for (const u of S.units){
    const d=U[u.type];
    let list;
    if (u.side==='p'){ list = eU.slice(); if (!S.bastion.dead) list.push(S.bastion); }
    else { list = pU.slice(); if (u.x < BASE_R+40) list = list.concat(S.buildings); }
    let t=null, bd=340;
    // najbliższy DOWOLNY wróg w polu widzenia — cel bazowy i „kto mnie okłada"
    let near=null, nb=340;
    for (const o of list){
      if (o.hp<=0) continue;
      const dist=Math.hypot(o.x-u.x,o.y-u.y);
      if (dist<nb){ nb=dist; near=o; }
    }
    if (d.hunt){
      // Łowca (łazik→arty) tropi swoją zwierzynę na CAŁYM polu, ale NIE daje się
      // bezkarnie okładać: cokolwiek jest już w zasięgu ataku, bije priorytet nad
      // daleką arty. Wcześniej łazik z hunt'em ignorował piechotę, która go tłukła,
      // i maszerował przez blob pod ostrzałem, nie oddając ani jednego strzału —
      // „dostawał w dupę od zwykłych żołnierzy", choć ma na nich kontrę ×2. Teraz
      // najpierw tępi to, co go okłada, a zwierzynę dobija, gdy droga jest wolna.
      let hb=1e9, prey=null;
      for (const o of list){
        if (o.hp<=0 || o.type!==d.hunt) continue;
        const dist=Math.hypot(o.x-u.x,o.y-u.y);
        if (dist<hb){ hb=dist; prey=o; }
      }
      if (near && nb<=d.range){ t=near; bd=nb; }      // ktoś w zwarciu → strzelaj
      else if (prey){ t=prey; bd=hb; }                // droga wolna → trop arty
      else { t=near; bd=nb; }
    } else { t=near; bd=nb; }
    if (t && bd<=d.range && bd>=(d.minR||0)){
      u.cd -= dt;
      if (u.cd<=0){
        // Atak polowej armii = baza + karty (pAtk). Sztab mnoży TYLKO działa bazy
        // (budynki niżej), nie ruszając jednostek w polu — koniec globalnego buffa.
        const out = d.dmg + (u.side==='p'?pAtk(u.type):0);
        if (d.proj){
          // pocisk leci — obrażenia dopiero na trafieniu (patrz updProj)
          S.projs.push({ x:u.x, y:u.y, tx:t.x, ty:t.y, tgt:t,
                         spd:d.proj, side:u.side, src:u.type, dmg:out });
        } else {
          const m=dmgTo(t,out,u.type);
          S.tracers.push({x1:u.x,y1:u.y,x2:t.x,y2:t.y,t:m>1?0.13:0.07,
                        c:m>1?'#ffe680':(u.side==='p'?CO.blue:CO.red), w:m>1?2.8:1});
          if (m>1) for (let k=0;k<4;k++){
            const a=Math.random()*6.283, sp=45+Math.random()*70;
            S.fx.push({x:t.x,y:t.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:0.2,c:'#ffe680',r:2.4});
          }
        }
        u.cd=d.rate; u.fireT=0.38; u.muzT=0.1;   // fireT: klip „shoot” (dłużej); muzT: krótki błysk z lufy
      }
    } else {
      let vx,vy, sMul=1;
      if (t){
        const dx=t.x-u.x, dy=t.y-u.y, L=Math.hypot(dx,dy)||1;
        const away = (d.minR && bd < d.minR) ? -1 : 1;
        vx=dx/L*away; vy=dy/L*away;
      }
      else { vx = u.side==='p'?1:-1; vy=0; }
      const hunting = d.hunt && t && t.type===d.hunt && t.x <= lineX()+HUNT_LEASH;
      const LIM = lineX() + (hunting ? HUNT_LEASH : 0);
      if (u.side==='p'){
        if (u.x > LIM){ vx = -1; vy = 0; }
        else if (vx>0 && u.x + vx*d.spd*sMul*dt > LIM) vx = 0;
      }
      if (u.side==='e' && S.eStance==='hold'){
        if (u.x < eHold){ vx = 1; vy = 0; }
        else if (vx<0 && u.x + vx*d.spd*sMul*dt < eHold) vx = 0;
      }
      const fwd = u.side==='p' ? 1 : -1;
      if (isHeavy(d) && vx*fwd < 0) sMul = BACK_MUL;
      const dxm=vx*d.spd*sMul*dt, dym=vy*d.spd*sMul*dt;
      u.x += dxm; u.y += dym;
      if (Math.abs(dxm)+Math.abs(dym) > 0.01) u.moveT=0.12;   // sygnał dla animacji: klip „walk”
    }
    if (u.x > BASE_R){
      const lo=LANE_Y-LANE_HALF, hi=LANE_Y+LANE_HALF;
      if (u.y<lo) u.y += Math.min(40*dt, lo-u.y);
      if (u.y>hi) u.y -= Math.min(40*dt, u.y-hi);
    }
    if (u.flash>0) u.flash-=dt*6;
    if (u.fireT>0) u.fireT-=dt;
    if (u.moveT>0) u.moveT-=dt;
    if (u.muzT>0)  u.muzT-=dt;
  }

  const rl = radarLvl();
  for (const u of S.units){
    if (u.side!=='e') continue;
    let near = u.x < BASE_R+60;
    if (!near) for (const o of pU){ if (Math.hypot(o.x-u.x,o.y-u.y)<CONTACT){ near=true; break; } }
    u.nearT = near ? SEEN_HOLD : Math.max(0,(u.nearT||0)-dt);
    if (rl>=2) u.seenT = SEEN_HOLD;
    else       u.seenT = u.nearT;   // w zwarciu widać typ nawet bez radaru — jednostki widzą się nawzajem
  }

  for (let i=0;i<S.units.length;i++) for (let j=i+1;j<S.units.length;j++){
    const a=S.units[i], b=S.units[j];
    const dx=b.x-a.x, dy=b.y-a.y, min=U[a.type].sz+U[b.type].sz, d2=dx*dx+dy*dy;
    if (d2>min*min || d2<0.001) continue;
    const dist=Math.sqrt(d2), push=(min-dist)/2/dist;
    a.x-=dx*push; a.y-=dy*push; b.x+=dx*push; b.y+=dy*push;
  }

  for (let i=S.units.length-1;i>=0;i--){
    const u=S.units[i];
    if (u.hp>0) continue;
    S.corpses.push({x:u.x,y:u.y,s:U[u.type].sz,c:u.side==='p'?CO.blueD:CO.redD});
    if (S.corpses.length>500) S.corpses.shift();
    // zgłoś zgon do animacji śmierci (render odegra klip „die" tam, gdzie istnieje)
    S.deaths.push({type:u.type, x:u.x, y:u.y, p:u.side==='p'});
    if (S.deaths.length>200) S.deaths.shift();
    explode(u.x,u.y,U[u.type].sz*1.6,u.side==='p'?CO.blue:CO.red);
    if (U[u.type].sz>=8){ boom(0.18); S.shake=Math.max(S.shake,3); }
    if (u._view){ u._view.destroy({children:true}); u._view=null; }
    S.units.splice(i,1);
  }
  for (let i=S.buildings.length-1;i>=0;i--) if (S.buildings[i] && S.buildings[i].hp<=0){
    const b=S.buildings[i];
    if (b.type==='hq'){ S.state='over'; S.endReason='SZTAB ZNISZCZONY'; boom(0.8); S.shake=24; }
    killBuilding(b);
  }
  if (S.bastion.hp<=0 && !S.bastion.dead){
    S.bastion.dead=true;
    explode(S.bastion.x,S.bastion.y,90,CO.red); S.shake=26; boom(0.9);
    S.state='win'; S.endReason='BASTION ZDOBYTY';
  }
  if (S.state!=='play' && S.wave>S.best) S.best=S.wave;

  let target;
  if (S.bastion.dead) target=FRONT_MAX;
  else {
    let maxP=null, minE=null;
    for (const u of pU) if (maxP===null||u.x>maxP) maxP=u.x;
    for (const u of eU) if (minE===null||u.x<minE) minE=u.x;
    target=S.frontX;
    if (maxP!==null&&minE!==null) target=(maxP+minE)/2;
    else if (maxP!==null) target=maxP;
    else if (minE!==null) target=minE;
  }
  S.frontX += (Math.max(FRONT_MIN,Math.min(FRONT_MAX,target))-S.frontX) * Math.min(1,dt*2.5);

  updProj(dt);

  for (let i=S.fx.length-1;i>=0;i--){
    const p=S.fx[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=0.94; p.vy*=0.94; p.life-=dt;
    if (p.life<=0) S.fx.splice(i,1);
  }
  for (let i=S.tracers.length-1;i>=0;i--){ S.tracers[i].t-=dt; if (S.tracers[i].t<=0) S.tracers.splice(i,1); }
  if (S.shake>0) S.shake=Math.max(0, S.shake-dt*30);
}

/* -------------------------- pociski (lot + trafienie) --------------------
   Artyleria i rakietowiec nie biją już natychmiast — wypuszczają pocisk,
   który leci do celu i zadaje obrażenia dopiero na trafieniu. Pocisk
   jednostkowy (rakieta) namierza żywy cel; odłamkowy (artyleria) leci w
   miejsce, gdzie cel był w chwili strzału — szybkie cele mogą uciec. */
function updProj(dt){
  for (let i=S.projs.length-1;i>=0;i--){
    const p=S.projs[i], d=U[p.src];
    if (!d.spl && p.tgt && p.tgt.hp>0){ p.tx=p.tgt.x; p.ty=p.tgt.y; }  // rakieta namierza
    const dx=p.tx-p.x, dy=p.ty-p.y, L=Math.hypot(dx,dy)||1, step=p.spd*dt;
    if (L<=step){ p.x=p.tx; p.y=p.ty; impact(p); S.projs.splice(i,1); }
    else { p.x+=dx/L*step; p.y+=dy/L*step; }
  }
}

function impact(p){
  const d=U[p.src];
  if (d.spl){
    // pula rażenia: jednostki wroga + STRUKTURY. Odłamki muszą kruszyć budynki
    // i BASTION, nie tylko żołnierzy — inaczej artyleria „strzela w sztab, ale
    // nie zadaje obrażeń" (pocisk trafiał w cel, lecz splash szukał tylko S.units).
    let pool = S.units.filter(o=>o.side!==p.side);
    if (p.side==='p'){ if (!S.bastion.dead) pool.push(S.bastion); }
    else pool = pool.concat(S.buildings);
    const foes = pool
      .filter(o=>o.hp>0 && Math.hypot(o.x-p.x,o.y-p.y)<=d.splR)
      .sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))
      .slice(0,d.spl);
    for (const o of foes) dmgTo(o,p.dmg,p.src);
    explode(p.x,p.y,16,CO.warn); boom(0.13);
  } else {
    const t=p.tgt;
    if (t && t.hp>0){
      const m=dmgTo(t,p.dmg,p.src);
      if (m>1) for (let k=0;k<4;k++){
        const a=Math.random()*6.283, sp=45+Math.random()*70;
        S.fx.push({x:t.x,y:t.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:0.2,c:'#ffe680',r:2.4});
      }
    }
    explode(p.x,p.y,6,p.side==='p'?CO.blue:CO.red);
  }
}

// --- linia (jedyna decyzja w trakcie walki) ---
export function setStance(i){
  i=Math.max(0,Math.min(STANCES.length-1,i));
  if (i===S.si) return;
  const fwd = i>S.si;
  S.si=i;
  say((fwd?'LINIA W PRZÓD — ':'ODWRÓT — ')+STANCES[S.si].n, fwd?'warn':'good');
  if (S.si===STANCES.length-1){ siren(); S.shake=Math.max(S.shake,6); }
}
export function toggleStance(){ setStance(S.si===STANCES.length-1 ? 0 : STANCES.length-1); }
