/* =========================================================================
   FRONT — rejestr tekstur (assety graficzne)
   Mapuje logiczne nazwy (typ jednostki / budynku / element sceny) na pliki
   PNG w assets/. Loader wczytuje tylko te, które faktycznie istnieją —
   brakujące są pomijane, a gra rysuje wtedy proceduralny glif (jak dotąd).

   Jak podmienić jednostkę na grafikę:
     1. wrzuć plik, np. assets/units/tank.png
     2. dopisz go w MANIFEST poniżej (albo użyj domyślnej nazwy = typ)
     3. odśwież — czołgi rysują się jako Twój sprite, reszta bez zmian.

   Rozmiar sprite'a jednostki jest skalowany do jej „sz” z tabeli U,
   więc grafika może mieć dowolną rozdzielczość.

   SPRITE SHEET (arkusz klatek):
     Jeśli plik jest ARKUSZEM (siatka klatek do animacji — chód, strzał, …),
     opisz go w SHEETS poniżej. Loader potnie go na klatki i wytnie tło
     „chroma” (domyślnie magenta #ff00ff) na przezroczystość. Render sam
     dobiera klip po stanie jednostki: idzie → walk, strzela → shoot,
     stoi → idle. Rozmiar klatki liczony z wymiarów pliku (px/kolumny),
     więc arkusz może mieć dowolną rozdzielczość.
   ========================================================================= */

import * as PIXI from '../vendor/pixi.min.mjs';

// Logiczna nazwa -> ścieżka pliku. WŁĄCZAJ POJEDYNCZO (opt-in), żeby konsola
// była czysta — wczytywane są TYLKO wpisy obecne tutaj. Odkomentuj / dopisz
// wiersz, gdy wrzucisz odpowiedni plik do assets/.
//
// Konwencja nazw (skopiuj potrzebne):
//   jednostki (klucz = typ z tabeli U):   inf, rkt, tank, lazik, arty, kolos
//     -> assets/units/<typ>.png
//   budynki (klucz = "b_" + typ z tabeli B):
//     b_hq, b_power, b_refinery, b_barracks, b_rocket, b_bunker, b_workshop,
//     b_factory, b_radar, b_reactor, b_lab, b_arty, b_heavy
//     -> assets/buildings/<typ>.png
//   scena:  bastion -> assets/scene/bastion.png
export const MANIFEST = {
  // Zwykły żołnierz (Piechota) jako arkusz klatek — patrz SHEETS.inf niżej.
  // Do zadziałania wrzuć plik assets/units/inf.png (arkusz z magentowym tłem).
  // Dopóki pliku nie ma, gra rysuje glif jak dotąd (jeden warn w konsoli).
  inf: 'assets/units/inf.png',
  // przykład — odkomentuj po wrzuceniu pliku:
  // tank:    'assets/units/tank.png',
  // b_hq:    'assets/buildings/hq.png',
  // bastion: 'assets/scene/bastion.png',
};

// Opis arkuszy klatek. Klucz = ta sama nazwa co w MANIFEST.
//   cols / rows  — siatka klatek (rozmiar pojedynczej klatki liczony w locie:
//                  szerokość_pliku/cols × wysokość_pliku/rows).
//   chroma       — kolor tła wycinany na przezroczystość (magenta domyślnie).
//   clips        — nazwane animacje: { row: nr wiersza, frames:[kolumny], fps,
//                  once?:true }. Render wybiera klip po stanie jednostki
//                  (shoot > walk > idle); brakujący klip = spada do walk/idle.
//   anchor       — punkt zaczepienia sprite'a [x,y] w ułamku klatki (0.5,0.5 = środek).
//
// Układ dla inf — siatka 7×4 (zmierzona z pliku 1024×559; klatka ≈146×140 px,
// sprite'y siedzą w lewych kolumnach, prawe są puste):
//   wiersz 0: 4 klatki postawy/celowania      -> idle
//   wiersz 1: 5 klatek chodu                   -> walk
//   wiersz 2: 2 klatki strzału (2. z błyskiem) -> shoot
//   wiersz 3: postawa/kucnięcie/leży/trup      -> die (rezerwa, patrz render)
// Jeśli podmienisz arkusz na inny — popraw cols/rows i listy frames tutaj.
export const SHEETS = {
  inf: {
    cols: 7, rows: 4, chroma: 0xff00ff, anchor: [0.5, 0.5],
    clips: {
      idle:  { row: 0, frames: [0, 1, 2, 3],    fps: 5 },
      walk:  { row: 1, frames: [0, 1, 2, 3, 4], fps: 9 },
      shoot: { row: 2, frames: [0, 1],          fps: 10 },
      // śmierć: klatki wiersza 3 są nierówne (leżący/trup szersze niż komórka),
      // więc podane jawnymi prostokątami [x,y,w,h] zmierzonymi z pliku: klęka → pada → trup.
      die:   { once: true, fps: 7, rects: [ [174,420,122,136], [326,420,217,136], [561,420,161,136] ] },
    },
  },
};

const loaded = {};   // name -> Texture (pełny obraz / reprezentatywna klatka)
const sheets = {};   // name -> { fw, fh, clips:{name:[Texture,...]+meta}, anchor }

// Wczytaj obrazek jako <img> (do keyingu przez canvas). Odrzuca przy braku pliku.
function loadImage(url){
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload  = () => res(im);
    im.onerror = () => rej(new Error('img load failed: ' + url));
    im.src = url;
  });
}

// Wczytaj arkusz, wytnij tło chroma (magenta) na przezroczystość, potnij na klipy.
async function loadSheet(name, url, sh){
  const img = await loadImage(url);
  const cw = img.naturalWidth, ch = img.naturalHeight;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);

  // chroma-key: wytnij tło (magenta) RAZEM z antyaliasowaną obwódką.
  // Zamiast liczyć odległość do dokładnego koloru (co zostawia różową poświatę na
  // krawędziach), sprawdzamy DOMINACJĘ kanałów tła: dla magenty kanały R,B są
  // „wysokie", a G „niski" — piksel jest tłem, gdy min(wysokich) wyraźnie > max(niskich).
  // Łapie to i czystą magentę, i półprzezroczyste piksele krawędzi. Uogólnia się na
  // inne czyste chroma (zielony/niebieski ekran); dla nietypowych spada do odległości.
  const key = sh.chroma == null ? 0xff00ff : sh.chroma;
  const kc = [(key >> 16) & 255, (key >> 8) & 255, key & 255];
  const hi = [], lo = [];
  kc.forEach((v, ch) => (v >= 128 ? hi : lo).push(ch));
  const MARG = 40;
  const id = ctx.getImageData(0, 0, cw, ch), px = id.data;
  const useDom = hi.length && lo.length;
  for (let i = 0; i < px.length; i += 4){
    if (useDom){
      let loMax = -1, hiMin = 256;
      for (const ch of lo) if (px[i+ch] > loMax) loMax = px[i+ch];
      for (const ch of hi) if (px[i+ch] < hiMin) hiMin = px[i+ch];
      const margin = hiMin - loMax;
      if (margin >= MARG){ px[i+3] = 0; continue; }     // tło + mocna obwódka -> przezroczyste
      // DESPILL: resztkowy nalot magenty na krawędzi (kanały tła > „niski") — ściągnij je
      // do poziomu „niskiego", żeby zabić fioletową poświatę bez zjadania sylwetki.
      if (margin > 0) for (const ch of hi) if (px[i+ch] > loMax) px[i+ch] = loMax;
    } else if (Math.abs(px[i]-kc[0]) <= 72 && Math.abs(px[i+1]-kc[1]) <= 72 && Math.abs(px[i+2]-kc[2]) <= 72){
      px[i+3] = 0;
    }
  }
  ctx.putImageData(id, 0, 0);

  const source = new PIXI.CanvasSource({ resource: cv });
  source.scaleMode = 'nearest';                    // pixel-art bez rozmycia
  const fw = Math.floor(cw / sh.cols), fh = Math.floor(ch / sh.rows);
  const clips = {};
  for (const [clipName, c] of Object.entries(sh.clips)){
    // klatki z jawnych prostokątów (rects: [[x,y,w,h],...]) albo z siatki (row + frames)
    const rects = c.rects || c.frames.map(col => [col*fw, c.row*fh, fw, fh]);
    const frames = rects.map(([x,y,w,h]) =>
      new PIXI.Texture({ source, frame: new PIXI.Rectangle(x, y, w, h) }));
    frames.fps  = c.fps || 8;
    frames.once = !!c.once;
    clips[clipName] = frames;
  }
  sheets[name] = { fw, fh, clips, anchor: sh.anchor || [0.5, 0.5] };
  // reprezentatywna klatka (pierwszy zdefiniowany klip) — do kompatybilności z unitTex()
  loaded[name] = clips[Object.keys(sh.clips)[0]][0];
}

// Wczytaj tylko to, co jawnie wpisano w MANIFEST. Brak wpisu = glif proceduralny.
export async function loadAssets() {
  for (const n of Object.keys(MANIFEST)) {
    try {
      if (SHEETS[n]) await loadSheet(n, MANIFEST[n], SHEETS[n]);
      else           loaded[n] = await PIXI.Assets.load(MANIFEST[n]);
    }
    catch (e) { console.warn('[assets] pominięto (brak/pusty):', MANIFEST[n]); }
  }
  return Object.keys(loaded);
}

export function tex(name)      { return loaded[name] || null; }
export function hasTex(name)   { return !!loaded[name]; }
export function unitTex(type)  { return loaded[type] || null; }
export function unitSheet(type){ return sheets[type] || null; }
export function buildTex(type) { return loaded['b_' + type] || null; }
