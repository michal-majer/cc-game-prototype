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

### Drogi — niezależne trakty z własnymi celami

Korytarz **nie jest jedną rurą z pasami**. Za wąskim gardłem przy bazie rozchodzi
się na osobne drogi i zbiega dopiero w leju przed bastionem:

```
        /-- DROGA GÓRNA ---- [MOST] --------- [BATERIA] --\
 BAZA -|--- DROGA ŚRODKOWA ------- [WĘZEŁ] ---------------|-- LEJ -- BASTION
        \-- DROGA DOLNA -- [SKŁAD] ------ [WIEŻA] -------/
```

Trzy rzeczy, które to musi spełniać — i one wymuszają cały ten model:

1. **Każda droga ma SWOJE cele, i każdy daje CO INNEGO.** Bez tego wybór drogi
   jest wyborem geometrii, a nie decyzją.
2. **Drogi są od siebie oddalone.** Nie trzy cienkie pasy w jednym pasie, a
   osobne trakty z pustką między nimi (`roadGap`, domyślnie 300 px = 30–75
   szerokości jednostki). Walka na górnej nie przelewa się na dolną — inaczej
   „rozdziel siły" nic nie znaczy.
3. **Drogi mogą być różnej długości.** Łuk (`bow`) wybrzusza drogę na zewnątrz,
   więc przemarsz nią jest realnie dłuższy. Pomiar misji 4: górna i dolna mają
   2 343 px traktu, środkowa 2 040 — **15% dłuższa droga za lepszy cel** to
   koszt alternatywny, a nie inny kolor.

**Przydział do drogi jest ROZKAZEM.** `u.lane` to numer drogi i gracz zmienia go
dowolnie, w każdej chwili: rozdziela armię po równo (`ROZDZIEL`), ściąga wszystko
na jedną (`GÓRNA` / `ŚRODKOWA` / `DOLNA`, klawisze `Q/W/E/R`), przerzuca w trakcie
walki. Przerzut kosztuje czas przeprawy w poprzek, nie kredyty. Skupienie armii na
jednej drodze **przestawia też kamerę na tę drogę** — jeden rozkaz, nie rozkaz plus
szukanie jej wzrokiem.

#### Rodzaje celów (`SECT_KINDS` w config)

| Cel | Daje, dopóki trzymasz | Po co go brać |
|---|---|---|
| **MINI-SZTAB** ★ | +5 kr./s | najprostszy zysk, skaluje wszystko |
| **MOST** ╬ | +10 mocy | wpina się do sieci jak elektrownia — budynki, które inaczej się nie zmieszczą |
| **SKŁAD** ▣ | +2 kolumny kratek | jedyny sposób na więcej miejsca w bazie; zlew na nadwyżkę |
| **WIEŻA** ◉ | +1 poziom radaru | realna alternatywa dla radaru za 350 kr. |
| **BATERIA** A | ich fale −25% | **jedyna rzecz w grze, która ZMNIEJSZA nacisk wroga** |

Do tego **każdy** zajęty cel daje raz nowe kratki (§4.3), a **cel jest zawsze
rozpoznany**: radar ukrywa skład fal wroga, nie ukształtowanie terenu. Wybór drogi
ma być decyzją podjętą z wiedzą, co na której jest — ukrycie tego za radarem
zamieniłoby „którą drogą" w rzut monetą.

Dzięki temu „rozdziel siły" i „skup się na jednej" to realnie **różne plany**:
dwie drogi po kredyty to inna partia niż jedna po radar i osłabienie.

**Barierka na dane:** cel nie może leżeć dalej, niż sięga najdalsza stanica, jaką
misja daje. Misja 3 miała suwak z dwiema pozycjami i cel w połowie pola — bot grał
ją do 6. fali bez szans. Cel, do którego misja nie pozwala dojść, jest misją
nieprzechodnią, nie trudną, więc `applyRoadObjectives` przycina go i krzyczy
w konsoli.

### Kształt korytarza

Gardło przy bazie i lej przed bastionem to **wspólny** korytarz; drogi żyją między
nimi. Korytarz nie ma stałej szerokości:

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
5. **Cele należą do DRÓG, nie do pola:** każda droga wnosi swoje, a cel liczy
   tylko jednostki ze swojej drogi. „Opanuj 2 z 3 dróg" (`goal.kind:'roads'`)
   znaczy „trzymaj cel na dwóch różnych drogach" — czyli: którą odpuszczasz.
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
| 1 | PIERWSZY DZIEŃ | Zarób X kredytów → jedna fala | elektrownia → rafineria | piechota | 1 droga |
| 2 | ŚCIANA | Odeprzyj 10 fal | baraki, działko, rozbiórka, **PRZESUŃ** | tempo i masa | 1 droga |
| 3 | PUNKT | Zajmij cel (od 3. fali) | łazik **albo** rakietowiec, radar, suwak (2 poz.) | mini-baza jako punkt startu fal | 1 droga |
| 4 | ROZWIDLENIE | Trzymaj 2 z 3 **dróg** (fale 8–14) | czołg, mini-baza wysunięta | pojazdy, kontry | **3 drogi** |
| 5 | POD OSTRZAŁEM | 2 drogi przez 4 fale z rzędu (do 14.) | budynki torowe, karty | ostrzał po torach, rakietowcy | 3 tory → lej |
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

**Rafineria WYMAGA elektrowni** (`reqAdd` w danych misji). Bez tego misja o ekonomii
przechodziła się JEDNYM budynkiem: sztab daje 4 mocy, rafineria bierze 2, więc prąd
był zbędny — pomiar pokazał wygraną w 0:59 z samą rafinerią. Teraz oba są naprawdę
wymuszone, a „najpierw prąd" jest lekcją, nie ozdobą.

*Do kalibracji:* cel kredytowy · czas do fali · siła fali (działa bazy mają ją
odeprzeć nawet przy słabej zabudowie) · kredyty startowe.

#### Działka są częścią bazy — i dlatego trzeba planować

Działko (GNIAZDO RAK.) **stoi na kratce budowy**, tak samo jak barak i rafineria.
Jego prawdziwą ceną nie są kredyty, a miejsce.

Była tu druga wersja — osobne STANOWISKA OGNIOWE przed bazą, po to, by działko
nie konkurowało o kratkę. Zdjęła decyzję: z osobnym stanowiskiem gniazdo nic nie
kosztuje poza kredytami, więc stawia się je zawsze i nie ma czego planować.
Wróciło na kratkę, a problem „pomyliłem się i nie mam jak tego odkręcić"
rozwiązuje **PRZESUŃ**.

#### PRZESUŃ — plan da się poprawić, ale nie darmowo

Każdy budynek poza sztabem można przenieść na inną kratkę:

- koszt **25 % wkładu** (`MOVE_FRAC`) — kupno plus wszystkie ulepszenia, więc
  przenoszenie rozbudowanej rafinerii boli, a świeżo postawionej prawie nie;
- budynek jest **3 s martwy** (`MOVE_SEC`) — nie strzela, nie produkuje, nie
  daje mocy; przeprowadzka w środku szpicu to realne ryzyko;
- odblokowane od **misji 2** (`feats.move`), razem z rozbiórką i naprawą.

Rozbiórka zwraca część kredytów i zwalnia kratkę; PRZESUŃ zachowuje poziom
ulepszeń i HP. Pierwsza jest wyjściem z martwego budynku, druga — z martwego
układu.

#### Siatka bazy rośnie z kampanią i nigdy się nie kurczy

| misja | kratki | z czego |
|---|---|---|
| 1 | **18** (6×3) | najciaśniej w całej kampanii |
| 2 | 24 (6×4) | + wiersz |
| 3 | 30 → 35 (6×5 → 7×5) | rośnie za zajęty teren |
| 4 | 35 → 42 (7×5 → 7×6) | rośnie za zajęty teren |
| 5–6 | 42 (7×6) | `GRID_MAX` — dalej rosną drogi, nie baza |

**Miejsce jest nagrodą za teren, nie stanem wyjściowym.** Każdy zajęty cel na
drodze daje raz nową kolumnę kratek (§4.3), SKŁAD dwie.

Siatka jest **monotoniczna**: `applyMission` bierze `max` z siatki misji i siatki
przeniesionej z poprzedniej, więc kratka raz zdobyta zostaje. Bez tego misja 2
(6×4) zabierała kolumnę wywalczoną w misji 1 rozbudowanej do 7×3 — gracz widział
regres tam, gdzie obiecaliśmy wzrost.

*Mina, na którą się nadziałem — i to dwa razy:* misja 1 nie ma rozbiórki, więc
jedno miejsce na rafinerię znaczy, że gracz **bezpowrotnie blokuje tutorial**,
stawiając tam elektrownię 1×1. Test na 200 losowaniach siatki: **106 układów
dało się w ten sposób zabić**, a 3 nie miały miejsca na rafinerię w ogóle.

Dwie poprawki nie pomogły i warto wiedzieć dlaczego:
- „gwarantuj trzy kotwice" **zdzierało całą żyłę** goniąc za liczbą, której na
  18 kratkach nie ma — jeden przebieg na trzy kończył się bazą bez rudy;
- „gwarantuj dwie kotwice" liczyło się **przed postawieniem sztabu**, więc
  broniło kratek, które sztab i tak zabierał (125/200 dalej do zablokowania).

Działa dopiero to: `ensureRefinerySpot()` woła się **po** postawieniu sztabu,
wymaga **dwóch ROZŁĄCZNYCH** kotwic 2×2 (dwie dzielące kratkę nie pomagają —
jedna elektrownia zabija obie) i zamiast zdzierać rudę **przesuwa całe złoże**:
ta sama ilość, inne miejsce. Wynik: **200/200 bez zakleszczenia**, minimum trzy
miejsca na rafinerię.

### Misja 2 — ŚCIANA

**Uczy:** kredyty trzeba zamienić w armię; baraki i działko robią różne rzeczy.
Pierwsza misja, w której da się przegrać.

**Ciaśniejsza siatka, inne ukształtowanie** — ten sam zestaw budynków, inne pole.
Czyta się jako obrona, nie ekspansja. Pierwsze fale działko wystarcza; dalej potrzebne baraki.

**Działkiem startowym jest GNIAZDO KM, nie rakietowe.** Przez chwilę jedynym
gniazdem na pasku było GNIAZDO RAK. — gracz dostawał odpowiedź na pancerz,
zanim zobaczył pierwszy pojazd, a „barak czy gniazdo?" było wyborem między
piechotą a bronią przeciwpancerną, czyli nie tym wyborem, o który w tej misji
chodzi. KM bije szybko i płasko, więc pancerz (płaska redukcja!) tnie mu
obrażenia najmocniej: na piechotę jest świetny, na łazika ledwo wystarcza.
Dzięki temu **pierwszy pojazd w fali trzeciej naprawdę coś znaczy** — i to jest
moment, w którym misja przestaje być samym stawianiem działek.

*Pułapka:* pokusa zrobienia tower defense na własnych zasadach. **Nie.** Cokolwiek tu
wejdzie, musi mówić tym samym słownictwem co reszta gry — inaczej gracz nauczy się
rzeczy, która zniknie w misji 3, i odbierze to jako cofnięcie.

**Szturm jest SKOŃCZONY: osiem fal i ani jednej więcej** (`enemy.waves`), a wróg
w tej misji **idzie, nie stoi** (`enemy.assault`). Domyślna logika wroga modeluje
FRONT: trzyma linię i naciera dopiero, gdy uzbiera przewagę. W misji obronnej
znaczyło to, że przy porządnej obronie NIE NACIERA NIGDY — stał tysiąc pikseli od
bazy, pole się nie czyściło i „odeprzyj 8 fal" nie kończyło się nawet po dwudziestu
dwóch (pomiar: 12:27 w misji liczonej na pięć minut). To nie front, tylko szturm
na bazę — i tak się teraz zachowuje.

### Misja 3 — PUNKT

**Uczy:** teren płaci, wywiad kosztuje, linia to wybór. Pierwsze wyjście poza bazę.

Suwak z **dwiema pozycjami**. Jeden mini-sztab na przedpolu. Wróg ma mini-bazę —
to z niej startują fale. Po przejęciu sektora: **nowe kratki przy froncie**
(`gridMax` w danych misji, `growGrid()` w ramce).

*Radar świadomie tutaj, nie w misji 4* — wywiad ma sens, gdy walczysz o punkt i nie
wiesz, co nadchodzi. W misji obronnej byłby ikoną.

*Nowe kratki to nie ozdoba* — pierwszy realny zlew na kredyty i odpowiedź na „siatka
pełna, 1 700 kredytów bez zastosowania".

**Cel nie zalicza się przed 3. falą** (`goal.after`). Bez tego misja kończyła się
w 1:21 na drugiej fali — czyli zanim gracz w ogóle zobaczył, po co był radar.

### Misja 4 — ROZWIDLENIE

**Uczy:** nie możesz być wszędzie naraz.

Front dochodzi do rozszerzenia, **kamera odjeżdża** (`camX` w danych misji), gracz
pierwszy raz widzi skalę pola. Trzy tory, trzy mini-sztaby. Cel: **dwie z trzech dróg** —
gdyby wymagał trzech, misja byłaby powtórką trójki razy trzy; przy dwóch gracz
**wybiera, którą drogę odpuszcza**, i to jest pierwsza prawdziwa decyzja
strategiczna. Górna daje moc i osłabia ich fale, ale jest najdłuższa; środkowa
jest krótka i płaci kredytami; dolna daje miejsce w bazie i wywiad.

*Odchudzona świadomie:* pierwotnie miała czołg, radar, tory, budynki torowe, kartę
i mini-bazę — sześć nowych rzeczy naraz, nie do przetestowania.

**Cel ma dwie bramki, nie jedną.** Pomiar bez planu fal: misja kończyła się
w **1:54 na trzeciej fali**, przy dziesięciu wrogach na polu i zerze strat —
armia startowa brała dwie drogi, zanim wróg w ogóle zaistniał. „Nie możesz być
wszędzie naraz" nie miało jak być prawdą. Stąd `after: 8` (zajęcie nie kończy
misji, dopóki nie przyjdzie nacisk, który każe dróg BRONIĆ) i `before: 14`
(a jeśli do czternastej fali nie trzymasz dwóch — przegrywasz). Panel celu mówi
o tym wprost: przy spełnionym celu przed czasem pokazuje „ZALICZY SIĘ OD FALI 8",
bo reguła, o której gracz dowiaduje się po fakcie, nie jest regułą.

Masa fal, cztery krzywe o tym samym rytmie:

| szczyt planu | wygrane | sztab min | stracone obiekty |
|---|---|---|---|
| 55 jedn. | 0/3 | 7 % | 21 |
| 32 jedn. | **1/3, potem 0/3** | 37 % → 7 % | 16 → 24 |
| 24 jedn. | **5/5** | 100 % | **0** |
| **28 jedn.** | **3/5** | **64 %** | **11** |

Cienka nie jest łatwiejszą wersją misji, tylko żadną: bot wygrywa dokładnie na
fali 8, czyli bramka `after` kończy misję, zanim cokolwiek się wydarzy.
Krzywa 32 dała **dwa różne wyniki w dwóch seriach po trzy przebiegi** — to
lekcja nr 3 z §3b i powód, dla którego wybór stanął dopiero na pięciu.
Wybrana 28: wróg dochodzi do bazy w dwóch przebiegach na pięć, sztab schodzi
do 64 %, jedenaście obiektów przepada — misja kosztuje, ale da się ją zagrać.

### Misja 5 — POD OSTRZAŁEM

**Uczy:** utrzymanie jest trudniejsze niż zdobycie. Przygotowanie do finału.

Bastion **ostrzeliwuje tory** — cyklicznie, **z zapowiedzią**, w losowej kolejności.
Bez zapowiedzi to podatek losowy; z zapowiedzią to decyzja: ewakuować tor (przerzut
rozkazem) czy przyjąć i odbudować. Ta sama mechanika bije w misji 6 po wąskim
gardle, więc gracz wchodzi do finału, już ją znając.

Karty wchodzą dopiero tutaj: przez cztery misje armia rosła zabudową i terenem.
Karty są odpowiedzią na moment, w którym zabudowa przestaje wystarczać.

**Cel to CZTERY FALE Z RZĘDU z dwiema drogami w ręku** (`hold`), a utrata choćby
na jedną falę zeruje licznik (`S.holdT` w sim.js). Plan fal musi więc mieć czym
tę utratę wymusić: rakietowcy wchodzą w siódmej fali, dokładnie wtedy, gdy gracz
zdążył zbudować pancerkę. Termin (`before: 14`) jest z tego samego powodu co
w trójce — bez niego „utrzymaj" czeka się, a nie gra.

Pomiar bez planu: **2/2 w 3:34, wszystkie pięć celów, zero strat.** Ostrzał
bastionu bez nacisku z pola jest samym podatkiem; boli dopiero wtedy, gdy masz
w tym czasie kogo odpierać.

#### Krzywa tej misji ma inny kształt niż reszta kampanii

Lekka na starcie, ciężka od piątej fali — i to nie jest uprzejmość. **Cel
`hold` rozstrzyga się w pierwszych czterech falach:** jeśli wtedy nie da się
zająć dróg, nie ma czego utrzymywać, a żaden późniejszy nacisk tego nie
odwraca. Pomiar pokazał to jako skok, nie zbocze:

| krzywa | wygrane | sztab min | cele | wróg przy bazie |
|---|---|---|---|---|
| równomiernie ciężka | 0/5 | 29 % | **0/5** | 5/5 |
| lekka i płaska | 3/3 | 100 % | 5/5 | 0/3 |
| **lekka → ciężka** | **2/5** | 93 % | 1/5 | **3/5** |

Do tego bramka `after: 9` — seria czterech fal musi żyć jeszcze na fali 9,
czyli przeżyć oba szpice (5 i 9). Bez niej wystarczyło zająć drogi na starcie
i doczekać, a to jest dokładnie ta rozgrywka, której ta misja nie uczy.

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

#### Pomiar 15.09.2026 — dlaczego misja 6 była nieprzechodnia

Bot, styl natarcie, pole 3 600 px. Dwa przebiegi: **porażka, fala 39–42, 18–19 min
gry, 921–1046 zabitych wrogów, BASTION 0%.** Diagnostyka mówi dokładnie gdzie:

| co | wartość |
|---|---|
| najdalszy punkt, do jakiego doszła Twoja armia | **3 315 px** — i stoi tam od fali 8 do 26 |
| gardło leja | 3 284 px |
| bastion | 3 958 px |
| najbliżej, jak ktokolwiek Twój podszedł do bastionu | **643 px** (zasięg artylerii: 175) |
| siły na polu, fala 8 / 16 / 24 | wróg 48 / 132 / 269 · Ty 39 / 117 / 182 |
| stosunek sił (eRatio) | 1,24 → 1,36 → **1,85** |
| artyleria postawiona przez bota | **0** |

Trzy wnioski, osobne:

1. **To jest §9.0, nie geometria.** Armia zatrzymuje się na wylocie leja, bo
   przegrywa wojnę na wyczerpanie — wróg skaluje się szybciej (269 vs 182).
   Front w tej grze przesuwa się WYŁĄCZNIE przez lokalne wygrywanie starć;
   jednostka z celem w zasięgu nie idzie dalej, tylko strzela. Przy wiecznej
   młynce nikt nie posuwa się ani o piksel.
2. **Większa mapa nie zepsuła tego, ale obnażyła.** Na polu 760 px młynka stała
   ~100–200 px od bastionu, więc „przegrywam na wyczerpanie" i tak kończyło się
   drapaniem bastionu. Na 3 600 px młynka stoi 643 px od niego, czyli przegrana
   znaczy teraz, że bastionu **nie widzisz w ogóle**.
3. **„NACISK — artyleria dosięga BASTIONU" jest prawdą tylko na czystym polu.**
   Wybór celu bierze NAJBLIŻSZEGO wroga w 340 px; bastion jest celem dopiero,
   gdy nic bliżej nie ma. Sama stanica NACISK jest teraz poprawnie 150 px od
   bastionu na każdym rozmiarze mapy — ale to linia, na którą armia nie dochodzi.
   Do tego łańcuch radar → fabryka → laboratorium → artyleria jest tak długi, że
   pod naciskiem bot nie kończy go nigdy: zaprojektowana odpowiedź misji 6
   (artyleria i kolejność wejścia) nie trafia do gry.

#### Odpowiedź: plan fal, nie geometria

Wniosek 1 mówił, że to **§9.0 — wojna na wyczerpanie**, a nie kształt leja.
Autorski plan fal zdejmuje to u źródła, i to jednym wierszem w `sim.js`:
**przy `waves` baza wroga NIE ROŚNIE** (`if (wavePlan()) return;` przed
`eBuild`). Jego siła przestaje być wykładnicza i staje się zapisana.

Wtedy KSZTAŁT PLANU jest treścią finału, tak jak kształt leja miał być:
fale 7–9 to szczyt ich siły, dziesiąta to **okno**, a od dwunastej ich rezerwy
się kończą. Bastion zostaje sam dokładnie wtedy, gdy kolejność wejścia w lej
zaczyna cokolwiek znaczyć. Finał świadomie **bez terminu** — ma być o przełamaniu
gardła, nie o zegarze; przegrać wciąż można normalnie, bo bastion ostrzeliwuje,
a szczyt fal potrafi zjeść bazę.

**Plan fal załatwia POŁOWĘ problemu — i tę drugą połowę widać dopiero na
długim przebiegu.** Ta sama misja, ten sam rytm, dwie masy fal:

| szczyt wroga na polu | sztab min | cele | bastion | czas |
|---|---|---|---|---|
| 67 jedn. | 13 % | 0/3 | **100 %** | 6:04, porażka na 10. fali |
| **23 jedn.** | 100 % | **2/3** | 65 % | 15:49 (budżet pomiaru) |
| 23 jedn., dłuższy budżet | 100 % | 2/3 | **62 %** | **38:00** |

Przy cięższej krzywej wynik jest **identyczny jak przed planem**: armia nie
dochodzi do gardła, bastionu nie widzi. Przy lżejszej **dochodzi** — trzyma pole
ze sztabem na 100 %, zerem strat i dwoma celami z trzech.

Ale bastion **nie umiera, tylko jest drapany**: 65 % po szesnastu minutach i
62 % po trzydziestu ośmiu. To trzy procent na dwadzieścia dwie minuty, czyli
stanie w miejscu, a nie powolne zwycięstwo. Pierwszy odczyt (te 65 % na końcu
budżetu) wyglądał jak przełamanie i tak go opisałem — dłuższy przebieg pokazał,
że to plateau.

Co z tego wynika: **plan fal naprawia DOJŚCIE do gardła, nie zabicie bastionu.**

#### Drugie ogniwo: artyleria, i to jest różnica kategoryczna

| | bastion | czas | wynik |
|---|---|---|---|
| bez baterii | **62 %** | 38:00 | plateau, misja nie ma końca |
| bez baterii, pełne laboratorium | 81 % | 94:50 | to samo, dłużej |
| **jedna bateria** | **0 %** | **11:21** | **2/2, trzy cele z trzech, zero strat** |

To nie jest różnica stopnia, tylko rodzaju. Powód siedzi w zasięgach: bateria
ma **175 px**, piechota **39**. Armia stoi na linii, na którą ją posyłasz, i bije
w najbliższego wroga — bez czegoś, co sięga dalej niż ona sama, bastion nie jest
celem, tylko tłem.

**Dlaczego nikt tej baterii nie stawiał.** Łańcuch radar → fabryka →
laboratorium → bateria to 1750 kredytów i **dwanaście kratek na czterdziestu
dwóch**, obok ekonomii, baraków i mocy. Bot grał 94 minuty z pełnym łańcuchem
i baterii nie zmieścił ani razu — nie zabrakło mu kredytów, zabrakło MIEJSCA.
§9.0 nazywał to „za długim łańcuchem"; pomiar mówi precyzyjniej: za szerokim.

**Poprawka** to `reqDrop` — wymaganie ZDJĘTE przez misję, symetrycznie do
istniejącego `reqAdd`. W szóstce bateria i kolosy wymagają fabryki zamiast
laboratorium (−500 kredytów, −2 kratki). Laboratorium zostaje w misji jako
+1 poziom do wszystkiego, ale przestaje być bramką do rzeczy, o której odprawa
mówi „jest Twoja". To jedyna zmiana drzewka techniki w całej kampanii i jedyna,
którą pomiar wymusił wprost.

Zostaje otwarte (Twoje liczby, nie moje):
· czy lej ma być długi (dziś 674 px = ułamek pola) czy krótki i taktyczny
  (~300 px = wielokrotność zasięgów) — dziś to ułamek, więc rośnie z mapą
· czy finał ma zostać przy `reqDrop`, czy raczej dać artylerię w `unlock` od
  startu misji 6 — pomiar mówi tylko, że bateria MUSI być osiągalna, nie jak

---

## 3b. Misja kampanii jest AUTORSKA, nie losowana

Dwie rzeczy w misji kampanii muszą być **zapisane z ręki**, bo inaczej nie da się
jej zbalansować — ani nawet zmierzyć:

**Układ złóż** (`ore` w danych misji). Losowa ruda znaczy, że każdy przebieg tej
samej misji ma inną ekonomię: „cel 600 kredytów" raz jest za łatwy, raz
niewykonalny, a pomiar nie mówi nic o misji, tylko o losowaniu. Podaje się mapką
znakową, wiersz = wiersz siatki:

```js
ore:['....#.',      //  #  bogata ruda
     '......',      //  o  uboga (połowa)
     '..#...'],     //  .  puste
```

**Plan fal** (`waves`). Każda fala z ręki: własny skład i własny odstęp.

```js
waves:[{ t:45, inf:2 }, { t:38, inf:3 }, … , { t:28, inf:8, lazik:2 }]
```

Fale składane proceduralnie z bazy wroga naciskają za każdym razem inaczej —
a **„fale 1–3 przyjmiesz działkami, od czwartej potrzebujesz ludzi" to obietnica
z odprawy, której procedura nie umie dotrzymać**. Przy planie wróg się nie
rozbudowuje (skład kolejnych fal jest już zapisany), a szturm **kończy się tam,
gdzie kończy się lista**.

### Wyzwanie: SZPICE I ODDECHY, nie równy strumień

Kalibracja misji 2 nauczyła trzech rzeczy, z których żadna nie była oczywista.

**1. Masa nie robi wyzwania.** Przy POTRÓJNEJ liczbie piechoty bot wciąż wygrywał
2/2 ze sztabem na 100%: równy strumień zawsze zdąży wyczyścić między falami.
Ginęły budynki na obrzeżach (20 straconych), ale sztab jest ostatni w kolejce —
jednostki biją w NAJBLIŻSZY cel, więc baza jest zjadana od zewnątrz.

**2. Równy, coraz ciaśniejszy zegar daje KLIF, nie wyzwanie.** Dwie sekundy na
falę dzieliły „wygrana 3/3, sztab 100%" od „przegrana 0/2, sztab 8%". To czysty
próg: albo nadążasz z czyszczeniem, albo lawina cię zjada, i nie ma nic pomiędzy.

**3. Działa dopiero rytm.** Fale 4, 8 i 10 uderzają ciasno i mocno (23/21/23 s),
a 5 i 9 dają oddech (39/38 s) na odbudowę i naprawę. Gracz przeżywa **trzy
momenty na styk** zamiast jednego progu, którego nie czuje, dopóki go nie
przekroczy — a porażka po takiej fali jest zrozumiała, nie nagła.

**4. Krzywa jest związana z kosztem kratki, nie tylko z siłą wroga.** Powrót
działek na siatkę przesunął całą misję 2 o jeden stopień: ta sama krzywa dawała
nagle 0/3 ze sztabem na 7%, bo plan, który wcześniej wychodził, przestał się
mieścić w bazie. Klif jest ostry — **+1 s na falę to wciąż 0/3, +2 s to 3/3** —
więc kalibracja idzie sekundami, nie „trochę luźniej".

**5. Misja ma dziś dwie różne trudne drogi, nie jedną łatwą.** Ten sam plan fal,
dwa style zabudowy bota:

| plan bota | wygrane | sztab min | stracone obiekty |
|---|---|---|---|
| działka wcześnie (3 gniazda przed 4. barakiem) | 3/3 | **55 %** | 13 |
| sama armia (6 baraków, gniazda na końcu) | **2/3** | 100 % | 6 |

Pierwszy przeżywa w gruzach, drugi bywa zmieciony razem z armią. Żaden nie
przechodzi tego spokojnie — a to jest dokładnie to „na styk", o które chodziło.

### Misja, której nie da się przegrać, nie jest wyzwaniem

Misja 3 nie zagraża bazie (walka toczy się w polu, sztab kończył na 100% i zero
straconych obiektów), więc jedyną „porażką" było mielenie bez końca: dziesięć
minut i darmowy cel, gdy wrogowi skończyły się fale. Stąd **limit fal**
(`goal.before`): nie zdążysz — przegrywasz. Czas przejęcia przestaje być czymś,
co się przeczeka, i staje się tym, o co grasz. Licznik „ZOSTAŁO FAL: n" siedzi
w panelu celu, bo reguła, o której gracz dowiaduje się po porażce, nie jest regułą.

Uwaga na pułapkę: plan fal musi być DŁUŻSZY od limitu. Przy planie równym
limitowi licznik fal przestaje rosnąć i przegrana nie odpala się wcale
(pomiar: 10:41 zamiast 2:54). `goalFailed` ma na to bezpiecznik.

### Zmierzone (bot, stan 16.09.2026)

| | wygrane | czas | sztab min | stracone obiekty |
|---|---|---|---|---|
| M1 | 3/3 | 2:14 | 100% | 0 |
| M2 | **3/3** | 5:57 | **55%** | **13** |
| M3 | **1–2/3** | 3:03 | 100% | 0 |
| M4 | **3/5** | 5:51 | **64%** | **11** |
| M5 | **2/5** | 6:25 | 81–93% | **14** |
| M6 | **0/2 — nieprzechodnia** | 38:00 | 100% | 0 |

Misje 4–6 mierzone z **przeniesioną bazą** (§3b, lekcja 2) i na **pięciu**
przebiegach (lekcja 3). W czwórce i piątce wróg dochodzi do bazy w 2–3
przebiegach na 5 — to jest ten „styk", o który chodziło.

**Misja 6 zostaje nieprzechodnia i nie ma sensu tego zmiękczać.** Armia
dochodzi do gardła i trzyma pole bez strat, ale bastion schodzi z 65 % do 62 %
przez dwadzieścia dwie minuty. Szczegóły i co z tego wynika — wyżej, w §3.

Bot to **dolna granica**: nie kituje, nie wycofuje się, nie rozgrywa suwaka,
nie przesuwa budynków. Jeśli on przechodzi dwójkę ze sztabem na 55% i trzynastoma
straconymi obiektami, człowiek przejdzie — ale wyjdzie z misji w gruzach.
**Misja 1 jest jedynym świadomym wyjątkiem**: broni jej sam sztab
(zasięg 330 wobec 39 piechoty), więc wróg ginie na podejściu bez względu na
liczbę — trzynaście piechoty i sztab wciąż na 100%. Jej stawka jest z zegara
i z tego, że fale rosną, a nie z ryzyka porażki.

M3 waha się między 1/3 a 2/3 między seriami i to jest **spodziewane**: misja jest
wyścigiem z zegarem, a nie progiem siły, więc rozstrzyga się o kilkanaście
procent przejęcia. Pomiar pokazał bota na 87% w piątej fali i zmiecionego
w szóstej — stąd szósta fala jest dziś oddechem, a nie drugim szpicem.

### Trzy rzeczy, których nie da się zgadnąć, pisząc plan fal

Każda kosztowała mnie przebieg na ślepo, więc zapisane są tu, a nie w commicie.

**1. Skala planu to LICZBA BUDYNKÓW WROGA NA FALĘ, nie liczba, która brzmi
groźnie.** Proceduralny wróg wystawia **jedną jednostkę na budynek na falę**
(`EB` w config) i rośnie o ~1 budynek na falę, więc czternasta fala misji 4 to
realnie ~15 jednostek. Pierwszy plan, jaki napisałem dla misji 4–6, miał tam 31
i wyglądał rozsądnie na papierze — w grze bot padał ze sztabem na 7 %. Krzywe
z misji 2 nie przenoszą się na misje polowe: w dwójce cała armia siedzi na bazie
pod gniazdami, w czwórce jest rozciągnięta na trzy drogi i ma jeszcze NACIERAĆ.

**2. Misji 4–6 nie wolno mierzyć od pustej siatki.** Kampania jest ciągła —
do czwórki wchodzi się z bazą z trójki. Pomiar od „sam sztab + 700 kredytów"
mierzy gracza, który w tej grze nie istnieje, i każe zbijać krzywą do poziomu,
przy którym prawdziwy gracz się nudzi. Harness dostał więc `PRE` — bazę
przeniesioną, stawianą od razu i za darmo, osobną dla każdej misji.

**3. Trzy przebiegi to za mało, żeby wybrać krzywą.** Ta sama krzywa misji 4
dała **1/3 w jednej serii i 0/3 w następnej** — na tej pierwszej oparłem wybór
i commit, i był to wybór na szumie, nie na pomiarze. Przy wskaźniku wygranych
rzędu „jedna na trzy" trzy przebiegi nie odróżniają 1/6 od 1/2. Wybór krzywej
idzie z **pięciu** przebiegów; trzy zostają do odrzucania rzeczy oczywistych
(0/3 ze sztabem na 7 % to nie jest przypadek).

**4. Krzywa zmierzona na zepsutej walce nie jest krzywą.** Limit podejścia
jednostki liczył się po samej osi X, a zasięg jest 2D: cel przesunięty w bok
o 10 px i więcej znaczył, że żołnierz dochodził na swój limit i **stał, nie
strzelając**. Dotyczyło to WYŁĄCZNIE armii gracza (wróg nie ma limitu linii),
więc każdy pomiar sprzed tej poprawki mierzył wojsko, które w połowie starć nie
oddawało ognia. Ta sama krzywa misji 2 dawała przed nią **0/5 ze sztabem na 3 %**,
po niej **5/5 ze sztabem na 100 %** — bez jednej zmiany w planie fal.
Morał nie brzmi „pilnuj zasięgów": brzmi **najpierw sprawdź, czy jednostki w ogóle
robią to, co myślisz, że robią, a dopiero potem strój liczby**. Odwrotna kolejność
zbija krzywe do poziomu, przy którym gra jest zepsuta w drugą stronę.

Dane autorskie są **sprawdzane, nie poprawiane**. `checkOreLayout`: brak miejsca
na rafinerię to błąd w danych misji i ma krzyczeć w konsoli, a nie znikać pod
losowaniem (poprawianie — `ensureRefinerySpot` — zostaje grze dowolnej).
`checkWavePlan`: plan krótszy lub równy terminowi (`goal.before`), `after` poza
planem, odstęp fali ≥ 60 s. Wszystkie trzy to błędy, których **nie widać po
liczbach** — misja po prostu zachowuje się inaczej, niż mówi jej komentarz,
a pierwszy z nich kosztował mnie już jeden przebieg na ślepo (10:41 zamiast 2:54).

**Losowanie zostaje grze dowolnej**, gdzie różnorodność jest sensem — tam żyją
warianty pola, eskalacja, losowa doktryna i losowa ruda.

### Przejście między misjami jest PŁYNNE

Nowa misja nie jest nową planszą. To ta sama baza, na którą **doszła plansza**
i **przesunął się widok**:

| co | jak się zachowuje między misjami |
|---|---|
| budynki | zostają na swoich kratkach, z poziomem ulepszeń i HP |
| kredyty | zostają, plus przydział startowy misji (`money`) |
| siatka | **tylko rośnie** — `max(siatka misji, siatka przeniesiona)` |
| ruda | złoża i wyrobiska z pokrywających się kratek przechodzą |
| pole | wydłuża się (`len`), zmienia kształt, dostaje drogi i cele |
| kamera | ten sam zoom, przestawiona na bazę (`fitCam(keepZoom)`) |
| armia | ginie — front zostaje za nami, wojsko odbudowujesz z baraków |

Trzy rzeczy, których to wymagało, i każda była błędem, póki jej nie było:
`applyMission` bierze `max` siatek, bo inaczej plansza się kurczyła; `buildField`
kopiuje `ore`/`seam` na pokrywające się kratki, bo inaczej wyeksploatowana żyła
wracała pełna; `fitCam` przyjmuje `keepZoom`, bo inaczej każde przejście
wyrywało graczowi skalę, do której się przyzwyczaił.

---

## 4. Zasady, bez których to się rozsypie

0. **Misja kampanii jest autorska.** Układ złóż i plan fal zapisane z ręki
   (§3b). Losowanie zostaje grze dowolnej.
1. **Punkt kontrolny na start każdej misji.** „Powtórz" wraca do niego.
2. **Wróg skaluje się numerem misji, nie bazą gracza.** W kampanii wprost planem
   fal (`waves`), w grze dowolnej rozbudową (`enemy.base`, `enemy.grow`). Plus
   stały przydział kredytów na start misji, żeby słabsza baza mogła nadrobić.
3. **Zdobyty sektor daje nowe kratki, nie tylko kredyty.**
4. **Baza przechodzi między misjami w świecie, nie między światami.** Ulepszenia armii
   z kart zostają — dlatego migawka ma dwa osobne wiadra: `base` i `run`.
   Przejście jest **płynne**: nic nie znika, plansza rośnie, widok się przesuwa.
   Siatka jest monotoniczna — kratka raz zdobyta nie wraca do wroga.
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

0. **Zlew kredytów / wróg out-skaluje gracza** — otwarte i teraz ZMIERZONE na
   finale kampanii: misja 6 kończy się porażką z bastionem na 0%, a armia stoi
   643 px od celu od fali 8. Szczegóły i liczby: §3, „Pomiar 15.09.2026".
   Dopóki to nie przejdzie, reszta jest budowaniem na piasku.
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
| Stanowiska ogniowe przed bazą | Miały odciążyć ciasną siatkę, a zdjęły decyzję: działko za samą cenę w kredytach stawia się zawsze. Działka wracają na kratki, pomyłkę odkręca PRZESUŃ |
