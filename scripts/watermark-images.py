#!/usr/bin/env python3
"""Stamp the game's artwork with copyright metadata and a small corner signature.

  python3 scripts/watermark-images.py            # stamp everything under public/ (safe to re-run: stamped files are skipped)
  python3 scripts/watermark-images.py --check    # list files that are not stamped yet

Needs Pillow + numpy (pip install pillow numpy). KEEP YOUR UNSTAMPED ORIGINALS somewhere private: stamping re-encodes the
images, so run this on a copy of the originals, not repeatedly on the same files.

Every image also gets an INVISIBLE keyed watermark (scripts/wmlib.py) that survives re-saving, mild scaling and screenshots.
The secret key lives in scripts/.wm-key (created on first run, git-ignored). BACK IT UP PRIVATELY and never publish it: it is
the only way to prove a copied image is yours (python3 scripts/detect-watermark.py suspect.png).
 - every .webp gets EXIF + XMP copyright (Artist, Copyright, rights statement): proves ownership if the file is copied;
 - square art (cards, fighters, edicts, omens, whims) also gets a faint signature in the corner;
 - transparency is preserved (the Monarque portrait is a cut-out: flattening it would put a black box behind it);
 - round backgrounds and the home wallpaper get a mark near two corners; the Monarque portrait gets one engraved on the dais;
 - the hall thumbnails (public/ui/thumbs) are cut from the marked backgrounds by this script too.
"""
import glob, os, sys, io, secrets
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wmlib

OWNER = 'dhamo ss'
YEAR = '2026'
NOTICE = f'(c) {YEAR} {OWNER}. All rights reserved.'
MARK = f'© {OWNER}'
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
MARKED_DIRS = ('cards', 'story/fighters', 'story/edicts', 'story/omens', 'story/whims')
MARKED_FILES = ()
BACKGROUNDS = tuple(f'ui/round-{n}.webp' for n in range(1, 8)) + ('ui/wallpaper.webp',)   # full-screen backdrops: marked bottom-right + top-left
CUTOUTS = ('ui/monarque.webp',)   # transparent cut-out: the mark is engraved on the artwork itself, never on the empty area
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
QUALITY = 84

def exif_bytes():
    ex = Image.Exif()
    ex[0x013B] = OWNER            # Artist
    ex[0x8298] = NOTICE           # Copyright
    ex[0x010E] = 'MONARQUE: Cards of the Fallen'  # ImageDescription
    ex[0x0131] = 'MONARQUE wm2'   # Software (also the "already stamped" marker)
    return ex.tobytes()

XMP = (f'<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
       f'<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/">'
       f'<dc:creator><rdf:Seq><rdf:li>{OWNER}</rdf:li></rdf:Seq></dc:creator>'
       f'<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">{NOTICE}</rdf:li></rdf:Alt></dc:rights>'
       f'<xmpRights:Marked>True</xmpRights:Marked><xmpRights:UsageTerms><rdf:Alt><rdf:li xml:lang="x-default">Not licensed for reuse or redistribution without written permission.</rdf:li></rdf:Alt></xmpRights:UsageTerms>'
       f'</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>').encode('utf-8')

def stamped(path):
    try:
        with Image.open(path) as im:
            return im.getexif().get(0x0131) == 'MONARQUE wm2'
    except Exception:
        return False

def signature(im):
    w, h = im.size
    size = max(11, round(w / 38))
    font = ImageFont.truetype(FONT, size)
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    tw = d.textlength(MARK, font=font)
    x, y = w - tw - size * 0.8, size * 0.7           # top-right: clear of the cost badge, name plate and stat bar
    d.text((x + 1, y + 1), MARK, font=font, fill=(0, 0, 0, 120))   # soft shadow keeps it legible on bright art
    d.text((x, y), MARK, font=font, fill=(255, 255, 255, 105))
    return Image.alpha_composite(im.convert('RGBA'), layer)

def background_mark(im):
    # Full-screen backdrops are scaled with "cover", so the very edge can be cropped: sit the marks ~4% inside the corners.
    w, h = im.size
    size = max(14, round(w / 52))
    font = ImageFont.truetype(FONT, size)
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    tw = d.textlength(MARK, font=font)
    for x, y in ((w - tw - w * 0.04, h - size - h * 0.05), (w * 0.04, h * 0.05)):
        d.text((x + 1, y + 1), MARK, font=font, fill=(0, 0, 0, 130))
        d.text((x, y), MARK, font=font, fill=(255, 255, 255, 95))
    return Image.alpha_composite(im.convert('RGBA'), layer).convert('RGB')

def cutout_mark(im):
    # Engrave the mark where the artwork is fully opaque (the front of the dais), and clip it to the artwork's own alpha,
    # so no stray pixels appear in the transparent area.
    import numpy as np
    im = im.convert('RGBA'); w, h = im.size
    size = max(16, round(w / 30))
    font = ImageFont.truetype(FONT, size)
    probe = ImageDraw.Draw(Image.new('L', (1, 1)))
    tw, th = int(probe.textlength(MARK, font=font)), size + 6
    alpha = np.asarray(im)[..., 3]
    best = None
    for y in range(int(h * 0.62), h - th, 4):                 # lower part of the image, bottom-most solid spot wins
        for x in range(int(w * 0.50), w - tw - 8, 6):         # right half, clear of the glowing centre ring
            if (alpha[y:y + th, x:x + tw] == 255).all():
                best = (x, y)
    if best is None: return im
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    d.text((best[0] + 1, best[1] + 1), MARK, font=font, fill=(0, 0, 0, 150))
    d.text(best, MARK, font=font, fill=(255, 255, 255, 150))
    out = Image.alpha_composite(im, layer)
    out.putalpha(im.split()[3])                                # keep the original transparency exactly
    return out

def needs_mark(rel):
    return rel in MARKED_FILES or any(rel.startswith(d + '/') for d in MARKED_DIRS)

def get_key():
    k = os.environ.get('WM_KEY')
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.wm-key')
    if k: return k.strip()
    if os.path.exists(path): return open(path).read().strip()
    k = secrets.token_hex(24)
    open(path, 'w').write(k + '\n')
    print(f'\n*** New secret watermark key written to {os.path.relpath(path)}. BACK IT UP PRIVATELY; never publish it. ***\n')
    return k

def encode(img, key):
    """Add the invisible mark and WebP-encode. Tries stronger marks until the saved bytes read back clean. -> (bytes, matches, delta)"""
    has_alpha = img.mode == 'RGBA'
    arr = np.asarray(img)
    rgb, alpha = arr[..., :3], (arr[..., 3] if has_alpha else None)
    best = None
    for delta in wmlib.DELTAS:
        marked = wmlib.embed(rgb, key, delta, alpha)
        out = Image.fromarray(np.dstack([marked, alpha]) if has_alpha else marked, 'RGBA' if has_alpha else 'RGB')
        buf = io.BytesIO()
        out.save(buf, 'WEBP', quality=QUALITY, alpha_quality=100, method=6, exif=exif_bytes(), xmp=XMP)
        back = np.asarray(Image.open(io.BytesIO(buf.getvalue())).convert('RGBA' if has_alpha else 'RGB'))
        hits, _, _, _ = wmlib.best_read(back[..., :3], key, back[..., 3] if has_alpha else None, deltas=(delta,))
        if best is None or hits > best[1]: best = (buf.getvalue(), hits, delta)
        if hits >= 62: break
    return best

def visible(rel, im):
    has_alpha = im.mode in ('RGBA', 'LA', 'PA') or 'transparency' in im.info
    if rel in CUTOUTS: out = cutout_mark(im)
    elif rel in BACKGROUNDS: out = background_mark(im)
    elif needs_mark(rel): out = signature(im)
    else: out = im
    return out.convert('RGBA' if has_alpha else 'RGB')      # never flatten a transparent image

def main():
    check = '--check' in sys.argv
    key = get_key()
    done = skipped = 0; weak = []
    todo = []
    for path in sorted(glob.glob(os.path.join(ROOT, '**', '*.webp'), recursive=True)):
        rel = os.path.relpath(path, ROOT).replace(os.sep, '/')
        if rel.startswith('ui/thumbs/'): continue            # rebuilt from the backgrounds below
        if stamped(path): skipped += 1; continue
        todo.append((path, rel))
    for n in range(1, 7):                                    # thumbnails missing -> report / rebuild with their background
        t = os.path.join(ROOT, 'ui', 'thumbs', f'round-{n}.webp')
        if not os.path.exists(t) or not stamped(t):
            if not any(r == f'ui/round-{n}.webp' for _, r in todo) and not check:
                todo.append((os.path.join(ROOT, 'ui', f'round-{n}.webp'), f'ui/round-{n}.webp#thumbonly'))
            elif check: print('not stamped:', f'ui/thumbs/round-{n}.webp')
    if check:
        for _, rel in todo: print('not stamped:', rel)
        print(f'{len(todo)} still to stamp, {skipped} already stamped'); return
    for path, rel in todo:
        thumb_only = rel.endswith('#thumbonly'); rel = rel.replace('#thumbonly', '')
        im = Image.open(path); im.load()
        v = im if thumb_only else visible(rel, im)           # thumb-only: the background on disk is already marked
        if not thumb_only:
            data, hits, delta = encode(v, key)
            open(path, 'wb').write(data); done += 1
            if hits < 60: weak.append((rel, hits))
        if rel in BACKGROUNDS and rel != 'ui/wallpaper.webp' and rel != 'ui/round-7.webp':
            t = v.convert('RGB'); t = t.resize((480, round(480 * t.height / t.width)), Image.LANCZOS)
            os.makedirs(os.path.join(ROOT, 'ui', 'thumbs'), exist_ok=True)
            data, hits, delta = encode(t, key)
            open(os.path.join(ROOT, 'ui', 'thumbs', os.path.basename(rel)), 'wb').write(data); done += 1
            if hits < 60: weak.append(('ui/thumbs/' + os.path.basename(rel), hits))
    print(f'stamped {done}, already stamped {skipped}')
    if weak: print('WARNING: weak invisible mark (matches of 64):', weak)

if __name__ == '__main__':
    main()
