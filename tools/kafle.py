#!/usr/bin/env python3
"""
FRONT — cięcie arkuszy z AI na tileset, którego oczekuje TILESETS (src/assets.js).

    pip install pillow numpy
    python3 tools/kafle.py            # -> assets/tiles/ziemia.png (+ podgląd)

DLACZEGO TO ISTNIEJE
Generator zwraca planszę poglądową, nie tileset: rozstaw kafli faluje (w teren.png
98-114 px zamiast stałej liczby), każde pole ma własną ciemną ramkę, a krawędzie nie
schodzą się z sąsiadem. Loader tnie SZTYWNĄ siatką `tile` px — arkusz wrzucony wprost
daje paski sąsiadów w każdym kaflu. Dlatego tniemy po ZMIERZONYCH SZWACH, każdy kafel
osobno, i składamy z nich czysty arkusz o równej siatce 64 px.

JAK ZMIERZYĆ NOWY ARKUSZ
Linie w SHEETS to pozycje szwów w pikselach. Dla nowego pliku odczytasz je profilem
jasności (ciemne minima = szwy) albo po prostu z podglądu w edytorze. Rozstaw NIE musi
być równy — stąd lista pozycji zamiast jednej liczby.
"""
import os, sys
from PIL import Image, ImageFilter
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT  = os.path.join(ROOT, 'assets/tiles/ziemia.png')

# --- budynki i scena: prostokąty zmierzone na arkuszu beton.png ---------------
# Wykryte automatycznie jako spójne plamy na ciemnym tle, potem przypisane do
# typów z tabeli B. Dobierane pod PROPORCJE kratki: render skaluje sprite przez
# min(szer/kratki, wys/kratki), więc kwadrat wciśnięty w fp [1,2] zostawia połowę
# pola pusty. Stąd wieża krat. -> rocket [1,2], długi kontener -> workshop [2,1].
BUILDINGS = {
  'hq':       (1074, 13,1274,205),   # maszt i sztandar — to ma być sztab
  'arty':     (1322, 14,1492,205),
  'factory':  (1073,218,1242,394),   # kominy
  'refinery': (1074,408,1242,573),   # zbiorniki
  'reactor':  (1309,406,1479,573),   # kopuła z poświatą
  'rocket':   (1415,597,1442,723),   # wieża kratownicowa, wysoka jak fp [1,2]
  'radar':    (1465,599,1505,657),   # czasza
  'power':    (1330,676,1385,721),   # agregat z pomarańczowymi światłami
  'barracks': (1291,602,1331,645),
  'bunker':   (1247,674,1290,724),
  'workshop': (1072,747,1199,790),   # długi kontener, szeroki jak fp [2,1]
  'lab':      (1463,674,1504,724),
  # heavy (CIĘŻKA FABR.) zostaje proceduralny — arkusz nie ma już bryły, która by
  # się od reszty odróżniała, a w scenariuszu I i tak wchodzi dopiero po lab.
}
SCENE = {
  'bastion': (1308,217,1479,382),    # opancerzona kopuła — twierdza wroga
}

# --- OZDOBY -----------------------------------------------------------------
# Prostokąty wykryte w prawym pasku teren.png (spójne plamy na ciemnym tle).
# Po co osobna warstwa obiektów, skoro są kafle terenu: kafel z generatora to
# SCENKA ze skomponowanym środkiem, a scenka powtórzona 200 razy zawsze będzie
# tapetą. Płaskiego gruntu, który wolno powtarzać, jest w arkuszu cztery kafle.
# Stąd podział jak na wizualizacji: gładkie podłoże + obiekty rozstawiane
# pojedynczo, z własną skalą i przesunięciem w kratce.
DECOR = {
  # pobocze — zieleń i głazy
  'krzak': [(1399,489,1448,533), (1457,489,1521,536), (1455,546,1522,593)],
  'glaz':  [(1266,495,1305,526), (1353,496,1388,524), (1228,546,1264,578),
            (1467,606,1516,638)],
  # trakt — ślady walki
  'zapora':[(1278,548,1326,580), (1337,544,1386,582), (1399,547,1447,585),
            (1349,655,1386,691), (1466,656,1518,691), (1404,709,1455,743)],
  'zlom':  [(1359,598,1387,637), (1403,602,1452,639), (1230,656,1278,692),
            (1234,709,1276,744), (1293,709,1331,744), (1294,759,1327,792)],
}
DECOR_TILE = 64          # komórka arkusza ozdób
DECOR_COLS = 6

TILE = 64          # bok kafla w gotowym arkuszu — musi zgadzać się z TILESETS.ziemia.tile
VARY = 3           # blok wariantów 3x3 = 9 odmian jednego gruntu

# --- zmierzone siatki arkuszy źródłowych (pozycje szwów w px) ----------------
SHEETS = {
  'teren': dict(
    path='assets/raw/teren.png',
    xs=[6,104,210,321,427,536,644,754,863,972,1095,1213],
    ys=[7,111,220,332,446,551,656,760,866,972],
    inset=7),                       # ile px obciąć z każdej strony, żeby zdjąć ramkę
  'beton': dict(
    path='assets/raw/beton.png',
    xs=[7+143*i for i in range(8)],
    ys=[13+round(142.4*j) for j in range(8)],
    inset=9),
}

# --- wybór kafli: (arkusz, [(wiersz, kolumna), ...]) -------------------------
# Kryterium: grunt ma być SZUMEM, nie obiektem. Drzewo, wrak czy lej mają swój
# środek kompozycji — powtórzone na polu czytają się jako tapeta, nie teren.
# Gdzie który blok siedzi w gotowym arkuszu — MUSI zgadzać się z TILESETS.ziemia
# w src/assets.js. Wiersz 0 to pasek znaczników, dalej dwa rzędy bloków 3x3.
BLOCK_AT = {'skala':(0,1), 'trawa':(3,1), 'ziemia':(6,1),
            'las':(0,4), 'kamien':(3,4), 'krzaki':(6,4)}
MARK_AT  = {'lej':0, 'ruda':1, 'wrak':2, 'ogien':3}

# Ile px obciąć dodatkowo dla konkretnego zestawu (ponad `inset` arkusza).
# Beton: zdejmujemy całą jasną ramkę płyty, zostaje sama faktura.
# Zestawy, które stykają się ze sobą na polu. Dostają WSPÓLNY ton krawędzi,
# inaczej każdy styk typów (trawa|krzaki, krzaki|las) rysuje własną linię
# i wraca krata — tym razem po granicach stref, a nie kafli.
FAMILY = ('trawa', 'ziemia', 'las', 'kamien', 'krzaki')

INSET_SET = {'skala': 30, 'trawa': 12, 'ziemia': 12, 'las': 12, 'kamien': 12, 'krzaki': 12}

SHEET_W, SHEET_H = 9, 7      # arkusz wyjściowy w kaflach (pasek znaczników + 2 rzędy bloków)

PICKS = {
  # placyk pod siatką bazy: betonowe płyty z arkusza beton.png. Mają wrysowaną
  # jasną ramkę i to jest tu ZALETA — kratka bazy ma się czytać jako kratka budowy.
  # Płyta = jedna kratka budowy, więc próbkowanie z przesunięciem jest tu wyłączone.
  # Wnętrze płyty, NIE cała płyta: ramka wrysowana w kafel powtórzona co 52 px
  # robi z placu podłogę w kratkę. Plac ma być ciągły — rozdzielenie kratek
  # budowy rysuje już silnik (CO.grid). Stąd duży inset w INSET_SET.
  'skala':  ('beton', [(0,0),(0,1),(0,4),(0,5),(0,6),(1,0),(1,1),(2,1),(2,3)], True),
  # pobocze korytarza — trawa z przetarciami, bez krzaków i kamiennych wychodni
  'trawa':  ('teren', [(0,0),(0,1),(1,0),(1,1),(1,3),(7,1),(7,2),(7,3)], True),
  # środek korytarza — goła ziemia. Unikatów jest tylko 4: arkusz ma dużo brązu,
  # ale prawie zawsze z lejem albo wrakiem w środku, a te na gruncie się powtarzają.
  'ziemia': ('teren', [(2,6),(3,5),(4,6),(5,5)], True),
  # --- pobocze: to ono robi z pola MAPĘ, a nie pasa w czerni ---------------
  # Bez nich wszystko poza korytarzem zostaje gołym tłem. Te trzy zestawy plamią
  # pobocze kępami, a nie jednolitą trawą.
  'las':    ('teren', [(0,5),(0,6),(0,8),(0,9),(0,10),(1,9),(1,10),(7,5),(7,6)], True),
  'kamien': ('teren', [(0,3),(1,2),(1,4),(4,5),(8,3),(0,2)], True),
  'krzaki': ('teren', [(2,4),(2,5),(1,3),(7,2),(7,3)], True),
}
# Znaczniki — pojedyncze kafle z górnego paska. Rozsypywane po polu, nie kaflowane.
MARKS = {
  'lej':   ('teren', (3,7)),                # lej po pocisku
  'ruda':  ('teren', (4,4)),                # największa kępa brył — żyła ma być widoczna
  'wrak':  ('teren', (6,10)),               # rozbity sprzęt
  'ogien': ('teren', (4,9)),                # pożar z dymem
}

# --- dopasowanie do palety gry ----------------------------------------------
# CO.bg #0f1315, CO.dirt #1a2022 — gra jest ciemna i odbarwiona, a arkusz z AI
# przychodzi jasny i nasycony. Bez tego kafle krzyczą i HUD przestaje być czytelny.
GRADE = {                       # (nasycenie, jasność, podniesienie dna)
  'skala':  (0.55, 0.62, 5),    # beton ma być tłem dla ikon budynków, nie bohaterem
  'trawa':  (0.70, 0.74, 6),    # pobocze może zostać zielone — to ono niesie „mapkę"
  'ziemia': (0.62, 0.72, 6),
  'las':    (0.66, 0.64, 4),    # ciemniejszy od trawy, żeby kępy czytały się jako masa
  'kamien': (0.55, 0.70, 6),
  'krzaki': (0.70, 0.72, 6),
  # Znaczniki NIE są przyciemniane tak jak grunt: lej, wrak i żyła mają być
  # widoczne z lotu kamery, a nie wtapiać się w podłoże.
  'mark':   (0.88, 0.95, 4),
  'decor':  (0.80, 0.88, 4),    # ozdoba ma się odcinać od podłoża, ale nie świecić
}

def load(sheet):
    s = SHEETS[sheet]
    return Image.open(os.path.join(ROOT, s['path'])).convert('RGB'), s

def cut(sheet, r, c, win=None, off=(0,0), extra=0):
    """Wytnij kafel po zmierzonych szwach, z insetem zdejmującym ramkę.

    `win` zawęża wycinek do okna `win` px przesuniętego o `off` — stąd biorą się
    dodatkowe warianty gruntu. To lepsze niż dorabianie ich odbiciem: odbity kafel
    ma ten sam układ plam i na polu widać go jako lustro, a przesunięte okno jest
    po prostu innym kawałkiem tej samej ziemi."""
    im, s = load(sheet)
    i = s['inset'] + extra
    x0, y0 = s['xs'][c]+i, s['ys'][r]+i
    x1, y1 = s['xs'][c+1]-i, s['ys'][r+1]-i
    if win:
        x0, y0 = x0+off[0], y0+off[1]
        x1, y1 = min(x0+win, x1), min(y0+win, y1)
    return im.crop((x0, y0, x1, y1)).resize((TILE, TILE), Image.LANCZOS)

def sample(sheet, picks, n, extra=0):
    """Zbierz n wariantów: najpierw pełne kafle, potem okna przesunięte w ich wnętrzu."""
    out = [cut(sheet, r, c, extra=extra) for r, c in picks]
    if len(out) >= n: return out[:n]
    im, s = load(sheet)
    span = min(s['xs'][1]-s['xs'][0], s['ys'][1]-s['ys'][0]) - 2*(s['inset']+extra)
    win = int(span*0.78)
    jit = [(0,0), (span-win,0), (0,span-win), (span-win,span-win), ((span-win)//2,(span-win)//2)]
    k = 0
    while len(out) < n:
        r, c = picks[k % len(picks)]
        out.append(cut(sheet, r, c, win, jit[1 + (k//len(picks)) % (len(jit)-1)], extra))
        k += 1
    return out[:n]

# Ile kontrastu WEWNĄTRZ kafla zostawić (1.0 = bez zmian). Kafel z generatora to
# scenka z jasnymi i ciemnymi plamami; położony obok sąsiada każda taka plama
# rysuje granicę kwadratu. Podłoże ma być POWIERZCHNIĄ — szczegół niesie warstwa
# ozdób, która leży na wierzchu i nie układa się w siatkę.
FLATTEN = {'trawa':0.58, 'ziemia':0.62, 'krzaki':0.66, 'kamien':0.72, 'las':0.78, 'skala':0.85}

def grade(t, which):
    sat, gain, lift = GRADE[which]
    a = np.asarray(t, dtype=np.float32)
    grey = a.mean(axis=2, keepdims=True)
    a = grey + (a - grey) * sat                 # odbarwienie
    a = lift + a * gain                         # przyciemnienie z podniesionym dnem
    k = FLATTEN.get(which)
    if k is not None:                           # spłaszczenie kontrastu do tonu kafla
        m = a.reshape(-1,3).mean(axis=0)
        a = m + (a - m) * k
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def normalize(tiles):
    """Ściągnij średnią jasność kafli do wspólnego poziomu.

    Bez tego zestaw jest patchworkiem jaśniejszych i ciemniejszych kwadratów —
    to najbardziej rzuca się w oczy na polu, bardziej niż niedopasowane krawędzie.
    Częściowo (MIX), żeby nie spłaszczyć wszystkich wariantów do jednego koloru."""
    MIX = 0.88
    arrs = [np.asarray(t, dtype=np.float32) for t in tiles]
    target = np.mean([a.reshape(-1,3).mean(axis=0) for a in arrs], axis=0)
    out = []
    for a in arrs:
        m = a.reshape(-1,3).mean(axis=0)
        a = a + (target - m) * MIX
        out.append(Image.fromarray(np.clip(a,0,255).astype(np.uint8)))
    return out

def edge_mean_of(arrs, width):
    return np.mean([np.concatenate([
        a[:width].reshape(-1,3), a[-width:].reshape(-1,3),
        a[:,:width].reshape(-1,3), a[:,-width:].reshape(-1,3)]).mean(axis=0)
        for a in arrs], axis=0)

def blend_edges(tiles, target=None, width=15):
    """Wyrównaj TON krawędzi kafli zestawu, nie zamalowuj ich.

    To jest lek na „widać kratę": kafel z generatora kończy się własnym,
    ciemniejszym obrzeżem, więc ułożony obok sąsiada rysuje linię i pole czyta
    się jako szachownica. Skoro każdy kafel zestawu kończy się tą samą jasnością,
    dowolny pasuje do dowolnego.

    Korekta jest MNOŻNIKOWA i liczona z profilu brzegu, nie wtapianiem w płaski
    kolor: wtapianie robiło wokół kafla gładką ramkę, czyli tę samą kratę, tylko
    jaśniejszą. Mnożnik zachowuje kamyki i trawę na brzegu — zmienia im wyłącznie
    ton — i gaśnie liniowo w głąb kafla, więc sam nie rysuje obwódki."""
    arrs = [np.asarray(t, dtype=np.float32) for t in tiles]
    H, W, _ = arrs[0].shape
    edge_mean = lambda a: np.concatenate([
        a[:width].reshape(-1,3), a[-width:].reshape(-1,3),
        a[:,:width].reshape(-1,3), a[:,-width:].reshape(-1,3)]).mean(axis=0)
    if target is None: target = np.mean([edge_mean(a) for a in arrs], axis=0)
    yy = np.minimum(np.arange(H), H-1-np.arange(H))[:,None]
    xx = np.minimum(np.arange(W), W-1-np.arange(W))[None,:]
    ramp = np.clip(1.0 - np.minimum(yy, xx)/width, 0, 1).astype(np.float32)[:,:,None]
    out = []
    for a in arrs:
        gain = np.clip(target / np.maximum(edge_mean(a), 1e-3), 0.6, 1.7)
        out.append(Image.fromarray(
            np.clip(a * (1 + (gain - 1) * ramp), 0, 255).astype(np.uint8)))
    return out

def expand(tiles, n):
    """Dobij zestaw do n wariantów odbiciami i obrotami unikatów."""
    ops = [lambda t: t,
           lambda t: t.transpose(Image.FLIP_LEFT_RIGHT),
           lambda t: t.transpose(Image.FLIP_TOP_BOTTOM),
           lambda t: t.transpose(Image.ROTATE_180),
           lambda t: t.transpose(Image.ROTATE_90),
           lambda t: t.transpose(Image.ROTATE_270)]
    out = list(tiles)
    k = 0
    while len(out) < n:
        out.append(ops[1 + k // len(tiles) % (len(ops)-1)](tiles[k % len(tiles)]))
        k += 1
    return out[:n]

def cutout_of(im, box, pad=2):
    """Wytnij bryłę z podanego arkusza i zdejmij tło do przezroczystości.

    Tło zdejmowane jest ZALEWANIEM OD KRAWĘDZI, nie progiem jasności: bryły mają
    własne ciemne partie (cień pod okapem, wnęki), a próg zjadłby je razem z tłem.
    Zalewanie rusza z ramki, więc ciemne wnętrze zostaje nietknięte."""
    x0, y0, x1, y1 = box
    c = im.crop((x0-pad, y0-pad, x1+pad, y1+pad)).convert('RGBA')
    a = np.asarray(c, dtype=np.int16)
    H, W = a.shape[:2]
    ring = np.concatenate([a[0,:,:3], a[-1,:,:3], a[:,0,:3], a[:,-1,:3]])
    bg = np.median(ring, axis=0)
    near = np.abs(a[:,:,:3] - bg).sum(axis=2) <= 60
    out = np.zeros((H,W), bool)
    stack = [(y,x) for y in (0,H-1) for x in range(W)] + [(y,x) for x in (0,W-1) for y in range(H)]
    stack = [(y,x) for y,x in stack if near[y,x]]
    for y,x in stack: out[y,x] = True
    while stack:
        y,x = stack.pop()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny,nx = y+dy, x+dx
            if 0<=ny<H and 0<=nx<W and near[ny,nx] and not out[ny,nx]:
                out[ny,nx] = True; stack.append((ny,nx))
    px = np.array(c)
    px[:,:,3] = np.where(out, 0, 255)
    return Image.fromarray(px)

def save_decor():
    """Złóż ozdoby w jeden arkusz: stała komórka, obiekt wpisany z marginesem.

    Stała komórka, bo render musi znać rozmiar bez tabeli wymiarów per obiekt;
    proporcje zostają, więc beczka nie robi się kwadratem."""
    im = Image.open(os.path.join(ROOT, SHEETS['teren']['path'])).convert('RGB')
    names = list(DECOR)
    rows = max(len(v) for v in DECOR.values())
    sheet = Image.new('RGBA', (DECOR_COLS*DECOR_TILE, len(names)*DECOR_TILE), (0,0,0,0))
    for r, name in enumerate(names):
        for c, box in enumerate(DECOR[name][:DECOR_COLS]):
            t = cutout_of(im, box)
            t = grade_rgba(t, 'decor')
            sc = min((DECOR_TILE-6)/t.width, (DECOR_TILE-6)/t.height)
            t = t.resize((max(1,round(t.width*sc)), max(1,round(t.height*sc))), Image.LANCZOS)
            sheet.paste(t, (c*DECOR_TILE + (DECOR_TILE-t.width)//2,
                            r*DECOR_TILE + (DECOR_TILE-t.height)//2), t)
    out = os.path.join(ROOT, 'assets/tiles/decor.png')
    sheet.save(out)
    print('zapisano', os.path.relpath(out, ROOT), sheet.size,
          '—', ', '.join(f'{n}×{len(DECOR[n])}' for n in names))

def grade_rgba(t, which):
    a = np.asarray(t, dtype=np.float32)
    sat, gain, lift = GRADE[which]
    rgb = a[:,:,:3]
    grey = rgb.mean(axis=2, keepdims=True)
    rgb = lift + (grey + (rgb - grey)*sat) * gain
    a[:,:,:3] = np.clip(rgb, 0, 255)
    return Image.fromarray(a.astype(np.uint8))

def cutout(box, pad=2):
    """Wytnij bryłę i zdejmij tło do przezroczystości.

    Tło zdejmowane jest ZALEWANIEM OD KRAWĘDZI, nie progiem jasności: bryły mają
    własne ciemne partie (cień pod okapem, wnęki), a próg zjadłby je razem z tłem.
    Zalewanie rusza z ramki, więc ciemne wnętrze zostaje nietknięte."""
    im, _ = load('beton')
    x0, y0, x1, y1 = box
    c = im.crop((x0-pad, y0-pad, x1+pad, y1+pad)).convert('RGBA')
    a = np.asarray(c, dtype=np.int16)
    H, W = a.shape[:2]
    ring = np.concatenate([a[0,:,:3], a[-1,:,:3], a[:,0,:3], a[:,-1,:3]])
    bg = np.median(ring, axis=0)
    near = np.abs(a[:,:,:3] - bg).sum(axis=2) <= 60
    out = np.zeros((H,W), bool)
    stack = [(y,x) for y in (0,H-1) for x in range(W)] + [(y,x) for x in (0,W-1) for y in range(H)]
    stack = [(y,x) for y,x in stack if near[y,x]]
    for y,x in stack: out[y,x] = True
    while stack:
        y,x = stack.pop()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny,nx = y+dy, x+dx
            if 0<=ny<H and 0<=nx<W and near[ny,nx] and not out[ny,nx]:
                out[ny,nx] = True; stack.append((ny,nx))
    px = np.array(c)
    px[:,:,3] = np.where(out, 0, 255)
    return Image.fromarray(px)

def save_pieces():
    for name, box in BUILDINGS.items():
        t = cutout(box)
        t.save(os.path.join(ROOT, f'assets/buildings/{name}.png'))
    for name, box in SCENE.items():
        cutout(box).save(os.path.join(ROOT, f'assets/scene/{name}.png'))
    print('zapisano', len(BUILDINGS), 'budynków +', len(SCENE), 'elementów sceny')

def main():
    # Układ arkusza wyjściowego = dokładnie to, czego szuka TILESETS.ziemia:
    #   wiersz 0 — pasek znaczników (lej [4.5,0], ruda [5.5,0] w kaflach)
    #   wiersze 1-3 — bloki wariantów 3x3: skala [0,1], trawa [3,1], ziemia [6,1]
    sheet = Image.new('RGBA', (SHEET_W*TILE, SHEET_H*TILE), (0,0,0,0))
    # Najpierw wytnij i wyrównaj wszystkie zestawy, DOPIERO POTEM zszyj krawędzie:
    # wspólny ton dla rodziny da się policzyć dopiero, gdy jest z czego.
    made = {}
    for name, (src, picks, jitter) in PICKS.items():
        extra = INSET_SET.get(name, 0)
        raw = (sample(src, picks, VARY*VARY, extra) if jitter
               else expand([cut(src,r,c,extra=extra) for r,c in picks], VARY*VARY))
        made[name] = normalize([grade(t, name) for t in raw])
    fam = [np.asarray(t, dtype=np.float32) for n in FAMILY for t in made.get(n, [])]
    fam_target = edge_mean_of(fam, 15) if fam else None
    for name, tiles in made.items():
        tiles = blend_edges(tiles, fam_target if name in FAMILY else None)
        cx, cy = BLOCK_AT[name]
        for i, t in enumerate(tiles):
            sheet.paste(t, ((cx + i % VARY)*TILE, (cy + i//VARY)*TILE))
    for i, (name, (src, (r, c))) in enumerate(MARKS.items()):
        sheet.paste(grade(cut(src, r, c), 'mark'), (MARK_AT[name]*TILE, 0))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sheet.save(OUT)
    print('zapisano', os.path.relpath(OUT, ROOT), sheet.size)
    save_pieces()
    save_decor()

if __name__ == '__main__':
    main()
