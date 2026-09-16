#!/usr/bin/env python3
"""
FRONT — podłoże generowane proceduralnie, nie przez AI.

    pip install pillow numpy
    python3 tools/grunt.py            # assets/raw/tex-*.png -> assets/tiles/grunt-*.png

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
WEJSCIE = 'assets/raw'      # płachty z generatora — wsad, gra ich nie czyta
WYJSCIE = 'assets/tiles'    # to, co wczytuje silnik
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
#   'rampa'  — z płachty bierzemy samą jasność, barwę daje rampa gry,
#   'wprost' — płachta idzie jak jest (bez zmiany barwy).
# 'wprost' wybrane dla trawy świadomie: barwa z Midjourney jest bliższa jasności
# trawy z wizualizacji docelowej niż ciemna rampa, którą proponowałem.
TRYB = {'trawa': 'wprost'}

ZRODLA = {
  # lista = kilka odmian tego samego materiału. Silnik miesza je maskami
  # o innym okresie niż sam grunt, więc wspólny rytm robi się dłuższy niż ekran
  # i powtarzalność przestaje być do złapania. Pierwsza odmiana jest wzorcem
  # barwy — kolejne dociągane są do niej histogramem, żeby nie było widać
  # „łat" w innym odcieniu, choćby generator zwrócił jaśniejszą trawę.
  'trawa':  ['tex-grass.png', 'tex-grass-2.png', 'tex-grass-3.png'],
  'ziemia': 'tex-dirt.png',
  'piach':  'tex-sand.png',
  'beton':  'tex-concrete.png',
}


def dociagnij(a, wzor):
    """Dopasuj rozkład jasności kanał po kanale do wzorca (dopasowanie histogramu).

    Bez tego druga i trzecia odmiana trawy kładą się na polu jako widoczne łaty
    w innym odcieniu — a po to, żeby rozbić rytm, mają się różnić UKŁADEM plam,
    nie barwą. Generator nie utrzyma palety między wywołaniami nawet z --sref,
    więc egzekwujemy ją tutaj."""
    out = np.empty_like(a)
    for k in range(3):
        src, ref = a[:, :, k].ravel(), wzor[:, :, k].ravel()
        wart, poz, licz = np.unique(src, return_inverse=True, return_counts=True)
        wart_r, licz_r = np.unique(ref, return_counts=True)
        dys   = np.cumsum(licz).astype(np.float64);   dys   /= dys[-1]
        dys_r = np.cumsum(licz_r).astype(np.float64); dys_r /= dys_r[-1]
        out[:, :, k] = np.interp(dys, dys_r, wart_r)[poz].reshape(a.shape[:2])
    return out


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


def wczytaj(nazwa, cfg, plik, wzor):
    """Jedna odmiana materiału: z płachty (wprost albo przez rampę) lub z szumu."""
    sciezka = os.path.join(ROOT, WEJSCIE, plik) if plik else ''
    if plik and os.path.exists(sciezka):
        if TRYB.get(nazwa) == 'wprost':
            a = np.asarray(Image.open(sciezka).convert('RGB'), dtype=np.float32)
            skad = 'wprost z ' + plik
        else:
            a = z_obrazu(sciezka, cfg['ramp'])
            skad = 'struktura z ' + plik
        if wzor is not None:
            a = dociagnij(a, wzor)
            skad += ' + histogram'
        return a, skad
    rng = np.random.default_rng(abs(hash(nazwa)) % 10000)
    a = rampa(pole(rng, cfg['plama']), cfg['ramp'])
    a += (rng.random(a.shape[:2]).astype(np.float32) - 0.5)[..., None] * cfg['ziarno'] * 2
    return a, 'szum'


def zloz(warstwy, seed):
    """Zmieszaj odmiany w JEDNĄ płachtę, o boku dwa razy większym niż źródła.

    Mieszanie robione było wcześniej w silniku — maskami na osobnych warstwach.
    Działało, ale wymuszało wypiek całego podłoża do tekstury (maski liczą się
    co klatkę na obwiedni maskowanego obiektu, czyli na całej mapie), a wypiek
    szedł w połowie rozdzielczości i ROZMAZYWAŁ trawę. Przy proceduralnym szumie
    to nie miało znaczenia, przy płachcie z fotografii owszem.

    Zrobione tutaj, offline, nie kosztuje nic w czasie gry i zostawia teksturę
    ostrą. Bok jest podwojony, więc okres powtarzania też się podwaja — a to
    właśnie długość okresu, nie jakość styków, decyduje o widocznej kracie.

    Bezszwowość zachowana: każde źródło kafluje się samo, a wagi mieszania biorą
    się z szumu zawijanego na tym samym boku."""
    n = len(warstwy)
    if n == 1: return warstwy[0]
    h, w, _ = warstwy[0].shape
    H, W = h*2, w*2
    global SIZE
    stare, SIZE = SIZE, H
    rng = np.random.default_rng(seed)
    wagi = [pole(rng, 0.5) for _ in range(n)]          # po jednej mapie wag na odmianę
    SIZE = stare
    wagi = [np.clip((x - 0.35) * 2.2, 0, 1) + 0.12 for x in wagi]
    suma = np.sum(wagi, axis=0)
    out = np.zeros((H, W, 3), dtype=np.float32)
    for a, g in zip(warstwy, wagi):
        kafel = np.tile(a, (H//h + 1, W//w + 1, 1))[:H, :W]
        out += kafel * (g / suma)[..., None]
    return out


def zrob(nazwa, cfg, seed):
    zrodla = ZRODLA.get(nazwa) or ['']
    if isinstance(zrodla, str): zrodla = [zrodla]
    odmiany, skady, wzor = [], [], None
    for plik in zrodla:
        a, skad = wczytaj(nazwa, cfg, plik, wzor)
        if wzor is None: wzor = a
        odmiany.append(a); skady.append(skad)
        if skad == 'szum': break          # bez płacht nie ma czego mieszać
    a = zloz(odmiany, seed)
    out = os.path.join(ROOT, WYJSCIE, f'grunt-{nazwa}.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(out)
    print('zapisano', os.path.relpath(out, ROOT), f'{a.shape[1]}×{a.shape[0]}',
          '·', ' + '.join(skady))


def plamy():
    """Warstwa WOLNEJ ZMIENNOŚCI — osobna tekstura mnożona na grunt w silniku.

    Kratka, którą widać na polu, nie bierze się ze szwów (zmierzony szew płachty
    to 0,68 przy medianie szumu 0,71 — niewidoczny), tylko z POWTARZALNOŚCI: ten
    sam charakterystyczny placek wraca w równym rytmie i oko skleja go w siatkę.
    Jedna tekstura powtarzana regularnie zawsze to zrobi, choćby stykała się
    idealnie.

    Lekarstwo: druga warstwa o okresie kilkukrotnie dłuższym od kafla gruntu.
    Wspólny okres obu robi się wtedy dłuższy niż ekran i rytm znika. Zakres
    zaczyna się od bieli, więc warstwa wyłącznie PRZYCIEMNIA — mnożenie przez
    biel nic nie zmienia, a plamy kładą cień. Rozjaśnianie wymagałoby drugiego
    trybu mieszania i nie jest potrzebne.
    """
    rng = np.random.default_rng(4242)
    f = (szum(rng, 4)*0.55 + szum(rng, 8)*0.30 + szum(rng, 16)*0.15)
    f = (f - f.min()) / max(1e-6, float(np.ptp(f)))
    a = 178 + f*77                                  # 178..255 — tylko przyciemnienie
    out = os.path.join(ROOT, WYJSCIE, 'grunt-plamy.png')
    Image.fromarray(np.clip(np.repeat(a[:,:,None],3,axis=2),0,255).astype(np.uint8)).save(out)
    print('zapisano', os.path.relpath(out, ROOT), f'{SIZE}×{SIZE}', '· wolna zmienność')


if __name__ == '__main__':
    os.makedirs(os.path.join(ROOT, WYJSCIE), exist_ok=True)
    for i, (nazwa, cfg) in enumerate(MATERIALY.items()):
        zrob(nazwa, cfg, 1000 + i)
    plamy()
