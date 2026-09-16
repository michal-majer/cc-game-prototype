# FRONT — prototyp (PixiJS)

Strategiczny auto-battler / dieslowe RTS z boku. Budujesz budynki na siatce,
jednostki maszerują i walczą same — Ty podejmujesz decyzje ekonomiczne,
przestrzenne i kontrujące, oraz ustawiasz linię natarcia.

To jest port oryginalnego prototypu (jeden plik Canvas 2D) na **PixiJS**, tak by
łatwo dodawać **grafikę i dźwięk**. Gra celuje w **PC** (Steam przez Electrona albo
Tauri); wersja w przeglądarce zostaje jako darmowe demo.

**Mapa jest dużo większa od ekranu i przewijana** (misja 6 to 3 600 px korytarza).
Kamera jest oknem, nie skalowaniem do ekranu: domyślnie jedzie za frontem, misja
startuje na bazie, a minimapa nad suwakiem linii pokazuje całość i okno widoku.
`⌖ FRONT` / `⌂ BAZA` (klawisze `F` / `B`) wracają do prowadzenia, przeciągnięcie
pola je zwalnia, kółko przybliża.

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
- **Rozkaz drogowy** (przyciski po prawej nad paskiem budowy): nazwa drogi ściąga na
  nią całą armię, ROZDZIEL rozkłada ją po równo. Każdy przycisk pokazuje cele swojej
  drogi i ile z nich trzymasz. Widoczne tylko tam, gdzie dróg jest więcej niż jedna.
- **Kamera:** `⌖ FRONT` jedzie za linią styku, `⌂ BAZA` wraca na siatkę, przeciągnięcie
  pola zwalnia prowadzenie. **Minimapa** nad suwakiem linii: klik = przewiń tam.
- **Klawiatura:** `1–5` linia, `←/→` linia, `Spacja` GOTÓW / natarcie / odwrót,
  `+/−` prędkość, `1/2/3` wybór karty, `Q/W/E/R` tory, `F/B` kamera, `Esc` odznacz / menu.

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
  sectors.js      cele na drogach: przejmowanie i zysk każdego rodzaju
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
Pomiar z 13.09.2026 (gra dowolna): 8 partii, 0 zwycięstw, bastion 0–3%.
Pomiar z 15.09.2026 (misja 6): porażka, fala 39–42, 18–19 min, bastion 0%, a armia
stoi 643 px od bastionu od 8. fali — wróg skaluje się szybciej (269 jednostek na
polu wobec 182). Rozbiór na liczby: `FRONT.md` §3, „Pomiar 15.09.2026".

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

### Misja kampanii jest autorska, nie losowana

Układ złóż (`ore`) i plan fal (`waves`) każdej misji są **zapisane z ręki** —
inaczej nie da się jej zbalansować ani zmierzyć.

```js
ore:['....#.',                              // # ruda · o uboga · . puste
     '......',
     '..#...'],
waves:[{t:45, inf:2}, {t:38, inf:3}, …],    // t = sekundy DO tej fali
```

Przy planie wróg się nie rozbudowuje, a szturm kończy się tam, gdzie kończy się
lista. Losowanie (ruda, doktryna, warianty pola, eskalacja) zostaje **grze dowolnej**.
Wszystkie sześć misji ma dziś plan z ręki; `checkWavePlan` pilnuje trzech błędów
w danych, których nie widać po liczbach (plan krótszy od terminu, `after` poza
planem, odstęp fali ≥ 60 s). Misja może też **dopisać** wymaganie budynku
(`reqAdd`) albo je **zdjąć** (`reqDrop`) — finał korzysta z drugiego, żeby
bateria artylerii wymagała fabryki zamiast laboratorium.

Skala planu to **liczba budynków wroga na falę**: proceduralny przeciwnik
wystawia jedną jednostkę na budynek i rośnie o ~1 budynek na falę, więc plan,
który brzmi groźnie, bywa trzykrotnie za ciężki. Krzywe z misji obronnych nie
przenoszą się na polowe — tam armia jest rozciągnięta na trzy drogi i ma jeszcze
nacierać.

Krzywe są **kalibrowane botem**, nie na wyczucie:

| | wygrane | czas | sztab min | stracone obiekty |
|---|---|---|---|---|
| M1 | 3/3 | 2:14 | 100% | 0 |
| M2 | 3/3 | 5:57 | 55% | 13 |
| M3 | 1–2/3 | 3:03 | 100% | 0 |
| M4 | 3/5 | 5:51 | 64% | 11 |
| M5 | 2/5 | 6:25 | 81–93% | 14 |
| M6 | **0/2 — nieprzechodnia** | 38:00 | 100% | 0 |

Bot to dolna granica — nie kituje, nie rozgrywa suwaka, nie przesuwa budynków.
Wyzwanie robi **rytm (szpice i oddechy), nie masa**: przy potrójnej liczbie
piechoty, ale równym strumieniu, bot wygrywał ze sztabem na 100%. Krzywa jest
też związana z **kosztem kratki** — powrót działek na siatkę zabrał misji 2 cały
stopień trudności (ta sama krzywa: 0/3 zamiast 3/3), a klif jest ostry: +1 s na
falę to wciąż 0/3, +2 s to 3/3. Szczegóły i pomiary: `FRONT.md` §3b.

### Siatka bazy, działka i PRZESUŃ

Działko (GNIAZDO RAK.) **stoi na kratce** i konkuruje o nią z rafinerią i barakiem —
to jest jego prawdziwa cena. Osobne stanowiska przed bazą były tu przez chwilę
i zdejmowały decyzję: skoro nic nie kosztują poza kredytami, stawia się je zawsze.

Pomyłkę odkręca **PRZESUŃ** (od misji 2): budynek idzie na inną kratkę za **25 %
wkładu** (kupno + ulepszenia) i jest przez **3 s martwy**. Rozbiórka jest wyjściem
z martwego budynku, PRZESUŃ — z martwego układu.

Siatka bazy rośnie przez całą kampanię i **nigdy się nie kurczy**: 18 kratek w misji 1
(6×3, najciaśniej), 24, 30→35, 35→42, potem 42. Każdy zajęty cel na drodze daje raz
nową kolumnę — **miejsce jest nagrodą za teren, nie stanem wyjściowym**.

### Przejście między misjami

Nowa misja to nie nowa plansza. Budynki, ulepszenia, kredyty i wyeksploatowane
złoża zostają; dochodzi plansza (dłuższe pole, drogi, cele) i przestawia się widok
przy zachowanym zoomie. Armia ginie — front zostaje za nami, wojsko odbudowujesz.

### Rozmiar mapy

Długość korytarza to **jedna liczba w danych misji** (`len`), a wszystko na nim —
stanice, mini-sztaby, progi kształtu, przyczółek wroga — podane jest **ułamkami**
tej długości. Skaluje się z mapą także promień przejmowania i prędkość marszu
(`SPD_MUL`, wykładnik 0.6 — większa mapa to realnie dłuższy przemarsz, nie ten sam).

**Zasięgi broni i rozmiary jednostek NIE skalują się.** W zasięgach zakodowane są
kontry; przeskalowanie ich rozjechałoby wszystkie luki między jednostkami. Warstwa
taktyczna zostaje identyczna — zmienia się tylko, ile jej mieści się na mapie.

### Drogi (kształt pola 1/3/1)

Za wąskim gardłem przy bazie korytarz rozchodzi się na **niezależne drogi** i zbiega
dopiero w leju przed bastionem:

```
        /-- DROGA GÓRNA ---- [MOST] --------- [BATERIA] --\
 BAZA -|--- DROGA ŚRODKOWA ------- [WĘZEŁ] ---------------|-- LEJ -- BASTION
        \-- DROGA DOLNA -- [SKŁAD] ------ [WIEŻA] -------/
```

**Każda droga ma swoje cele, a każdy rodzaj daje co innego:** MINI-SZTAB kredyty,
MOST moc, SKŁAD kratki, WIEŻA radar, BATERIA ścina fale wroga o 25%. Do tego każdy
zajęty cel daje raz nowe kratki. Dlatego „którą drogą" jest decyzją o zysku, nie
o kierunku — a `ROZDZIEL` i `CAŁOŚĆ NA GÓRNĄ` to realnie różne plany.

Drogi są **od siebie oddalone** (300 px między osiami) i mogą być **różnej długości**
— łuk zewnętrznych dróg w misji 4 daje 2 343 px traktu wobec 2 040 środkowej, czyli
15% dłuższy przemarsz za lepszy cel.

**Przydział do drogi jest rozkazem** — zmieniasz go dowolnie i w każdej chwili
(przyciski dróg, klawisze `Q/W/E/R`). Przerzut kosztuje czas przeprawy, nie kredyty.
Skupienie armii na jednej drodze przestawia też kamerę na tę drogę. Przy kształcie
`'1'` droga jest jedna i cały mechanizm jest niewidoczny.

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
