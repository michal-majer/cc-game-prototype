# FRONT — prototyp (PixiJS)

Strategiczny auto-battler / dieslowe RTS z boku. Budujesz budynki na siatce,
jednostki maszerują i walczą same — Ty podejmujesz decyzje ekonomiczne,
przestrzenne i kontrujące, oraz ustawiasz linię natarcia.

To jest port oryginalnego prototypu (jeden plik Canvas 2D) na **PixiJS**, tak by
łatwo dodawać **grafikę i dźwięk**. Gra celuje w **PC** (Steam przez Electrona albo
Tauri); wersja w przeglądarce zostaje jako darmowe demo. Pole walki przewija się
w poziomie, kółko przybliża.

**Silnik zostaje PixiJS — nie przepisujemy na Unity** (decyzja 14.09.2026). Kod jest
skończony, a wszystko, co realnie poprawia grę, jest niezależne od silnika. Konsole nie
są celem: jeśli Steam pójdzie dobrze, port robi wydawca za udział w przychodzie.
Precedens: Vampire Survivors powstał w Phaserze i trafił na Steam w Electronie, a porty
na konsole przyszły dopiero po sukcesie. Pełne uzasadnienie i koszty odrzuconej drogi:
`decyzje/2026-09-14-silnik-front-pixijs.md` w repozytorium Ikar.

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
- **Rozkaz torowy** (przyciski po prawej nad paskiem budowy): TOR 1/2/3 ściąga całą
  armię na jeden tor, ROZDZIEL rozkłada ją po równo. Widoczne tylko tam, gdzie tory są.
- **Klawiatura:** `1–5` linia, `←/→` linia, `Spacja` GOTÓW / natarcie / odwrót,
  `+/−` prędkość, `1/2/3` wybór karty, `Q/W/E/R` tory, `Esc` odznacz / menu.

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
  sim.js          rdzeń: obrażenia, spawn, fala, krok update(dt), linia
  render.js       render świata na Pixi + kamera (pan/pinch)
  hud.js          HUD w DOM (paski, pasek budowy, suwak, karty, log)
  input.js        dotyk/mysz (pan/tap) + przyciski + klawiatura
  meta.js         warianty pola (modyfikatory) + eskalacja między runami
                  (localStorage) + metryki i RAPORT KOŃCOWY do analizy
  missions.js     DANE misji i światów (zero logiki rozgrywki)
  campaign.js     ramka misji: cel z danych, punkt kontrolny, migawka, ocena, postęp
  menu.js         menu · wybór misji · odprawa · ocena sztabu (DOM)
  game.js         punkt wejścia: budowa pola pod misję + pętla; ładowany z index.html
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
RUNS=4 STYL=natarcie node tools/bot-test.js       # gra dowolna
RUNS=2 MISJA=m2 node tools/bot-test.js           # misja kampanii
```

Bot gra słabo (nie kituje, nie naprawia) — pokazuje dolną granicę, nie grę człowieka.
Pomiar z 13.09.2026: 8 partii, 0 zwycięstw, bastion 0–3%. Szczegóły w `tools/bot-test.js`.

## Kampania

Gra startuje **menu**: KAMPANIA (Świat I — „PIERWSZY FRONT", sześć misji) albo
GRA DOWOLNA (otwiera się po przejściu świata). Misja to jeden krok frontu: cel
z danych, własna siatka, własny pasek budowy, własny wróg. Baza przechodzi między
misjami; „POWTÓRZ" wraca do **punktu kontrolnego** na start misji, nie do początku
świata.

Ocena po misji to **jedno słowo i dwie–trzy liczby** (`PRZEŁAMANIE · Fala 8 ·
Straty 12`), nie gwiazdki — i **nie bramkuje postępu, tylko odblokowuje**.

To jedna ramka dla obu trybów: gra dowolna to rekord `SKIRMISH` w `src/missions.js`,
a nie drugi silnik. **Nowa misja = wpis w tabeli, nie nowy kod** — jeśli dodanie misji
wymaga dotknięcia `sim.js`, ramka jest zepsuta.

```
src/missions.js   DANE: sześć misji Świata I + gra dowolna (zero logiki)
src/campaign.js   RAMKA: cel z danych, punkt kontrolny, migawka, ocena, postęp
src/menu.js       EKRANY: menu · wybór misji · odprawa · ocena sztabu
```

Pełny projekt gry — kształt pola 1/3/1, treść każdej misji, co odrzucone i dlaczego,
kolejność robót: **`FRONT.md`**. Rozkazy generała (aktywne moce; pomysł, nie kod,
wycięte z v1): `docs/rozkazy.md`.

### Tory (kształt pola 1/3/1)

Korytarz nie ma stałej szerokości: przy bazie jeden tor, w środku trzy, przed
bastionem lej. **Przydział jednostki do toru jest rozkazem** — zmieniasz go dowolnie
i w każdej chwili (przyciski TOR 1/2/3 · ROZDZIEL, klawisze `Q/W/E/R`). Przerzut
kosztuje czas przejazdu, nie kredyty. Przy kształcie `'1'` torów jest wszędzie jeden
i cały mechanizm jest niewidoczny.

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
