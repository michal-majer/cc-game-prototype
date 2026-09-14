# Kampania — rosnąca mapa (pomysł z 14.09.2026)

> Pomysł Michała z rozmowy 14.09.2026, spisany, żeby nie zginął. To jest kierunek, nie
> specyfikacja: liczby są do sprawdzenia w grze, kolejność robót na końcu.

## Jedno zdanie

Nie zaczynasz każdej partii od zera. Zaczynasz od małej bazy i samej obrony, a mapa rośnie
w miarę, jak przesuwasz front: przedpole, środek, natarcie, bastion. Baza i armia zostają
między etapami.

## Dlaczego

- **Wolny start znika.** Pierwszy etap to sama obrona bez suwaka i bez sektorów, więc gra
  uczy się sama, bez samouczka.
- **„Druga partia wygląda jak pierwsza" znika.** Mapa rośnie, baza zostaje, każdy etap
  wprowadza coś nowego.
- **Hak „przesuwasz front" staje się dosłowny.** Mapa odsłania się tam, gdzie doszedłeś.
- **Długość.** Steam zwraca pieniądze za grę poniżej 2 godzin (i do 14 dni od zakupu).
  Małe strategie w tej cenie dają 4–8 godzin. Cel kampanii: **4–6 godzin**, plus potyczka
  bez końca na dogrywkę.

## Struktura: etap → teatr → kampania

| Warstwa | Co to jest | Długość |
|---|---|---|
| **Etap** | jeden krok frontu: obrona → przedpole → środek → natarcie | 8–15 min |
| **Teatr** | jeden front z własnym bastionem, doktryną wroga i układem rudy; 4 etapy | 40–60 min |
| **Kampania** | 4–5 teatrów po kolei, każdy trudniejszy, z odblokowaniami | 3–5 h, z powtórkami 4–6 h |

Rachunek: 4 teatry × 4 etapy = 16 misji. Teatr drugi i dalsze to głównie **dane**, nie nowy
kod: doktryna wroga, warianty pola, co odblokowane, ile fal, co jest celem.

## Cztery etapy teatru

| Etap | Co się odsłania | Cel | Co nowego dla gracza |
|---|---|---|---|
| 1. Obrona | baza, mała siatka | przetrwać N fal (albo X minut) | budynki podstawowe, **bez suwaka** |
| 2. Przedpole | przedpole z **mini-bazą wroga** | zdobyć sektor | suwak z dwiema pozycjami, **nowe kratki** przy froncie |
| 3. Środek | środek, radar, karty | zdobyć środek | wywiad, karty co 3 fale, pojazdy wroga |
| 4. Natarcie | nacisk i bastion | zniszczyć bastion | pełny suwak, artyleria, ciężkie |

Mini-baza wroga w zdobywanym sektorze to punkt startu jego fal na tym etapie (dziś: lista
`S.eBase` i pozycja `SECT[i].x`). Po zdobyciu sektora mapa odsłania następny.

## Zasady, bez których to się rozsypie

1. **Punkt kontrolny na start każdego etapu.** Stan bazy zapisany na początku etapu;
   „powtórz etap" wraca do niego. Bez tego gracz, który źle zbudował w etapie 1, utknie
   w etapie 3 bez wyjścia.
2. **Wróg skaluje się z numerem etapu i teatru, nie z bazą gracza.** Inaczej dobra baza
   z etapu 1 rozjeżdża etap 3 bez walki. Do tego stały przydział kredytów na start etapu,
   żeby słabsza baza mogła nadrobić.
3. **Zdobyty sektor daje nowe kratki, nie tylko kredyty.** Raporty z 14.09: siatka pełna
   po 10 falach i 1 700–1 950 kredytów bez zastosowania. Przedpole odsłania kilka pól do
   zabudowy przy froncie (wysunięta baza). To nagroda, którą czuć, i zlew na pieniądze.
4. **Baza przechodzi między etapami w teatrze, nie między teatrami.** Nowy teatr = nowy
   front i nowa mała baza. Ulepszenia armii z kart zostają. Bez efektu, że baza z teatru 1
   rozjeżdża teatr 4.
5. **Odblokowania rozłożone na całą kampanię.** Dziś 13 budynków i 17 kart od razu.
   W kampanii po jednym–dwa na etap. To darmowa treść, bo już istnieje.
6. **Grafika teatru = podmiana kafli i koloru, nie nowa mapa.** Ziemia, śnieg, pustynia:
   trzy zestawy kafli terenu, ta sama siatka, te same budynki.

## Teatr jako dane (szkic)

```js
// szkic — docelowo obok DOCTRINES w src/config.js albo osobny src/kampania.js
{
  id:'t1', name:'PIERWSZY FRONT', tiles:'ziemia',
  doctrine:'CZERWONA FALA',
  mods:['zaopatrzenie'],                 // warianty pola na ten teatr (z MODIFIERS)
  unlock:{ buildings:['power','refinery','barracks'], cards:[] },   // stan na wejściu
  stages:[
    { id:'obrona',    goal:{ waves:8 },                  unlock:{ buildings:['rocket'] } },
    { id:'przedpole', goal:{ sector:0 }, eBase:['barracks','barracks'], unlock:{ buildings:['workshop','radar'], cells:[[7,1],[7,2],[7,3]] } },
    { id:'srodek',    goal:{ sector:1 }, eBase:['barracks','barracks','barracks','rocket'], unlock:{ cards:true, buildings:['factory'] } },
    { id:'natarcie',  goal:{ bastion:true }, unlock:{ buildings:['lab','arty'] } },
  ],
  startMoney:250, grant:200,             // kredyty na start teatru i na start każdego etapu
}
```

Co już jest w kodzie i na czym to siada: pozycje sektorów (`SECT`), baza wroga jako lista
budynków (`S.eBase`), doktryny (`DOCTRINES`), warianty (`MODIFIERS`), odstęp fal
(`waveInterval`), raport końca partii z rozbiciem dochodu (`finishRun`), bot do testów
(`tools/bot-test.js`). Do napisania: ramka etapu z warunkiem wygranej, odsłanianie mapy
i limit linii, zapis stanu między etapami (punkt kontrolny), mini-baza wroga jako punkt
startu fal, ekran między etapami, odblokowania.

## Potyczka zostaje

Obecny tryb (losowa doktryna, warianty, eskalacja rosnąca po wygranej) zostaje jako
**potyczka** do grania po kampanii i jako tryb bez końca. Eskalacja działa tylko tam.

## Wersja druga (nie teraz)

- **Trzy tory z środka** (góra / środek / dół): wybór, czy jednostki idą równo, czy na
  jeden tor. Dziś korytarz jest jeden, jednostki trzymają się osi, wróg liczy siły dla
  całego pola. Tory to zmiana w symulacji, w AI i w sektorach naraz — osobny projekt,
  po tym jak cztery etapy na jednym torze zagrają.
- Cele poboczne w etapie (utrzymaj sektor N fal, nie strać budynku, zdobądź przed falą X).

## Warianty i pomysły do dopisania

Michał: „mam masę pomysłów". Tu jest na nie miejsce, po jednej linijce, bez oceny na razie:

- (teatr) …
- (etap / cel misji) …
- (wróg / doktryna) …
- (nagroda za sektor) …

## Kolejność robót

1. **Etap 1 sam, bez reszty:** mała siatka, 8 fal, bez suwaka. Jeśli te pierwsze pięć
   minut nie wciąga, kampania tego nie naprawi. (2 wieczory)
2. Ramka etapu: warunek wygranej, ekran między etapami, punkt kontrolny. (2–3 wieczory)
3. Odsłanianie mapy, limit linii, mini-baza wroga w sektorze, nowe kratki. (2–3 wieczory)
4. Odblokowania i przydział kredytów, pierwszy teatr w całości. (2 wieczory)
5. Drugi teatr jako dane; jeśli wchodzi bez zmian w kodzie, ramka jest dobra.

Razem 8–10 wieczorów na pierwszy teatr, bez torów. Bot testuje etap tak samo jak dziś
partię.
