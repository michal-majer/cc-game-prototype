#!/usr/bin/env python3
"""
FRONT — sprawdzian płachty materiału przed wrzuceniem jej do gry.

    pip install pillow numpy
    python3 tools/plachta-test.py assets/raw/tex-trawa.png

Trzy rzeczy psują płachtę tak, że widać to dopiero na całym polu, a na
pojedynczym obrazku wygląda ładnie. Wszystkie trzy da się zmierzyć, więc nie ma
powodu zgadywać:

  GRADIENT — jaśniejszy róg. Powtórzony przez pole robi szachownicę i jest to
             najtrudniejsza do usunięcia wada, bo korekta zjada też fakturę.
  SZEW     — prawa krawędź nie pasuje do lewej. Widać przy każdym styku kafli.
  PLAMA    — wielkoskalowa różnica jasności wewnątrz płachty. To samo co
             gradient, tylko nie na krawędziach.

Skrypt wypisuje ocenę i zapisuje obok pliku podgląd `<nazwa>-kafel.png`:
płachtę ułożoną 3×3. Jeśli na podglądzie widać kratę, to jej nie ma w grze
skąd zniknąć.
"""
import sys, os
from PIL import Image, ImageFilter
import numpy as np


def ocena(wartosc, prog_ok, prog_zle, etykieta, jednostka=''):
    if wartosc <= prog_ok:   stan, znak = 'DOBRA', '+'
    elif wartosc <= prog_zle: stan, znak = 'DO PRZYJĘCIA', '~'
    else:                     stan, znak = 'ODRZUĆ', '!'
    print(f'  {znak} {etykieta:<10} {wartosc:6.1f}{jednostka}   {stan}')
    return znak


def sprawdz(path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im, dtype=np.float32)
    H, W, _ = a.shape
    print(f'\n{os.path.basename(path)}  {W}×{H}')
    if W != H:
        print('  ! płachta nie jest kwadratem — kaflowanie tego nie lubi')

    lum = a.mean(axis=2)
    znaki = []

    # GRADIENT: rozrzut jasności między ćwiartkami. Róg jaśniejszy o kilka
    # poziomów jest jeszcze do uratowania, o kilkanaście — już nie.
    h, w = H//2, W//2
    cw = [lum[:h,:w].mean(), lum[:h,w:].mean(), lum[h:,:w].mean(), lum[h:,w:].mean()]
    znaki.append(ocena(max(cw)-min(cw), 3.0, 7.0, 'gradient', ' poz.'))

    # SZEW: różnica między przeciwległymi krawędziami. Płachta ma się stykać
    # SAMA ZE SOBĄ — tak leży w grze, kafel przy kaflu tego samego rodzaju.
    k = 6
    szew = max(np.abs(a[:, :k].mean(axis=(0,1)) - a[:, -k:].mean(axis=(0,1))).max(),
               np.abs(a[:k, :].mean(axis=(0,1)) - a[-k:, :].mean(axis=(0,1))).max())
    znaki.append(ocena(szew, 4.0, 10.0, 'szew', ' poz.'))

    # PLAMA: ile zostaje zmienności po mocnym rozmyciu. Drobna faktura znika
    # w rozmyciu, więc to, co zostaje, to właśnie plamy.
    plama = float(np.asarray(im.filter(ImageFilter.GaussianBlur(W//12)),
                             dtype=np.float32).mean(axis=2).std())
    znaki.append(ocena(plama, 4.0, 8.0, 'plama', ' poz.'))

    # Nasycenie — paleta gry jest odbarwiona, krzykliwa zieleń zabija czytelność.
    mx, mn = a.max(axis=2), a.min(axis=2)
    nasyc = float((np.where(mx > 0, (mx-mn)/np.maximum(mx,1), 0)).mean()*100)
    znaki.append(ocena(nasyc, 30.0, 45.0, 'nasycenie', ' %'))

    out = os.path.splitext(path)[0] + '-kafel.png'
    pod = Image.new('RGB', (W*3//2, H*3//2))
    mala = im.resize((W//2, H//2), Image.LANCZOS)
    for r in range(3):
        for c in range(3):
            pod.paste(mala, (c*W//2, r*H//2))
    pod.save(out)
    print(f'  podgląd 3×3: {os.path.relpath(out)}')

    if '!' in znaki:
        print('  → generuj jeszcze raz; wada zostanie widoczna na całym polu')
    elif '~' in znaki:
        print('  → da się użyć, ale lepszy wynik oszczędzi ręcznych poprawek')
    else:
        print('  → bierzemy')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit('użycie: python3 tools/plachta-test.py <plik.png> [...]')
    for p in sys.argv[1:]:
        sprawdz(p)
