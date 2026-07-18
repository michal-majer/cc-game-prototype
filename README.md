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
- **Klawiatura:** `1–5` linia, `←/→` linia, `Spacja` GOTÓW / natarcie / odwrót,
  `+/−` prędkość, `1/2/3` wybór karty, `Esc` odznacz.

## Struktura

```
index.html        canvas Pixi (#stage) + cały HUD jako DOM overlay
style.css         HUD: mobile-first, ostry i klikalny na dotyk
vendor/
  pixi.min.mjs    PixiJS 8 (ESM), wczytywany lokalnie
src/
  game.js         mechanika 1:1 + render Pixi + kamera + input + HUD
  audio.js        proceduralne boom/siren + rejestr własnych próbek
  assets.js       manifest tekstur (opt-in) + loader
assets/           tu wrzucasz PNG/dźwięki (patrz assets/README.md)
```

Wszystkie pokrętła balansu są u góry `src/game.js` (sekcja KONFIG / TABELE) —
te same stałe co w oryginale.

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
dopiero w zwarciu. Co 5 fal dostajesz rozkaz ze sztabu — jedną z trzech kart.
