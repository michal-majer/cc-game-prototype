# Assety — grafika i dźwięk

Gra działa bez żadnych plików w tym folderze — rysuje wtedy proceduralne glify
i płaskie wypełnienia. Wrzucając pliki, podmieniasz je pojedynczo. **Brakująca
grafika nigdy nie blokuje rozgrywki** — to jest zasada, nie przypadek.

---

## Co wrzucić od grafika (stan: 15.09.2026)

| Plik | Co to | Uwagi |
|---|---|---|
| `assets/tiles/ziemia.png` | **arkusz kafli terenu** | sześć bloków 3×3 (beton / trawa / ziemia / las / kamień / zarośla) + górny pasek znaczników (lej, ruda, wrak, pożar) |
| `assets/tiles/decor.png` | **ozdoby** | wiersz = rodzaj (krzak, głaz, zapora, złom), kolumna = odmiana; tło przezroczyste |
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

> **Zamawiasz nową grafikę planszy?** Gotowy brief i prompty siedzą
> w [`docs/grafika-plansza.md`](../docs/grafika-plansza.md). Krótko: nie zamawiaj
> „tilesetu", tylko wielkie jednolite płachty materiału plus obiekty na
> magentowym tle — z kafli-scenek nie da się zrobić gruntu.


Generator zwraca **planszę poglądową**, nie tileset. Trzy wady są tu istotne
i każda wymaga innej poprawki:

| Wada | Co robi w grze | Lek |
|---|---|---|
| rozstaw kafli faluje (98–114 px) | paski sąsiadów w każdym kaflu | cięcie po **zmierzonych szwach**, nie równą siatką |
| kafel ma wrysowaną ramkę i cień | widoczna krata | głębsze cięcie + wyrównanie tonu krawędzi |
| kafel jest **scenką**, nie fakturą | tapeta z powtórzonego drzewa | scenki idą do warstwy ozdób, gruntem zostaje to, co płaskie |

Cięcie robi **`tools/kafle.py`** (`pip install pillow numpy`, potem
`python3 tools/kafle.py`). Wszystko, co się dobiera ręcznie, siedzi w tabelach
na górze pliku: zmierzone szwy arkuszy, wybór kafli na każdy grunt, prostokąty
budynków i ozdób, dopasowanie do palety. Po dogenerowaniu nowej grafiki
poprawiasz tabelę, nie kod.

Narzędzie zapisuje:

- `assets/tiles/ziemia.png` — grunty i znaczniki (układ z `TILESETS`),
- `assets/tiles/decor.png` — ozdoby z przezroczystością (układ z `DECORSET`),
- `assets/buildings/*.png`, `assets/scene/bastion.png` — bryły.

### Czemu grunt jest osobno od obiektów

Bo płaskiego gruntu, który wolno powtarzać, jest w arkuszu terenu **cztery
kafle**. Reszta to scenki ze skomponowanym środkiem — drzewo, głaz, lej —
a scenka powtórzona przez całe pole zawsze będzie tapetą. Dlatego podłoże jest
gładkie (ścięty kontrast, zdjęta wielkoskalowa plama), a to, co przyciąga oko,
leży na nim jako pojedyncze obiekty z własną skalą i przesunięciem.

Trzy rzeczy, które usuwają widoczną kratę, i żadna nie zastępuje pozostałych:

1. **wspólny ton krawędzi** w obrębie całej rodziny terenu — inaczej każdy styk
   typów rysuje własną linię. Korekta mnożnikowa i wąska; wtapianie w płaski
   kolor robi wokół kafla gładką ramkę, czyli tę samą kratę;
2. **filtr górnoprzepustowy** — kafel ma w środku jaśniejszą i ciemniejszą
   połowę, a taka plama powtórzona co 52 px daje szachownicę nawet przy idealnie
   zgranych brzegach;
3. **obrót i odbicie** kafla po pozycji — dziewięć wariantów w równym rytmie
   ma rozpoznawalny deseń; osiem ułożeń robi z nich 72 widoki.

Obiekty ozdób są odbijane, ale **nie obracane** — beczka ma pion.

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
