# Assety — grafika i dźwięk

Gra działa bez żadnych plików w tym folderze — rysuje wtedy proceduralne glify
i gra proceduralne efekty. Wrzucając pliki, podmieniasz je pojedynczo.

## Grafika (PNG)

Nazwy są zdefiniowane w `src/assets.js` (obiekt `MANIFEST`). Domyślnie:

```
assets/units/inf.png        piechota
assets/units/rkt.png        rakietowiec
assets/units/tank.png       czołg
assets/units/lazik.png      łazik
assets/units/arty.png       artyleria
assets/units/kolos.png      kolos

assets/buildings/hq.png     sztab
assets/buildings/power.png  elektrownia
...                         (reszta budynków — patrz MANIFEST)

assets/scene/bastion.png    bastion wroga
```

- Jednostki: sprite jest skalowany do rozmiaru `sz` jednostki, więc grafika
  może mieć dowolną rozdzielczość. Rysuj postać zwróconą **w prawo** (gracz);
  wersja wroga jest automatycznie odbijana w poziomie.
- Brakujący plik = fallback do glifu. Możesz podmieniać po jednym.

## Dźwięk

W `src/audio.js` użyj `registerSfx(nazwa, url)` przy starcie, np.:

```js
import { registerSfx } from './audio.js';
registerSfx('boom',  'assets/sfx/boom.wav');
registerSfx('siren', 'assets/sfx/siren.wav');
```

Dopóki nic nie zarejestrujesz, gra brzmi proceduralnie jak dotąd.
