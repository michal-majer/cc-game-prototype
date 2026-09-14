# Rozkazy generała — aktywne moce (pomysł z 14.09.2026)

> Pomysł Michała: „karty rozkazy, czyli czasowe powerupy albo moce jak nalot". Osobna
> mechanika od kart ulepszeń (ROZKAZ ZE SZTABU co 3 fale): tamte są trwałe i losowane,
> te są **na żądanie**, za punkty, i zależą od **generała**. Tylko projekt, nic z tego nie
> jest w kodzie. Skąd biorą się punkty, jest otwarte.

## Jedno zdanie

Gracz ma kilka punktów rozkazów i trzy przyciski. Naciska, kiedy chce: nalot na skupisko
wroga, forsowny marsz, zrzut zaopatrzenia. Zestaw zależy od generała, którego prowadzi.

## Jak to ma działać

- **Punkty rozkazów** (●): start 1, maksimum 5, widoczne przy przyciskach rozkazów.
- **Trzy rozkazy na generała**, klawisze Q / W / E albo klik. Każdy ma koszt w punktach
  i własne odnowienie, więc nawet z pełną pulą nie da się spamować jednego.
- Rozkaz bez celu (nalot bez wroga na polu) albo bez punktów pokazuje powód i nie schodzi.
- **Raport końca partii** dostaje listę użytych rozkazów i nazwę generała, żeby balans
  szedł z danych, jak przy ekonomii.

Pierwszy zestaw do sprawdzenia (generał ŻELAZNY):

| Rozkaz | Koszt | Odnowienie | Co robi |
|---|---|---|---|
| NALOT | 2 | 30 s | po ~1 s bomby spadają na najgęstsze skupisko wroga: ok. 45 obr., ignoruje pancerz, do 8 celów w promieniu ~60 px |
| FORSOWNY MARSZ | 1 | 25 s | Twoi +35% prędkości i +2 ataku przez 10 s |
| ZRZUT ZAOPATRZENIA | 1 | 30 s | +150 kredytów natychmiast |

Trzy różne rodzaje celowo: ogień, ruch, ekonomia. Jeśli wszystkie trzy to obrażenia,
gracz bierze zawsze ten sam.

## Skąd przybywają punkty — pytanie otwarte

Trzy kandydaty. Warto zrobić tak, żeby wszystkie trzy były w konfiguracji naraz i każde
dało się wyłączyć zerem — wtedy porównanie to zmiana trzech liczb, nie trzy wersje kodu:

```js
// szkic do src/config.js
export const CMD = {
  start:1, max:5,
  timeEvery:15,     // +1 co 15 s (0 = wyłączone)
  killsPer:0,       // +1 co N zabitych wrogów (0 = wyłączone)
  sectorEvery:0,    // +1 co N s za każdy trzymany sektor (0 = wyłączone)
};
```

| Źródło | Za | Przeciw | Pasuje do |
|---|---|---|---|
| **Czas** | zawsze coś przybywa, łatwo zbalansować | rozkazy stają się rotacją, nie decyzją; obrona i natarcie dostają tyle samo | potyczka, początkujący |
| **Zabici** | nagradza walkę, rozkazy przychodzą, gdy jest gorąco | kto wygrywa, dostaje więcej (kula śniegowa); obrona bez kontaktu nie ma nic | krótkie, gęste etapy |
| **Sektory / punkty na mapie** | wiąże rozkazy z terenem i z hakiem „przesuwasz front": zdobyty sektor to sztab bliżej frontu | gracz bez sektorów (etap 1 kampanii) nie ma rozkazów | kampania z rosnącą mapą |

Propozycja do sprawdzenia: **sektory jako główne źródło plus wolny czas jako podłoga**
(np. `timeEvery:40, sectorEvery:20`). Obrona ma wtedy jeden rozkaz na jakiś czas, a kto
trzyma dwa sektory, ma ich trzy razy więcej. „Punkty do zdobycia" na mapie to w praktyce
to samo co sektory, tylko można je położyć w innym miejscu niż mini-sztaby.

Jak sprawdzić, gdy będzie w kodzie: przestawić liczby, zagrać trzy partie na każde
ustawienie, spojrzeć w raporcie na użyte rozkazy (ile i jakich) i na wynik. Bot może
używać rozkazów sam: nalot na skupisko od 5 jednostek, marsz przy natarciu, zrzut przy
pustej kasie.

## Generał

Generał wyznacza **zestaw rozkazów**. Docelowo:

- wybierany na teatr kampanii (`docs/kampania.md`) albo na start potyczki,
- każdy ma trzy rozkazy w innym charakterze: ogień (nalot, ostrzał zaporowy), ruch
  (marsz, odwrót z osłoną), ekonomia (zrzut, przyspieszona budowa), wywiad (zwiad
  odsłania skład fali, sabotaż bastionu),
- może mieć jeden bonus stały (np. +1 punkt na start, tańsze naloty); to jest tożsamość
  generała, nie zestaw statystyk,
- generałów odblokowuje się w kampanii, tak jak budynki.

Pomysły na kolejnych generałów i rozkazy (do dopisania, po linijce):

- …

## Co trzeba zrobić w kodzie, gdy przyjdzie pora

- `src/orders.js`: tabele generałów i rozkazów, punkty, odnowienia, efekty; wpięcie
  w `sim.update` (punkty, odnowienia, bonus marszu, naloty w drodze).
- Panel z trzema przyciskami w HUD (po prawej nad suwakiem linii), klawisze Q/W/E.
- Znacznik nalotu na mapie przed uderzeniem; celowanie myszą jako opcja na PC, automat
  jako domyślne.
- Lista użytych rozkazów i generał w raporcie końca partii; zrzut jako źródło w dochodzie.
- Drugi generał, żeby wybór był wyborem. Odblokowania rozkazów w kampanii.

Szacunek: 2–3 wieczory na wersję z jednym generałem, bez celowania myszą.
