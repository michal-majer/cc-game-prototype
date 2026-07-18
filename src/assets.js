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
  // przykład — odkomentuj po wrzuceniu pliku:
  // tank:    'assets/units/tank.png',
  // b_hq:    'assets/buildings/hq.png',
  // bastion: 'assets/scene/bastion.png',
};

const loaded = {};   // name -> Texture

// Wczytaj tylko to, co jawnie wpisano w MANIFEST. Brak wpisu = glif proceduralny.
export async function loadAssets() {
  for (const n of Object.keys(MANIFEST)) {
    try { loaded[n] = await PIXI.Assets.load(MANIFEST[n]); }
    catch (e) { console.warn('[assets] pominięto (brak/pusty):', MANIFEST[n]); }
  }
  return Object.keys(loaded);
}

export function tex(name)     { return loaded[name] || null; }
export function hasTex(name)  { return !!loaded[name]; }
export function unitTex(type) { return loaded[type] || null; }
export function buildTex(type){ return loaded['b_' + type] || null; }
