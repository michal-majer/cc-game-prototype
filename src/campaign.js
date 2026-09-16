/* =========================================================================
   FRONT — RAMKA MISJI + KAMPANIA

   Jedno miejsce, w którym „misja" znaczy cokolwiek. Reszta gry o kampanii
   nie wie: sim.js pyta `goalDone()`, hud.js pyta `feat('cards')`, pasek
   budowy pyta `allows(typ)`. Dzięki temu ta sama ramka obsługuje kampanię
   i grę dowolną (FRONT.md §7) — każda misja napisana raz służy obu.

   Co tu jest:
     · startMission()  — nałożenie danych misji na config i S (pole, siatka,
                         kształt, pasek, wróg), a potem PUNKT KONTROLNY
     · snapshot/restore— migawka między misjami i „powtórz" (FRONT.md §10)
     · goalDone/goalTx — cel z danych: jeden warunek wygranej, jeden tekst
     · finishMission   — OCENA SZTABU (§5) i zapis postępu

   PUNKT KONTROLNY — cztery miny, o które to się rozbija (FRONT.md §10):
     1. S.grid[r][c].b to REFERENCJA do obiektu z S.buildings → zapisujemy
        `id` budynku, kratka trzyma id, po wczytaniu przelinkowanie.
     2. S.doc i S.run.mods to referencje do tabel → zapisujemy NAZWĘ.
     3. Karty mutują B i U → zapisujemy LISTĘ WZIĘTYCH KART, nie stan tablic;
        po wczytaniu resetTables() + ponowne odegranie. Przeżyje zmianę balansu.
     4. S.fx / S.tracers / S.projs / S.corpses → nie zapisujemy wcale, czyścimy.
   ========================================================================= */

import {
  B, U, COLS, ROWS, BASE_X, BASE_Y, CELL, GRID_MAX_COLS, GRID_MAX_ROWS,
  LANE_Y, BAS_X, BAS_HP, FRONT_MIN, START_MONEY, DOCTRINES,
  STANCES, setGrid, setShape, setField, halfForShape, atF, fieldX1, resetTables, clamp,
  setRoads, roadY, roadPointX, roadCount, roadName, sectKind, pl,
} from './config.js';
import { S, SECT, say } from './state.js';
import { MISSIONS, WORLDS, SKIRMISH, worldOf } from './missions.js';
import { DECK, OPEN } from './cards.js';
import { secP, roadsHeld } from './sectors.js';

const LS_KEY = 'front.camp';
const CAMP_V = 1;

/* ------------------------------ POSTĘP ----------------------------------
   Co pamiętamy między sesjami: która misja zaliczona, z jaką oceną, i czy
   gra dowolna jest już otwarta. Nic więcej — stan bazy żyje w S i w migawce. */
export function loadProgress(){
  try {
    const m = JSON.parse(localStorage.getItem(LS_KEY));
    if (m && typeof m === 'object' && m.v === CAMP_V) return { done:{}, ...m };
  } catch(e){}
  return { v:CAMP_V, done:{}, freeplay:false };
}
function saveProgress(p){ try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch(e){} }
export function resetProgress(){ saveProgress({ v:CAMP_V, done:{}, freeplay:false }); }

// Misja jest dostępna, gdy poprzednia w świecie została zaliczona.
// Pierwsza zawsze. Ocena NIE BRAMKUJE — przeszedłeś, idziesz dalej (FRONT.md §5).
export function missionOpen(worldId, idx){
  const w = WORLDS.find(x=>x.id===worldId) || WORLDS[0];
  if (idx <= 0) return true;
  const p = loadProgress();
  return !!p.done[w.missions[idx-1]];
}
export const worldDone = w => w.missions.every(id => loadProgress().done[id]);

/* --------------------------- MISJA BIEŻĄCA ------------------------------- */
export const MIS = () => S.mission || SKIRMISH;
export const feat = k => { const f = MIS().feats || {}; return f[k]; };
export const isCampaign = () => !!(S.mission && S.mission.id !== 'skirmish');
// Pasek budowy: lista `unlock` misji JEST drzewkiem techniki kampanii.
// `req` z tabeli B działa tylko MIĘDZY budynkami obecnymi na tej liście —
// inaczej gniazdo w misji 2 byłoby zablokowane przez wyrzutnię, której
// w misji 2 nie ma i mieć nie miało.
export function allows(t){
  const u = MIS().unlock;
  return !u || u.includes(t);
}
export function missionReq(t){
  const u = MIS().unlock;
  // `reqAdd` — wymaganie DOPISANE przez misję. Misja 1 uczy, że ekonomia ma
  // stawkę, a przechodziła się samą rafinerią: sztab daje 4 mocy, rafineria
  // bierze 2, więc prąd był zbędny. Dopisanie `refinery: ['power']` sprawia,
  // że oba budynki są NAPRAWDĘ wymuszone — bez ruszania globalnej tabeli B.
  const add = (MIS().reqAdd || {})[t] || [];
  // `reqDrop` — wymaganie ZDJĘTE przez misję, symetrycznie do `reqAdd`. Misja
  // może skrócić drzewko tak samo, jak może je wydłużyć. Finał tego potrzebuje:
  // łańcuch radar → fabryka → laboratorium → bateria to 1750 kredytów i DWANAŚCIE
  // kratek na czterdziestu dwóch, obok ekonomii, baraków i mocy — pomiar pokazał
  // bota, który przez 94 minuty nie zmieścił baterii ani razu. A bez niej (zasięg
  // 175) nie ma czym bić w bastion z linii, na której armia realnie stoi.
  const drop = (MIS().reqDrop || {})[t] || [];
  const req = [...(B[t].req || []), ...add].filter(r => !drop.includes(r));
  return u ? req.filter(r => u.includes(r)) : req;
}

/* ------------------------- NAŁOŻENIE DANYCH MISJI ------------------------
   Woła game.js przed budową pola. Rusza tylko to, co jest DANYMI: siatkę,
   kształt, drogi, długość pola, wroga. Zero logiki rozgrywki.                */
export function applyMission(m, carry){
  S.mission = m;
  let [gc, gr] = m.grid || [GRID_MAX_COLS, GRID_MAX_ROWS];
  /* PLANSZA NIGDY SIĘ NIE KURCZY. To niezmiennik, nie staranność w danych:
     przejście ma być ciągłe („wszystko zostaje, plansza rośnie"), a siatka
     mniejsza od poprzedniej znaczy, że budynki z brzegu po prostu przepadają.
     Pomiar złapał to od razu: misja 1 gra na 6×3, misja 2 miała 5×4 — kolumna
     piąta znikała razem z tym, co na niej stało.                             */
  if (carry && carry.base){
    gc = Math.max(gc, carry.base.cols || 0);
    gr = Math.max(gr, carry.base.rows || 0);
  }
  setGrid(gc, gr);
  // KOLEJNOŚĆ MA ZNACZENIE: kształt → DROGI → długość pola. Wysokość świata
  // liczy się z drog (ich odstępu i łuków), a stanice i promień celów
  // z długości pola.
  setShape(m.shape || '1');
  setRoads(m.roads, m.roadGap, m.roadW);
  setField(m.len || 760, m.halfH || halfForShape());
  S.gridMax = m.gridMax || [gc, gr];            // dokąd może urosnąć siatka
  S.misWaveT = m.waveT || null;
  S.misGrow = m.enemy && m.enemy.grow != null ? m.enemy.grow : 1;
  S.shell = (m.enemy && m.enemy.shell) ? { ...m.enemy.shell, t:m.enemy.shell.every, lane:-1, warnT:0 } : null;
  // Przyczółek wroga siedzi na końcu korytarza — ułamkiem, nie pikselem, żeby
  // zmiana długości pola nie zostawiała go w pustce albo za bastionem.
  S.espawn = { x: atF(m.spawnF != null ? m.spawnF : 0.97), y: LANE_Y };
  S.goalT = 0; S.holdT = 0;                     // liczniki celów „utrzymaj"
  checkWavePlan(m);
}

/* Sprawdzenie DANYCH, nie rozgrywki — jak `checkOreLayout` dla rudy. Każdy
   z tych trzech błędów już raz kosztował przebieg na ślepo, a żaden nie widać
   po liczbach: misja po prostu zachowuje się nie tak, jak napisano w komentarzu.
   Krzyczymy w konsoli i gramy dalej — dane misji poprawia człowiek.            */
export function checkWavePlan(m){
  const w = m.waves, g = m.goal || {};
  if (!w || !w.length) return;
  // Plan RÓWNY terminowi = przegrana, która nigdy nie odpala: licznik fal
  // przestaje rosnąć na ostatniej pozycji planu (pomiar: 10:41 zamiast 2:54).
  if (g.before != null && w.length <= g.before)
    console.error('[fale '+m.id+'] plan ma '+w.length+' fal przy terminie '+g.before
                  +' — przegrana nie ma czym odpalić (potrzeba > '+g.before+')');
  // `after` RÓWNE długości planu jest poprawne (misja 1: trzy fale, `after:3` —
  // cel zalicza się, gdy trzecia wyjdzie). Błędem jest dopiero `after` ZA planem.
  if (g.after != null && g.after > w.length)
    console.error('[fale '+m.id+'] `after:'+g.after+'` jest za planem '+w.length+' fal — cel nigdy się nie zaliczy');
  // HUD pisze zegar jako „0:SS" — 60 s i więcej wychodzi poza format.
  const zaDlugie = w.filter(x => x.t >= 60).length;
  if (zaDlugie) console.warn('[fale '+m.id+'] '+zaDlugie+' fal z odstępem ≥ 60 s — HUD pisze 0:SS');
}

/* Cele z DANYCH DROG. Każda droga wnosi swoje — górna może mieć most i baterię,
   dolna skład i wieżę. SECT jest importowany jako const w kilku modułach, więc
   mutujemy W MIEJSCU; pozycja celu liczy się z ułamka DŁUGOŚCI DROGI, więc
   zmiana rozmiaru mapy nie zostawia celów w pustce.                           */
export function applyRoadObjectives(){
  SECT.length = 0;
  // BARIERKA NA DANE: cel nie może leżeć dalej, niż sięga NAJDALSZA STANICA,
  // jaką ta misja daje. Inaczej misja jest po prostu nieprzechodnia — armia
  // zatrzymuje się na linii i nie ma jak dojść do celu.
  const nSt = Math.max(1, Math.min(STANCES.length, feat('stance') || STANCES.length));
  const xMax = STANCES[nSt-1].x;
  for (let i=0;i<roadCount();i++){
    const r = (MIS().roads || [])[i];
    for (const o of (r && r.sect) || []){
      let x = roadPointX(o.f);
      if (x > xMax){
        console.warn('[misja '+MIS().id+'] cel '+(o.n||o.kind)+' za najdalszą linią ('
                     +Math.round(x)+' > '+Math.round(xMax)+') — przycięty');
        x = xMax;
      }
      SECT.push({ n:o.n || sectKind(o.kind).name, kind:o.kind || 'sztab',
                  road: roadCount()>1 ? i : -1, f:o.f,
                  x, y:roadY(i, x), cap:0, own:0, paid:false });
    }
  }
}

/* --------------------------------- CEL -----------------------------------
   Cel misji to DANE. Jeden warunek wygranej, jeden tekst do HUD-a, jeden
   pasek postępu. Dodanie nowego rodzaju celu to jeden `case` tutaj i wpis
   w missions.js — nie dotykasz sim.js.                                      */
// ZAROBIONE od startu misji, nie stan portfela. „Zbierz 700 kredytow" liczone
// po saldzie KARZE ZA BUDOWANIE — gracz, ktory robi dokladnie to, czego misja
// uczy (postaw elektrownie i rafinerie), ODDALA sie od wlasnego celu. Bot to
// pokazal: wygrywal misje 1 dopiero w 5. fali, bo wydawal wszystko na biezaco.
const earned = () => {
  const i = (S.stat && S.stat.inc) || {};
  return (i.ruda||0)+(i.sektory||0)+(i.baza||0)+(i.lupy||0)+(i.zlom||0)+(i.karty||0);
};

/* PRZEGRANA Z ZEGARA. Misja, której nie da się PRZEGRAĆ, nie jest wyzwaniem —
   jest młynem: misja 3 nie zagraża bazie (walka toczy się w polu), więc jedyną
   „porażką" było mielenie bez końca. `goal.before` stawia zegar: nie zdążysz
   do N-tej fali — przegrywasz. Czas przejęcia przestaje być czymś, co się
   przeczeka, i staje się tym, o co grasz.                                     */
export function goalFailed(){
  const g = MIS().goal || {};
  if (!g.before || goalDone()) return false;
  if (S.wave > g.before) return true;
  /* Bezpiecznik: plan fal wyczerpany, pole czyste i nikt niczego nie przejmuje,
     a celu nie ma — nie ma już CZYM go osiągnąć, więc misja stoi w miejscu.
     Bez tego limit fal nie odpalał wcale, gdy plan kończył się na tej samej
     fali co limit: licznik przestawał rosnąć i misja mieliła się w nieskończoność
     (pomiar: 10:41 zamiast 2:54). Warunek „nikt nie przejmuje" chroni gracza,
     który właśnie kończy zajmowanie celu na ostatnich sekundach.               */
  const plan = MIS().waves;
  if (plan && S.wave >= plan.length
      && !S.units.some(u => u.side==='e' && u.hp>0)
      && !SECT.some(q => q.cap > 0)) return true;
  return false;
}

export function goalDone(){
  const g = MIS().goal || {};
  // `after` — cel nie zalicza się wcześniej niż po N falach. W misji 1 to ono
  // sprawia, że „zegar tyka i po nim przychodzi jedna fala" naprawdę się dzieje:
  // bez tego gracz wygrywa na sekundę przed kontaktem i nie widzi, PO CO była
  // ekonomia. Kosztuje jedną linię, a jest całą pointą tej misji.
  if (g.after && S.wave < g.after) return false;
  switch (g.kind){
    case 'money':   return earned() >= g.target;
    // „Odeprzyj 8 fal" znaczy ODEPRZYJ, nie „doczekaj, aż ósma wyjdzie z bazy":
    // cel zalicza się dopiero, gdy pole jest czyste z ich jednostek.
    case 'waves':   return S.wave >= g.target && !S.units.some(u=>u.side==='e' && u.hp>0);
    case 'sectors': return secP() >= g.target;
    // „n z 3 DRÓG" — liczy się liczba RÓŻNYCH dróg, na których trzymasz cel,
    // nie liczba celów. To jest ta decyzja z misji 4: którą drogę odpuszczasz.
    case 'roads':   return roadsHeld() >= g.target;
    case 'hold':    return S.holdT >= (g.waves||1);
    case 'bastion': return !!(S.bastion && S.bastion.dead);
    default:        return false;
  }
}
/* JEDNO źródło tekstu celu — dla panelu w grze i dla odprawy w menu.
   Wcześniej menu miało własny `briefGoal` z innym słownictwem i BEZ przypadku
   `roads`, więc odprawa misji 4 pokazywała „CEL — —", a piątka obiecywała
   sektory, podczas gdy w grze chodziło o drogi. `m` pozwala opisać misję,
   która nie jest jeszcze bieżąca.                                            */
export function goalText(m){
  const mi = m || MIS();
  const g = mi.goal || {};
  const fal = n => n+' '+pl(n,'FALĘ','FALE','FAL');
  const drog = n => n+' '+pl(n,'DROGĘ','DROGI','DRÓG');
  const rn = (mi.roads || []).length || roadCount();
  switch (g.kind){
    case 'money':   return 'ZAROBIĆ '+g.target+' KREDYTÓW';
    case 'waves':   return 'ODEPRZYJ '+fal(g.target);
    case 'sectors': return g.target>1
                      ? 'ZAJMIJ '+g.target+' '+pl(g.target,'CEL','CELE','CELÓW')+' NA DROGACH'
                      : 'ZAJMIJ CEL';
    case 'roads':   return 'OPANUJ '+g.target+' Z '+rn+' DRÓG';
    case 'hold':    return 'UTRZYMAJ '+drog(g.target)+' PRZEZ '+fal(g.waves||1);
    case 'bastion': return 'ZNISZCZ BASTION';
    default:        return '—';
  }
}
// [teraz, cel] — HUD rysuje z tego pasek i licznik
export function goalNow(){
  const g = MIS().goal || {};
  switch (g.kind){
    case 'money':   return [Math.floor(earned()), g.target];
    case 'waves':   return [S.wave, g.target];
    case 'sectors': return [secP(), g.target];
    case 'roads':   return [roadsHeld(), g.target];
    case 'hold':    return [Math.floor(S.holdT), g.waves||1];
    case 'bastion': return [Math.round(100*(1 - (S.bastion?S.bastion.hp/S.bastion.maxHp:0))), 100];
    default:        return [0, 1];
  }
}

/* ------------------------------- MIGAWKA ---------------------------------
   Nie zapisujemy symulacji — zapisujemy STAN MIĘDZY MISJAMI: co stoi na
   siatce, ile kredytów, jakie karty, co odblokowane. Około dwudziestu linii,
   dokładnie jak w FRONT.md §10.

   Dwa osobne wiadra, bo to kilka linii różnicy przy pisaniu, a otwiera drogę
   do kampanii wieloświatowej (FRONT.md §8):
     · base — co stoi na siatce; ginie na nowym froncie
     · run  — karty i ulepszenia armii; przechodzą MIĘDZY światami             */
export function snapshot(){
  return {
    base: {
      money: S.money,
      // Ruda zapisuje się RAZEM ZE STANEM WYPALENIA: przejście do kolejnej misji
      // ma być ciągłe, a nie darmowym uzupełnieniem złóż. Kratki poza dawną
      // siatką dokłada mapka nowej misji (patrz carryOre w game.js).
      grid: S.grid.map(row => row.map(g => ({ ore:g.ore, seam:g.seam, bid: g.b ? g.b.id : 0 }))),
      buildings: S.buildings.map(b => ({ id:b.id, type:b.type, c:b.c, r:b.r, lvl:b.lvl,
                                         hp:b.hp, maxHp:b.maxHp })),
      hq: S.hq ? S.hq.id : 0,
      cols: COLS, rows: ROWS,
    },
    run: {
      cards: (S.stat && S.stat.cards ? S.stat.cards.slice() : []),   // LISTA KART, nie stan tablic
      pBonus: { ...S.pBonus },
      harvBonus: S.harvBonus || 0,
      doc: S.doc ? S.doc.name : null,                                // NAZWA, nie referencja
    },
  };
}

// Odtworzenie kart z listy nazw: resetTables() już poszedł w newMission,
// więc wystarczy odegrać efekty. Karta, której nie ma w talii (zmiana balansu
// między wersjami), jest po prostu pomijana — migawka nie psuje się od patcha.
export function replayCards(names){
  const all = [...DECK, ...OPEN];
  for (const n of names||[]){
    const c = all.find(x => x.n === n);
    if (c){ try { c.f(); } catch(e){} }
  }
}

// Wczytanie migawki bazy na ŚWIEŻO zbudowaną siatkę bieżącej misji.
// Budynek, który nie mieści się w nowej (mniejszej) siatce, jest pomijany —
// ramka nie może się wysypać dlatego, że misja gra na ciaśniejszym polu.
export function restoreBase(snap, mkBuilding){
  if (!snap) return;
  const byId = new Map();
  for (const rec of snap.buildings){
    if (rec.c + B[rec.type].fp[0] > COLS || rec.r + B[rec.type].fp[1] > ROWS) continue;
    const b = mkBuilding(rec.type, rec.c, rec.r, true);
    b.id = rec.id; b.lvl = rec.lvl;
    b.maxHp = rec.maxHp; b.hp = Math.min(rec.hp, rec.maxHp);
    byId.set(rec.id, b);
  }
  if (snap.hq && byId.has(snap.hq)) S.hq = byId.get(snap.hq);   // PRZELINKOWANIE (mina nr 1)
}

/* ---------------------------- OCENA SZTABU -------------------------------
   Nie gwiazdki. Trzy gwiazdki mówią graczowi, że przeszedł źle, i zapraszają
   do powtarzania — a kampania z punktem kontrolnym jest zaprojektowana pod
   płynność (FRONT.md §5). Jedno słowo i dwie–trzy liczby.

   Oceniamy CZAS, STRATY, PROCENT BASTIONU. Nie oceniamy wydajności ekonomii,
   choć dane są: w misjach 1–3 gracz ma eksperymentować, a ocena za wydajność
   każe mu grać optymalnie, zanim zrozumie, co jest optymalne.

   Ocena NIE BRAMKUJE POSTĘPU — odblokowuje. Przeszedłeś, idziesz dalej zawsze. */
export function rate(m, sec, loss){
  const par = m.par || { sec:600, loss:20 };
  if (sec <= par.sec*0.7 && loss <= par.loss*0.5) return { word:'PRZEŁAMANIE', tag:'best' };
  if (loss === 0)                                 return { word:'BEZ STRAT',    tag:'best' };
  if (sec <= par.sec && loss <= par.loss)         return { word:'WYKONANE',     tag:'good' };
  if (loss > par.loss*2)                          return { word:'WYKRWAWIENI',  tag:'hard' };
  return { word:'NA STYK', tag:'hard' };
}

// Zamknięcie misji: ocena, zapis postępu, odblokowanie gry dowolnej.
export function finishMission(win){
  const m = MIS();
  if (!isCampaign()) return null;
  const st = S.stat || {};
  const sec = st.t0 ? Math.round((performance.now() - st.t0)/1000) : 0;
  const loss = st.pKill || 0;
  const basPct = S.bastion && S.bastion.maxHp
    ? Math.round(100*(1 - Math.max(0,S.bastion.hp)/S.bastion.maxHp)) : 0;
  const r = win ? rate(m, sec, loss) : { word:'ODRZUCENI', tag:'lose' };

  const line = [r.word, 'Fala '+S.wave, 'Straty '+loss]
    .concat(m.goal && m.goal.kind==='bastion' ? ['Bastion '+basPct+'%'] : [])
    .join(' · ');

  if (win){
    const p = loadProgress();
    const prev = p.done[m.id];
    // zapisujemy NAJLEPSZY przebieg, ale gorszy nie odbiera odblokowania
    if (!prev || sec < prev.sec) p.done[m.id] = { word:r.word, tag:r.tag, sec, loss, wave:S.wave, bas:basPct };
    const w = worldOf(m.id);
    if (w.missions.every(id => p.done[id])) p.freeplay = true;   // gra dowolna po Świecie I
    saveProgress(p);
  }
  return { win, word:r.word, tag:r.tag, line, sec, loss, wave:S.wave, bas:basPct, mission:m };
}

/* --------------------------- NOWE KRATKI Z TERENU ------------------------
   Zdobyty sektor daje NOWE KRATKI, nie tylko kredyty (FRONT.md §4.3). To nie
   ozdoba: pierwszy realny zlew na kredyty i odpowiedź na „siatka pełna,
   1 700 kredytów bez zastosowania". Misja podaje `gridMax` — dokąd siatka może
   urosnąć; każdy przejęty mini-sztab dokłada jedną kolumnę, aż do sufitu.     */
export function growGrid(){
  const max = S.gridMax || [COLS, ROWS];
  if (COLS >= max[0] && ROWS >= max[1]) return false;
  const nc = Math.min(max[0], COLS+1), nr = Math.min(max[1], ROWS);
  if (nc===COLS && nr===ROWS) return false;
  const wiecejKolumn = nc > COLS;
  setGrid(nc, nr);
  /* NOWA KRATKA DOCHODZI OD ZAPLECZA, nie od frontu. Siatka kotwiczy się prawą
     krawędzią do wylotu korytarza (patrz BASE_X w config), więc dopisanie kolumny
     na końcu tablicy przesunęłoby CAŁĄ bazę o kratkę w lewo — wszystkie budynki
     skoczyłyby w bok w trakcie walki. Wstawiamy ją więc na początek i przesuwamy
     indeksy: na ekranie nic się nie rusza, a z tyłu przybywa placu.            */
  if (wiecejKolumn){
    for (const b of S.buildings) b.c += 1;
    for (let r=0;r<ROWS;r++){
      if (!S.grid[r]) S.grid[r]=[];
      S.grid[r].unshift({ore:0,seam:false,pull:false,b:null,prevOre:0});
    }
  }
  // Piksele budynku są liczone RAZ, przy stawianiu. Przeliczamy je po każdej
  // zmianie siatki — przesunięcie indeksu i przesunięcie kotwicy znoszą się
  // co do piksela, ale poleganie na tym byłoby poleganiem na przypadku.
  for (const b of S.buildings){
    const [w,h] = B[b.type].fp;
    b.x = BASE_X + (b.c + w/2)*CELL;
    b.y = BASE_Y + (b.r + h/2)*CELL;
  }
  for (let r=0;r<ROWS;r++){
    if (!S.grid[r]) S.grid[r]=[];
    for (let c=0;c<COLS;c++)
      if (!S.grid[r][c]) S.grid[r][c]={ore:0,seam:false,pull:false,b:null,prevOre:0};
  }
  say('▶ SAPERZY ROZSZERZYLI PLAC — NOWE KRATKI','good');
  return true;
}

export const fmtTime = s => Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
