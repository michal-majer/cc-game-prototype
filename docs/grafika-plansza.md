# Brief na grafikę planszy

Czego potrzebuje silnik, żeby pole bitwy wyglądało jak wizualizacja docelowa.
Dotyczy **wyłącznie planszy**: grunt, drzewa, skały, ślady walki. Bez jednostek,
bez budynków, bez interfejsu.

---

## 1. Dlaczego pierwsze arkusze nie wystarczyły

Nie chodzi o jakość rysunku — ta jest dobra. Chodzi o **format**. Arkusze
z `assets/raw/` są planszami poglądowymi, a nie materiałem do kaflowania, i to
przesądza o tym, jak wyglądają w ruchu.

| Wada | Co robi w grze |
|---|---|
| kafel jest **scenką ze skomponowanym środkiem** (drzewo pośrodku, głaz pośrodku) | powtórzony przez pole czyta się jako tapeta, bo oko wyłapuje ten sam układ co 52 px |
| kafel ma **wrysowaną ramkę i cień** | widoczna krata na całym polu |
| kafel ma **jaśniejszą i ciemniejszą połowę** | szachownica, nawet gdy tony wariantów są zgrane co do jednostki |
| krawędzie **nie schodzą się** z sąsiadem | szew widoczny przy każdym styku |
| rozstaw kafli **faluje** (98–114 px zamiast stałej) | sztywne cięcie wkłada w każdy kafel paski sąsiadów |
| obiekty są **wtopione w grunt** | nie da się ich rozstawić osobno ani przeskalować |

Płaskiego gruntu, który wolno powtarzać, było w całym arkuszu terenu **cztery
kafle**. Reszta to scenki.

**Wniosek, który zmienia zamówienie:** nie zamawiamy „tilesetu". Zamawiamy
**wielkie, jednolite płachty materiału** (z nich sam wytnę kafle i zrobię je
bezszwowymi) plus **osobne obiekty na jednolitym tle**. To jest format, w którym
generator jest mocny, a my nie tracimy niczego.

---

## 1a. Czym to generować

Nie chodzi o markę, tylko o **jedną zdolność**: model musi umieć generować
w trybie kaflowania (circular padding / seamless / `--tile`). Bez niego dostajesz
ładny obrazek, który na styku z samym sobą pokazuje szew.

| Zadanie | Czego szukać | Dlaczego |
|---|---|---|
| płachty materiału (A) | **tryb kaflowania**: `--tile` w Midjourney albo „Tiling / circular padding" w Stable Diffusion (ComfyUI, A1111, Invoke) | to jedyna rzecz, której nie da się dobrze naprawić po fakcie; przesunięcie i wtopienie szwu zawsze zostawia ślad |
| obiekty (B, C) | model **instrukcyjny** (czatowy generator obrazu) | trzeba wyegzekwować jednolite magentowe tło i rozdzielenie obiektów, a modele instrukcyjne trzymają się takich poleceń lepiej niż modele „estetyczne" |

Jeśli masz tylko generator bez trybu kaflowania — płachty i tak się przydadzą.
Wytnę z nich okna i zszyję szwy offline; wyjdzie gorzej niż z prawdziwego
kaflowania, ale wciąż nieporównanie lepiej niż z kafli-scenek.

**Na obiekty rozważ generowanie pojedynczo** — jeden obiekt na obraz, na
magencie — zamiast całego arkusza. Więcej generowań, ale znacznie wyższa
skuteczność: model przestaje mieć pokusę komponowania sceny, a wycinanie staje
się trywialne.

Parametry startowe: Midjourney `--tile --ar 1:1 --style raw --stylize 100`;
Stable Diffusion: kaflowanie włączone, CFG 5–7, kwadrat 1024.

---

## 2. Co zamawiamy

### Paczka A — płachty materiału (4 obrazy)

Jeden obraz na materiał, **1024×1024 px**, wypełniony fakturą **od krawędzi do
krawędzi**. Bez ramki, bez marginesu, bez podpisu, bez siatki, bez pojedynczego
dużego obiektu w środku.

| Plik | Materiał | Gdzie w grze |
|---|---|---|
| `assets/raw/tex-trawa.png` | niska trawa z przetarciami, kamyki, mech | pobocze, większość mapy |
| `assets/raw/tex-ziemia.png` | ubita, zryta ziemia, koleiny, żwir, sucha glina | trakt, pole walki |
| `assets/raw/tex-piach.png` | suchy piasek z drobną falą i kamykami | warianty misji, przejścia |
| `assets/raw/tex-beton.png` | zniszczony beton: włosowate pęknięcia, zacieki, mech w szczelinach | plac bazy |

Dla betonu ważne: **ciągła powierzchnia, nie panele**. Rytm płyt wprowadza
własną kratę, a rozdzielenie kratek budowy rysuje już silnik.

### Paczka B — roślinność i skały (1 arkusz)

**1536×1024 px**, obiekty rozrzucone na **jednolitym magentowym tle `#FF00FF`**,
każdy w pełni osobno, z szerokim marginesem pustego tła.

Zawartość: iglaki (3 rozmiary), drzewa liściaste (2), suche/spalone drzewa (2),
pnie i karpy (2), krzaki (3), głazy i skupiska kamieni (4), kępy trawy (2).

### Paczka C — ślady walki (1 arkusz)

Ten sam format co B.

Zawartość: leje po pociskach (4 rozmiary), wypalenia i osmalenia gruntu (3),
wraki pojazdów (3), stanowiska z worków z piaskiem (2), jeże czeskie (2),
zasieki (2), zwały gruzu betonowego (3), porzucone skrzynie i beczki (4).

---

## 3. Wymagania wspólne — to jest sedno

Te punkty decydują o tym, czy dostawa da się użyć. Każdy z nich wziął się
z konkretnej rzeczy, która poszła źle za pierwszym razem.

1. **Równomierne światło.** Żadnego gradientu jasności przez obraz, żadnej
   winiety, żadnego „reflektora" na środku. Gradient w płachcie powtórzony przez
   pole robi szachownicę — to była najtrudniejsza do usunięcia wada.
2. **Brak ramek i obwódek.** Ani wokół obrazu, ani wokół pojedynczego kafla, ani
   wokół obiektu.
3. **Brak kompozycji w płachtach.** Płachta ma być **fakturą**, nie ilustracją:
   żadnego punktu centralnego, żadnej ścieżki przez środek, żadnego dużego
   obiektu. Największy element to kamień wielkości pięści.
4. **Obiekty osobno.** W paczkach B i C żaden obiekt nie dotyka drugiego i nie
   nachodzi na niego. Cień obiektu nie może wchodzić na sąsiada — inaczej
   automatyczne wycinanie sklei dwa obiekty w jeden.
5. **Jedna kamera dla wszystkiego.** Widok z góry z lekkim odchyleniem (ok. 70–75°),
   identyczny dla każdego obiektu. Mieszanka rzutów widać natychmiast.
6. **Światło z lewej góry, cień miękki, w prawo w dół**, wtopiony w sprite.
   Jeden kierunek dla wszystkich obiektów.
7. **Paleta gry.** Ciemna i odbarwiona. Kotwice z `src/config.js`:
   tło `#0f1315`, ziemia `#1a2022`, ruda `#c9a227`, tekst `#c8d4d6`.
   Materiał ma siedzieć w tej rodzinie — jasna, nasycona zieleń krzyczy
   i zabija czytelność jednostek.
8. **Bez napisów, numerów, znaków wodnych, legend.**
9. **Format PNG, bez kompresji stratnej.**

---

## 4. Prompty

Do wklejenia bez zmian. Po angielsku, bo generatory trzymają się wtedy bliżej
wymagań technicznych.

### A1 — trawa

```
Seamless tileable ground texture, top-down orthographic view, hand-painted
stylized 2D RTS game art. Temperate grassland: short dry grass, patches of bare
soil, small pebbles, moss. The texture fills the ENTIRE canvas edge to edge as
one continuous uniform surface.

Absolutely flat even lighting across the whole image — no light source, no
gradient, no vignette, no highlight, no shadows.

NO trees, NO bushes, NO rocks bigger than a fist, NO paths, NO objects, NO focal
point, NO composition, NO border, NO frame, NO grid lines, NO text, NO watermark.

Muted desaturated palette, dark olive green and grey-brown, low contrast, matches
a dark UI (#0f1315 background). Fine even detail at a consistent small scale.
1024x1024.
```

### A2 — ziemia (trakt, pole walki)

Jak A1, z podmienionym opisem materiału:

```
Churned bare earth of a battlefield: dried mud, vehicle track ruts, loose gravel,
cracked clay, scattered small stones.
```

### A3 — piach

```
Dry sand: fine wind ripples, small scattered pebbles, patches of coarser grit.
```

### A4 — beton

```
Worn concrete surface: hairline cracks, oil and water stains, moss creeping in
the cracks, small chips and spalling. One CONTINUOUS slab surface — no panel
joints, no repeating tile pattern, no expansion lines.
```

### B — roślinność i skały

```
Game asset sheet of isolated top-down props for a 2D RTS, on a PLAIN SOLID
MAGENTA background (#FF00FF).

Contents: 3 conifer trees in different sizes, 2 deciduous trees, 2 dead burnt
trees, 2 tree stumps, 3 bushes, 4 boulders and rock clusters, 2 grass tufts.

Each object is FULLY SEPARATE with wide empty magenta margins around it. Objects
never touch or overlap. No object's shadow reaches another object.

All objects share one camera: viewed from above with a slight tilt (about 70
degrees), identical for every object. Light from the top-left, one soft shadow
baked under each object falling to the bottom-right.

NO ground texture, NO grass or soil under the objects, NO tiles, NO frames, NO
labels, NO text, NO numbers, NO watermark.

Hand-painted stylized art, muted desaturated palette, dark olive and grey-brown,
matching a dark UI. 1536x1024.
```

### C — ślady walki

```
Game asset sheet of isolated top-down battlefield debris for a 2D RTS, on a
PLAIN SOLID MAGENTA background (#FF00FF).

Contents: 4 shell craters in different sizes seen from directly above, 3 scorched
burn patches, 3 destroyed armoured vehicle wrecks, 2 sandbag emplacements, 2
czech hedgehog anti-tank obstacles, 2 barbed wire sections, 3 piles of broken
concrete rubble, 2 wooden crates, 2 fuel barrels.

Each object is FULLY SEPARATE with wide empty magenta margins around it. Objects
never touch or overlap.

All objects share one camera: viewed from above with a slight tilt (about 70
degrees), identical for every object. Light from the top-left, one soft shadow
baked under each object falling to the bottom-right.

NO ground texture under the objects, NO tiles, NO frames, NO labels, NO text,
NO watermark.

Hand-painted stylized art, muted desaturated palette, dark olive and grey-brown,
matching a dark UI. 1536x1024.
```

### Negatyw (dla Stable Diffusion; modele czatowe go nie potrzebują)

```
vignette, gradient, light source, sunbeam, cast shadow, border, frame, margin,
grid lines, visible tile seams, text, watermark, signature, label, numbers,
single large object, tree, bush, boulder, path, road, composition, focal point,
depth of field, blur, bokeh, high contrast, saturated colors, neon, isometric
view, perspective, horizon, sky, character, vehicle, building
```

---

## 5. Jak sprawdzić dostawę, zanim trafi do repo

Płachty (paczka A) — **zmruż oczy i spójrz na miniaturę**:

- [ ] czy któryś róg jest wyraźnie jaśniejszy od pozostałych? → odrzuć, gradient
      zrobi szachownicę
- [ ] czy widać pojedynczy obiekt przyciągający wzrok? → odrzuć, to scenka
- [ ] czy faktura dochodzi do samej krawędzi? → jeśli jest margines albo ramka,
      odrzuć

Arkusze obiektów (B, C):

- [ ] czy tło jest **jednolicie magentowe**, bez gradientu i bez cieni na tle?
- [ ] czy da się poprowadzić palcem wokół każdego obiektu po samym tle?
- [ ] czy cienie padają w jedną stronę u wszystkich obiektów?
- [ ] czy nie ma podpisów ani numerów?

Niezdany punkt to nie drobiazg — każdy z nich kosztuje albo ręczne poprawki,
albo widoczną wadę na całym polu.

---

## 6. Co dzieje się po stronie kodu, gdy dostawa wejdzie

Wsad ląduje w `assets/raw/` (patrz `assets/README.md`), cięcie robi
`tools/kafle.py`. Po stronie kodu dochodzi wtedy:

1. **Kafle z płachty zamiast z kafli.** Wariant gruntu wycinany jako okno
   128×128 z losowego miejsca płachty — wariantów jest wtedy dziesiątki, nie
   dziewięć, i żaden nie ma własnej ramki ani plamy. Odpada połowa obecnej
   obróbki (wyrównywanie tonu krawędzi, filtr górnoprzepustowy).
2. **Bezszwowość robiona offline** — przesunięcie o pół kafla i wtopienie szwu.
   Płachta 1024 px daje na to zapas, którego pojedynczy kafel nie dawał.
3. **Miękkie przejścia między gruntami.** Z płacht da się wygenerować „plamy"
   z rozmytą krawędzią alfa, kładzione na podłoże. Wtedy trawa wchodzi w ziemię
   płynnie, zamiast po granicy kratki — dziś to jedyne miejsce, gdzie siatka
   jeszcze się zdradza.
4. **Rozstawianie obiektów po gęstości**, nie po kratce: drzewa kępami, leje
   gęściej w stronę bastionu.

Punktów 1–3 nie da się zrobić z obecnego materiału — stąd to zamówienie.
