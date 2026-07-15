# BONEYARD (*Cmentarzysko*)

Strategiczny auto-battler, dieslowe RTS z boku. Budujesz budynki, jednostki maszerują
i walczą same. Ty podejmujesz tylko decyzje ekonomiczne, przestrzenne i kontrujące.

> **Wraki nie znikają. Twoi zabici stają się twoim murem — a mur odcina ci dochód.
> Żeby zarobić, musisz przetopić własnych poległych.**

## Jak uruchomić — bez instalacji czegokolwiek

Czysty vanilla JS + Canvas 2D. Zero zależności, zero bundlera.

**Najprościej (Mac / dowolny system):**
- Kliknij dwukrotnie `index.html` — otworzy się w przeglądarce i od razu działa (`file://`).

**Albo lokalny serwer (jeśli wolisz `http://`):**
```bash
python3 -m http.server 8000
# potem otwórz http://localhost:8000
```

To wszystko. Nie trzeba instalować żadnych bibliotek, node'a ani niczego.

## Jak grać

1. **Wybierz dowódcę** (pasywny bonus/minus na cały run).
2. **Wybierz kartę fali** — trudniejsza fala = większy mnożnik złomu.
3. W przerwie **buduj**: lewy klik na pusty slot → menu budowy.
4. **Prawy klik na budynek** → sprzedaj za 50%.
5. **Lewy klik na wrak** → **PRZETOP** za złom (otwiera pas, ale wpuszcza wroga).
6. **Spacja** w przerwie → odpal falę od razu, +25% do mnożnika.

### Trójkąt
STRZELCY > RAKIETOWCY > CZOŁGI > STRZELCY. Powietrze (Sępy) kontruje **wyłącznie Bateria AA**.

### O co chodzi
Zapchany wrakami pas jest bezpieczny — ale **nie generuje zabójstw, więc nie zarabiasz**.
Żeby mieć na kolejny budynek, musisz przetopić własny mur i wpuścić RDZĘ z powrotem.

## Struktura

```
index.html   — canvas + HUD/karty (DOM nad canvasem)
style.css    — HUD, karty, font pikselowy
game.js      — całość gry (CONFIG → STATE → AUDIO → SPAWN → COMBAT →
               WRECKS → ECONOMY → WAVES → INPUT → RENDER → LOOP)
```

Wszystkie pokrętła balansu są w `CONFIG` na górze `game.js`.
