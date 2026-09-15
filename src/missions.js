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
              upgrade:false, ore:true, terrIncome:false };
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
           'Elektrownia daje moc. Rafineria zamienia rudę w kredyty.',
           'Za 55 sekund zameldują się goście. Działa sztabu je przyjmą.'],
    grid:[5,4], shape:'1', money:400, camX:860,
    unlock:['power','refinery'],
    feats:feats({}),
    // Cel liczy KREDYTY ZAROBIONE, nie saldo. Liczony po saldzie karałby za budowanie,
    // czyli dokładnie za to, czego misja uczy — bot to pokazał: wygrywał dopiero
    // w 5. fali, bo wydawał wszystko na bieżąco. `after:1` trzyma wygraną do pierwszej
    // fali, żeby gracz zobaczył, PO CO była ekonomia: z prądem i rafinerią cel pada
    // tuż PO odparciu fali, bez nich to cztery minuty i kilka fal — presja bez
    // twardego limitu czasu.
    goal:{ kind:'money', target:600, after:1 },
    enemy:{ doc:'CZERWONA FALA', base:['barracks'], grow:0, spawnX:800, bastion:0 },
    waveT:[55, 45],
    par:{ sec:150, loss:0 },
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
    gen:'Osiem fal. Nie oddasz ani kratki.',
    brief:['Ciaśniej niż wczoraj. Każda kratka to decyzja.',
           'Gniazdo strzela samo. Barak co falę wystawia żołnierza.',
           'Fale 1–3 przyjmiesz gniazdem. Od czwartej potrzebujesz ludzi.'],
    grid:[5,4], shape:'1', money:450, camX:860,
    unlock:['power','refinery','barracks','bunker'],
    feats:feats({ sell:true, repair:true }),
    goal:{ kind:'waves', target:8 },
    enemy:{ doc:'CZERWONA FALA', base:['barracks','barracks'], grow:0.5, spawnX:820, bastion:0 },
    waveT:[40, 34],
    par:{ sec:330, loss:6 },
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
           'Przejęty mini-sztab płaci kredytami i otwiera nowe kratki.'],
    grid:[5,5], gridMax:[7,5], shape:'1', money:500, camX:1000,   // przejęty sztab = +1 kolumna kratek
    unlock:['power','refinery','barracks','bunker','workshop','radar'],
    feats:feats({ stance:2, sectors:1, radar:1, sell:true, repair:true, upgrade:true, terrIncome:true }),
    goal:{ kind:'sectors', target:1 },
    enemy:{ doc:'CZERWONA FALA', base:['barracks','barracks'], grow:0.7, spawnX:980, bastion:0 },
    waveT:[45, 32],
    par:{ sec:420, loss:10 },
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
    gen:'Trzy tory. Wybierz, który oddajesz.',
    brief:['Korytarz się rozszerza. Trzy tory, trzy mini-sztaby.',
           'Weź dwa. Trzeciego nie obronisz — i o to chodzi.',
           'Fabryka daje czołgi. Oni odpowiedzą rakietami.'],
    grid:[7,6], shape:'1-3-1', money:600, camX:1200,
    unlock:['power','refinery','barracks','bunker','workshop','radar','rocket','factory'],
    feats:feats({ stance:4, sectors:3, radar:2, sell:true, repair:true, upgrade:true, terrIncome:true }),
    goal:{ kind:'sectors', target:2 },
    enemy:{ doc:'CZERWONA FALA', base:['barracks','barracks','barracks'], grow:0.85, spawnX:1090, bastion:0 },
    waveT:[45, 30],
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
           'Sztab przysyła rozkazy — pierwsze karty do wyboru.'],
    grid:[7,6], shape:'1-3-1', money:650, camX:1200,
    unlock:['power','refinery','barracks','bunker','workshop','radar','rocket','factory','reactor'],
    feats:feats({ stance:4, sectors:3, radar:2, cards:true, sell:true, repair:true, upgrade:true, terrIncome:true }),
    goal:{ kind:'hold', target:2, waves:4 },
    enemy:{ doc:'CZERWONA FALA', base:['barracks','barracks','barracks','rocket'], grow:1,
            spawnX:1110, bastion:0, shell:{ every:26, warn:5, dmg:26, r:52 } },
    waveT:[40, 30],
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
           'Artyleria i ciężka fabryka są Twoje. Reszta to kolejność.'],
    grid:[7,6], shape:'1-3-1', money:700, camX:1200,
    unlock:['power','refinery','barracks','bunker','workshop','radar','rocket','factory',
            'reactor','lab','arty','heavy'],
    feats:feats({ stance:5, sectors:3, radar:2, cards:true, sell:true, repair:true, upgrade:true, terrIncome:true }),
    goal:{ kind:'bastion' },
    enemy:{ doc:'CZERWONA FALA', base:['barracks','barracks','barracks','rocket','factory'], grow:1,
            spawnX:1114, bastion:2200, shell:{ every:22, warn:4, dmg:30, r:56 } },
    waveT:[40, 30],
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
  grid:[7,6], shape:'1', money:null, camX:1200,
  unlock:null,                       // null = pełne drzewko z tabeli B (req jak dotąd)
  feats:feats({ stance:5, sectors:3, radar:2, cards:true, sell:true, repair:true,
                upgrade:true, terrIncome:true }),
  goal:{ kind:'bastion' },
  enemy:{ doc:null, base:null, grow:1, spawnX:null, bastion:null },
  waveT:null,
  par:{ sec:900, loss:30 },
};
