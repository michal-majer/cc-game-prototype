# FRONT — prototyp (PixiJS)

Strategiczny auto-battler / dieslowe RTS z boku. Budujesz budynki na siatce,
jednostki maszerują i walczą same — Ty podejmujesz decyzje ekonomiczne,
przestrzenne i kontrujące, oraz ustawiasz linię natarcia.

To jest port oryginalnego prototypu (jeden plik Canvas 2D) na **PixiJS**, tak by
łatwo dodawać **grafikę i dźwięk**, i żeby grało się **na telefonie** — pole walki
wypełnia wysokość ekranu i **przewija się w poziomie** (na desktopie widać całość,
kółko/pinch przybliża).

## Uruchomienie

ESM + Pixi wczytywany lokalnie (`vendor/pixi.min.mjs`) — nie ma bundlera ani
`npm install`, ale moduły ES wymagają serwera HTTP (nie `file://`):

```bash
python3 -m http.server 8000
# otwórz http://localhost:8000
```

To wszystko. Zero zależności do instalowania.

## Sterowanie

- **Pole (Pixi):** przeciągnij palcem/myszą, żeby przewinąć. Pinch / kółko = zoom.
- **Tap na kratkę** (gdy nic nie wybrane) → **ulepsz** budynek.
- **Kafel budowy** (dół) → wybierz budynek → **tap na kratkę** = postaw.
- **✂ ROZBIÓRKA** → tap na budynek (zwrot 50%) albo na żyłę (zaoranie).
- **Suwak linii** (nazwy OBRONA…NATARCIE) → ustawia, jak daleko wychodzą Twoi.
- **Rozkazy generała** (panel po prawej nad suwakiem, `Q/W/E`): nalot, forsowny marsz,
  zrzut zaopatrzenia — za punkty rozkazów. Opis i pytania otwarte: `docs/rozkazy.md`.
- **Klawiatura:** `1–5` linia, `←/→` linia, `Spacja` GOTÓW / natarcie / odwrót,
  `+/−` prędkość, `1/2/3` wybór karty, `Q/W/E` rozkazy, `Esc` odznacz.

## Struktura

```
index.html        canvas Pixi (#stage) + cały HUD jako DOM overlay
style.css         HUD: mobile-first, ostry i klikalny na dotyk
vendor/
  pixi.min.mjs    PixiJS 8 (ESM), wczytywany lokalnie
src/
  config.js       WSZYSTKIE stałe i tablice balansu (+ BAL = 4 liczby ruchome)
  state.js        S — jeden współdzielony obiekt stanu + say() + SECT
  effects.js      wybuchy (cząsteczki)
  economy.js      ruda: żyły, wydobycie, odrost
  sectors.js      trzy mini-sztaby (przejmowanie terenu)
  buildings.js    stawianie, moc, poziomy, technologia, walidacja kratek
  enemy.js        AI wroga, bastion, wywiad, kontry
  cards.js        talia (ulepszenia ze sztabu) + otwarcia
  orders.js       rozkazy generała: aktywne moce za punkty (nalot, marsz, zrzut)
  sim.js          rdzeń: obrażenia, spawn, fala, krok update(dt), linia
  render.js       render świata na Pixi + kamera (pan/pinch)
  hud.js          HUD w DOM (paski, pasek budowy, suwak, karty, log)
  input.js        dotyk/mysz (pan/tap) + przyciski + klawiatura
  meta.js         warianty pola (modyfikatory) + eskalacja między runami
                  (localStorage) + metryki i RAPORT KOŃCOWY do analizy
  game.js         punkt wejścia: newRun + pętla; index.html ładuje ten plik
  audio.js        proceduralne boom/siren + rejestr własnych próbek
  assets.js       manifest tekstur (opt-in) + loader
assets/           tu wrzucasz PNG/dźwięki (patrz assets/README.md)
```

Zależności idą w jedną stronę:
`config → state → (economy · sectors · buildings · enemy · cards · sim · meta) → render · hud · input → game`.
Cały balans jest w `src/config.js` — te same stałe co w oryginale.

## Warianty runu, eskalacja i raport (meta.js)

Każdy run to nie tylko losowa doktryna wroga — na starcie losują się **warianty
pola** (modyfikatory: twardszy bastion, szybsze fale, mgła wojny, cięższe
pancerze, żyzne złoża…), więc dwa runy tej samej doktryny grają inaczej.
**Eskalacja** rośnie o 1 z każdą **wygraną** (porażka jej nie podnosi), do sufitu 6
(trzymana w `localStorage` pod `front.meta`): front stopniowo się zaostrza, a wariantów
losuje się więcej naraz (1 → 2 → 3). Dorzuć nowe warianty do tablicy `MODIFIERS`
w `src/meta.js`. Początek partii to walka piechoty: pierwsze trzy budynki każdej
doktryny to baraki, kontry wywiadu ruszają od 5. fali, linia startuje na PRZEDPOLU.

Na **koniec runu** powstaje raport: skrót na ekranie końca (**⧉ KOPIUJ RAPORT**
kopiuje pełny JSON), pełny obiekt w konsoli (F12) i historia ostatnich 30 runów
w `localStorage`. Raport ma **rozbicie dochodu** wg źródła (ruda, sektory, baza, łupy
z bastionu, złom, karty) plus sumę wydatków — to jest podstawa do balansu ekonomii. Z konsoli: `__front.meta()` (podgląd), `__front.resetMeta()`
(zerowanie eskalacji) — dostępne pod `?debug` w URL.

## Bot testowy (balans)

`tools/bot-test.js` rozgrywa kilka partii w przeglądarce bez okna i wypisuje raport
końca każdej: doktryna, warianty, fala, czas gry, ile bastionu zniszczone. Służy do
sprawdzenia po zmianie balansu, czy partia ma koniec i czy da się ją wygrać.

```bash
python3 -m http.server 8123 &
npm i playwright
RUNS=4 STYL=natarcie node tools/bot-test.js
```

Bot gra słabo (nie kituje, nie naprawia) — pokazuje dolną granicę, nie grę człowieka.
Pomiar z 13.09.2026: 8 partii, 0 zwycięstw, bastion 0–3%. Szczegóły w `tools/bot-test.js`.

## Kampania (pomysł)

Rosnąca mapa zamiast startu od zera: obrona → przedpole → środek → natarcie na bastion,
baza zostaje między etapami, kolejne teatry to dane, nie nowy kod. Opis, zasady
i kolejność robót: `docs/kampania.md`. Rozkazy generała (aktywne moce: nalot, marsz,
zrzut; pomysł, nie kod): `docs/rozkazy.md`.

## Dodawanie grafiki i dźwięku

- **Grafika:** wrzuć PNG do `assets/…`, dopisz wpis w `MANIFEST` w `src/assets.js`.
  Brak pliku = gra rysuje proceduralny glif (jak dotąd). Jednostki rysuj zwrócone
  w prawo — wersja wroga jest odbijana automatycznie.
- **Dźwięk:** w `src/audio.js` użyj `registerSfx('boom', 'assets/sfx/boom.wav')`.
  Bez rejestracji gra brzmi proceduralnie.

Szczegóły i konwencje nazw: `assets/README.md`.

## O co chodzi w grze

Bastion po prawej **jest bazą wroga** — im bardziej go rozbijesz, tym słabsze jego
fale. Żyły rudy odrastają, ale kratka pod budynkiem to martwa kratka. Zajęty teren
(sektory) płaci Ci kredyty — a oddany płaci wrogowi. Bez radaru wroga widzisz
dopiero w zwarciu; radar I pokazuje jego kształty na całym polu (typ rozpoznasz
w zwarciu), radar II daje pełną widoczność. Co 3 fale dostajesz rozkaz ze sztabu —
jedną z trzech kart (zawsze co najmniej jedna ulepsza armię: dmg/pancerz). Sam sztab
ulepszasz bez limitu, ale jego bonus podbija **działa bazy**, nie polową armię —
skalowanie jednostek idzie właśnie kartami.
