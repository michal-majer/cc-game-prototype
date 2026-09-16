/* =========================================================================
   FRONT — ŚWIATY I MISJE (czyste DANE, zero kodu rozgrywki)

   Świat = jedna mapa, jeden kształt pola, jedna doktryna, sześć misji.
   Misja = jeden krok frontu: cel z danych + warunek wygranej + to, co gracz
   ma na pasku budowy.

   Zasada nadrzędna (FRONT.md §3): JEDNA MISJA = JEDNA NOWA RZECZ DLA GRACZA
   I JEDNA DLA WROGA. Jeśli dopisujesz misji czwartą nowość — wytnij trzy.

   Ramka misji (campaign.js) NIE WIE, czy gra kampanię, czy grę dowolną —
   czyta stąd i tyle. Gra dowolna to ten sam rekord, tylko składany losowo
   (patrz SKIRMISH na dole).

   ---------------------------------------------------------------------
   POLA REKORDU MISJI
     grid    [kolumny, wiersze]  — siatka bazy (mniejsza = ciaśniej)
     shape   '1' | '1-3-1'       — kształt korytarza (config.SHAPES)
     len     int                 — DŁUGOŚĆ KORYTARZA w px. Mapa jest większa od
                                   ekranu i przewijana; wszystko na korytarzu
                                   (stanice, sektory, progi kształtu, przyczółek)
                                   liczy się UŁAMKAMI tej liczby, więc to jedyne
                                   pokrętło rozmiaru pola. Marsz skaluje się
                                   podliniowo (config.SPD_MUL), więc dłuższe pole
                                   to realnie dłuższy przemarsz, nie ten sam.
     halfH   int                 — połowa wysokości korytarza; domyślnie z kształtu
                                   (1 tor → ciasno, 3 tory → pas na tor)
     spawnF  0..1                — gdzie na korytarzu stoi przyczółek wroga
     roads   [{n,y,bow,sect}]     — DROGI. Za wąskim gardłem korytarz rozchodzi
                                   się na niezależne trakty i zbiega w leju:
                                     n    nazwa (trafia na przycisk rozkazu)
                                     y    −1/0/+1 — przesunięcie o roadGap
                                     bow  łuk na zewnątrz (0.3 = spory objazd,
                                          czyli droga REALNIE dłuższa)
                                     sect cele NA TEJ DRODZE: {kind, n, f},
                                          f = ułamek długości drogi
                                   Każdy rodzaj celu daje CO INNEGO (config
                                   SECT_KINDS: kredyty/moc/kratki/radar/osłabia),
                                   więc „którą drogą" jest decyzją o zysku, nie
                                   o kierunku. Jedna droga = brak rozwidlenia.
     roadGap int                 — odstęp między osiami dróg (domyślnie 300)
     roadW   int                 — szerokość jednej drogi (domyślnie 150)
     reqAdd  {typ:[wymagania]}   — wymaganie DOPISANE przez misję (patrz m1)
     ore     ['..##..', …]       — STAŁY UKŁAD ZŁÓŻ, wiersz = wiersz siatki:
                                   # bogata ruda · o uboga · . puste.
                                   Losowa ruda znaczy, że każdy przebieg tej samej
                                   misji ma inną ekonomię — a wtedy nie da się jej
                                   zbalansować ani zmierzyć. Losowanie zostaje
                                   GRZE DOWOLNEJ, gdzie różnorodność jest sensem.
     waves   [{t, typ:n, …}, …]  — AUTORSKI PLAN FAL: każda fala z ręki, z własnym
                                   składem i odstępem (`t` = sekundy DO niej).
                                   Po ostatniej szturm się KOŃCZY. Fale składane
                                   proceduralnie z bazy wroga naciskają za każdym
                                   razem inaczej — „fale 1–3 przyjmiesz działkami,
                                   od czwartej potrzebujesz ludzi" jest obietnicą,
                                   której procedura nie umie dotrzymać.
     money   int                 — kredyty na start
     unlock  [typ budynku]       — CO JEST NA PASKU. To jest drzewko techniki
                                   kampanii; `req` z tabeli B działa tylko
                                   między budynkami obecnymi na tej liście.
     feats   {...}               — które systemy gry są w tej misji włączone
     goal    {kind, target}      — cel z danych (patrz campaign.goalDone)
     enemy   {...}               — skład i tempo wroga; skaluje się NUMEREM
                                   MISJI, nie bazą gracza (FRONT.md §4.2)
     waveT   [pierwsza, kolejne] — sekundy do 1. fali i odstęp dalszych
     par     {sec, loss}         — próg na ocenę „PRZEŁAMANIE" (§5)
   ---------------------------------------------------------------------
   Liczby są DO SPRAWDZENIA W GRZE. Struktura nie.
   ========================================================================= */

// domyślne wyłączenie wszystkiego — misja włącza tylko to, czego uczy
const OFF = { stance:0, sectors:0, cards:false, radar:0, sell:false, repair:false,
              move:false, upgrade:false, ore:true, terrIncome:false };
const feats = o => ({ ...OFF, ...o });

export const MISSIONS = {

  /* --- 1 — PIERWSZY DZIEŃ --------------------------------------------------
     Uczy: EKONOMIA MA STAWKĘ. Cel jest ekonomiczny, ale zegar tyka i po nim
     przychodzi fala. Nie musi być wyzwaniem — odpierasz ją działami sztabu —
     ale gracz widzi, PO CO była ekonomia. Sama checklista („zbierz X, postaw
     elektrownię") uczy interfejsu, nie gry.
     Nie ma: suwaka, sektorów, kart, radaru, rozbiórki, ulepszania.           */
  m1: {
    id:'m1', n:1, code:'PIERWSZY DZIEŃ',
    teach:'Ekonomia ma stawkę.',
    gen:'Prąd i ruda. Bez nich jesteś tu tylko celem.',
    brief:['Sztab stoi. Reszta zależy od Ciebie.',
           'Najpierw prąd. Rafineria bez niego nie ruszy.',
           'Trzy fale. Działa sztabu je przyjmą — Ty masz zdążyć z kredytami.'],
    // NAJCIAŚNIEJ w całej kampanii: 18 kratek, z czego cztery bierze sztab,
    // a złoże kolejne dwa. Siatka rośnie z każdą misją razem z odsunięciem
    // frontu (m2 20, m3 25→35, m4 36→42) — miejsce jest NAGRODĄ ZA TEREN,
    // nie stanem wyjściowym.
    //   5×3 było o jedną kolumnę za ciasne: zostawało dokładnie jedno miejsce
    //   na rafinerię i gracz mógł ZABLOKOWAĆ MISJĘ, stawiając tam elektrownię
    //   (misja 1 nie ma rozbiórki). Tutorial nie może się zakleszczyć od
    //   jednego kliknięcia — patrz ensureRefinerySpot w economy.js.
    grid:[6,3], shape:'1', len:1300, money:400,
    // Sztab bierze kolumny 0–1 (wiersze 1–2). Dwa ziarna rudy rozstawione tak,
    // żeby zostały DWA ROZŁĄCZNE miejsca na rafinerię 2×2: kolumny 2–3 u góry
    // i 4–5 na dole. Jedna elektrownia nie zablokuje obu, więc tutorial
    // przeżyje każde kliknięcie.
    ore:['....#.',
         '......',
         '..#...'],
    /* TRZY FALE, cel dopiero po trzeciej. Jedna fala i cel po pierwszej znaczyły,
       że misja kończy się, ZANIM ktokolwiek dojdzie do bazy — gracz nie widział
       nawet, po co była ekonomia. Teraz widzi ich pod płotem trzy razy.
       Misja 1 JAKO JEDYNA nie jest „na styk" i to jest świadome: broni jej sam
       sztab (zasięg 330 wobec 39 piechoty), więc wróg ginie na podejściu bez
       względu na liczbę — pomiar: 13 piechoty i sztab wciąż na 100%. Stawka tu
       jest z zegara i z tego, że fale rosną, a nie z ryzyka porażki. */
    waves:[{ t:55, inf:4 }, { t:42, inf:6 }, { t:38, inf:8 }],
    unlock:['power','refinery'],
    // Rafineria WYMAGA elektrowni. Bez tego misja o ekonomii przechodziła się
    // samą rafinerią: sztab daje 4 mocy, rafineria bierze 2, więc prąd był
    // zbędny (pomiar: wygrana w 0:59 z jednym budynkiem). Teraz oba są naprawdę
    // wymuszone, a kolejność „najpierw prąd" jest lekcją, nie ozdobą.
    reqAdd:{ refinery:['power'] },
    feats:feats({}),
    // Cel liczy KREDYTY ZAROBIONE, nie saldo. Liczony po saldzie karałby za budowanie,
    // czyli dokładnie za to, czego misja uczy — bot to pokazał: wygrywał dopiero
    // w 5. fali, bo wydawał wszystko na bieżąco. `after:1` trzyma wygraną do pierwszej
    // fali, żeby gracz zobaczył, PO CO była ekonomia: z prądem i rafinerią cel pada
    // tuż PO odparciu fali, bez nich to cztery minuty i kilka fal — presja bez
    // twardego limitu czasu.
    goal:{ kind:'money', target:600, after:3 },
    enemy:{ doc:'CZERWONA FALA', base:['barracks'], spawnF:0.97, bastion:0 },
    par:{ sec:180, loss:0 },
  },

  /* --- 2 — ŚCIANA ----------------------------------------------------------
     Uczy: kredyty trzeba zamienić w armię; barak i gniazdo robią RÓŻNE rzeczy.
     Pierwsza misja, w której da się przegrać.
     Ciaśniejsza siatka, ten sam zestaw pojęć — czyta się jako obrona, nie
     ekspansja. Pułapka, w którą NIE wchodzimy: tower defense na własnych
     zasadach. Cokolwiek tu wejdzie, musi mówić tym samym słownictwem co
     reszta gry, inaczej gracz nauczy się rzeczy, która zniknie w misji 3.    */
  m2: {
    id:'m2', n:2, code:'ŚCIANA',
    teach:'Kredyty trzeba zamienić w armię.',
    gen:'Dziesięć fal. Nie oddasz ani kratki.',
    brief:['GNIAZDO zajmuje kratkę tak samo jak barak. Wybierasz, nie dokładasz.',
           'Gniazdo strzela samo. Barak co falę wystawia żołnierza.',
           'Postawione źle? PRZESUŃ przenosi budynek za ćwierć kosztu.',
           'Czwarta, ósma i dziesiąta uderzą ciasno. Między nimi odbudujesz.'],
    // Działko stoi na kratce — inaczej nie byłoby wyboru, tylko dokładanie.
    // Ciasna siatka + koszt kratki = pierwsza misja, w której UKŁAD bazy jest
    // decyzją, a nie formalnością. PRZESUŃ (feats.move) jest zaworem: pomyłkę
    // da się odkręcić za 25% wkładu, ale budynek jest 3 s martwy.
    // Siatka ROŚNIE przez całą kampanię i NIGDY się nie kurczy (6×3 → 6×4 →
    // 6×5→7×5 → 7×5→7×6). Misja 2 dokłada wiersz, nie zabiera kolumny.
    grid:[6,4], shape:'1', len:1300, money:450,
    ore:['..##..',
         '......',
         '......',
         '....#.'],
    /* DZIESIĘĆ FAL ZE SZPICAMI I ODDECHAMI — i to jest cała kalibracja tej misji.

       Pomiar pokazał, że sama MASA nie robi wyzwania: przy potrójnej liczbie
       piechoty bot wciąż wygrywał 2/2 ze sztabem na 100%, bo równy strumień
       zawsze zdąży wyczyścić między falami. Pokrętłem jest ZEGAR — ale równy,
       coraz ciaśniejszy zegar daje KLIF, nie wyzwanie: dwie sekundy na falę
       dzieliły „wygrana 3/3, sztab 100%" od „przegrana 0/2, sztab 8%".

       Rozwiązaniem są SZPICE i ODDECHY. Fale 4, 8 i 10 uderzają ciasno i mocno;
       5 i 9 dają czas na odbudowę. Gracz przeżywa trzy momenty na styk zamiast
       jednego progu, którego nie czuje, dopóki go nie przekroczy.

       PRZELICZONE po powrocie działek na kratki (+2 s na każdą falę). Gniazdo
       zajmuje teraz kratkę, więc ta sama krzywa po zmianie dawała 0/3 ze
       sztabem na 7% — plan, który wcześniej wychodził, przestał się mieścić
       w bazie. Klif jest OSTRY i to jest tu najważniejsza liczba: +1 s na falę
       to wciąż 0/3, +2 s to 3/3, ale ze sztabem na 41% i 13 straconymi
       obiektami. Dokładnie „na styk": przeżywasz, ale wychodzisz w strzępach.
       Pomiar końcowy z liczbami w README.                                     */
    waves:[
      { t:40, inf:4 },                    // rozpoznanie
      { t:34, inf:6 },
      { t:30, inf:9,  lazik:1 },          // pierwszy pojazd
      { t:23, inf:14, lazik:2 },          // ▲ SZPIC — tu zwykle pada pierwszy budynek
      { t:39, inf:6  },                   // ▼ oddech: odbuduj, napraw, dostaw barak
      { t:27, inf:13, lazik:2 },
      { t:25, inf:16, lazik:3 },
      { t:21, inf:24, lazik:4 },          // ▲ SZPIC — najcięższy punkt misji
      { t:38, inf:8,  lazik:1 },          // ▼ ostatni oddech
      { t:23, inf:30, lazik:7 },          // ▲ szturm końcowy
    ],
    unlock:['power','refinery','barracks','bunker'],
    feats:feats({ sell:true, repair:true, move:true }),
    // Szturm kończy się tam, gdzie kończy się plan — misja obronna ma mieć koniec.
    goal:{ kind:'waves', target:10 },
    // `assault` — to nie front, tylko szturm na bazę: idą, nie stoją. Bez tego
    // przy porządnej obronie wróg w ogóle nie nacierał i misja nie miała końca.
    enemy:{ doc:'CZERWONA FALA', assault:true, spawnF:0.97, bastion:0 },
    par:{ sec:480, loss:40 },
  },

  /* --- 3 — PUNKT -----------------------------------------------------------
     Uczy: teren płaci, wywiad kosztuje, linia to wybór. Pierwsze wyjście
     poza bazę. Suwak ma DWIE pozycje — nie pięć.
     Radar świadomie TU, nie w misji 4: wywiad ma sens, gdy walczysz o punkt
     i nie wiesz, co nadchodzi. W misji obronnej byłby ikoną.
     Nowe kratki po przejęciu to nie ozdoba — pierwszy realny zlew na kredyty
     i odpowiedź na „siatka pełna, 1 700 kredytów bez zastosowania".          */
  m3: {
    id:'m3', n:3, code:'PUNKT',
    teach:'Teren płaci. Wywiad kosztuje.',
    gen:'Mini-sztab na przedpolu. Wejdź i odstój.',
    brief:['Pierwszy raz wychodzisz poza bazę.',
           'Suwak ustawia linię: pod osłoną albo na przedpolu.',
           'Radar pokaże, co nadchodzi. Kosztuje tyle, co armia.',
           'Masz siedem fal, żeby go zająć. Ósma znaczy, że nie zdążyłeś.'],
    grid:[6,5], gridMax:[7,5], shape:'1', len:2100, money:500,
    // Cztery kratki rudy — misja pierwszy raz utrzymuje wojsko W POLU, więc
    // ekonomia musi unieść więcej niż w dwójce. Mapka ma sześć kolumn, a siatka
    // rośnie do siedmiu: siódma dochodzi pusta, jako czysty zlew na kredyty.
    ore:['..##..',
         '......',
         '......',
         '....#.',
         '.....#'],
    /* Krzywa ŁAGODNIEJSZA niż w dwójce, mimo że misja jest późniejsza: tam
       broniłeś się pod działami, tu pierwszy raz WYCHODZISZ POZA ICH ZASIĘG
       (cel leży 20 px za zasięgiem gniazd — to jest zamierzone). Pierwsza wersja
       szła krzywą jak w dwójce i bot nie zdobył celu ani razu.

       Wyzwaniem jest tu ZEGAR, nie przetrwanie. Misja 3 nie zagraża bazie —
       walka toczy się w polu — więc bez limitu nie dało się jej ani wygrać, ani
       przegrać: mieliła się po dziesięć minut i kończyła darmowym celem, gdy
       wrogowi skończyły się fale. `before:7` zamienia „czas przejęcia" z rzeczy,
       którą się przeczekuje, w to, o co się gra. Plan ma OSIEM fal przy limicie
       siedmiu — ósma musi mieć czym odpalić przegraną.

       Szósta fala jest ODDECHEM, nie szpicem, i to nie jest łagodzenie: pomiar
       po powrocie działek na kratki pokazał bota na 87% przejęcia w piątej fali
       i zmiecionego w szóstej — wyścig rozstrzygał się, zanim gracz zdążył
       cokolwiek z nim zrobić. Piąta i szósta to teraz OKNO NA SZTURM (2/3
       zamiast 0/3). Uwaga: samo rozciągnięcie zegara nie działa — +4 s na
       każdą falę dało 0/3, bo baraki wystawiają żołnierza CO FALĘ, więc
       dłuższe fale to wolniejsza armia przy tym samym limicie fal.            */
    waves:[
      { t:40, inf:3 },
      { t:32, inf:5 },
      { t:27, inf:6 },
      { t:22, inf:9,  lazik:1 },          // ▲ szpic — przez niego trzeba się przebić
      { t:32, inf:6 },                    // ▼ OKNO NA SZTURM — piąta i szósta
      { t:32, inf:8 },                    // ▼ …to jedyny moment, żeby wejść na cel
      { t:26, inf:13, lazik:2 },          // ostatnia fala PRZED upływem czasu
      { t:22, inf:16, lazik:3 },          // ta leci już tylko wtedy, gdy nie zdążyłeś
    ],
    unlock:['power','refinery','barracks','bunker','workshop','radar'],
    feats:feats({ stance:2, sectors:1, radar:1, sell:true, repair:true, move:true, upgrade:true, terrIncome:true }),
    // Jedna droga, jeden cel — i stoi DOKŁADNIE na najdalszej linii, jaką ten
    // suwak daje (PRZEDPOLE, 1/4 pola). Cel, do którego misja nie pozwala dojść,
    // jest misją nieprzechodnią, nie trudną.
    roads:[{ n:'TRAKT', y:0, bow:0,
             sect:[{ kind:'sztab', n:'PRZEDPOLE', f:0.25 }] }],
    // `after:3` — nie da się wygrać, zanim radar i suwak zdążą cokolwiek znaczyć.
    // Bez tego misja kończyła się w 1:21 na drugiej fali, czyli zanim gracz
    // w ogóle zobaczył, po co był wywiad.
    goal:{ kind:'sectors', target:1, after:3, before:7 },
    enemy:{ doc:'CZERWONA FALA', spawnF:0.97, bastion:0 },
    par:{ sec:240, loss:25 },
  },

  /* --- 4 — ROZWIDLENIE -----------------------------------------------------
     Uczy: NIE MOŻESZ BYĆ WSZĘDZIE NARAZ. Front dochodzi do rozszerzenia,
     kamera odjeżdża, gracz pierwszy raz widzi skalę pola.
     Cel „2 z 3", nie „3 z 3": przy trzech misja byłaby trójką razy trzy;
     przy dwóch gracz WYBIERA, który tor odpuszcza — pierwsza prawdziwa
     decyzja strategiczna.
     Odchudzona świadomie: pierwotnie miała czołg, radar, tory, budynki
     torowe, kartę i mini-bazę — sześć nowości naraz, nie do przetestowania. */
  m4: {
    id:'m4', n:4, code:'ROZWIDLENIE',
    teach:'Nie możesz być wszędzie naraz.',
    gen:'Trzy drogi. Wybierz, którą oddajesz.',
    brief:['Za gardłem korytarz rozchodzi się na trzy niezależne drogi.',
           'Każda ma co innego do wzięcia. Górna i dolna są dłuższe.',
           'Opanuj dwie. Trzeciej nie obronisz — i o to chodzi.',
           'Zajęcie to połowa roboty: masz je UTRZYMAĆ do ósmej fali.',
           'Do czternastej albo trzymasz dwie, albo misja przepada.'],
    grid:[7,5], gridMax:[7,6], shape:'1-3-1', len:3200, money:600,   // zajęty cel = nowe kratki
    ore:['..##...',
         '.......',
         '......#',
         '....#..',
         '..#....'],
    // Trzy drogi, trzy RÓŻNE powody, żeby nią pójść. Górna daje moc i tnie ich
    // fale, ale jest najdłuższa; środkowa jest krótka i płaci kredytami;
    // dolna daje miejsce w bazie i wywiad. Nie da się wziąć wszystkiego —
    // i to jest cała misja.
    roadGap:300, roadW:150,
    roads:[
      { n:'GÓRNA',    y:-1, bow:0.30, sect:[{ kind:'most',    n:'MOST',      f:0.40 },
                                            { kind:'bateria', n:'BATERIA',   f:0.76 }] },
      { n:'ŚRODKOWA', y: 0, bow:0,    sect:[{ kind:'sztab',   n:'WĘZEŁ',     f:0.52 }] },
      { n:'DOLNA',    y: 1, bow:0.30, sect:[{ kind:'sklad',   n:'SKŁAD',     f:0.38 },
                                            { kind:'wieza',   n:'WIEŻA',     f:0.72 }] },
    ],
    /* SZESNAŚCIE FAL. Pomiar przed planem: misja kończyła się w 1:54 na TRZECIEJ
       fali, ze szczytem dziesięciu wrogów na polu i zerem strat — armia startowa
       brała dwie drogi, zanim wróg w ogóle zaistniał. „Nie możesz być wszędzie
       naraz" nie miało jak być prawdą, bo nie było kogo nie zdążyć powstrzymać.

       Stąd DWIE bramki, nie jedna: `after:8` — zajęcie dróg nie kończy misji,
       dopóki nie przyjdzie nacisk, który każe ich BRONIĆ; `before:14` — a jeśli
       do czternastej fali nie trzymasz dwóch, przegrywasz. Między nimi jest ta
       misja: nie zdobycie, tylko utrzymanie dwóch dróg naraz.

       Wróg rozkłada każdą falę PO DROGACH (round-robin w sim.js), więc trzecia
       część fali to wciąż realna siła na każdym trakcie. Czołgi wchodzą w ósmej
       fali — dokładnie wtedy, gdy zaczyna się liczyć utrzymanie.

       MASA WYBRANA POMIAREM, z trzech krzywych o tym samym rytmie:
         ×3 (szczyt 55 jedn.) · 0/3 · sztab  7% — plan, który brzmiał groźnie
         ×1 (szczyt 24 jedn.) · 3/3 · sztab 100% · 0 strat — nie ma o co grać
         TA  (szczyt 32 jedn.) · 1/3 · sztab 37% · 16 straconych obiektów
       Środkowa nie jest kompromisem, tylko jedyną, przy której misja w ogóle
       coś kosztuje: przy cienkiej bot wygrywa dokładnie na fali 8, czyli
       bramka `after` kończy misję, zanim cokolwiek się wydarzy.               */
    waves:[
      { t:46, inf:4 },                            // po jednym na drogę — rozpoznanie
      { t:38, inf:6 },
      { t:34, inf:7,  lazik:1 },
      { t:30, inf:8,  lazik:2 },
      { t:26, inf:11, lazik:3 },                  // ▲ SZPIC — pierwszy raz na trzech naraz
      { t:42, inf:6,  lazik:1 },                  // ▼ oddech
      { t:32, inf:10, lazik:3 },
      { t:30, inf:12, lazik:3, tank:1 },          // pierwszy czołg — i pierwsza bramka celu
      { t:25, inf:15, lazik:4, tank:2 },          // ▲ SZPIC
      { t:44, inf:8,  lazik:2 },                  // ▼ oddech
      { t:31, inf:12, lazik:4, tank:2 },
      { t:29, inf:14, lazik:4, tank:2 },
      { t:24, inf:18, lazik:5, tank:3 },          // ▲ SZPIC — ostatnia przed terminem
      { t:40, inf:9,  lazik:3, tank:1 },          // ▼ oddech
      { t:26, inf:20, lazik:5, tank:4 },          // te dwie lecą, gdy nie zdążyłeś
      { t:30, inf:22, lazik:6, tank:4 },
    ],
    unlock:['power','refinery','barracks','bunker','workshop','radar','rocket','factory'],
    feats:feats({ stance:4, sectors:3, radar:2, sell:true, repair:true, move:true, upgrade:true, terrIncome:true }),
    goal:{ kind:'roads', target:2, after:8, before:14 },
    // `base` i `grow` są przy planie fal MARTWE (sim.js nie woła eBuild) —
    // zostają jako zapis, czym ten wróg jest, gdyby plan kiedyś zdjąć.
    enemy:{ doc:'CZERWONA FALA', base:['barracks','barracks','barracks'], grow:0.85, spawnF:0.97, bastion:0 },
    par:{ sec:540, loss:16 },
  },

  /* --- 5 — POD OSTRZAŁEM ---------------------------------------------------
     Uczy: utrzymanie jest trudniejsze niż zdobycie.
     Bastion ostrzeliwuje tory cyklicznie, Z ZAPOWIEDZIĄ, w losowej kolejności.
     Bez zapowiedzi to podatek losowy; z zapowiedzią to decyzja: ewakuować tor
     czy przyjąć i odbudować. Ta sama mechanika bije w misji 6 po wąskim
     gardle, więc gracz wchodzi do finału, już ją znając.
     Karty wchodzą dopiero tutaj: przez cztery misje armia rosła zabudową
     i terenem; karty są odpowiedzią na moment, gdy to przestaje wystarczać.
     JEŚLI COŚ MA WYPAŚĆ Z ZAKRESU — TO TA MISJA. Treść rozkłada się na 4 i 6. */
  m5: {
    id:'m5', n:5, code:'POD OSTRZAŁEM',
    teach:'Utrzymanie jest trudniejsze niż zdobycie.',
    gen:'Będą bić w tory. Usłyszysz, zanim trafią.',
    brief:['Trzymasz środek. Oni ostrzeliwują tory po kolei.',
           'Ostrzał jest zapowiadany. Zdążysz ewakuować albo przyjąć i odbudować.',
           'Sztab przysyła rozkazy — pierwsze karty do wyboru.',
           'Cztery fale Z RZĘDU z dwiema drogami. Utrata zeruje licznik.',
           'Od siódmej fali sypią rakietowcami — pancerka przestaje wystarczać.'],
    grid:[7,6], shape:'1-3-1', len:3200, money:650,
    ore:['..##...',
         '.......',
         '......#',
         '....#..',
         '..#....',
         '.....#.'],
    // Te same drogi co w misji 4 — gracz już wie, co na której jest. Nowa jest
    // tylko cena ich trzymania: ostrzał bije po drogach, z zapowiedzią.
    roadGap:300, roadW:150,
    roads:[
      { n:'GÓRNA',    y:-1, bow:0.30, sect:[{ kind:'most',    n:'MOST',    f:0.40 },
                                            { kind:'bateria', n:'BATERIA', f:0.76 }] },
      { n:'ŚRODKOWA', y: 0, bow:0,    sect:[{ kind:'sztab',   n:'WĘZEŁ',   f:0.52 }] },
      { n:'DOLNA',    y: 1, bow:0.30, sect:[{ kind:'sklad',   n:'SKŁAD',   f:0.38 },
                                            { kind:'wieza',   n:'WIEŻA',   f:0.72 }] },
    ],
    /* SZESNAŚCIE FAL, cięższych niż w czwórce — bo baza jest już rozwinięta,
       a misja nie o zdobycie, tylko o CZTERY FALE Z RZĘDU z dwiema drogami
       w ręku. Utrata choćby na jedną falę zeruje licznik (sim.js), więc plan
       musi mieć czym tę utratę wymusić: rakietowcy od siódmej fali biją
       w pancerkę, którą gracz właśnie zdążył zbudować.

       Pomiar przed planem: 2/2 w 3:34, wszystkie pięć celów, ZERO strat,
       szczyt szesnastu wrogów. Ostrzał bastionu bez nacisku z pola jest tylko
       podatkiem — bolało dopiero, gdy jest kogo w tym czasie odpierać.        */
    waves:[
      { t:44, inf:5 },
      { t:36, inf:8,  lazik:1 },
      { t:32, inf:12, lazik:2 },
      { t:28, inf:15, lazik:3, tank:1 },
      { t:24, inf:20, lazik:4, tank:1 },              // ▲ SZPIC
      { t:42, inf:10, lazik:2 },                      // ▼ oddech
      { t:30, inf:18, lazik:4, tank:2, rkt:2 },       // rakietowcy — kontra na pancerkę
      { t:28, inf:22, lazik:5, tank:2, rkt:2 },
      { t:23, inf:28, lazik:6, tank:3, rkt:3 },       // ▲ SZPIC
      { t:44, inf:12, lazik:2, tank:1 },              // ▼ oddech — tu zwykle zaczyna się licznik
      { t:30, inf:24, lazik:5, tank:3, rkt:3 },
      { t:28, inf:27, lazik:6, tank:4, rkt:3 },
      { t:23, inf:33, lazik:7, tank:5, rkt:4 },       // ▲ SZPIC — ostatnia przed terminem
      { t:42, inf:15, lazik:3, tank:2 },              // ▼ oddech
      { t:26, inf:38, lazik:8, tank:6, rkt:4 },
      { t:28, inf:42, lazik:9, tank:6, rkt:5 },
    ],
    unlock:['power','refinery','barracks','bunker','workshop','radar','rocket','factory','reactor'],
    feats:feats({ stance:4, sectors:3, radar:2, cards:true, sell:true, repair:true, move:true, upgrade:true, terrIncome:true }),
    goal:{ kind:'hold', target:2, waves:4, before:14 },
    enemy:{ doc:'CZERWONA FALA', base:['barracks','barracks','barracks','rocket'], grow:1,
            spawnF:0.97, bastion:0, shell:{ every:26, warn:5, dmg:26, r:52 } },
    par:{ sec:600, loss:22 },
  },

  /* --- 6 — LEJ -------------------------------------------------------------
     Uczy: rozwinięta baza nie pomaga tak, jak się gracz spodziewa.
     Problem, który ta misja rozwiązuje: finał z pełną bazą trwa minutę i jest
     antyklimaksem. Podbicie HP bastionu tego NIE naprawia — wydłuża to samo.
     Naprawia KSZTAŁT: w leju trzydzieści jednostek wchodzi po kilka, a bastion
     bije w zwężenie. Siła przestaje być odpowiedzią, KOLEJNOŚĆ WEJŚCIA
     zaczyna nią być. Główne pokrętło tej misji to przepustowość leja —
     HP bastionu rusza się OSTATNIE.                                          */
  m6: {
    id:'m6', n:6, code:'LEJ',
    teach:'Siła przestaje być odpowiedzią.',
    gen:'Wejście jest jedno. Kolejność ustalasz Ty.',
    brief:['Korytarz zwęża się przed bastionem. Wejdziecie po kilku.',
           'Bastion bije w gardło, nie w całe pole.',
           'Artyleria i ciężka fabryka są Twoje. Reszta to kolejność.',
           'Dziewiąta fala jest ich szczytem. Dziesiąta daje Ci okno.',
           'Ich rezerwy są policzone — od dwunastej fali zaczną się kończyć.'],
    grid:[7,6], shape:'1-3-1', len:3600, money:700,
    ore:['..##...',
         '.......',
         '......#',
         '....#..',
         '..#....',
         '.....#.'],
    // W finale drogi są szersze i bez objazdów: tu treścią nie jest wybór trasy,
    // a KOLEJNOŚĆ WEJŚCIA w lej. Baterie na skrzydłach są jedyną rzeczą, która
    // ścina ich fale — bez nich gardło jest nie do przejścia.
    roadGap:280, roadW:180,
    roads:[
      { n:'GÓRNA',    y:-1, bow:0, sect:[{ kind:'bateria', n:'BATERIA PN.', f:0.62 }] },
      { n:'ŚRODKOWA', y: 0, bow:0, sect:[{ kind:'sztab',   n:'WĘZEŁ',      f:0.55 }] },
      { n:'DOLNA',    y: 1, bow:0, sect:[{ kind:'bateria', n:'BATERIA PD.', f:0.62 }] },
    ],
    unlock:['power','refinery','barracks','bunker','workshop','radar','rocket','factory',
            'reactor','lab','arty','heavy'],
    /* SZESNAŚCIE FAL, KTÓRE ROSNĄ, A POTEM SIĘ KOŃCZĄ — i to jest cała naprawa
       finału, nie geometria leja.

       Pomiar przed planem (15.09) mówił wprost: 0/2, sztab na 3%, dwadzieścia
       cztery stracone obiekty, bastion nietknięty. Armia stawała 643 px od
       bastionu i stała tam do końca, bo PRZEGRYWAŁA WOJNĘ NA WYCZERPANIE —
       wróg rozbudowywał się szybciej (269 jednostek na polu wobec 182 gracza).
       Front w tej grze przesuwa się wyłącznie przez lokalne wygrywanie starć,
       więc przy wiecznej młynce nikt nie posuwa się ani o piksel.

       Plan autorski zdejmuje to u źródła: przy `waves` baza wroga NIE ROŚNIE
       (sim.js), więc jego siła jest zapisana, a nie wykładnicza. Kształt planu
       jest wtedy treścią finału: fale 7–9 to szczyt ich siły, fala 10 to OKNO,
       a od dwunastej ich rezerwy się kończą. Bastion zostaje sam — dokładnie
       wtedy, gdy kolejność wejścia w lej zaczyna cokolwiek znaczyć.

       Świadomie BEZ terminu: finał ma być o przełamaniu gardła, nie o zegarze.
       Przegrać wciąż można normalnie — bastion ostrzeliwuje, a szczyt fal
       potrafi zjeść bazę.

       MASA WYBRANA POMIAREM i tu różnica jest największa w całej kampanii:
         ×2 (szczyt 67 jedn. na polu) · sztab 13% · bastion 100% · cele 0/3
         TA (szczyt 23 jedn. na polu) · sztab 100% · BASTION 65% · cele 2/3
       Przy cięższej krzywej armia w ogóle nie dochodzi do gardła — to ten sam
       wynik, co przed planem. Przy tej dochodzi, bierze dwa cele i zaczyna
       gryźć bastion; misja trwa ~16 minut, czyli dokładnie tyle, ile finał
       miał trwać. Lekka krzywa NIE jest tu ułatwieniem: to jedyna, przy której
       finał w ogóle się wydarza.                                              */
    waves:[
      { t:50, inf:5 },
      { t:40, inf:6,  lazik:1 },
      { t:36, inf:7,  lazik:2 },
      { t:32, inf:9,  lazik:2, tank:1 },
      { t:28, inf:11, lazik:3, tank:2 },              // ▲
      { t:46, inf:6,  lazik:2 },                      // ▼ oddech
      { t:32, inf:8,  lazik:3, tank:1, rkt:2 },
      { t:29, inf:10, lazik:3, tank:2, rkt:2 },
      { t:25, inf:14, lazik:4, tank:3, rkt:2 },       // ▲ SZCZYT ICH SIŁY
      { t:48, inf:6,  lazik:2, tank:1 },              // ▼ OKNO — tędy wchodzi się w lej
      { t:34, inf:9,  lazik:3, tank:2, rkt:1 },       // ostatnie porządne uderzenie
      { t:34, inf:7,  lazik:2, tank:1, rkt:1 },       // ▼ ich rezerwy się kończą
      { t:36, inf:5,  lazik:2, tank:1 },
      { t:38, inf:4,  lazik:1, tank:1 },
      { t:40, inf:3,  lazik:1 },
      { t:44, inf:3 },                                // dalej bastion broni się sam
    ],
    feats:feats({ stance:5, sectors:3, radar:2, cards:true, sell:true, repair:true, move:true, upgrade:true, terrIncome:true }),
    goal:{ kind:'bastion' },
    enemy:{ doc:'CZERWONA FALA', base:['barracks','barracks','barracks','rocket','factory'], grow:1,
            spawnF:0.97, bastion:2200, shell:{ every:22, warn:4, dmg:30, r:56 } },
    par:{ sec:900, loss:30 },
  },
};

/* --------------------------------- ŚWIATY --------------------------------
   Świat to DANE, nie kod. Kolejny świat = nowy wpis: inne kafle, inny kształt,
   inna doktryna, ta sama ramka. Jeśli dodanie świata wymaga dotknięcia kodu
   rozgrywki — ramka jest zepsuta (patrz „nudny świat kontrolny", FRONT.md §9.7). */
export const WORLDS = [
  { id:'s1', name:'PIERWSZY FRONT', tiles:'ziemia',
    sub:'Sześć kroków do bastionu.',
    shape:'1-3-1', doctrine:'CZERWONA FALA', win:'bastion',
    missions:['m1','m2','m3','m4','m5','m6'] },
];

export const worldOf = id => WORLDS.find(w => w.missions.includes(id)) || WORLDS[0];
export const missionAt = (w, i) => MISSIONS[w.missions[i]];

/* ------------------------------ GRA DOWOLNA -------------------------------
   Ten sam rekord misji, tylko wszystko włączone i cel = bastion. Dzięki temu
   gra dowolna i kampania to JEDEN silnik ramki, a nie dwa tryby — każda misja
   napisana raz służy obu. Odblokowywana po przejściu Świata I.               */
export const SKIRMISH = {
  id:'skirmish', n:0, code:'GRA DOWOLNA',
  teach:'Wszystko naraz.', gen:'Front jak zawsze. Reszta losowa.',
  brief:['Losowa doktryna, losowe warianty pola, pełna eskalacja.'],
  grid:[7,6], shape:'1-3-1', len:3200, money:null,
  roadGap:300, roadW:150,
  roads:[
    { n:'GÓRNA',    y:-1, bow:0.30, sect:[{ kind:'most',    n:'MOST',    f:0.40 },
                                          { kind:'bateria', n:'BATERIA', f:0.76 }] },
    { n:'ŚRODKOWA', y: 0, bow:0,    sect:[{ kind:'sztab',   n:'WĘZEŁ',   f:0.52 }] },
    { n:'DOLNA',    y: 1, bow:0.30, sect:[{ kind:'sklad',   n:'SKŁAD',   f:0.38 },
                                          { kind:'wieza',   n:'WIEŻA',   f:0.72 }] },
  ],
  unlock:null,                       // null = pełne drzewko z tabeli B (req jak dotąd)
  feats:feats({ stance:5, sectors:3, radar:2, cards:true, sell:true, repair:true,
                upgrade:true, terrIncome:true }),
  goal:{ kind:'bastion' },
  enemy:{ doc:null, base:null, grow:1, spawnF:0.97, bastion:2200 },
  waveT:null,
  par:{ sec:900, loss:30 },
};
