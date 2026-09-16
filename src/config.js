/* =========================================================================
   FRONT — KONFIG / TABELE / STAŁE
   Wszystkie pokrętła balansu w jednym miejscu (jak sekcja CONFIG w oryginale).
   · const  — stałe niezmienne w trakcie gry
   · BAL    — te cztery liczby ruszają KARTY i resetuje resetTables()
   · B / U  — tablice budynków i jednostek; karty mutują ich pola (przez run),
              resetTables() przywraca je z migawek B0/U0 na starcie runu
   ========================================================================= */

// --- drobne utilsy ---
export const HEX   = s => (typeof s === 'number' ? s : parseInt(String(s).replace('#',''), 16));
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// --- wymiary / geometria ---
export const W = 1200, H = 680;
export const CELL = 52;
// Siatka bazy to DANE MISJI (misja 1 gra na mniejszej, misja 2 na ciaśniejszej).
// `let` + eksport = zywe wiazanie: importerzy widza zmiane bez zadnej przerobki.
// GRID_MAX pilnuje, zeby GEOMETRIA KORYTARZA (BASE_R, linie, sektory) NIE ruszala
// sie razem z siatka — mniejsza siatka to mniej kratek w tej samej bazie, nie inne pole.
export const GRID_MAX_COLS = 7, GRID_MAX_ROWS = 6;
export let COLS = GRID_MAX_COLS, ROWS = GRID_MAX_ROWS;
export const BASE_X = 40, BASE_Y = 176;
export const BASE_R = BASE_X + GRID_MAX_COLS*CELL;   // 404 — stale, niezalezne od COLS
export const LANE_Y = 332;
export const FRONT_MIN = BASE_R;

/* ============================ ŚWIAT / KORYTARZ ===========================
   MAPA JEST DUŻO WIĘKSZA OD EKRANU I PRZEWIJANA. Dlatego długość korytarza
   NIE jest stałą — jest DANĄ MISJI (`len` w missions.js), a wszystkie punkty
   na korytarzu podane są UŁAMKAMI jego długości, nie pikselami.

   Bez tego każda zmiana rozmiaru mapy znaczyłaby ręczne przeliczanie stanic,
   sektorów, progów kształtu, linii wroga i kamery — czyli pięciu miejsc
   naraz, za każdym razem. Teraz jest jedna liczba w danych misji.

   Co jest UŁAMKIEM (skaluje się z mapą):
     · stanice (STANCES.f) · progi kształtu (SHAPES[].f) · pozycje sektorów
     · promień przejmowania (CAP_R) · smycz łowcy (HUNT_LEASH)
   Co zostaje W PIKSELACH (warstwa taktyczna, NIE skalujemy):
     · zasięgi broni i rozmiary jednostek — w nich zakodowane są KONTRY
       (patrz komentarz przy tabeli U); przeskalowanie ich rozjechałoby
       wszystkie luki między jednostkami
     · ENGAGE_BAND, CONTACT, BAS_RANGE — liczone względem zasięgów

   `let` + eksport = żywe wiązanie: importerzy widzą nowe wartości bez żadnej
   przeróbki, a setField() jest jedynym miejscem, które je liczy.            */

const LEN_REF  = 760;    // dawna długość pola — odniesienie dla skal poniżej
const HALF_REF = 130;    // dawna połowa wysokości korytarza

export let FIELD_LEN = LEN_REF;      // długość korytarza w px (dana misji)
export let LANE_HALF = HALF_REF;     // połowa wysokości korytarza
export let BAS_X     = BASE_R + FIELD_LEN - 46;
export let FRONT_MAX = BAS_X - 30;
export let EHOLD_X   = BAS_X - 110;
export let CAP_R     = 118;          // promień przejmowania mini-sztabu
export let HUNT_LEASH = 150;         // jak daleko za linię łowca goni zwierzynę
export let LANE_SHIFT = 90;          // px/s przy przerzucie MIĘDZY torami
export let SPD_MUL   = 1;            // mnożnik marszu — patrz niżej

// Punkt na korytarzu z ułamka jego długości (0 = skraj bazy, 1 = bastion).
export const atF = f => BASE_R + FIELD_LEN * f;
export const fieldX1 = () => BASE_R + FIELD_LEN;

/* SPD_MUL — mnożnik PRĘDKOŚCI MARSZU, nie zasięgów.
   Na dużo większej mapie sam przemarsz zjadłby misję: przy dawnych 26 px/s
   piechota szłaby przez pole misji 6 blisko dwie minuty w jedną stronę.
   Skalujemy WSZYSTKIE jednostki JEDNAKOWO, więc relacje między nimi (łazik
   najszybszy, artyleria najwolniejsza) i wszystkie kontry zostają nietknięte —
   zmienia się wyłącznie czas dojścia.

   Wykładnik PODLINIOWY (0.6), nie 1.0, i to jest sedno: przy 1.0 czas przejścia
   byłby identyczny jak na starej mapie, czyli większa mapa nie dawałaby NICZEGO
   poza ładniejszym widokiem. Przy 0.6 pole ×4 daje marsz ~1,7× dłuższy — mapa
   realnie JEST większa, a nie jest slalomem przez pustkę.
   To jest pokrętło tempa: podnieś do 1.0 = krótsze marsze, zejdź do 0.3 = dłuższe. */
const SPD_EXP = 0.6;

// Wysokosc WSPOLNEGO korytarza. Nie zalezy juz od liczby drog: drogi maja
// wlasna szerokosc (ROAD_W) i wlasne osie (ROAD_GAP), a gardlo i lej sa ciasne
// z definicji — to one bramkuja wejscie.
export const halfForShape = () => 150;

export function setField(len, halfH){
  FIELD_LEN = clamp(len|0, 400, 20000);
  LANE_HALF = clamp(halfH|0 || HALF_REF, 80, 900);
  BAS_X     = BASE_R + FIELD_LEN - 46;
  FRONT_MAX = BAS_X - 30;
  EHOLD_X   = BAS_X - 110;
  const kLen  = FIELD_LEN / LEN_REF;
  const kHalf = LANE_HALF / HALF_REF;
  // Promień mini-sztabu rośnie PODLINIOWO i ma sufit: przy skali liniowej na polu
  // 3 200 px wychodziło 420 px, czyli strefa na trzecią część mapy — sąsiednie
  // sektory zachodziłyby na siebie i „stanie w sektorze" przestałoby być miejscem.
  CAP_R      = Math.round(clamp(118 * Math.pow(kLen, 0.6), 90, 240));
  HUNT_LEASH = Math.round(150 * Math.pow(kLen, 0.6));
  LANE_SHIFT = Math.round(110 * Math.max(1, ROAD_GAP/300));
  SPD_MUL    = +Math.pow(kLen, SPD_EXP).toFixed(3);
  // progi kształtu liczą się z ułamków — jedno miejsce, jeden raz
  for (const zs of Object.values(SHAPES)) for (const z of zs) z.x = atF(z.f);
  // Stanice: najpierw ułamkowe, potem liczone OD BASTIONU, na końcu środek.
  for (const st of STANCES) if (st.f != null) st.x = atF(st.f);
  // „Artyleria dosięga bastionu" — z ZASIĘGU artylerii, z marginesem na to, że
  // jednostka stoi trochę za linią. Bierzemy wartość z tabeli U, więc jeśli
  // kiedyś ruszysz U.arty.range, stanica pojedzie razem z nią.
  const reach = Math.max(60, ((U && U.arty ? U.arty.range : 175) - 25));
  for (const st of STANCES){
    if (st.fromBase != null) st.x = BASE_R + st.fromBase;
    else if (st.fromEnd === 0)   st.x = BAS_X;
    else if (st.fromEnd)    st.x = Math.max(atF(0.3), BAS_X - reach);
  }
  const iMid = STANCES.findIndex(st=>st.mid);
  if (iMid > 0) STANCES[iMid].x = (STANCES[iMid-1].x + STANCES[iMid+1].x)/2;
}

export function setGrid(cols, rows){
  COLS = clamp(cols|0, 2, GRID_MAX_COLS);
  ROWS = clamp(rows|0, 2, GRID_MAX_ROWS);
}

/* Stanice. Dwie pierwsze to UŁAMKI korytarza, dwie ostatnie liczą się OD BASTIONU
   — i to nie jest niekonsekwencja, tylko jedyny sposób, żeby ich nazwy nie kłamały.

   NACISK znaczy „artyleria dosięga BASTIONU". To jest ODLEGŁOŚĆ, nie miejsce:
   zasięg artylerii (175 px) jest warstwą taktyczną i NIE skaluje się z mapą.
   Przy ułamku 0.77 na polu 760 px wychodziło 129 px do bastionu (dosięgała),
   ale na polu 3 600 px już 782 px — artyleria nie dosięgała niczego, opis stanicy
   był nieprawdą, a razem z nim znikała odpowiedź na zakorkowany lej w misji 6.

   ŚRODEK liczy się jako PUNKT MIĘDZY PRZEDPOLEM A NACISKIEM, żeby na długiej
   mapie nie zostawał martwy odcinek między trzecim i czwartym stopniem suwaka. */
export const STANCES = [
  // OBRONA liczona OD BAZY, nie ułamkiem pola — symetrycznie do NACISKU, który
  // liczy się od bastionu. Ułamek znaczył, że na dłuższej mapie „obrona" odsuwa
  // się od bazy: na polu 1300 linia stała 104 px za krawędzią bazy, na 3600
  // byłaby kilkaset px w polu, poza zasięgiem własnych dział. Obrona ma znaczyć
  // „przy drucie, pod gniazdami", niezależnie od rozmiaru mapy.
  {n:'OBRONA',    fromBase:40, x:0, d:'pod działami bazy'},
  {n:'PRZEDPOLE', f:0.25, x:0, d:'1/4 — poza osłoną'},
  {n:'ŚRODEK',    mid:true, x:0, d:'neutralny grunt'},
  {n:'NACISK',    fromEnd:true, x:0, d:'artyleria dosięga BASTIONU'},
  {n:'NATARCIE',  fromEnd:0, x:0, d:'wszystko na bastion'},
];

/* ============================ DROGI (tory) ===============================
   Korytarz nie jest jedna rura z pasami. To KILKA NIEZALEZNYCH DROG, ktore
   rozchodza sie za waskim gardlem przy bazie i zbiegaja w leju przed bastionem:

          /-- DROGA GORNA ---- [MOST] --------- [BATERIA] --\
   BAZA -|--- DROGA SRODKOWA ------- [SKLAD] ---------------|-- LEJ -- BASTION
          \-- DROGA DOLNA -- [RAFINERIA] -- [WIEZA] -------/

   Trzy rzeczy, ktore to musi spelniac — i one wymuszaja caly ten model:

   1. KAZDA DROGA MA SWOJE CELE. Gorna i dolna maja INNE budynki do zajecia,
      z innym zyskiem (kredyty / moc / kratki / radar / oslabienie bastionu).
      Bez tego wybor drogi jest wyborem geometrii, a nie decyzja.
   2. DROGI SA OD SIEBIE ODDALONE. Nie trzy cienkie pasy w jednym pasie, a
      osobne trakty z pustka miedzy nimi (ROAD_GAP). Walka na gornej NIE
      przelewa sie na dolna — inaczej „rozdziel sily" nic nie znaczy.
   3. DROGI MOGA BYC ROZNEJ DLUGOSCI. Luk (`bow`) wybrzusza droge na zewnatrz,
      wiec przemarsz nia jest realnie dluzszy: dluzsza droga za lepszy cel to
      koszt alternatywny, a nie tylko inny kolor.

   PRZYDZIAL DO DROGI JEST ROZKAZEM. u.lane to numer drogi i gracz zmienia go
   dowolnie, w kazdej chwili: rozdziela armie po rowno, sciaga wszystko na
   jedna, przerzuca w trakcie walki. To jest ta sama klasa decyzji co suwak
   linii — tyle ze w poprzek, nie w glab.

   Przy jednej drodze wszystko to jest no-opem i symulacja chodzi jak dotad.  */

// f = prog strefy jako ULAMEK dlugosci korytarza · n = ile drog
// h = polowa wysokosci WSPOLNEGO korytarza (gardlo/lej) jako ulamek LANE_HALF.
// h < 1 to LEJ: przewagi liczebnej nie da sie wprowadzic naraz. PRZEPUSTOWOSC
// LEJA to glowne pokretlo misji 6 — HP bastionu rusza sie OSTATNIE.
export const SHAPES = {
  '1':     [{ f: 1.1,  n: 1, h: 1,    x:0 }],               // jedna droga na calej dlugosci (Swiat II)
  '1-3-1': [{ f: 0.18, n: 1, h: 0.62, x:0 },                // przy bazie — waskie gardlo
            { f: 0.82, n: 3, h: 1,    x:0 },                // rozwidlenie — trzy osobne drogi
            { f: 1.1,  n: 1, h: 0.38, x:0 }],               // LEJ przed bastionem
  '1-2-1': [{ f: 0.18, n: 1, h: 0.62, x:0 },                // rezerwa: ksztalt drugiego swiata
            { f: 0.82, n: 2, h: 1,    x:0 },
            { f: 1.1,  n: 1, h: 0.38, x:0 }],
};
let SHAPE = '1';
export const shapeId = () => SHAPE;
export function setShape(id){ SHAPE = SHAPES[id] ? id : '1'; }

/* Opis drog bieżącej misji. Ustawia campaign.applyRoads z danych misji.
     n    — nazwa (trafia na przyciski rozkazu i minimape)
     y    — przesuniecie od osi w jednostkach ROAD_GAP (-1 / 0 / +1)
     bow  — luk na zewnatrz w ulamku ROAD_GAP (0 = prosto, 0.4 = spory objazd)
     sect — cele NA TEJ DRODZE: {kind, f} gdzie f to ulamek DLUGOSCI DROGI     */
export let ROADS = [{ n:'KORYTARZ', y:0, bow:0, sect:[] }];
export let ROAD_GAP = 300;      // odstep miedzy osiami drog (px)
export let ROAD_W   = 150;      // szerokosc jednej drogi (px)
export function setRoads(list, gap, w){
  ROADS = (list && list.length) ? list : [{ n:'KORYTARZ', y:0, bow:0, sect:[] }];
  ROAD_GAP = clamp(gap|0 || 300, 120, 900);
  ROAD_W   = clamp(w|0   || 150, 60,  500);
}
export const roadCount = () => ROADS.length;
export const roadName  = i => (ROADS[i] ? ROADS[i].n : 'KORYTARZ');

// strefa ksztaltu obejmujaca x (pierwszy prog wiekszy od x wygrywa)
export function zoneAt(x){
  const zs = SHAPES[SHAPE];
  for (const z of zs) if (x < z.x) return z;
  return zs[zs.length-1];
}
export const lanesAt = x => zoneAt(x).n;
export const maxLanes = () => Math.max(roadCount(), SHAPES[SHAPE].reduce((m,z)=>Math.max(m,z.n), 1));

/* ROZWIDLENIE i ZBIEG — gdzie drogi sie rozchodza i gdzie wracaja do jednego
   korytarza. To progi ksztaltu, wiec „gdzie sie rozdziela" i „gdzie jest lej"
   to jedna dana, nie dwie, ktore moglyby sie rozjechac.                       */
export function splitX(){
  const zs = SHAPES[SHAPE];
  for (let i=0;i<zs.length;i++) if (zs[i].n > 1) return i>0 ? zs[i-1].x : BASE_R;
  return Infinity;                       // jedna droga — nie ma rozwidlenia
}
export function mergeX(){
  const zs = SHAPES[SHAPE];
  for (let i=0;i<zs.length;i++) if (zs[i].n > 1) return zs[i].x;
  return Infinity;
}
/* Gdzie zaczyna sie LEJ — prog pierwszej strefy WEZSZEJ od poprzedniej.
   Uzywa tego AI wroga: bez tego wrog masowal sie w samym gardle i robil KOREK,
   ktorego nie da sie przebic (pomiar: fala 46, bastion 0%). Lej ma bramkowac
   wejscie GRACZA, a nie byc darmowa twierdza wroga.                           */
export function narrowStart(){
  const zs = SHAPES[SHAPE];
  for (let i=1;i<zs.length;i++){
    const h = zs[i].h == null ? 1 : zs[i].h, hp = zs[i-1].h == null ? 1 : zs[i-1].h;
    if (h < hp) return zs[i-1].x;
  }
  return Infinity;
}

/* Polowa wysokosci WSPOLNEGO korytarza (gardlo przy bazie i lej przed
   bastionem). ZWEZENIE JEST STOPNIOWE, nie skokowe: liczba drog jest
   dyskretna, ale szerokosc przechodzi lagodnie przez pas TAPER — lej ma
   sciskac coraz mocniej w miare podchodzenia, a nie ciac pole pionowa sciana.
   Gracz czyta z pola, ile jeszcze ma miejsca, i to JEST mechanika misji 6.    */
const TAPER_F = 0.07;
export function corridorHalf(x){
  const zs = SHAPES[SHAPE];
  let i = zs.length - 1;
  for (let k = 0; k < zs.length; k++) if (x < zs[k].x){ i = k; break; }
  const h  = zs[i].h == null ? 1 : zs[i].h;
  if (i === 0) return LANE_HALF * h;
  const hPrev = zs[i-1].h == null ? 1 : zs[i-1].h;
  if (hPrev === h) return LANE_HALF * h;
  const start = zs[i-1].x, band = FIELD_LEN * TAPER_F;
  const t = clamp((x - start) / band, 0, 1);
  return LANE_HALF * (hPrev + (h - hPrev) * t);
}

/* Os drogi `i` w miejscu x.

   W gardle i w leju wszystkie drogi sa TA SAMA osia (LANE_Y) — tam jest jeden
   korytarz. Miedzy rozwidleniem a zbiegiem rozchodza sie na swoje wysokosci,
   a luk (`bow`) wypycha je jeszcze dalej w polowie drogi. Rozejscie i zbieg
   sa WYGLADZONE (sinus), zeby droga byla traktem, a nie zlamana kreska —
   jednostka ma nia jechac, a nie skakac na progach.                           */
export function roadY(i, x){
  const r = ROADS[i] || ROADS[0];
  if (!r || !r.y && !r.bow) return LANE_Y;
  const x0 = splitX(), x1 = mergeX();
  if (!isFinite(x0) || x <= x0 || x >= x1) return LANE_Y;
  const t = clamp((x - x0) / Math.max(1, x1 - x0), 0, 1);
  const open = Math.sin(t * Math.PI);            // 0 na koncach, 1 w srodku
  const ramp = Math.min(1, open * 2.2);          // szybkie rozejscie, potem plaskowyz
  const dir  = r.y === 0 ? (r.bow >= 0 ? 1 : -1) : Math.sign(r.y);
  return LANE_Y + (r.y * ROAD_GAP) * ramp + dir * (r.bow || 0) * ROAD_GAP * open;
}
// Polowa szerokosci PRZEJEZDNEJ drogi w miejscu x. Poza rozwidleniem to
// wspolny korytarz (gardlo/lej), wiec liczy sie corridorHalf.
export function roadHalf(x){
  const x0 = splitX(), x1 = mergeX();
  if (!isFinite(x0) || x <= x0 || x >= x1) return corridorHalf(x);
  // Wygladzone wejscie i wyjscie: droga rozszerza sie z gardla i zwiera w lej,
  // zeby trakt nie zaczynal sie pionowym progiem.
  const band = Math.max(40, (x1-x0)*0.10);
  const t = Math.min(1, Math.min(x-x0, x1-x)/band);
  return corridorHalf(x) + (ROAD_W/2 - corridorHalf(x)) * t;
}
// Calkowity pionowy zasieg pola (do kamery, renderu i minimapy).
export function fieldHalf(){
  let m = LANE_HALF;
  for (let i=0;i<ROADS.length;i++){
    const r = ROADS[i];
    const reach = Math.abs(r.y||0)*ROAD_GAP + Math.abs(r.bow||0)*ROAD_GAP + ROAD_W/2;
    if (reach > m) m = reach;
  }
  return m + 20;
}
// Punkt na DRODZE z ulamka jej dlugosci (0 = rozwidlenie, 1 = zbieg w leju).
export function roadPointX(f){
  const x0 = splitX(), x1 = mergeX();
  if (!isFinite(x0)) return atF(clamp(f,0,1));
  return x0 + (x1 - x0) * clamp(f, 0, 1);
}

// --- zgodność: dawne nazwy używane przez render/sim ---
export const laneCY   = (lane, n, x) => roadY(lane, x);
export const laneHalf = (n, x) => roadHalf(x);

// Przerzut MIEDZY drogami (LANE_SHIFT) skaluje sie z odstepem drog — dalsza
// droga to dluzsza przeprawa w poprzek, ale ten sam koszt w sekundach.

/* ======================== CELE NA DROGACH ================================
   „Gorna i dolna droga maja INNE budynki do zajecia" — wiec cel nie jest jednym
   rodzajem punktu, ktory zawsze placi kredytami. Kazdy rodzaj daje CO INNEGO,
   i to dopiero czyni wybor drogi decyzja, a nie wyborem koloru:

     kredyty  — najprostszy zysk, skaluje wszystko
     moc      — odblokowuje budynki, ktore inaczej nie zmieszcza sie w sieci
     kratki   — jedyny sposob na wiecej miejsca w bazie (zlew na kredyty)
     radar    — widzisz sklad fal, czyli mozesz kontrowac zamiast reagowac
     oslabia  — tnie produkcje wroga; jedyna rzecz, ktora zmniejsza nacisk

   Dzieki temu „rozdziel sily" i „skup sie na jednej drodze" sa realnymi,
   roznymi planami: dwie drogi po kredyty to inna partia niz jedna po radar
   i oslabienie. Nowy rodzaj celu to wpis tutaj + jedna gałąź w sectors.js.  */
export const SECT_KINDS = {
  sztab:   { name:'MINI-SZTAB', ico:'★', col:'#e8b23a', give:'kredyty', val:5,    desc:'+5 kr./s' },
  most:    { name:'MOST',       ico:'╬', col:'#4dd0d0', give:'moc',     val:10,   desc:'+10 mocy' },
  sklad:   { name:'SKŁAD',      ico:'▣', col:'#5fd18a', give:'kratki',  val:1,    desc:'+2 kolumny kratek' },
  wieza:   { name:'WIEŻA',      ico:'◉', col:'#c9a2e8', give:'radar',   val:1,    desc:'+1 poziom radaru' },
  bateria: { name:'BATERIA',    ico:'A', col:'#d98a4d', give:'oslabia', val:0.25, desc:'ich fale −25%' },
};
export const sectKind = k => SECT_KINDS[k] || SECT_KINDS.sztab;

// --- AI wroga ---
export const EARTY_CAP = 3;
export const EPUSH_R  = 1.35;
export const EHOLD_R  = 0.85;
// Minimalna MASA jednostek, przy której wróg w ogóle rozważa szturm „z cierpliwości"
// (bez przewagi sił). Poniżej — trzyma linię i kontestuje mini-sztaby zamiast
// nadziewać garstkę na bazę. Szturm z PRZEWAGI (r > EPUSH_R) działa niezależnie.
export const EPUSH_MIN = 8;
export const EPATIENCE = 110;
export const EPAT_MASS = 70;
export const ESCOUT    = 3;
// Od której fali wywiad wroga uruchamia KONTRY (rakiety na czołgi, łaziki na piechotę,
// piechota na rakiety, kontrbateria). Wcześniej wróg buduje wyłącznie z kolejki doktryny,
// więc początek partii to walka piechoty, a nie pojazdy w drugiej fali.
export const ECOUNTER_FROM = 5;
export const ETHINK    = 2;
export const ECOMMIT   = 26;
export const ESHELLED  = 55;

export const CO = {
  bg:'#0f1315', dirt:'#1a2022', grid:'#232c2f', gridHi:'#2f3b3f', laneEdge:'#39474b',
  ore:'#c9a227', oreDark:'#8a6f1a',
  blue:'#4d9de0', blueD:'#2a5f8a', red:'#e05252', redD:'#8a2f2f',
  txt:'#c8d4d6', dim:'#66787c', warn:'#e8b23a', ok:'#5fd18a',
  panel:'#161c1e', panelHi:'#202a2d', power:'#e8b23a',
  crt:'#7de08a', crtDim:'#2f5c39', crtBg:'#0a0f0b', intel:'#c9a2e8', lock:'#39474b'
};

// --- ruda / bastion / ekonomia ---
// BASE_INCOME — darmowy trickle bez żadnego budynku. Był 3 (podłoga „nigdy nie
// spłukany"), przez co ekonomia sama się niosła. 2 = ledwie oddech; żeby rosnąć
// MUSISZ sięgnąć po rudę albo teren.
export const BASE_INCOME = 2;
// ORE_RATE — ile ciągnie JEDEN harvester z bogatej żyły (>5 rudy). Rafineria I poz.
// = 1 harvester (1 żyła). Ulepszenie = kolejny harvester (kolejna żyła), aż do
// liczby przyległych żył. 9/harvester: I poz. 9/s → II 18/s → III 27/s za rudę.
// 6 → 9 (14.09.2026): ruda ma nieść ekonomię, a sektory być dodatkiem. Przy 6/s dwa
// darmowe sektory (10/s) biły rafinerię za 250 kr., więc ruda leżała nietknięta
// (raport Michała: 1 rafineria, ruda na koniec 1 812 przy 993 na start). Pole to
// wytrzymuje: nietknięte kratki odrastają po ORE_REGEN każda, harvester bierze z jednej.
export const ORE_RATE  = 9;
// Odrost rudy — ROZPRZĘGNIĘTY na dwie prędkości (regrow wybiera po fladze pull):
//  · ORE_REGEN — żyła SPOCZYNKOWA (nietknięta): szybkie odbicie, pusta 0→450 ~90 s.
//  · ORE_SIP   — żyła CZYNNA (pod rafinerią): odrost przy drenażu. 2 (było 1):
//                netto −1/kratkę, więc bogate pole schodzi WOLNO (nie w minutę),
//                a po wypaleniu wciąż sączy ORE_SIP × kratki = solidny KRĘGOSŁUP
//                (nie chudy trickle). Ruda ma nieść ekonomię, nie mini-sztaby.
//                Chcesz świeży zryw — przenieś rafinerię na odrośniętą żyłę.
//                (SALV_CAP pilnuje, by głębsze pola nie dały fortuny z zaorania.)
export const ORE_REGEN = 5;
export const ORE_SIP   = 2;
export const ORE_YOUNG = 0.16;   // głębszy start (0.11→0.16 ≈ 72–162/kratkę): dłuższa faza bogata; zaoranie i tak ograniczone przez SALV_CAP
export const BAS_HP    = 2200;   // twardszy: nie da się wygrać szybką dekapitacją, front trwa dłużej
export const BAS_DMG   = 34;
export const BAS_RANGE = 150;
export const BAS_RATE  = 0.8;
export const BAS_SPL_R = 35;
export const BAS_SPL_N = 3;
export const WAVE_TIME = 30;     // rzadsze fale → mniej jednostek naraz, każda znaczy więcej (patrz waveInterval)
export const TERR_MAX  = 9;      // 3/sektor (było 5): teren to DODATEK do rudy — trzy sektory = jeden harvester; sektory dalej się opłacają przez karę dla wroga
// ETERR_SEC — co ile sekund WSZYSTKIE trzy zajęte sektory dokładają wrogowi budynek
// (jeden sektor: 3× wolniej). 65 → 120 (14.09.2026): przy 65 s wróg dostawał budynek
// co dwie fale za samo trzymanie terenu i partia zamieniała się w kulę śniegową.
export const ETERR_SEC = 120;
// Bonus wroga za trzymane mini-sztaby. Gracz z sektorów bierze KREDYTY (TERR_MAX),
// wróg nie używa kasy — jego nagrodą jest SIŁA: każdy zajęty sztab podbija obrażenia
// CAŁEJ jego polowej armii o ETERR_ATK (druga noga obok przyspieszonej rozbudowy z
// eTerrBank). Wróg bierze sztaby POJEDYŃCZO i z każdego rośnie w siłę — snowball, który
// KARZE oddanie terenu i nagradza kontestowanie: 3 sektory = +3 dmg każdej jednostce.
// Płasko (jak karty gracza). 2 → 1 (14.09.2026): przy +6 piechota wroga (9→15) razem
// z szybszą rozbudową z sektorów nie dawała się odbić. Chcesz zdusić bonus — odbij sztab.
export const ETERR_ATK = 1;
export const SELL_BACK = 0.5;
// PRZESUNIĘCIE budynku: ułamek wartości i tyle sekund budowy. Ma być tanie
// względem rozbiórki (50% straty) i drogie względem darmowego cofnięcia —
// planowanie zostaje decyzją, ale pomyłka nie jest wyrokiem na całą misję.
export const MOVE_FRAC = 0.25, MOVE_SEC = 3;
/* ----------------------------- FORMACJA ----------------------------------
   UKŁAD BARAKÓW W BAZIE = SZYK ODDZIAŁU W POLU. Kolumna baraku mówi, jak
   GŁĘBOKO stoi jego żołnierz (prawa kolumna = pierwsza linia), wiersz — gdzie
   w poprzek drogi. Dzięki temu „2 – 1" znaczy coś naprawdę: wysunięty żołnierz
   jest najbliżej wroga, więc to on zbiera ogień (wybór celu bierze NAJBLIŻSZEGO),
   a dwóch z tyłu strzela zza niego.

   Obie liczby są SUFITAMI, nie krokiem na kratkę: szyk ma czytać się tak samo
   na siatce 6×3 (misja 1) i 7×6 (finał), a przede wszystkim ma mieścić się
   w zasięgach broni.

   CAŁA KOPERTA SZYKU MUSI ZMIEŚCIĆ SIĘ W NAJKRÓTSZYM ZASIĘGU. Pierwsze liczby
   (34 w głąb, 40 w poprzek) tego nie spełniały: żołnierz ze skraju stał 40 px
   od osi drogi przy zasięgu piechoty 39, a po przekątnej 52 — więc nie dosięgał
   tego, z kim bił się sąsiad, i szyk zamiast wspierać się nawzajem rozłaził się
   na osobne walki. Teraz przekątna to ~29 px, z zapasem pod 39: szyk widać,
   ale każdy w nim strzela do tego samego celu.                               */
export const FORM_DEPTH = 24, FORM_SPREAD = 16;
/* --------------------- ŻOŁD: kredyty MIĘDZY misjami ----------------------
   Baza przechodzi między misjami w całości, KREDYTY nie. Pełny portfel robił
   z następnej misji formalność: z misji 1 wychodziło się z ~1500 kredytów, za
   które w pierwszej sekundzie misji 2 stawiało się cztery gniazda i ulepszenie
   — i nie trzeba było już ekonomii, czyli dokładnie tego, czego misja uczy.
   Zostaje ŻOŁD: ułamek oszczędności do sufitu, jako premia za gospodarność,
   a nie jako przepustka. Właściwym startem jest `money` z danych misji.      */
export const CARRY_FRAC = 0.15, CARRY_CAP = 150;
// Naprawa budynku: koszt = udział brakującego HP × wartość × REPAIR_FRAC.
// Symetria ze złomem (scrap 50% wartości / naprawa 50% brakującej wartości) —
// późną grą to STAŁY sink: utrzymanie ostrzeliwanego frontu kosztuje kredyty.
export const REPAIR_FRAC = 0.5;
// Zaoranie żyły płaci najwyżej z SALV_CAP rudy/kratkę — koniec z „odczekaj aż
// odrośnie do 450 i zaorz na fortunę". Młode pole (≤~140/kratkę) i tak jest niżej.
export const SALV_CAP = 140;
// Czas budowy budynku = koszt / BUILD_DIV, ograniczony do [BUILD_MIN, BUILD_MAX] s.
// Budynek w budowie jest MARTWY (bez mocy, dochodu, produkcji, ognia) — gotówka nie
// zamienia się w działającą bazę na pstryknięcie. Niżej BUILD_DIV = wolniej.
// 35 (było 50): elektrownia 3 s → rafineria 7 s → fabryka 11 s → ciężka fabr. 16 s.
export const BUILD_DIV = 35, BUILD_MIN = 2, BUILD_MAX = 16;
export const MAXLVL    = 3;
export const RAID_PAY  = 0.4;
export const HQ_COST   = 350;
export const START_MONEY = 250;  // = koszt rafinerii: zawsze stać na jedną (karty otwarcia nadpisują)
export const CAP_RATE  = 6;   // wolniejsze przejmowanie (~17 s) → sektor to trwały bój, nie pstryknięcie
// CAP_R (promień mini-sztabu) skaluje się z długością pola — patrz setField.

// --- BALANS RUCHOMY (karty + resetTables) ---
// EBUILD_EVERY: co ile fal wróg dokłada budynek. Niżej = szybsza eskalacja.
// 0.85 (~1,18 budynku/falę): 0.7 zaostrzono pod snowball sztabu (gracz mnożył CAŁĄ
// armię i wygrywał każde starcie). Odkąd sztab nie mnoży już armii — a jej skalowanie
// idzie z rzadszych, płaskich kart — ta eskalacja robiła się zbyt duszna. Powrót do
// 0.85 domyka pętlę: wróg wciąż rośnie od startu, ale gracz nadąża torem kart.
export const BAL = { ORE_MAX:450, CLEAR_SALV:0.4, HQ_STEP:0.07, EBUILD_EVERY:0.85 };

// --- budynki ---
export const B = {
  hq:      {name:'SZTAB',        short:'SZTAB', fp:[2,2], cost:0,   hp:1500, col:'#7fb3d9', ico:'★', sup:4, req:[],
            atk:{dmg:30, range:330, rate:0.65}, desc:'broni całej bazy · 330 px'},
  power:   {name:'ELEKTROWNIA',  short:'PRĄD',  fp:[1,1], cost:100, hp:200,  col:'#e8b23a', ico:'⚡', sup:6, req:[],
            desc:'+6 mocy · 1×1'},
  refinery:{name:'RAFINERIA',    short:'RAF.',  fp:[2,2], cost:250, hp:250,  col:'#5fd18a', ico:'$', drn:2, req:[],
            desc:'harvester: +9 kr./s za żyłę · ulepsz = kolejny'},
  barracks:{name:'BARAK',        short:'BARAK', fp:[1,1], cost:150, hp:200,  col:'#6fa8dc', ico:'i', drn:2, req:[],
            unit:'inf', count:1, desc:'co falę: 1× Piechota · 1×1'},
  // cost 300→340: „łatwo wielu mieć" — każda rura pluje elitarną rakietą co falę,
  // więc 3–4 wyrzutnie robiły blob, który sam wygrywał każde starcie z pancerką.
  // Rakieta zostaje odpowiedzią na pancerz, ale stawianie ich ŚCIANY ma boleć budżet,
  // a nie być domyślnym otwarciem na wszystko.
  rocket:  {name:'WYRZUTNIA',    short:'WYRZ.', fp:[1,2], cost:340, hp:180,  col:'#9b7fd4', ico:'r', drn:2, req:[],
            unit:'rkt', count:1, desc:'rakiety przebijają pancerz · ×2 do czołgów'},
  // DZIAŁKO jest CZĘŚCIĄ BAZY — stoi na kratce i konkuruje o miejsce z rafinerią
  // i barakiem. To jest cała jego cena: nie kredyty, a plan. Osobne stanowiska
  // przed bazą (próbowane 15.09) zdejmowały tę decyzję i zostawiały samo
  // „kliknij, gdy masz 180 kredytów". Zamiast nich jest PRZESUŃ (patrz input.js):
  // planujesz, a pomyłkę da się poprawić za część wartości.
  bunker:  {name:'GNIAZDO RAK.',  short:'GNIAZ.',fp:[1,1], cost:180, hp:350,  col:'#8fa3a8', ico:'▲', drn:1, req:['rocket'],
            desc:'rakiety 230 px · przebija pancerz',
            atk:{dmg:15, range:230, rate:1.0, ap:true}},
  workshop:{name:'WARSZTAT',     short:'WARSZ.',fp:[2,1], cost:200, hp:220,  col:'#d9a04d', ico:'w', drn:2, req:[],
            unit:'lazik', count:1},
  factory: {name:'FABRYKA',      short:'FABR.', fp:[2,2], cost:400, hp:300,  col:'#4d9de0', ico:'T', drn:3, req:['radar'],
            unit:'tank', count:1},
  radar:   {name:'RADAR',        short:'RADAR', fp:[1,2], cost:350, hp:220,  col:'#4dd0d0', ico:'◉', drn:3, req:['refinery'],
            desc:'I: rozpoznasz ich w zwarciu · II: skład fali zawczasu'},
  reactor: {name:'REAKTOR',      short:'REAKT.',fp:[2,2], cost:500, hp:260,  col:'#f2d24b', ico:'☢', sup:36, boom:120,
            req:['radar'], desc:'+36 mocy · wybucha'},
  lab:     {name:'LABORATORIUM', short:'LAB.',  fp:[1,2], cost:500, hp:260,  col:'#b0d04d', ico:'L', drn:3, req:['radar','factory'],
            desc:'artyleria i kolosy · +1 POZIOM wszystkim'},
  arty:    {name:'BATERIA ART.', short:'ART.',  fp:[2,2], cost:500, hp:250,  col:'#d98a4d', ico:'A', drn:4, req:['lab'],
            unit:'arty', count:1, desc:'odłamki ×3 · 60–175 px'},
  heavy:   {name:'CIĘŻKA FABR.', short:'C.FAB.',fp:[2,2], cost:700, hp:420,  col:'#3a7fc0', ico:'K', drn:5, req:['lab'],
            unit:'kolos', count:1},
};
export const BAR = ['power','refinery','barracks','rocket','bunker','workshop','factory',
             'radar','reactor','lab','arty','heavy'];

// --- jednostki ---
export const U = {
  // ZASIĘGI BEZPOŚREDNIEGO OGNIA ×1.5 (inf/łazik/czołg/kolos/rkt): dawne 26–66 px
  // dawały „tulaninę" — jednostki biły się w kilkunastu pikselach, a wróg spoza
  // zasięgu farmił stojących. Skala ×1.5 zachowuje WSZYSTKIE luki (a więc kontry),
  // a walka czyta się jak strzelanina. Artyleria (175) BEZ zmian — osobna liga,
  // zależą od niej stanice (NACISK: „arty dosięga bastionu”).
  inf:  {name:'Piechota',    hp:60,  dmg:9,  range:39,  spd:26, rate:0.75, sz:4,  strong:['rkt']},
  // dmg 15→12: DPS był za wysoki. Rakietowiec i tak przebija pancerz (ap) oraz
  // dostaje ×2 do pancernych (strong+COUNTER), więc bazowe 15 czyniło go zbyt
  // uniwersalnym młotem. 12 = ~10 DPS bazowo, ~21 vs pancerni — dalej specjalista.
  //   range 74→66, rate 1.15→1.2: rakieta była TANIM młotem na wszystko pancerne —
  //   masówka rakiet za nic kitowała czołgi (zasięg 74 vs 36) i STALOWA PIĘŚĆ sama
  //   się na nią nadziewała. Krótsze okno kitu + niższy DPS + droższa WYRZUTNIA
  //   (250→300) każą inwestować, zamiast zalewać rurami. Właściwa kara idzie z AI:
  //   enemy dosypuje teraz piechotę na masówkę rakiet (patrz eBuild) — a piechota
  //   przebija ×2 przez 50 HP rakietowca. Rakieta = specjalista od pancerza, nie
  //   uniwersalna odpowiedź na wszystko.
  //   range 99→84: masówka rakiet dalej rozjeżdżała pancerną doktrynę „za darmo".
  //   Rakieta ap+×2 przegrywa 1v1 w zwarciu (czołg ją kładzie w 2,5 s, ona jego w
  //   9,5 s) — CAŁA jej siła to OSTRZAŁ NA PODEJŚCIU: outrange + blob skupiający ogień.
  //   Przy 99 px każda rura wpychała ~1,1 darmowego strzału, nim czołg (54) czy kolos
  //   (66) w ogóle dosięgły; ściana wyrzutni topiła STALOWĄ PIĘŚĆ, zanim ta zdążyła
  //   oddać cios. 84 (baza 56 × 1.5, w konwencji zasięgów) wciąż PRZEBIJA pancerny
  //   zasięg — rola kontry nietknięta — ale ścina okno podejścia do ~0,7 strzału:
  //   pancerni realnie wymieniają ciosy, a blob rakiet płaci stratami za rozjazd.
  rkt:  {name:'Rakietowiec', hp:50,  dmg:12, range:84,  spd:22, rate:1.2,  sz:4,  strong:['tank','kolos','lazik'], ap:true, proj:200},
  tank: {name:'Czołg',       hp:190, dmg:19, range:54,  spd:34, rate:0.95, sz:8,  strong:['inf'], arm:5},
  // hp 90→110→125, +arm 3: łazik MA tępić piechotę (strong+COUNTER ×2), ale ginął
  // w zwarciu z gromadą, zanim ją przetrzebił. 1v1/2v1/3v1 miażdżył — problemem był
  // OSTRY KLIF: 3 żołnierzy sprzątał, przy 4 padał bez szans (pomiar: 100% → 0%).
  // Pancerz 3 to właściwa dźwignia: PŁASKA redukcja tnie głównie wiele słabych trafień
  // (piechota 9→6, −33%), a ciężkie ledwie drapie (czołg 19→16, −16%) — mocny na blob,
  // słaby na pancerne, zgodnie z rolą. Kontra rakietowca NIETKNIĘTA: rkt ma ap, który
  // ignoruje pancerz. +15 HP odbudowuje margines, by „4" było pewne, a „5" wciąż ponad
  // siły (pomiar po zmianie: 3/4 = 100%, 5 = 0%). `light`: mimo pancerza łazik NIE jest
  // „ciężki" — zachowuje pełną prędkość odwrotu (kit łowcy), patrz isHeavy.
  lazik:{name:'Łazik',       hp:125, dmg:11, range:45,  spd:55, rate:0.5,  sz:6,  strong:['arty','inf'], hunt:'arty', arm:3, light:true},
  arty: {name:'Artyleria',   hp:70,  dmg:24, range:175, spd:15, rate:3.0,  sz:7,  strong:[], spl:3, splR:34, minR:60, proj:150},
  kolos:{name:'Kolos',       hp:430, dmg:32, range:66,  spd:21, rate:1.1,  sz:11, strong:['inf'], arm:6},
};
export const COUNTER   = 2.0;
// Pasmo walki: jak daleko ZA LINIĄ trzymana jednostka podejdzie, by dosięgnąć
// wroga strzałem, zamiast stać jak słup pod ostrzałem dłuższego zasięgu. Kryje
// zwarcie z pancernymi (czołg 54, kolos 66 px), ale NIE pozwala gonić kitera
// (rkt 99, arty 175) przez całe pole — poza pasmem jednostka trzyma linię.
export const ENGAGE_BAND = 90;
export const BACK_MUL  = 0.4;
export const CONTACT = 90;
export const SEEN_HOLD = 2;
export const NOUP = ['lab'];
// klasy dla osobnych ulepszeń gracza (karty): żołnierze vs opancerzeni
export const isSoldier = t => t==='inf' || t==='rkt';
export const isArmored = t => t==='tank' || t==='kolos';

// --- budynki wroga (skład fali) ---
export const EB = {
  barracks:{name:'BARAK',        unit:'inf',  count:1},
  rocket:  {name:'WYRZUTNIA',    unit:'rkt',  count:1},
  workshop:{name:'WARSZTAT',     unit:'lazik',count:1},
  factory: {name:'FABRYKA',      unit:'tank', count:1},
  arty:    {name:'BATERIA ART.', unit:'arty', count:1, desc:'odłamki ×3 · 60–175 px'},
  heavy:   {name:'CIĘŻKA FABR.', unit:'kolos',count:1},
};
// Pierwsze TRZY budynki każdej doktryny to baraki: początek partii ma być walką piechoty
// o mini-sztaby. Pojazdy i artyleria wchodzą od 4. budynku (~fala 5), gdy gracz ma już
// ekonomię i czym odpowiedzieć. Charakter doktryny zostaje — zmienia się tylko moment.
export const DOCTRINES = [
  { name:'CZERWONA FALA', tag:'Masa piechoty. Zaleją cię liczbą.',
    hint:'Pancerz kosi piechotę. Czołgi i bunkry.',
    start:['barracks','barracks'],
    order:[['barracks'],['barracks'],['barracks'],['rocket'],['barracks'],
           ['barracks'],['factory'],['barracks'],['barracks'],['rocket'],
           ['barracks'],['factory'],['barracks'],['barracks'],['heavy']],
    late:['barracks','barracks','rocket','factory'] },
  { name:'STALOWA PIĘŚĆ', tag:'Doktryna pancerna. Czołgi od ~5. fali.',
    hint:'Bez rakiet nie masz czym tego przebić.',
    start:['barracks'],
    order:[['barracks'],['barracks'],['barracks'],['factory'],['factory'],
           ['barracks'],['factory'],['factory'],['heavy'],['factory'],
           ['barracks'],['heavy'],['factory'],['factory'],['heavy']],
    late:['factory','heavy','workshop','barracks'] },
  { name:'GRAD', tag:'Artyleria. Rozbiorą cię z dystansu.',
    hint:'Odłamki koszą zbitą masę. Łaziki dopadną baterie.',
    start:['barracks'],
    order:[['barracks'],['barracks'],['barracks'],['rocket'],['arty'],
           ['arty'],['workshop'],['barracks'],['arty'],['rocket'],
           ['workshop'],['arty'],['rocket'],['factory'],['heavy']],
    late:['arty','rocket','workshop','barracks'] },
];

// --- migawki do resetu (karty mutują U/B; bez tego statystyki przeciekają między runami) ---
const U0 = JSON.parse(JSON.stringify(U));
const B0 = JSON.parse(JSON.stringify(B));
export function resetTables(){
  for (const k in U0){ for (const f in U[k]) delete U[k][f]; Object.assign(U[k], U0[k]); }
  for (const k in B0){ for (const f in B[k]) delete B[k][f]; Object.assign(B[k], B0[k]); }
  BAL.ORE_MAX=450; BAL.CLEAR_SALV=0.4; BAL.HQ_STEP=0.07; BAL.EBUILD_EVERY=0.85;
}

// --- czyste helpery siatki (bez stanu) ---
export const fpOf = t => B[t].fp;
export function cellsOf(t,c,r){
  const [w,h]=fpOf(t), out=[];
  for (let rr=r; rr<r+h; rr++) for (let cc=c; cc<c+w; cc++) out.push([cc,rr]);
  return out;
}
export function ringOf(t,c,r){
  const [w,h]=fpOf(t), out=[];
  for (let rr=r-1; rr<=r+h; rr++) for (let cc=c-1; cc<=c+w; cc++){
    if (rr>=r&&rr<r+h&&cc>=c&&cc<c+w) continue;
    if (rr<0||rr>=ROWS||cc<0||cc>=COLS) continue;
    out.push([cc,rr]);
  }
  return out;
}
// „ciężki" = kara do prędkości odwrotu (BACK_MUL): czołg/kolos/arty nie kitują.
// `light` wyłącza tę karę mimo pancerza — łazik jest opancerzony, ale wciąż to
// szybki wóz rozpoznawczy, który MA móc odskoczyć (kit łowcy artylerii).
export const isHeavy = d => !d.light && !!(d.arm || d.minR);
/* Polska liczba mnoga: 1 → forma pojedyncza, 2–4 → „few", reszta → „many",
   z wyjątkiem 12–14, które idą jak „many". Bez tego panel celu pisał
   „UTRZYMAJ 2 DRÓG PRZEZ 4 FAL", co czyta się jak tłumaczenie maszynowe.     */
export function pl(n, one, few, many){
  if (n === 1) return one;
  const d = n % 10, s = n % 100;
  return (d >= 2 && d <= 4 && !(s >= 12 && s <= 14)) ? few : many;
}
export const plObj = n => pl(n, 'OBIEKT', 'OBIEKTY', 'OBIEKTÓW');
export function cellAt(px,py){
  const c=Math.floor((px-BASE_X)/CELL), r=Math.floor((py-BASE_Y)/CELL);
  return (c>=0&&c<COLS&&r>=0&&r<ROWS)?{c,r}:null;
}
