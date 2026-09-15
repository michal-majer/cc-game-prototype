# FRONT — projekt gry

> Jeden dokument na całość. Zastępuje `kampania.md`, `scenariusze.md`,
> `scenariusz-*.md` i `misja-*.md`. Stan na 14.09.2026, wieczór.
> Liczby są do sprawdzenia w grze — struktura nie.

---

## 0. Decyzje zamknięte

| Co | Decyzja | Dlaczego |
|---|---|---|
| Silnik | **PixiJS, zostaje** | Kod skończony; wszystko, co poprawia grę, jest niezależne od silnika. Precedens: Vampire Survivors sprzedał milion kopii na Phaserze + Electronie, zanim ktokolwiek tknął temat przepisania |
| Repo | **to samo, `cc-game-prototype` → `front`** | Wartość siedzi w `config.js` i w historii gita. Nowe repo = „przepiszę przy okazji" |
| Cel platformowy | PC / Steam przez Electrona, przeglądarka jako demo | Konsole nie są celem |
| Zakres v1 | **jeden świat, sześć misji, + gra dowolna** | Wszystko inne po premierze |
| Wycięte z v1 | rozkazy generała, generałowie jako postacie, kampania wieloświatowa | Najdroższe otwarte wątki |

---

## 1. Trzy pojęcia

**Misja** — jeden krok frontu. 8–15 minut. Ma cel z danych i warunek wygranej.

**Świat (scenariusz)** — jedna mapa, jeden bastion, jeden kształt pola, jedna
doktryna wroga, sześć misji. 1,5–2 godziny. Kończy się rozstrzygnięciem.
Świat to **dane, nie kod**: ramka misji nie wie, czy gra kampanię, czy grę dowolną.

**Przebieg** — w v1 to jeden świat. W v2 (patrz §8) kilka światów z wyborem kolejności.

Gdzie to siedzi w kodzie: `src/missions.js` (dane) → `src/campaign.js` (ramka)
→ `src/game.js` (budowa pola i ścieżka misji) → `src/menu.js` (ekrany).

---

## 2. Mapa i kształt pola: 1 / 3 / 1

**Mapa jest dużo większa od ekranu i przewijana.** To nie jest kosmetyka — to zmienia
rolę kamery i wymusza, żeby geometria była danymi, nie stałymi.

### Mapa jako jedna liczba

Długość korytarza to `len` w danych misji. **Wszystko na korytarzu podane jest
UŁAMKAMI tej długości**, nie pikselami: stanice (`STANCES.f`), progi kształtu
(`SHAPES[].f`), pozycje mini-sztabów, przyczółek wroga (`spawnF`), promień
przejmowania. Bez tego każda zmiana rozmiaru mapy znaczyłaby ręczne przeliczanie
pięciu miejsc naraz, za każdym razem.

Stan: misje 1–2 to 1 300 px, misja 3 — 2 100, misje 4–5 — 3 200, misja 6 — 3 600.
Dawne pole miało 760 px.

**Co skaluje się z mapą, a co nie** — i to jest tu cała ostrożność:

| Skaluje się | Nie skaluje się |
|---|---|
| stanice, sektory, progi kształtu | **zasięgi broni** — w nich zakodowane są KONTRY |
| promień mini-sztabu, smycz łowcy | rozmiary jednostek |
| przerzut między torami | `ENGAGE_BAND`, `CONTACT`, `BAS_RANGE` |
| prędkość marszu (`SPD_MUL`) | HP, obrażenia, tempo strzału |

Przeskalowanie zasięgów rozjechałoby wszystkie luki między jednostkami — a to one
są grą. Dlatego warstwa taktyczna (kilkadziesiąt pikseli) zostaje identyczna,
a zmienia się tylko, ile tej warstwy mieści się na mapie.

**`SPD_MUL` — prędkość marszu, wykładnik podliniowy 0.6.** Przy 1.0 czas przejścia
byłby taki sam jak na starej mapie, czyli większa mapa nie dawałaby nic poza
ładniejszym widokiem. Przy 0.6 pole ×4 daje marsz ~1,7× dłuższy: mapa realnie
jest większa, a nie jest slalomem przez pustkę. To jest pokrętło tempa.

### Kamera jest oknem, nie skalowaniem do ekranu

Dawniej kamera dobierała zoom tak, by **zmieścić całe pole** — przy polu 3 200 px
znaczyłoby to jednostki po kilka pikseli. Teraz:

- domyślny zoom wypełnia pasmo **w pionie** (cały korytarz od góry do dołu),
  a w poziomie się przewija; na telefonie wygrywa szerokość, bo inaczej widać
  10% mapy i nawet nie sąsiedni tor;
- zoom out sięga **całego pola** — ale to wybór gracza, nie stan domyślny;
- **kamera sama jedzie za frontem**; chwycenie pola przełącza ją w tryb wolny,
  a `⌖ FRONT` / `⌂ BAZA` (klawisze `F` / `B`) wracają do prowadzenia;
- **misja startuje na BAZIE**, nie na froncie: przed pierwszą falą gracz tylko
  buduje, a buduje w bazie. Na pierwszej fali kamera sama przechodzi na front,
  o ile gracz nie wziął jej w swoje ręce;
- **minimapa** (pasek nad suwakiem linii) pokazuje całość: bazę, korytarz, kto
  trzyma które mini-sztaby, jednostki obu stron, linię frontu i **okno widoku**.
  Klik przewija. Bez niej duża mapa jest karą, nie funkcją.

Wysokości paneli HUD-a są **mierzone z DOM** (`--top-h`), nie zgadywane — pasek
górny zawija się inaczej na każdej szerokości i każda sztywna liczba była tam
kiedyś błędna.

### Kształt korytarza

Korytarz nie ma stałej szerokości:

```
   BAZA │ 1 tor  │      3 tory      │ lej │ BASTION
        └─wąskie─┴──── środek ──────┴──1──┘
```

- **Przy bazie — jeden tor.** Naturalne wąskie gardło, naturalna obrona gracza.
- **Środek — trzy tory.** Jedyne miejsce, gdzie istnieje wybór kierunku.
- **Przed bastionem — lej.** Przewagi liczebnej **nie da się wprowadzić naraz**.

Kształt siada na istniejący suwak linii bez nowej koncepcji: OBRONA i PRZEDPOLE =
wąskie gardło, ŚRODEK = rozszerzenie, NACISK i NATARCIE = lej.

Odrzucone: wariant 1/3/2/1. Każde przejście między szerokościami to miejsce, gdzie
jednostki muszą się rozdzielić albo złączyć — dwa przejścia to dwa razy mniej rzeczy
do zepsucia niż trzy. Wariant z dwoma torami przy bastionie zostaje jako **kształt
drugiego świata** (`'1-2-1'` w `SHAPES`): darmowa różnorodność bez nowego kodu.

### Konsekwencje techniczne — PRZED dopieszczeniem misji 1

1. **`lane` jako pole jednostki wchodzi do symulacji od początku**, nawet jeśli przez
   trzy pierwsze misje zawsze wynosi 0. Inaczej w środku kampanii przepisujesz
   `sim.js`, `enemy.js` i `sectors.js` na gotowej, dopieszczonej misji.
2. **Tor jest funkcją pozycji, nie stanem globalnym:** `lanesAt(x) → 1 | 3`.
3. **Przydział do toru jest ROZKAZEM.** `u.lane` gracz zmienia dowolnie i w każdej
   chwili: rozdziela armię na tory, ściąga wszystko na jeden, przerzuca w trakcie
   walki (`setArmyLane`, przyciski TOR 1/2/3 · ROZDZIEL, klawisze Q/W/E/R).
   Przerzut kosztuje czas przejazdu (`LANE_SHIFT`), nie kredyty.
4. **Wróg liczy siły per tor** — tylko w strefie szerokiej. W wąskiej jak dziś.
5. **Sektory idą za kształtem:** PRZEDPOLE 1, ŚRODEK **3 (po jednym na tor)**,
   NACISK 1. „Przejmij środek" znaczy „wygraj na dwóch z trzech torów",
   a `terrIncome()` płaci proporcjonalnie — za darmo, z kształtu.
6. **Przepustowość leja to jedna liczba** (`h` ostatniej strefy w `SHAPES`) —
   główne pokrętło misji 6. HP bastionu rusza się OSTATNIE.
7. **Zwężenie jest stopniowe, nie skokowe.** Liczba torów jest dyskretna (nie ma
   półtora toru), ale szerokość przechodzi łagodnie przez pas `TAPER_F`: lej ma
   ściskać coraz mocniej w miarę podchodzenia, a nie ciąć pole pionową ścianą.
   Gracz czyta z pola, ile jeszcze ma miejsca — i to JEST mechanika misji 6.

---

## 3. Świat I — „PIERWSZY FRONT"

Kształt 1/3/1, doktryna stała, misje autorskie, kolejność sztywna.
Zasada nadrzędna: **jedna misja = jedna nowa rzecz dla gracza i jedna dla wroga.**

| # | Kryptonim | Cel | Nowe u gracza | Nowe u wroga | Kształt |
|---|---|---|---|---|---|
| 1 | PIERWSZY DZIEŃ | Zbierz X kredytów → jedna fala | elektrownia, rafineria | piechota | 1 tor |
| 2 | ŚCIANA | Odeprzyj 8 fal | baraki, działko | tempo i masa | 1 tor |
| 3 | PUNKT | Przejmij sektor | łazik **albo** rakietowiec, radar, suwak (2 poz.) | mini-baza jako punkt startu fal | 1 tor |
| 4 | ROZWIDLENIE | Przejmij 2 z 3 sektorów środka | czołg, mini-baza wysunięta | pojazdy, kontry | **3 tory** |
| 5 | POD OSTRZAŁEM | Utrzymaj środek / dojdź do leja | budynki torowe, karty | ostrzał po torach | 3 tory → lej |
| 6 | LEJ | Zniszcz bastion | pełny suwak, artyleria, ciężkie | bastion bije w gardło | lej |

Treść każdej misji (czego uczy, co jest odchudzone, czego świadomie nie ma)
siedzi w komentarzach `src/missions.js` — przy danych, nie obok nich.

### Misja 1 — PIERWSZY DZIEŃ

**Uczy:** ekonomia ma stawkę.

Cel ekonomiczny, ale **zegar tyka i po nim przychodzi jedna fala**. Nie musi być
wyzwaniem — odpierasz ją działami bazy — ale gracz widzi, po co była ekonomia.
Sama checklista („zbierz X, postaw elektrownię") uczy interfejsu, nie gry.
W danych robi to `goal.after: 1` — cel nie zalicza się przed pierwszą falą.

Portret generała z jednym zdaniem zamiast samouczka. Pasek budowy pokazuje **dwa
budynki**. Nie ma: suwaka, sektorów, kart, radaru, wariantów pola, eskalacji,
rozbiórki, ulepszania.

*Do kalibracji:* cel kredytowy (ma wymusić oba budynki, nie samo czekanie) · czas do
fali · siła fali (działa bazy mają ją odeprzeć nawet przy słabej zabudowie) · rozmiar
siatki · kredyty startowe.

### Misja 2 — ŚCIANA

**Uczy:** kredyty trzeba zamienić w armię; baraki i działko robią różne rzeczy.
Pierwsza misja, w której da się przegrać.

**Ciaśniejsza siatka, inne ukształtowanie** — ten sam zestaw budynków, inne pole.
Czyta się jako obrona, nie ekspansja. Fale 1–3 działko wystarcza; 4–8 potrzebne baraki.

*Pułapka:* pokusa zrobienia tower defense na własnych zasadach. **Nie.** Cokolwiek tu
wejdzie, musi mówić tym samym słownictwem co reszta gry — inaczej gracz nauczy się
rzeczy, która zniknie w misji 3, i odbierze to jako cofnięcie.

### Misja 3 — PUNKT

**Uczy:** teren płaci, wywiad kosztuje, linia to wybór. Pierwsze wyjście poza bazę.

Suwak z **dwiema pozycjami**. Jeden mini-sztab na przedpolu. Wróg ma mini-bazę —
to z niej startują fale. Po przejęciu sektora: **nowe kratki przy froncie**
(`gridMax` w danych misji, `growGrid()` w ramce).

*Radar świadomie tutaj, nie w misji 4* — wywiad ma sens, gdy walczysz o punkt i nie
wiesz, co nadchodzi. W misji obronnej byłby ikoną.

*Nowe kratki to nie ozdoba* — pierwszy realny zlew na kredyty i odpowiedź na „siatka
pełna, 1 700 kredytów bez zastosowania".

### Misja 4 — ROZWIDLENIE

**Uczy:** nie możesz być wszędzie naraz.

Front dochodzi do rozszerzenia, **kamera odjeżdża** (`camX` w danych misji), gracz
pierwszy raz widzi skalę pola. Trzy tory, trzy mini-sztaby. Cel: **dwa z trzech** —
gdyby wymagał trzech, misja byłaby powtórką trójki razy trzy; przy dwóch gracz
**wybiera, który tor odpuszcza**, i to jest pierwsza prawdziwa decyzja strategiczna.

*Odchudzona świadomie:* pierwotnie miała czołg, radar, tory, budynki torowe, kartę
i mini-bazę — sześć nowych rzeczy naraz, nie do przetestowania.

### Misja 5 — POD OSTRZAŁEM

**Uczy:** utrzymanie jest trudniejsze niż zdobycie. Przygotowanie do finału.

Bastion **ostrzeliwuje tory** — cyklicznie, **z zapowiedzią**, w losowej kolejności.
Bez zapowiedzi to podatek losowy; z zapowiedzią to decyzja: ewakuować tor (przerzut
rozkazem) czy przyjąć i odbudować. Ta sama mechanika bije w misji 6 po wąskim
gardle, więc gracz wchodzi do finału, już ją znając.

Karty wchodzą dopiero tutaj: przez cztery misje armia rosła zabudową i terenem.
Karty są odpowiedzią na moment, w którym zabudowa przestaje wystarczać.

**Jeśli coś ma wypaść z zakresu — to ta misja.** Jej treść rozkłada się na 4 i 6.

### Misja 6 — LEJ

**Uczy:** rozwinięta baza nie pomaga tak, jak się gracz spodziewa.

Problem: **finał z pełną bazą trwa minutę i jest antyklimaksem.** Podbicie HP bastionu
tego nie naprawia — wydłuża to samo. Naprawia **kształt**: w leju trzydzieści
jednostek wchodzi po kilka, a bastion bije w zwężenie. Siła przestaje być
odpowiedzią, **kolejność wejścia** zaczyna nią być.

*Odrzucone:* finał jako obrona trzech torów — ładne tematycznie, ale powtarzało
misję 5 i nie dawało zamknięcia.

*Do kalibracji:* **przepustowość leja — główne pokrętło tej misji** · HP bastionu
(ostatnie, co ruszasz) · zasięg i tempo ostrzału · czas przejścia: cel 12–18 min,
poniżej 5 = misja zepsuta.

---

## 4. Zasady, bez których to się rozsypie

1. **Punkt kontrolny na start każdej misji.** „Powtórz" wraca do niego.
2. **Wróg skaluje się numerem misji, nie bazą gracza.** (`enemy.base`, `enemy.grow`,
   `waveT` w danych misji.) Plus stały przydział kredytów na start misji, żeby
   słabsza baza mogła nadrobić.
3. **Zdobyty sektor daje nowe kratki, nie tylko kredyty.**
4. **Baza przechodzi między misjami w świecie, nie między światami.** Ulepszenia armii
   z kart zostają — dlatego migawka ma dwa osobne wiadra: `base` i `run`.
5. **Odblokowania rozłożone na całą kampanię.** Lista `unlock` misji JEST drzewkiem
   techniki; `req` z tabeli `B` działa tylko między budynkami obecnymi na tej liście.
6. **Grafika świata = podmiana kafli i koloru, nie nowa mapa.** (`TILESETS` w `assets.js`.)
   Rozmiar mapy to jedna liczba w danych misji (`len`), nie nowa geometria.
7. **Mechanika zamykana w swojej misji, liczby nigdy.** „Czołg na 100%" = arkusz
   z 4 animacjami, wersja wroga sprawdzona po odbiciu, dźwięk strzału i śmierci, wpis
   w `U` z opisem, zachowanie wroga w `enemy.js`, interakcja z kartami, przebieg bota.
   **Ale pancerz czołgu zostaje otwarty, dopóki nie istnieje to, co go kontruje.**
   Dlatego wszystkie liczby siedzą w `config.js` — powrót do misji to edycja tabeli.

---

## 5. Ocena misji

**Nie gwiazdki.** Trzy gwiazdki mówią graczowi, że przeszedł źle, i zapraszają do
powtarzania — a kampania z punktem kontrolnym jest zaprojektowana pod płynność.

**Ocena sztabu:** jedno słowo i dwie–trzy liczby.

```
PRZEŁAMANIE · Fala 8 · Straty 12 · Bastion 40%
```

Oceniamy **czas, straty, procent bastionu**. Nie oceniamy efektywności ekonomii
(choć dane są) — w misjach 1–3 gracz ma eksperymentować, a ocena za wydajność każe mu
grać optymalnie, zanim zrozumie, co jest optymalne.

**Ocena nie bramkuje postępu — odblokowuje.** Przeszedłeś, idziesz dalej zawsze.

---

## 6. Osiągnięcia

**Projektuj teraz, podłączaj na końcu.** Liczniki w `S.stat`, który już jest.
Podpięcie do Steama idzie w Electronie przez natywny mostek (Greenworks) — to
najbardziej uciążliwy kawałek drogi na Steam i nie chcesz go ruszać w październiku.

20–25 sztuk: **połowa za przejście**, **ćwierć za kuriozalne zagrania** (wygrana bez
rafinerii, bastion rozbity samą artylerią) — ta grupa jest najważniejsza marketingowo
— **reszta za grę dowolną i eskalację**. Bez osiągnięć za grind.

---

## 7. Gra dowolna

Zostaje, niezależnie od wszystkiego. **To ten sam silnik ramki:** świat ze **składaną**
listą misji z puli, losowa doktryna, warianty pola i eskalacja jak dziś.
W kodzie to rekord `SKIRMISH` w `missions.js` — `startMission('skirmish')`, nie drugi tryb.
Odblokowywana po przejściu Świata I.

Koszt, którego nie da się uniknąć: misja składana losowo musi znieść **różny stan bazy
na wejściu**. Dlatego zasady 1–2 z §4 przestają być kosmetyką i stają się warunkiem,
żeby to w ogóle działało.

---

## 8. Światy II, III i kampania wieloświatowa

### Osie zmienności

Każdy kolejny świat rusza **jedną** oś.

| Oś | Co zmienia | Gdzie |
|---|---|---|
| Kształt | szerokość korytarza | II |
| Cel | jak się wygrywa | II |
| Czym grasz | zabudowa vs armia vs zdolności | III |
| Doktryna | co robi wróg | wszystkie, darmowa |

### Świat II — „OBRONA" (kształt + cel)

Front stoi i nie ruszy się z miejsca, więc bastion trzeba dosięgnąć inaczej:
zbudować bombę, uzbroić i wystrzelić. **Bomba i obrona uzasadniają się nawzajem.**

Kształt: **wąski korytarz na całej długości** (`shape:'1'` — już jest).
Odczucie tower defense robi kształt, nie nowe zasady.

**Bomba to warunek zwycięstwa** (`win:'bomb'`), nie osobny świat. Zasada, bez której
to się psuje — bomba nie może być sposobem na wygranie bez walki: **żre moc**
(ta sama mechanika co `S.drain`) i **uzbrojenie jest sygnałem dla wroga**.

*Wymaga kodu:* `goal.kind:'bomb'` · budynek z fazami i paskiem postępu · rosnący pobór
mocy · priorytet w `enemy.js` po uzbrojeniu · ekran zwycięstwa ze strzałem.

### Świat III — „SZTAB" (czym grasz)

**Warunek wstępny: to nie jest plik danych.** Rozkazy generała są dziś pomysłem bez
kodu. Sedno to **odjęcie reszty**: trzy budynki zamiast trzynastu, minimalna armia,
cała decyzyjność w tym, kiedy wydać nalot, a kiedy odłożyć na zrzut.
**Tu generałowie stają się oddziałami z Into the Breach.**

### Kampania wieloświatowa (v2)

Co sprawia, że wyspy w ItB działają: nie ich liczba, tylko że **wybierasz kolejność**.
Arytmetyka decyduje o kształcie: Twój świat to 1,5–2 h, cztery pod rząd to maraton.
**Decyzja: v1 to jeden świat.** Ale ramkę budujesz tak, żeby światy dało się łączyć —
stan przechodzący między światami (karty, generał, eskalacja) trzymasz **osobno** od
stanu bazy. W kodzie: `snapshot()` zwraca `{ base, run }` i to jest ta różnica.

---

## 9. Kolejność robót

0. ~~Zlew kredytów w potyczce~~ — otwarte, mierzone botem (`tools/bot-test.js`).
1. ~~`lane` i `lanesAt(x)` w symulacji~~ — **zrobione**, z rozkazem torowym.
2. ~~Ramka misji~~ — **zrobione**: cel z danych, warunek wygranej, ekran między
   misjami, punkt kontrolny (`id` w `mkBuilding`, kratka trzyma `id`, `snapshot()`/`restoreBase()`).
3. **Misja 1 na gotowo** — grafika od grafika, dźwięk, portret. Log już prowadzi.
4. ~~Misja 2 na brzydko~~ — **zrobione i to był test ramki**: misja 2 działa samą
   ramką i danymi, bez dopisywania kodu w `sim.js`.
5. Misje 2–3 na gotowo, potem otwarcie środka i misje 4–6.
6. Gra dowolna na tej samej ramce — **jest**, do wyważenia.
7. **Nudny świat kontrolny** — inny kształt, inna doktryna, inne kafle, cel jak
   w jedynce, zero nowych mechanik. Sprawdza, czy da się dodać świat **bez dotykania kodu**.
8. Świat II jako pierwsza darmowa aktualizacja po premierze.
9. System rozkazów, potem Świat III. Potem kampania wieloświatowa.

---

## 10. Save / load

Kampania nie potrzebuje zapisu w środku symulacji. Potrzebuje **migawki między
misjami** — i tą migawką jest `campaign.snapshot()`. Cztery miny i co z nimi zrobiono:

1. **`S.grid[r][c].b` trzymało referencję do obiektu z `S.buildings`.**
   → `id` w `mkBuilding`, migawka zapisuje `id`, `restoreBase()` przelinkowuje.
2. **`S.doc` i `S.run.mods` to referencje do `DOCTRINES`/`MODIFIERS`.**
   → zapisujemy nazwę, nie obiekt.
3. **Karty mutują `B` i `U`.** → zapisujemy **listę wziętych kart**;
   po wczytaniu `resetTables()` + `replayCards()`. Przeżyje zmianę balansu.
4. **`S.fx`, `S.tracers`, `S.projs`, `S.corpses`** → nie zapisujemy wcale, czyścimy.

Postęp kampanii (która misja zaliczona, z jaką oceną) siedzi w `localStorage`
pod `front.camp`. Przy pakowaniu do Electrona zapis idzie do pliku.

---

## 11. Odrzucone — i dlaczego

| Pomysł | Dlaczego nie |
|---|---|
| Przepisanie na Unity | Przepisywałbyś to, co zostaje (`config.js`, `sim.js`, AI), żeby napisać to, czego jeszcze nie ma |
| Nowe repo | „Przepiszę przy okazji" w tańszym przebraniu |
| TypeScript / bundler / testy teraz | Ten sam instynkt. Po kampanii albo nigdy |
| Tory odblokowywane w misji 4 | Przepisywanie `sim.js` na gotowej misji. Stąd `lane` od początku |
| Kształt 1/3/2/1 | Trzy przejścia zamiast dwóch. Zostaje jako kształt drugiego świata |
| Misja 4 z sześcioma nowościami | Nie do przetestowania — przy porażce nie wiadomo, co zawiodło |
| Finał jako obrona trzech torów | Powtarzał misję 5, nie dawał zamknięcia |
| Podbicie HP bastionu na finał | Wydłuża antyklimaks zamiast go usuwać. Naprawia kształt (lej) |
| Trzy gwiazdki za misję | Zaprasza do powtarzania w grze zaprojektowanej pod płynność |
| Osiągnięcia za grind | W grze na 4–6 h wiszą jako nieosiągalne |
| 4–5 światów w v1 | 6–8 godzin bez zakończenia. v1 = jeden świat, ale ramka gotowa na łączenie |
| Warianty pola w misjach kampanii | Losowy modyfikator na dopieszczonej misji 1 to nie różnorodność, tylko szum. Warianty zostają grze dowolnej |
