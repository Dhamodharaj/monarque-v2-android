#!/usr/bin/env python3
"""Check whether an image carries the invisible MONARQUE watermark (proof it was copied from your game).

  python3 scripts/detect-watermark.py suspect.png [more files...]
  python3 scripts/detect-watermark.py suspect.jpg --size 512x512      # force the size the original art had

Needs the secret key in scripts/.wm-key (or env WM_KEY). Works on re-saved / re-compressed / mildly rescaled copies: the image is
resized back to each known original size and compared; if that fails it also tries small pixel shifts (for cropped edges).
The reported "chance" is the probability that an UNMARKED image would match this well by luck, already corrected for how many
combinations were tried. FOUND / LIKELY mean it is almost certainly yours. NOT FOUND proves nothing either way: heavy cropping,
rotation, a big downscale combined with re-compression, or strong editing can wipe the mark.
"""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wmlib

KNOWN = [(512, 512), (1920, 1080), (1672, 941), (1671, 941), (800, 554), (480, 270)]
SHIFTS = [(dy, dx) for dy in range(8) for dx in range(8)]

def load_key():
    k = os.environ.get('WM_KEY')
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.wm-key')
    if k: return k.strip()
    if os.path.exists(p): return open(p).read().strip()
    sys.exit('No key: put it in scripts/.wm-key or set WM_KEY.')

def search(rgba, has_alpha, key, sizes, shifts):
    best = (-1, None, None, None)
    for size in sizes:
        r = rgba.resize(size, Image.LANCZOS) if rgba.size != size else rgba
        arr = np.asarray(r)
        hit, _, delta, shift = wmlib.best_read(arr[..., :3], key, arr[..., 3] if has_alpha else None, shifts=shifts)
        if hit > best[0]: best = (hit, delta, shift, size)
    return best, len(sizes) * len(shifts) * len(wmlib.DELTAS)

def check(path, key, sizes):
    im = Image.open(path); im.load()
    rgba = im.convert('RGBA'); has_alpha = np.asarray(rgba)[..., 3].min() < 255
    best, trials = search(rgba, has_alpha, key, sizes, [(0, 0)])           # stage 1: aligned
    p = min(1.0, wmlib.chance(best[0]) * trials)
    if p > 1e-3:                                                              # stage 2: allow shifts (cropped edge)
        best2, t2 = search(rgba, has_alpha, key, sizes, SHIFTS)
        trials += t2
        if best2[0] > best[0]: best = best2
        p = min(1.0, wmlib.chance(best[0]) * trials)
    hit, delta, shift, size = best
    verdict = 'FOUND' if p < 1e-9 else 'LIKELY' if p < 1e-3 else 'POSSIBLE' if p < 5e-2 else 'NOT FOUND'
    print(f'{verdict:10} {path}  matched {hit}/{wmlib.BITS} bits  (chance of a false match: {p:.1e})  [size {size[0]}x{size[1]}, step {delta:.0f}, shift {shift}]')

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    sizes = list(KNOWN)
    if '--size' in sys.argv:
        val = sys.argv[sys.argv.index('--size') + 1]; w, h = val.lower().split('x'); sizes = [(int(w), int(h))]; args = [a for a in args if a != val]
    if not args: sys.exit(__doc__)
    key = load_key()
    for a in args:
        try: check(a, key, sizes)
        except Exception as e: print(f'ERROR      {a}: {e}')

if __name__ == '__main__':
    main()
