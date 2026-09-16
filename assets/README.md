# Assety — grafika i dźwięk

Gra działa bez żadnych plików w tym folderze — rysuje wtedy proceduralne glify
i płaskie wypełnienia. Wrzucając pliki, podmieniasz je pojedynczo. **Brakująca
grafika nigdy nie blokuje rozgrywki** — to jest zasada, nie przypadek.

---

## Co wrzucić od grafika (stan: 15.09.2026)

| Plik | Co to | Uwagi |
|---|---|---|
| `assets/tiles/ziemia.png` | **arkusz kafli terenu** | trzy bloki 3×3 (skała / trawa / ziemia) + górny pasek ze znacznikami (lej, ruda) |
| `assets/units/inf.png` | żołnierz | arkusz klatek **albo** pojedynczy sprite |
| `assets/buildings/<typ>.png` | budynki | `hq`, `power`, `refinery`, `barracks`, `bunker`, … |
| `assets/scene/bastion.png` | bastion wroga | |
| `assets/portrait/gen.png` | portret generała | pokazywany na odprawie misji |

Po wrzuceniu pliku **odkomentuj odpowiedni wiersz w `MANIFEST`** (`src/assets.js`).
Kafle terenu wczytują się same z `TILESETS` — wystarczy plik.

---

## Jak wrzucić plik do repo

**PNG commituje się TYLKO wewnątrz `assets/`.** Globalny `.gitignore` ma `*.png`,
a wyjątki (`!assets/**`) dotyczą wyłącznie tego drzewa — plik położony w korzeniu
repo albo w `docs/` git po cichu pominie i nikt się nie zorientuje.

Sprawdzenie, gdy coś „nie widać":

```sh
git check-ignore -v <ścieżka>     # cisza albo reguła z „!" = plik wejdzie; reguła bez „!" = ignorowany
git status --short --untracked-files=all | grep png
```

Z linii poleceń:

```sh
git checkout claude/funny-cray-81sz6f
cp ~/Downloads/arkusz.png assets/raw/ziemia-teren-2026-09-16.png
git add assets/raw/ziemia-teren-2026-09-16.png
git commit -m "Assety: surowy arkusz terenu z AI"
git push -u origin claude/funny-cray-81sz6f
```

Przez stronę GitHuba (bez terminala): wejdź w katalog `assets/raw` na gałęzi
roboczej → **Add file › Upload files** → przeciągnij PNG → *Commit changes*.
Katalog musi istnieć w drzewie (stąd ten `README.md` obok) — GitHub nie pozwala
wgrać pliku do katalogu, którego nie ma.

---

## Arkusz z AI — krok pośredni

Generator zwraca **planszę poglądową**, nie tileset: kafel wypada na ułamku
piksela, wiersze są poprzesuwane, każde pole ma własną ciemną ramkę, a krawędzie
nie schodzą się z sąsiadem. Loader tnie sztywną siatką (`tile` px), więc taki
plik wrzucony wprost daje paski sąsiadów w każdym kaflu i widoczną kratę na polu.

Droga jest więc dwuetapowa:

1. surowy plik → `assets/raw/` (magazyn wsadu, gra go nie czyta),
2. pocięcie i przełożenie na **czysty arkusz o równej siatce** → `assets/tiles/ziemia.png`.

Czysty arkusz musi trafić w układ z `TILESETS` (niżej): bloki wariantów `vary×vary`
pod współrzędnymi z `sets`, znaczniki w górnym pasku. Najprościej złożyć go tak,
żeby pasował do domyślnego wpisu — wtedy w kodzie nie zmienia się nic.

Co się nadaje na kafel gruntu, a co nie:

| Nadaje się | Nie nadaje się |
|---|---|
| jednolity grunt bez ramki i bez mocnego środka kompozycji | kafel z wyraźną obwódką (po ułożeniu = krata) |
| drobny, powtarzalny szum (żwir, trawa, spękania) | duży pojedynczy obiekt (drzewo, wrak) — to dekoracja, nie grunt |
| krawędzie schodzące się z sąsiadem | kafel z cieniem wychodzącym poza pole |

Obiekty (drzewa, wraki, beczki, mury) zostaw na później — **silnik nie ma jeszcze
warstwy dekoracji**, rysuje wyłącznie grunt (`sets`). `marks` (lej, ruda) są już
w tabeli i loader je tnie, ale `markTex()` nie jest jeszcze nigdzie wołane w
`render.js` — rudę i leje rysują dotąd figury proceduralne.

---

## Kafle terenu (`TILESETS` w `src/assets.js`)

```js
ziemia: {
  url:'assets/tiles/ziemia.png',
  tile:64,          // bok POJEDYNCZEGO kafla w pikselach
  vary:3,           // blok wariantów 3×3 = 9 odmian jednego gruntu
  sets:{ skala:[0,1], trawa:[3,1], ziemia:[6,1] },   // [kolumna, wiersz] w KAFLACH
  marks:{ lej:[4.5,0], ruda:[5.5,0] },
}
```

- Współrzędne podane są **w kaflach, nie w pikselach** — przy innej rozdzielczości
  arkusza zmieniasz jedną liczbę `tile`.
- Wariant kafla dobierany jest **deterministycznie po pozycji**, więc pole nie
  migocze między klatkami i wygląda tak samo po powrocie z menu.
- Korytarz kafluje się tylko tam, gdzie jest **przejezdny** — lej naprawdę zwęża
  pole, a nie tylko rysuje krawędź.
- Świat zmienia się **podmianą kafli i koloru, nie nową mapą** — nowy świat to
  nowy wpis w `TILESETS` i nowy plik.

---

## Jednostki

- Sprite jest skalowany do rozmiaru `sz` jednostki, więc grafika może mieć
  dowolną rozdzielczość. Rysuj postać zwróconą **w prawo** (gracz);
  wersja wroga jest automatycznie odbijana w poziomie i zabarwiana na czerwono.
- **Bez wpisu w `SHEETS` plik jest traktowany jak pojedyncza klatka.** To wystarczy,
  żeby zobaczyć grafikę w grze — animację dokładasz później.

### Arkusz klatek (opcjonalnie)

```js
SHEETS.inf = {
  cols: 7, rows: 4, chroma: 0xff00ff, anchor:[0.5,0.5],
  clips: { idle:{row:0,frames:[0,1,2,3],fps:5}, walk:{…}, shoot:{…}, die:{…} },
}
```

- **Tło**: magenta `#ff00ff` — wycinane do przezroczystości przy wczytaniu
  (razem z antyaliasowaną obwódką i resztkowym nalotem na krawędziach).
- Render sam dobiera animację po stanie jednostki: strzela → `shoot`,
  idzie → `walk`, stoi → `idle`; `die` odgrywa się raz w miejscu zgonu.
- Klatki o nierównych wymiarach można podać jawnymi prostokątami `rects:[[x,y,w,h],…]`.

---

## Dźwięk

W `src/audio.js` użyj `registerSfx(nazwa, url)` przy starcie, np.:

```js
import { registerSfx } from './audio.js';
registerSfx('boom',  'assets/sfx/boom.wav');
registerSfx('siren', 'assets/sfx/siren.wav');
```

Dopóki nic nie zarejestrujesz, gra brzmi proceduralnie jak dotąd.
