#!/usr/bin/env python3
"""
FRONT — podłoże generowane proceduralnie, nie przez AI.

    pip install pillow numpy
    python3 tools/grunt.py            # -> assets/raw/tex-*.png

DLACZEGO NIE Z GENERATORA OBRAZU

Bo grunt jest jedynym elementem planszy, w którym AI gra przeciwko nam.
Potrzebujemy powierzchni, która jest jednocześnie:

  · bezszwowa co do piksela      — generator nie ma na to trybu bez --tile,
                                   a zszywanie po fakcie zawsze zostawia ślad,
  · zamknięta w palecie gry      — generator trafia w barwę „mniej więcej",
                                   a każde odchylenie widać na całym polu,
  · UBOGA W DETAL                — i to jest sedno. Na wizualizacji docelowej
                                   grunt jest tłem: miękkie plamy, żadnych
                                   pojedynczych źdźbeł. Cały budżet detalu idzie
                                   w obiekty i jednostki i dlatego plansza się
                                   czyta. Generator poproszony o „teksturę trawy"
                                   daje dokładnie odwrotność — gęsty drobny
                                   detal, który przy 52 px robi się papką.

Szum proceduralny daje wszystkie trzy rzeczy naraz i za darmo.

ALE NAJLEPIEJ WYPADA POŁĄCZENIE. Płachta z generatora ma STRUKTURĘ, której szum
nie wymyśli — kierunek źdźbeł, nieregularne przetarcia, charakter. Brakuje jej
tylko palety: przychodzi jasna i nasycona, a przyciemnienie zamienia trawę
w słomę. Rozwiązaniem jest wzięcie z płachty samej jasności i przepuszczenie
jej przez RAMPĘ BARW gry — bo to rampa, czyli kilka zdefiniowanych stopni
zamiast ciągłego widma, czyta się jako „malowane", a nie „fotografia".

Dlatego: jeśli obok leży płachta źródłowa (patrz ZRODLA), materiał powstaje
z niej. Jeśli nie ma — powstaje w całości z szumu i też jest dobry.

BEZSZWOWOŚĆ jest tu z konstrukcji, nie z obróbki: wartości losowane są w węzłach
kraty, a indeks węzła liczy się MODULO rozmiar kraty. Prawa krawędź czyta więc
te same węzły co lewa i styk nie istnieje — nie ma czego maskować.
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIZE = 512                      # bok płachty; 512 dzieli się przez każdą kratę niżej
# Na ekranie płachta rozciągana jest na kilka kratek bazy, więc drobne oktawy
# i tak się zgęszczają — stąd ziarno liczone jest z zapasem.

# Materiał = rampa barw od cienia do światła + ile w nim ziarna.
# Barwy trzymane blisko palety z src/config.js (CO.bg #0f1315, CO.dirt #1a2022):
# ciemne i odbarwione, żeby jednostki i HUD zostały czytelne.
MATERIALY = {
  'trawa':  dict(ramp=[(26,32,22), (44,56,34), (62,74,46), (84,92,60)],
                 ziarno=7, plama=0.50),
  'ziemia': dict(ramp=[(32,28,22), (58,48,34), (82,68,48), (104,88,64)],
                 ziarno=8, plama=0.55),
  'piach':  dict(ramp=[(52,46,34), (84,76,56), (112,102,76), (134,124,96)],
                 ziarno=5, plama=0.45),
  'beton':  dict(ramp=[(30,34,36), (48,53,55), (66,72,74), (84,90,92)],
                 ziarno=4, plama=0.35),
}


def szum(rng, krata):
    """Szum wartości na kracie `krata`×`krata`, zawijany i wygładzony.

    Indeks węzła liczony jest modulo `krata`, więc prawa krawędź czyta te same
    węzły co lewa — płachta styka się sama ze sobą bez żadnej obróbki."""
    w = rng.random((krata, krata)).astype(np.float32)
    krok = SIZE // krata
    t = (np.arange(SIZE, dtype=np.float32) % krok) / krok
    t = t*t*(3 - 2*t)                                   # wygładzenie brzegów komórki
    i0 = (np.arange(SIZE) // krok) % krata
    i1 = (i0 + 1) % krata
    # dwuliniowo, najpierw w poziomie, potem w pionie
    a = w[np.ix_(i0, i0)]*(1-t)[None, :] + w[np.ix_(i0, i1)]*t[None, :]
    b = w[np.ix_(i1, i0)]*(1-t)[None, :] + w[np.ix_(i1, i1)]*t[None, :]
    return a*(1-t)[:, None] + b*t[:, None]


def pole(rng, plama):
    """Kilka oktaw: grube robią plamy, drobne strzępią ich brzegi.

    Waga grubych oktaw (`plama`) decyduje, czy powierzchnia jest spokojnym tłem,
    czy kotłuje się od kontrastu. Tło wygrywa — detal jest zadaniem obiektów."""
    # Ciężar przesunięty na ŚREDNIE oktawy. Na samych grubych powierzchnia wychodzi
    # rozmyta i czyta się jak rozlana plama, a nie jak grunt; na samych drobnych
    # wraca papka, w której giną jednostki. Środek daje fakturę widoczną przy 52 px.
    f = (szum(rng, 8)*0.30 + szum(rng, 16)*0.26 + szum(rng, 32)*0.22
         + szum(rng, 64)*0.14 + szum(rng, 128)*0.08)
    f = (f - f.min()) / max(1e-6, float(np.ptp(f)))
    return 0.5 + (f - 0.5) * (0.55 + plama)


def rampa(f, kolory):
    """Przełóż pole 0..1 na rampę barw — to ona daje „malowane", a nie „foto":
    kilka zdefiniowanych stopni zamiast ciągłego widma fotografii."""
    k = np.array(kolory, dtype=np.float32)
    x = np.clip(f, 0, 1) * (len(k) - 1)
    i = np.floor(x).astype(int)
    i1 = np.minimum(i + 1, len(k) - 1)
    u = (x - i)[..., None]
    return k[i]*(1-u) + k[i1]*u


# Materiał -> płachta źródłowa z generatora obrazu. Brak pliku = czysta procedura,
# więc listę można zostawić wypełnioną „na zapas".
ZRODLA = {
  'trawa':  'tex-grass.png',
  'ziemia': 'tex-dirt.png',
  'piach':  'tex-sand.png',
  'beton':  'tex-concrete.png',
}


def z_obrazu(sciezka, ramp):
    """Struktura z płachty, barwy z rampy gry.

    Bierzemy samą jasność, rozciągamy ją na pełny zakres (percentyle, nie min/max,
    żeby pojedynczy jasny kamyk nie zjadł kontrastu całej płachty) i przekładamy
    przez rampę. Barwa źródła jest wyrzucana w całości — to ona przychodziła za
    jasna i za nasycona, a samo przyciemnienie zamieniało trawę w słomę."""
    a = np.asarray(Image.open(sciezka).convert('RGB'), dtype=np.float32)
    lum = a.mean(axis=2)
    lo, hi = np.percentile(lum, 2), np.percentile(lum, 98)
    f = np.clip((lum - lo) / max(1e-6, hi - lo), 0, 1)
    return rampa(f, ramp)


def zrob(nazwa, cfg, seed):
    rng = np.random.default_rng(seed)
    zrodlo = os.path.join(ROOT, 'assets/raw', ZRODLA.get(nazwa, ''))
    skad = 'szum'
    if ZRODLA.get(nazwa) and os.path.exists(zrodlo):
        a = z_obrazu(zrodlo, cfg['ramp'])
        skad = 'struktura z ' + os.path.basename(zrodlo)
    else:
        a = rampa(pole(rng, cfg['plama']), cfg['ramp'])
    # ziarno: drobne, wysokoczęstotliwościowe, żeby powierzchnia nie była gładka
    # jak plastik — ale na tyle słabe, by nie wróciła papka.
    a += (rng.random(a.shape[:2]).astype(np.float32) - 0.5)[..., None] * cfg['ziarno'] * 2
    out = os.path.join(ROOT, 'assets/raw', f'tex-{nazwa}.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(out)
    print('zapisano', os.path.relpath(out, ROOT),
          f'{a.shape[1]}×{a.shape[0]}', '·', skad)


if __name__ == '__main__':
    for i, (nazwa, cfg) in enumerate(MATERIALY.items()):
        zrob(nazwa, cfg, 1000 + i)
