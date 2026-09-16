# Surowe arkusze (z AI / od grafika)

Tu leżą pliki **tak jak wyszły z generatora** — niepocięte, nie wyrównane do
siatki. Gra ich NIE wczytuje. To magazyn wsadu, nie asset.

Asset produkcyjny powstaje z nich osobno i ląduje w `assets/tiles/`,
`assets/buildings/` itd. — dopiero tamte pliki widzi `src/assets.js`.

## Dlaczego nie da się wrzucić arkusza z AI prosto do `assets/tiles/`

Loader (`loadTileset` w `src/assets.js`) tnie obraz **sztywną siatką**:
`tile` pikseli na kafel, bloki wariantów pod podanymi współrzędnymi. Arkusz
z generatora prawie nigdy tego nie spełnia:

- kafel wypada na ułamku piksela (np. 1536 px / 9 kafli = 170.6 px),
- wiersze bywają przesunięte względem siebie o kilka pikseli,
- każdy kafel ma **własną ciemną ramkę** — po ułożeniu obok siebie wychodzi
  krata, a nie ciągły teren,
- krawędzie nie są bezszwowe: prawa krawędź kafla nie pasuje do lewej sąsiada.

Dlatego krok pośredni jest obowiązkowy: **pocięcie i przełożenie na czysty
arkusz** o równej siatce w układzie, którego oczekuje `TILESETS`.

## Nazewnictwo

`<świat>-<co-to>-<data>.png`, np. `ziemia-teren-2026-09-16.png`,
`beton-baza-2026-09-16.png`. Data odróżnia kolejne podejścia generatora —
zwykle jest ich kilka, a stare warto trzymać do porównania.

Warto dopisać w commicie, czym to generowane (model + prompt), żeby dało się
dogenerować brakujący kafel w tym samym stylu.
