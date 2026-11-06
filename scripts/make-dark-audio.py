#!/usr/bin/env python3
"""Renders the Story Mode "dark battle" soundscape (no samples, pure synthesis) to public/audio/dark/.

    python3 scripts/make-dark-audio.py [outdir]

Music loops are built from whole bars and the reverb tail is folded back onto the start, so they loop seamlessly.
Needs numpy, scipy and ffmpeg (libvorbis + libmp3lame).
"""
import os, subprocess, sys, tempfile
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'public', 'audio', 'dark')
os.makedirs(OUT, exist_ok=True)
RNG = np.random.default_rng(1337)

# ---------------------------------------------------------------- basics
mf = lambda m: 440.0 * 2 ** ((m - 69) / 12)
def T(d): return np.arange(int(d * SR)) / SR
def filt(x, kind, fc, order=3):
    fc = np.clip(fc, 20, SR / 2 - 200)
    return signal.sosfilt(signal.butter(order, fc, btype=kind, fs=SR, output='sos'), x)
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], btype='band', fs=SR, output='sos'), x)
def noise(d): return RNG.standard_normal(int(d * SR))
def adsr(n, a, d, s, r):
    e = np.ones(n); a = int(a * SR); d = int(d * SR); r = int(r * SR)
    a = min(a, n); e[:a] = np.linspace(0, 1, a, endpoint=False) ** 1.5 if a else 1
    d = min(d, n - a);
    if d > 0: e[a:a + d] = np.linspace(1, s, d)
    if a + d < n: e[a + d:] = s
    r = min(r, n)
    if r > 0: e[n - r:] *= np.linspace(1, 0, r) ** 1.5
    return e
def expd(n, tau): return np.exp(-np.arange(n) / SR / tau)
def saw_ph(ph): return 2 * (ph % 1.0) - 1
def osc(f, d, vib=0.0, vib_rate=5.2, shape='saw', drift=0.0, phase=0.0):
    t = T(d); fv = f * (1 + vib * np.sin(2 * np.pi * vib_rate * t + phase) + drift * np.sin(2 * np.pi * 0.23 * t + phase * 3))
    ph = np.cumsum(fv) / SR + phase
    if shape == 'saw': return saw_ph(ph)
    if shape == 'sq': return np.sign(np.sin(2 * np.pi * ph))
    return np.sin(2 * np.pi * ph)
def add(*a):
    n = max(len(x) for x in a); o = np.zeros(n)
    for x in a: o[:len(x)] += x
    return o
def losc(f, d, **kw):  # loop-safe oscillator: whole number of cycles over the loop
    return osc(max(1, round(f * d)) / d, d, **kw)
def lperiod(d, p): return d / max(1, round(d / p))
def norm(x, peak=0.9): m = np.max(np.abs(x)) or 1; return x / m * peak

# ---------------------------------------------------------------- voices
def pad(freqs, d, cutoff=900, att=1.5, rel=1.5, voices=3, det=0.007, vib=0.003, level=1.0):
    n = int(d * SR); out = np.zeros(n)
    for f in freqs:
        for v in range(voices):
            ph = RNG.uniform(0, 1); dt = (v - (voices - 1) / 2) * det
            out += osc(f * (1 + dt), d, vib=vib, vib_rate=4.8 + 0.7 * v, phase=ph) / voices
    out = filt(out, 'low', cutoff) * adsr(n, att, 0.1, 1.0, rel)
    return out * level / max(1, len(freqs)) ** 0.6
FORMANTS = {'ah': [(800, 1, 8), (1150, .5, 10), (2900, .15, 12)], 'oh': [(450, 1, 8), (800, .45, 10), (2830, .1, 12)], 'oo': [(325, 1, 7), (700, .3, 9), (2530, .06, 12)]}
def choir(freqs, d, vowel='ah', att=1.8, rel=1.8, level=1.0):
    n = int(d * SR); src = np.zeros(n)
    for f in freqs:
        for v in range(5):
            src += osc(f * (1 + RNG.uniform(-.004, .004)), d, vib=0.006, vib_rate=5.0 + RNG.uniform(0, 1.2), phase=RNG.uniform(0, 1)) / 5
    src += 0.12 * filt(noise(d), 'low', 4000)
    out = np.zeros(n)
    for fc, g, q in FORMANTS[vowel]: out += g * bp(src, fc * .9, fc * 1.1)
    return out * adsr(n, att, 0.1, 1.0, rel) * level / max(1, len(freqs)) ** 0.5
def cello(m, d, level=1.0, vib=0.009, cut=1700, att=0.22, rel=0.5):
    f = mf(m); x = 0.7 * osc(f, d, vib=vib, vib_rate=5.4) + 0.3 * osc(f * 1.003, d, vib=vib, vib_rate=5.0, shape='sq')
    return filt(x, 'low', cut) * adsr(int(d * SR), att, 0.1, 0.85, rel) * level
def stac(m, d, cut=900, level=1.0):  # staccato low string
    f = mf(m); n = int(d * SR); x = osc(f, d) * 0.6 + osc(f * 2.003, d) * 0.25
    return filt(x, 'low', cut) * np.minimum(1, np.arange(n) / (0.006 * SR)) * expd(n, d * 0.5) * level
def brass(freqs, d, level=1.0, open_to=2600, att=0.25, rel=0.6):
    n = int(d * SR); x = sum(osc(f, d, vib=0.002) + 0.5 * osc(f * 1.004, d) for f in freqs) / len(freqs)
    lo, hi = filt(x, 'low', 500), filt(x, 'low', open_to)
    e = np.minimum(1, np.arange(n) / (att * SR * 1.5)) ** 2
    return (lo * (1 - e) + hi * e) * adsr(n, att, 0.1, 0.9, rel) * level
def taiko(f0=64, level=1.0, tau=0.42, d=1.6):
    n = int(d * SR); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * np.cumsum(f0 * (1 + 1.4 * np.exp(-t / 0.06))) / SR) * np.exp(-t / tau)
    head = 0.35 * np.sin(2 * np.pi * np.cumsum(f0 * 1.59 * (1 + 0.6 * np.exp(-t / 0.04))) / SR) * np.exp(-t / (tau * 0.5))
    click = filt(noise(d), 'low', 1800) * np.exp(-t / 0.012) * 0.8
    thump = filt(noise(d), 'low', 220) * np.exp(-t / 0.09) * 0.5
    return (body + head + click + thump) * level
def tom(f0=110, level=1.0, d=0.8): return taiko(f0, level, 0.2, d)
def bell(f, d=6.0, level=1.0, bright=1.0):
    t = T(d); out = np.zeros_like(t)
    for r, g, tau in [(0.5, .5, 3.0), (1, 1, 2.6), (1.19, .6, 2.0), (1.56, .45, 1.6), (2.0, .55, 1.4), (2.51, .3, 1.0), (3.0, .22, .7), (4.17, .15 * bright, .5), (5.43, .1 * bright, .35)]:
        out += g * np.sin(2 * np.pi * f * r * t + RNG.uniform(0, 6)) * np.exp(-t / tau)
    out += 0.25 * filt(noise(d), 'low', 5000) * np.exp(-t / 0.02)
    return out * level * 0.4
def gong(f=70, d=9.0, level=1.0):
    t = T(d); out = np.zeros_like(t)
    for r, g, tau in [(1, 1, 5.0), (1.47, .7, 4.0), (2.09, .6, 3.2), (2.57, .45, 2.5), (3.4, .35, 2.0), (4.8, .25, 1.4), (6.1, .15, 1.0)]:
        wob = 1 + 0.002 * np.sin(2 * np.pi * (0.7 + r * .13) * t)
        out += g * np.sin(2 * np.pi * f * r * np.cumsum(wob) / SR) * np.exp(-t / tau) * np.minimum(1, t / 0.03)
    out += 0.5 * filt(noise(d), 'low', 3000) * np.exp(-t / 0.25)
    return out * level * 0.35
def impact(f0=48, level=1.0, d=1.2, crack=0.6):
    n = int(d * SR); t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * np.cumsum(f0 * (1 + 2.5 * np.exp(-t / 0.05))) / SR) * np.exp(-t / 0.3)
    body = filt(noise(d), 'low', 700) * np.exp(-t / 0.08)
    cr = filt(noise(d), 'high', 1800) * np.exp(-t / 0.018) * crack
    return (sub + 0.6 * body + cr) * level
def swell(d, lo=200, hi=4000, level=1.0, rising=True):
    n = int(d * SR); x = noise(d); a = filt(x, 'low', lo); b = filt(x, 'low', hi)
    e = np.linspace(0, 1, n) ** 2
    e = e if rising else e[::-1]
    return (a * (1 - e) + b * e) * (e ** 0.7 if rising else e ** 0.7) * level
def clang(f=520, d=1.6, level=1.0):
    t = T(d); out = np.zeros_like(t)
    for r, g, tau in [(1, 1, .5), (1.62, .7, .35), (2.31, .55, .25), (3.17, .4, .18), (4.4, .3, .12), (5.9, .22, .08)]:
        out += g * np.sin(2 * np.pi * f * r * t + RNG.uniform(0, 6)) * np.exp(-t / tau)
    out += filt(noise(d), 'high', 2500) * np.exp(-t / 0.03) * 0.8
    return out * level * 0.45
def heartbeat(level=1.0):
    a = taiko(48, 1.0, 0.16, 0.6); b = taiko(44, 0.65, 0.14, 0.6); out = np.zeros(int(0.9 * SR)); out[:len(a)] += a[:len(out)]; s = int(0.27 * SR); out[s:s + len(b)] += b[:len(out) - s]
    return out * level

# ---------------------------------------------------------------- mixing
class Mix:
    def __init__(self, d, loop=False): self.n = int(d * SR); self.L = np.zeros(self.n); self.R = np.zeros(self.n); self.loop = loop
    def put(self, snd, t, g=1.0, pan=0.0):
        i = int(t * SR); a = np.cos((pan + 1) * np.pi / 4); b = np.sin((pan + 1) * np.pi / 4)
        for off in range(0, len(snd), self.n if self.loop else len(snd) + 1):
            seg = snd[off:off + self.n] if self.loop else snd
            j = (i + off) % self.n if self.loop else i
            m = min(len(seg), self.n - j)
            if m > 0: self.L[j:j + m] += seg[:m] * g * a; self.R[j:j + m] += seg[:m] * g * b
            if self.loop and len(seg) > m: r = len(seg) - m; self.L[:r] += seg[m:] * g * a; self.R[:r] += seg[m:] * g * b
            if not self.loop: break
    def stereo(self): return np.stack([self.L, self.R], 1)
def make_ir(rt60, seed, dark=3200):
    r = np.random.default_rng(seed); n = int(rt60 * 1.1 * SR); t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-6.9 * t / rt60); ir = filt(ir, 'low', dark, 2)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR)); return ir / np.sqrt(np.sum(ir ** 2))
def reverb(st, rt60=3.0, wet=0.3, loop=False, dark=3200):
    out = np.zeros_like(st)
    for ch, seed in ((0, 11), (1, 23)):
        x = st[:, ch]; ir = make_ir(rt60, seed, dark); full = signal.fftconvolve(x, ir)
        y = full[:len(x)].copy()
        if loop:
            tail = full[len(x):]; y[:len(tail)] += tail[:len(y)]
        out[:, ch] = y
    return st * (1 - wet * 0.6) + out * wet * 2.2
def tone(st, cut=0.85, mid=1.7, hi=1.5):  # keep the weight but let strings, choir and brass speak on small speakers
    out = np.zeros_like(st); n = len(st)
    for ch in (0, 1):  # filter a tripled copy and keep the middle so the loop seam stays continuous
        x = np.tile(st[:, ch], 3)
        y = x - cut * filt(x, 'low', 90) + mid * bp(x, 200, 2500) + hi * filt(x, 'high', 2500)
        out[:, ch] = y[n:2 * n]
    return out
def finish(st, rms_db=None, peak=0.89, fade_in=0.0, fade_out=0.0):
    x = st.copy()
    if rms_db is not None:
        r = np.sqrt(np.mean(x ** 2)); x *= 10 ** (rms_db / 20) / (r + 1e-9)
    x = np.tanh(x * 1.1) / np.tanh(1.1)  # soft limit
    m = np.max(np.abs(x)); x = x / m * peak if m > peak else x
    if fade_in: n = int(fade_in * SR); x[:n] *= np.linspace(0, 1, n)[:, None]
    if fade_out: n = int(fade_out * SR); x[-n:] *= np.linspace(1, 0, n)[:, None]
    return x
def write(name, st, kind='sfx'):
    wav = os.path.join(tempfile.gettempdir(), name + '.wav'); wavfile.write(wav, SR, (np.clip(st, -1, 1) * 32767).astype(np.int16))
    if kind == 'music':
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', '3', os.path.join(OUT, name + '.ogg')], check=True)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '128k', os.path.join(OUT, name + '.mp3')], check=True)
    else:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-q:a', '4', os.path.join(OUT, name + '.mp3')], check=True)
    os.remove(wav); print(f'  {name:<18}{len(st) / SR:6.1f}s  peak {np.max(np.abs(st)):.2f}')

D, F, G, A, Bb, C, E = 2, 5, 7, 9, 10, 0, 4  # pitch classes (D minor world)
def chord(root, kind, octv):  # midi list
    r = 12 * (octv + 1) + root
    return {'m': [r, r + 7, r + 15], 'M': [r, r + 7, r + 16], 'o': [r, r + 7, r + 12]}[kind]

CHORDS = [(D, 'm'), (Bb - 12 + 12, 'M'), (G, 'm'), (A, 'M')]
SEQ8 = [(D, 'm'), (D, 'm'), (Bb, 'M'), (Bb, 'M'), (G, 'm'), (G, 'm'), (A, 'M'), (A, 'M')]  # per bar
OST = {D: [38, 38, 41, 38, 38, 43, 38, 41], Bb: [34, 34, 38, 34, 34, 39, 34, 38], G: [31, 31, 34, 31, 31, 36, 31, 34], A: [33, 33, 37, 33, 33, 38, 33, 37]}

# ================================================================ MUSIC
def music_menu():
    bpm = 60; beat = 60 / bpm; bar = 4 * beat; bars = 16; dur = bars * bar; m = Mix(dur, True)
    m.put(losc(mf(26), dur, shape='sin') * 0.55 + filt(losc(mf(26), dur), 'low', 140) * 0.25, 0, 0.5)
    prog = [(D, 'm'), (Bb, 'M'), (G, 'm'), (A, 'M')]
    for k, (r, kind) in enumerate(prog):
        ch = chord(r, kind, 2) if r != Bb else chord(Bb, kind, 1)
        ch = [c + 12 for c in ch] if k != 1 else ch
        m.put(pad([mf(x) for x in ch], 4 * bar + 3, cutoff=800, att=2.2, rel=2.5, level=0.55), k * 4 * bar - 0.5, 1.0)
    phr = [[(1, 62, 3), (4, 65, 1), (5, 64, 2), (7, 62, 2), (9, 57, 6)], [(1, 65, 3), (4, 67, 1), (5, 65, 2), (7, 62, 2), (9, 58, 6)],
           [(1, 67, 3), (4, 70, 1), (5, 69, 2), (7, 67, 2), (9, 62, 6)], [(1, 64, 3), (4, 65, 1), (5, 64, 2), (7, 61, 2), (9, 57, 6)]]
    for k, p in enumerate(phr):
        for (b0, mid, db) in p:
            m.put(cello(mid - 12, db * beat, 0.5), k * 4 * bar + (b0 - 1) * beat, 1, -0.2)
            if k >= 2 or True: m.put(cello(mid, db * beat, 0.16, cut=2300), k * 4 * bar + (b0 - 1) * beat + 0.03, 1, 0.3)
    for k in range(bars):
        m.put(taiko(55, 0.5 if k % 4 == 0 else 0.28, 0.5), k * bar, 1, 0)
        if k % 4 == 3: m.put(taiko(60, 0.22, 0.3), k * bar + 2.5 * beat, 1, 0.1)
    for k in (0, 8): m.put(bell(mf(50), 9, 0.5), k * bar, 1, 0.15)
    for k, (r, kind) in enumerate(prog[:4]):
        if k >= 2: m.put(choir([mf(x) for x in chord(r, kind, 3)], 4 * bar + 2, 'oo', 2.5, 3, 0.55), (k * 4 - 0.4) * bar / 1.0 * 1.0 if False else k * 4 * bar - 1.0, 1, 0)
    wind = filt(bp(noise(dur), 250, 900), 'low', 700) * (0.5 + 0.5 * np.sin(2 * np.pi * np.arange(int(dur * SR)) / SR / lperiod(dur, 11.0))) * 0.12
    m.put(wind, 0, 1, 0)
    return finish(tone(reverb(m.stereo(), 4.6, 0.38, True)), rms_db=-21)

def drums(m, bpm, bars, hits, fills=(), gain=1.0):
    beat = 60 / bpm; bar = 4 * beat
    for b in range(bars):
        for (pos, f0, g) in hits:
            m.put(taiko(f0, g * gain, 0.4 if f0 < 70 else 0.22), b * bar + pos * beat, 1, -0.1 if f0 > 80 else 0.0)
        if b in fills:
            for k in range(8): m.put(tom(95 + (k % 4) * 14, (0.35 + k * 0.05) * gain, 0.5), b * bar + 3 * beat + k * beat / 8, 1, -0.3 + (k % 4) * 0.2)

def ostinato(m, bpm, bars, per_bar, step, cut=900, level=0.5, hi=0.25, start_bar=0, until=None):
    beat = 60 / bpm; bar = 4 * beat; stepd = beat * step
    for b in range(start_bar, until or bars):
        r, kind = SEQ8[b % 8]; notes = OST[r]
        for k in range(per_bar):
            nt = notes[k % len(notes)]; t = b * bar + k * stepd
            m.put(stac(nt, stepd * 0.92, cut, level), t, 1, -0.2)
            if hi: m.put(stac(nt + 12, stepd * 0.9, cut * 1.3, level * hi), t, 1, 0.25)

def music_battle():
    bpm = 96; beat = 60 / bpm; bar = 4 * beat; bars = 16; dur = bars * bar; m = Mix(dur, True)
    m.put(losc(mf(26), dur, shape='sin') * 0.5 + filt(losc(mf(26), dur), 'low', 130) * 0.25, 0, 0.6)
    drums(m, bpm, bars, [(0, 58, 1.0), (2, 62, 0.85), (1.5, 74, 0.45), (3.5, 74, 0.5)], fills=(3, 7, 11, 15))
    ostinato(m, bpm, bars, 8, 0.5, 950, 0.55)
    for b in range(bars):
        r, kind = SEQ8[b % 8]
        if b % 2 == 0: m.put(choir([mf(x) for x in chord(r, kind, 3)], 2 * bar + 0.6, 'ah' if b % 4 else 'oh', 1.0, 1.2, 0.5), b * bar, 1, 0)
    for b in (0, 4, 8, 12):
        r, kind = SEQ8[b % 8]; ch = [mf(x) for x in chord(r, 'o', 2)] + [mf(chord(r, 'o', 3)[0])]
        m.put(brass(ch, 2.2 * beat, 0.55, 2400, 0.12, 0.9), b * bar, 1, 0)
    for b in range(8, 16): m.put(pad([mf(x) for x in chord(*SEQ8[b % 8], 4)], bar + 0.8, cutoff=3200, att=0.4, rel=0.6, voices=4, vib=0.0, level=0.18) * (0.6 + 0.4 * np.sin(2 * np.pi * 11 * T(bar + 0.8))), b * bar, 1, 0.3)
    for b in (7, 15): m.put(clang(430, 1.8, 0.5), b * bar + 3.5 * beat, 1, -0.2)
    for b in (0, 8): m.put(gong(66, 8, 0.45), b * bar, 1, 0)
    return finish(tone(reverb(m.stereo(), 2.6, 0.24, True)), rms_db=-20)

def music_intense():
    bpm = 124; beat = 60 / bpm; bar = 4 * beat; bars = 16; dur = bars * bar; m = Mix(dur, True)
    m.put(losc(mf(26), dur, shape='sin') * 0.5 + filt(losc(mf(26), dur), 'low', 150) * 0.3, 0, 0.6)
    drums(m, bpm, bars, [(0, 56, 1.0), (1, 62, 0.7), (2, 58, 0.95), (3, 62, 0.7), (0.5, 80, 0.4), (1.5, 80, 0.4), (2.5, 80, 0.4), (3.5, 80, 0.45)], fills=(3, 7, 11, 15))
    ostinato(m, bpm, bars, 16, 0.25, 1100, 0.45, 0.35)
    for b in range(bars):
        r, kind = SEQ8[b % 8]
        m.put(choir([mf(x) for x in chord(r, kind, 3)] + [mf(chord(r, 'o', 4)[0])], bar + 0.4, 'ah', 0.3, 0.5, 0.6), b * bar, 1, 0)
        m.put(pad([mf(x) for x in chord(r, kind, 4)], bar, cutoff=3800, att=0.2, rel=0.3, voices=4, vib=0.0, level=0.26) * (0.55 + 0.45 * np.sin(2 * np.pi * 13 * T(bar))), b * bar, 1, 0.3)
    for b in (0, 4, 8, 12):
        r, kind = SEQ8[b % 8]
        m.put(brass([mf(x) for x in chord(r, 'o', 2)] + [mf(chord(r, 'o', 3)[1])], 1.6 * beat, 0.7, 3000, 0.05, 0.5), b * bar, 1, 0)
        m.put(swell(bar * 0.9, 300, 7000, 0.35), b * bar - bar * 0.9 + (dur if b == 0 else 0), 1, 0)
        m.put(gong(70, 6, 0.35), b * bar, 1, 0)
    return finish(tone(reverb(m.stereo(), 2.2, 0.2, True)), rms_db=-19)

def music_duel():
    bpm = 80; beat = 60 / bpm; bar = 4 * beat; bars = 16; dur = bars * bar; m = Mix(dur, True)
    m.put(losc(mf(26), dur, shape='sin') * 0.6 + filt(losc(mf(26), dur), 'low', 120) * 0.3, 0, 0.7)
    for b in range(bars):
        for k, g in enumerate([1.0, 0.55, 0.85, 0.55]): m.put(taiko(52 + (3 if k % 2 else 0), g, 0.6, 2.0), b * bar + k * beat, 1, 0)
        if b % 2 == 1: [m.put(tom(90 + (j % 3) * 15, 0.3 + j * 0.04, 0.5), b * bar + 3 * beat + j * beat / 6, 1, -0.3 + (j % 3) * 0.3) for j in range(6)]
    prog = [(D, 'm'), (Bb, 'M'), (G, 'm'), (A, 'M')]
    for k in range(8):
        r, kind = prog[k % 4]; b0 = k * 2 * bar
        m.put(choir([mf(x) for x in chord(r, kind, 3)] + [mf(chord(r, 'o', 2)[0])], 2 * bar + 1.2, 'ah' if k % 2 == 0 else 'oh', 1.2, 1.5, 0.9), b0 - 0.2, 1, 0)
        if k >= 4: m.put(choir([mf(x) for x in chord(r, kind, 4)], 2 * bar + 1, 'ah', 1.0, 1.5, 0.55), b0, 1, 0.2)
        m.put(pad([mf(x) for x in chord(r, kind, 2)], 2 * bar + 1, cutoff=1400, att=0.8, rel=1.2, level=0.45), b0 - 0.3, 1, -0.2)
        m.put(brass([mf(r + 36 - 24 + 0), mf(r + 36 - 12), mf(r + 36 - 12 + 7)], 2 * bar - 0.3, 0.7, 2600, 0.5, 0.8), b0, 1, 0)
    for b in range(0, bars, 2): m.put(stac(36 + 2 + 0, 0.3, 1000, 0.0), 0, 1, 0)
    for b in range(bars):
        r, kind = SEQ8[b % 8]; nt = OST[r][0]
        for j in range(3): m.put(stac(nt, beat / 1.5 * 0.9, 900, 0.5), b * bar + 0.0 + j * beat / 1.5 * 0 + (j * 4 / 3) * beat * 0.5 * 0 + j * beat * 4 / 3 / 3, 1, -0.2)
    for b in (0, 8): m.put(bell(mf(50), 9, 0.55), b * bar, 1, 0.1); m.put(gong(62, 9, 0.5), b * bar, 1, 0)
    for b in (3, 7, 11, 15): m.put(swell(bar * 0.8, 250, 5000, 0.3), b * bar + 0.2, 1, 0)
    return finish(tone(reverb(m.stereo(), 4.4, 0.36, True)), rms_db=-19)

def music_gm():
    bpm = 48; beat = 60 / bpm; bar = 4 * beat; bars = 8; dur = bars * bar; m = Mix(dur, True)
    m.put(losc(mf(26), dur, shape='sin') * 0.7 + filt(losc(mf(25), dur), 'low', 110) * 0.35, 0, 0.7)
    for k, (notes) in enumerate([[38, 51, 57, 68], [38, 50, 56, 69], [36, 49, 55, 66], [37, 50, 57, 68]]):
        m.put(pad([mf(x) for x in notes], 2 * bar + 4, cutoff=1500, att=3.5, rel=3.5, voices=4, det=0.012, vib=0.004, level=0.6), k * 2 * bar - 1.5, 1, 0)
        m.put(choir([mf(x + 12) for x in notes[:3]], 2 * bar + 3, 'oo', 3, 3, 0.55), k * 2 * bar - 1, 1, 0.2)
        m.put(brass([mf(notes[0] - 12), mf(notes[0])], 2 * bar - 1, 0.5, 900, 3.0, 2.0), k * 2 * bar + 0.5, 1, 0)
    for b in (0, 4): m.put(gong(55, 10, 0.7), b * bar, 1, 0)
    for k in range(int(dur / 2)): m.put(heartbeat(0.4 if k % 4 == 0 else 0.22), k * 2.0 + 0.3, 1, 0)
    for b in (3, 7): m.put(swell(bar * 0.9, 200, 4500, 0.35, True), b * bar + 0.1, 1, 0.3)
    m.put(bell(mf(45), 10, 0.4), 4 * bar, 1, -0.2)
    whisper = bp(noise(dur), 1200, 3800) * (np.sin(2 * np.pi * np.arange(int(dur * SR)) / SR / lperiod(dur, 7.0)) ** 2) * 0.05
    m.put(whisper, 0, 1, 0)
    return finish(tone(reverb(m.stereo(), 6.5, 0.5, True)), rms_db=-21)

# ================================================================ STINGS & SFX
def one(snd, rev=1.8, wet=0.25, pan=0.0, lead=0.0, tail=1.5, peak=0.85, d=None):
    d = d or (len(snd) / SR + tail); m = Mix(d); m.put(snd, lead, 1, pan); st = m.stereo()
    st = reverb(st, rev, wet) if wet else st
    return finish(st, peak=peak)
def sting_victory():
    m = Mix(7.5)
    for k, g in enumerate([0.5, 0.6, 0.75, 0.9, 1.0]): m.put(taiko(60, g, 0.3, 1.2), k * 0.16, 1, 0)
    m.put(taiko(48, 1.1, 0.9, 2.5), 0.9, 1, 0); m.put(gong(62, 8, 0.7), 0.9, 1, 0)
    m.put(brass([mf(38), mf(45), mf(50), mf(57)], 4.8, 0.9, 3000, 0.35, 1.4), 0.9, 1, 0)
    m.put(brass([mf(62), mf(69)], 4.2, 0.55, 3400, 0.5, 1.2), 1.4, 1, 0.2)
    m.put(choir([mf(x) for x in (50, 57, 62, 65, 69)], 5, 'ah', 0.4, 2.0, 0.9), 0.9, 1, 0)
    m.put(bell(mf(62), 6, 0.35), 0.9, 1, 0.3)
    return finish(reverb(m.stereo(), 3.4, 0.33), peak=0.9)
def sting_defeat():
    m = Mix(8.5)
    m.put(bell(mf(45), 8, 1.0), 0.0, 1, -0.1); m.put(bell(mf(43), 8, 0.9), 2.0, 1, 0.1); m.put(bell(mf(38), 8, 0.9), 4.2, 1, 0)
    m.put(osc(mf(26), 8, shape='sin') * np.linspace(1, 0, int(8 * SR)) * 0.6, 0, 1, 0)
    m.put(choir([mf(x) for x in (38, 45, 50, 53)], 6, 'oo', 1.2, 3.0, 0.5), 0.5, 1, 0)
    m.put(impact(40, 0.9, 1.8, 0.2), 0, 1, 0)
    return finish(reverb(m.stereo(), 5.0, 0.4), peak=0.88)
def sfx_claim():
    m = Mix(3.5); s = bp(noise(0.5), 2500, 9000) * np.minimum(1, T(0.5) / 0.04) * np.exp(-T(0.5) / 0.14); m.put(s * 0.9, 0, 1, 0.2)
    m.put(clang(900, 1.6, 0.5), 0.02, 1, 0.1); m.put(taiko(58, 0.9, 0.5), 0.05, 1, 0); m.put(bell(mf(57), 3, 0.35), 0.2, 1, 0)
    return finish(reverb(m.stereo(), 2.0, 0.25), peak=0.85)
def sfx_level():
    m = Mix(5)
    for k, g in enumerate([0.55, 0.7, 0.9]): m.put(taiko(62, g, 0.3, 1.0), k * 0.2, 1, 0)
    m.put(brass([mf(38), mf(45), mf(50)], 3.0, 0.8, 3200, 0.2, 1.0), 0.6, 1, 0)
    m.put(choir([mf(x) for x in (50, 57, 62)], 3.2, 'ah', 0.5, 1.5, 0.8), 0.6, 1, 0)
    m.put(gong(64, 6, 0.5), 0.6, 1, 0)
    return finish(reverb(m.stereo(), 3.0, 0.3), peak=0.88)
def sfx_vs():
    m = Mix(3.2); m.put(taiko(55, 1.0, 0.5, 2.0), 0.0, 1, -0.2); m.put(taiko(55, 1.0, 0.5, 2.0), 0.55, 1, 0.2); m.put(gong(60, 7, 0.65), 1.1, 1, 0)
    m.put(swell(1.0, 200, 3000, 0.4), 0.1, 1, 0); m.put(impact(42, 0.9, 1.5), 1.1, 1, 0)
    return finish(reverb(m.stereo(), 2.4, 0.28), peak=0.9)
def sfx_boom():
    m = Mix(7); m.put(impact(36, 1.2, 3.0, 0.15), 0.0, 1, 0); m.put(swell(2.4, 120, 1800, 0.5), 0, 1, 0)
    m.put(gong(55, 9, 0.8), 0.0, 1, 0); m.put(osc(mf(25), 6, shape='sin') * adsr(int(6 * SR), 1.5, 0.1, .8, 3) * 0.6, 0.2, 1, 0)
    return finish(reverb(m.stereo(), 4.5, 0.4), peak=0.92)
def sfx_type():
    s = filt(noise(0.05), 'high', 900) * expd(int(0.05 * SR), 0.006) * 0.8 + np.sin(2 * np.pi * 220 * T(0.05)) * expd(int(0.05 * SR), 0.01) * 0.4
    return finish(np.stack([s, s], 1), peak=0.22)

def sfx_sacrifice():
    """Gather Soul: a drawn breath, a wet tear, a stuttering heart that misses a beat, then cold Soul rising out of the wound. Deliberately uneasy (minor second, tritone)."""
    m = Mix(4.2)
    m.put(swell(1.0, 120, 3800, 0.55), 0, 1, -0.3)                                          # the inhale
    m.put(pad([mf(38), mf(39), mf(44)], 3.2, 520, 0.9, 1.6, level=0.9), 0, 1, 0)              # beating minor second + tritone drone
    tear = bp(noise(0.55), 700, 4200) * (0.55 + 0.45 * np.sign(np.sin(2 * np.pi * 23 * T(0.55)))) * expd(int(0.55 * SR), 0.2)
    m.put(tear * 0.8, 0.95, 1, 0.15); m.put(impact(41, 1.0, 1.1, 0.35), 0.95, 1, 0)            # the cut
    m.put(taiko(50, 0.9, 0.3, 0.8), 1.45, 1, 0); m.put(taiko(46, 0.6, 0.26, 0.8), 1.7, 1, 0)   # heartbeat, then the third beat never comes
    m.put(choir([mf(50), mf(56)], 2.2, 'oh', 0.5, 1.4, 0.55), 1.55, 1, 0.1)                    # hollow voices on a tritone
    for k, f in enumerate((mf(86), mf(90), mf(93))): m.put(np.sin(2 * np.pi * f * T(1.6)) * expd(int(1.6 * SR), 0.55) * 0.14, 2.0 + 0.12 * k, 1, -0.5 + 0.5 * k)  # cold Soul, thin and sharp
    m.put(bell(mf(45), 4, 0.35, 0.6), 2.0, 1, 0)
    return finish(reverb(m.stereo(), 3.0, 0.34), peak=0.85)

def sfx_all():
    out = {}
    # ui tap: iron on stone
    s = filt(noise(0.18), 'band' if False else 'low', 2200) * expd(int(0.18 * SR), 0.02) + np.sin(2 * np.pi * 140 * T(0.18)) * expd(int(0.18 * SR), 0.05) * 0.9
    out['ui-tap'] = one(s, 0.8, 0.1, tail=0.3, peak=0.42)
    s = np.sin(2 * np.pi * np.cumsum(120 * (1 - 0.5 * T(0.5) / 0.5)) / SR) * adsr(int(0.5 * SR), 0.01, 0.05, 0.6, 0.35) + 0.3 * filt(noise(0.5), 'low', 900) * adsr(int(0.5 * SR), 0.02, 0.05, 0.4, 0.4)
    out['ui-close'] = one(s * 0.7, 1.0, 0.15, tail=0.3, peak=0.4)
    s = swell(0.6, 150, 1200, 0.6) + np.sin(2 * np.pi * 70 * T(0.6)) * adsr(int(0.6 * SR), 0.2, 0.05, 0.7, 0.3) * 0.5
    out['ui-open'] = one(s, 1.2, 0.18, tail=0.4, peak=0.5)
    s = filt(noise(0.09), 'high', 1500) * expd(int(0.09 * SR), 0.012) * 0.6 + np.sin(2 * np.pi * 330 * T(0.09)) * expd(int(0.09 * SR), 0.02) * 0.3
    out['card-select'] = one(s, 0.6, 0.08, tail=0.2, peak=0.34)
    out['card-commit'] = one(add(taiko(80, 0.9, 0.2, 0.7), 0.5 * clang(700, 0.5, 0.4)), 1.2, 0.18, tail=0.5, peak=0.65)
    out['call'] = one(add(taiko(66, 1.0, 0.35, 1.0), 0.4 * clang(1100, 0.8, 0.5)), 1.6, 0.2, tail=0.7, peak=0.72)
    s = bp(noise(0.28), 900, 6000) * np.sin(np.pi * T(0.28) / 0.28) ** 2 * 0.8 + filt(noise(0.28), 'low', 400) * expd(int(0.28 * SR), 0.1) * 0.3
    out['card-flip'] = one(s, 0.8, 0.1, tail=0.2, peak=0.5)
    m = Mix(1.4); m.put(swell(0.5, 300, 6000, 0.6), 0, 1, 0); m.put(impact(52, 0.8, 1.0, 0.5), 0.5, 1, 0); m.put(clang(600, 1.0, 0.3), 0.5, 1, 0.1)
    out['reveal'] = finish(reverb(m.stereo(), 1.6, 0.2), peak=0.7)
    m = Mix(0.6)
    for k in range(5): m.put(filt(noise(0.06), 'high', 1400) * expd(int(0.06 * SR), 0.01) * 0.7, k * 0.09, 1, -0.4 + k * 0.2)
    out['deal'] = finish(m.stereo(), peak=0.42)
    m = Mix(0.9)
    for k in range(9): m.put(bp(noise(0.12), 700, 5000) * np.sin(np.pi * T(0.12) / 0.12) * 0.5, k * 0.085, 1, -0.5 + k * 0.12)
    out['shuffle'] = finish(m.stereo(), peak=0.4)
    out['slam'] = one(add(impact(46, 1.0, 1.0, 0.8), taiko(70, 0.6, 0.2, 0.7)), 1.6, 0.2, tail=0.7, peak=0.8)
    out['clash'] = one(add(clang(430, 2.2, 1.0), impact(55, 0.7, 0.9, 0.7), 0.5 * clang(655, 1.2, 0.7)), 2.0, 0.25, tail=1.2, peak=0.85)
    m = Mix(2.4); m.put(brass([mf(38), mf(45), mf(50)], 1.4, 0.7, 2800, 0.04, 0.8), 0, 1, 0); m.put(taiko(58, 1.0, 0.5, 1.4), 0, 1, 0); m.put(clang(880, 1.0, 0.25), 0.02, 1, 0.2)
    out['win-trick'] = finish(reverb(m.stereo(), 2.4, 0.28), peak=0.82)
    out['damage'] = one(add(impact(44, 1.1, 1.0, 0.9), 0.4 * filt(noise(0.4), 'low', 2500) * expd(int(0.4 * SR), 0.06)), 1.0, 0.12, tail=0.5, peak=0.88)
    out['heal'] = one(add(pad([mf(50), mf(57), mf(62)], 1.8, 1100, 0.5, 1.0, level=0.8), bell(mf(69), 2.5, 0.2)), 2.2, 0.3, tail=1.2, peak=0.5)
    t = T(1.1); s = filt(osc(mf(38), 1.1) * 0.5 + osc(mf(50), 1.1) * 0.3, 'low', 600) * (t / 1.1) ** 1.5 * np.exp(-((t - 1.1) / 0.8) ** 2 * 0) * adsr(int(1.1 * SR), 0.5, 0.02, 1, 0.25)
    out['ki'] = one(s, 1.5, 0.2, tail=0.5, peak=0.5)
    t = T(1.0); s = filt(osc(mf(45), 1.0) * 0.6, 'low', 700) * adsr(int(1.0 * SR), 0.02, 0.05, 0.8, 0.8) * np.linspace(1, 0.2, int(1.0 * SR))
    out['ki-loss'] = one(s, 1.2, 0.2, tail=0.4, peak=0.5)
    m = Mix(1.2); m.put(taiko(62, 1.0, 0.4, 1.1), 0, 1, -0.2); m.put(taiko(62, 0.9, 0.4, 1.1), 0.34, 1, 0.2)
    out['round'] = finish(reverb(m.stereo(), 1.8, 0.2), peak=0.75)
    m = Mix(5)
    for k in range(10): m.put(taiko(60 + (k % 2) * 6, 0.25 + k * 0.07, 0.3, 1.0), k * 0.1, 1, 0)
    m.put(taiko(46, 1.1, 0.9, 2.5), 1.1, 1, 0); m.put(gong(62, 8, 0.8), 1.1, 1, 0); m.put(swell(1.1, 200, 4000, 0.5), 0, 1, 0)
    out['match-start'] = finish(reverb(m.stereo(), 3.0, 0.3), peak=0.9)
    m = Mix(7); m.put(impact(38, 1.1, 2.0, 0.6), 0, 1, 0); m.put(bell(mf(43), 8, 0.9), 0.1, 1, 0); m.put(osc(mf(25), 6, shape='sin') * adsr(int(6 * SR), 0.05, .1, .6, 4) * 0.5, 0, 1, 0)
    out['ko'] = finish(reverb(m.stereo(), 4.0, 0.35), peak=0.9)
    s = pad([mf(26), mf(33), mf(38)], 3.5, 500, 1.6, 1.6, level=1.2) + swell(3.5, 100, 1500, 0.15)
    out['last-two'] = one(s, 3.0, 0.3, tail=0.4, peak=0.6)
    s = osc(mf(25), 0.5, shape='sin') * 0.2
    m = Mix(0.9); m.put(heartbeat(1.0), 0, 1, 0); out['heartbeat'] = finish(m.stereo(), peak=0.8)
    s = np.sin(2 * np.pi * np.cumsum(70 * np.ones(int(0.4 * SR))) / SR) * expd(int(0.4 * SR), 0.12)
    out['invalid'] = one(s * 0.7 + filt(noise(0.4), 'low', 300) * expd(int(0.4 * SR), 0.05) * 0.5, 0.8, 0.1, tail=0.3, peak=0.4)
    m = Mix(3.2); m.put(brass([mf(26), mf(33), mf(38)], 2.4, 0.9, 1100, 0.7, 1.2), 0, 1, 0); m.put(swell(2.4, 100, 1800, 0.35), 0, 1, 0); m.put(impact(34, 0.6, 1.5, 0.1), 1.6, 1, 0)
    out['gm-growl'] = finish(reverb(m.stereo(), 3.0, 0.3), peak=0.85)
    out['gong'] = one(gong(58, 9, 1.0), 3.5, 0.28, tail=0.5, peak=0.9)
    m = Mix(3.0)
    for k, p in enumerate([0, 1.1]): m.put(brass([mf(38), mf(41), mf(45)], 0.9, 0.9, 2200, 0.05, 0.35), p, 1, -0.2 + k * 0.4); m.put(taiko(60, 0.8, 0.4, 1.0), p, 1, 0)
    out['alarm'] = finish(reverb(m.stereo(), 2.2, 0.25), peak=0.8)
    out['shield'] = one(add(clang(300, 1.8, 0.9), 0.4 * taiko(74, 0.7, 0.2, 0.6)), 1.8, 0.2, tail=0.9, peak=0.7)
    m = Mix(2.6); m.put(swell(1.0, 80, 2500, 0.55), 0, 1, 0); m.put(impact(40, 0.9, 1.4, 0.2), 1.0, 1, 0); m.put(choir([mf(50), mf(57), mf(62)], 1.4, 'oh', 0.3, 1.2, 0.6), 0.9, 1, 0)
    out['wild-surge'] = finish(reverb(m.stereo(), 2.8, 0.3), peak=0.85)
    out['wild-heal'] = one(add(choir([mf(50), mf(57), mf(62)], 2.0, 'ah', 0.6, 1.2, 0.8), bell(mf(74), 3, 0.3)), 2.8, 0.3, tail=1.2, peak=0.6)
    m = Mix(3.0); m.put(swell(0.6, 100, 3500, 0.7), 0, 1, 0); m.put(impact(34, 1.3, 2.0, 0.9), 0.6, 1, 0); m.put(gong(50, 7, 0.5), 0.6, 1, 0)
    out['wild-blast'] = finish(reverb(m.stereo(), 3.4, 0.28), peak=0.92)
    m = Mix(2.4)
    for k in range(7): m.put(clang(1800 + 240 * (k % 3), 0.25, 0.4), k * 0.07, 1, -0.4 + k * 0.13)
    m.put(impact(48, 1.0, 1.0, 0.4), 0.55, 1, 0); m.put(taiko(60, 0.8, 0.3, 1), 0.55, 1, 0)
    out['wild-seal'] = finish(reverb(m.stereo(), 2.0, 0.22), peak=0.85)
    t = T(1.4); ping = np.sin(2 * np.pi * 440 * t) * expd(len(t), 0.5) * 0.6
    m = Mix(3.2)
    for k in range(3): m.put(ping * (0.9 ** k), k * 0.5, 1, -0.3 + k * 0.3)
    m.put(pad([mf(33), mf(40)], 2.2, 500, 0.3, 1.2, level=0.8), 0, 1, 0)
    out['wild-scan'] = finish(reverb(m.stereo(), 2.4, 0.3), peak=0.55)
    m = Mix(3.0); w = filt(noise(1.6), 'high', 500) * expd(int(1.6 * SR), 0.5); m.put(w * 0.9, 0.05, 1, 0); m.put(np.sin(2 * np.pi * 3200 * T(2.5)) * expd(int(2.5 * SR), 0.9) * 0.15, 0.05, 1, 0); m.put(impact(60, 0.6, 0.6, 0.9), 0, 1, 0)
    out['wild-flare'] = finish(reverb(m.stereo(), 2.0, 0.2), peak=0.85)
    m = Mix(3.2); m.put(swell(1.4, 80, 2200, 0.7, True)[::-1] * 0 + swell(1.4, 80, 2200, 0.7, False), 0, 1, 0); m.put(swell(1.4, 80, 2200, 0.5, True), 0.3, 1, 0); m.put(impact(36, 1.0, 1.8, 0.1), 1.4, 1, 0)
    out['wild-invert'] = finish(reverb(m.stereo(), 3.2, 0.32), peak=0.85)
    m = Mix(5.0); m.put(choir([mf(x) for x in (38, 45, 50, 57, 62)], 3.6, 'ah', 1.0, 1.8, 0.9), 0, 1, 0); m.put(bell(mf(62), 5, 0.5), 1.0, 1, 0.2); m.put(gong(60, 7, 0.5), 1.0, 1, 0)
    out['wild-wish'] = finish(reverb(m.stereo(), 3.8, 0.35), peak=0.85)
    m = Mix(4.5); m.put(choir([mf(x) for x in (50, 57, 62, 66)], 3.2, 'ah', 0.3, 2.0, 0.9), 0, 1, 0); m.put(bell(mf(74), 5, 0.4), 0, 1, 0.3)
    out['wish-granted'] = finish(reverb(m.stereo(), 3.5, 0.33), peak=0.8)
    m = Mix(3.6); m.put(bp(noise(2.6), 1500, 4500) * np.sin(np.pi * T(2.6) / 2.6) ** 2 * 0.35, 0, 1, -0.5); m.put(bp(noise(2.6), 900, 3000) * np.sin(np.pi * T(2.6) / 2.6) ** 2 * 0.3, 0.2, 1, 0.5)
    m.put(pad([mf(38), mf(39), mf(45)], 3.0, 700, 0.6, 1.6, level=0.9), 0, 1, 0); m.put(impact(40, 0.7, 1.0, 0.2), 1.0, 1, 0)
    out['wild-curse'] = finish(reverb(m.stereo(), 3.0, 0.35), peak=0.75)
    out['story-victory'] = sting_victory(); out['story-defeat'] = sting_defeat(); out['story-claim'] = sfx_claim(); out['story-level'] = sfx_level()
    out['story-vs'] = sfx_vs(); out['story-boom'] = sfx_boom(); out['story-type'] = sfx_type()
    out['story-bell'] = one(bell(mf(45), 9, 1.0), 4.0, 0.3, tail=0.5, peak=0.8)
    out['sacrifice'] = sfx_sacrifice()
    return {k: v for k, v in out.items() if v is not None}

if __name__ == '__main__':
    print('music'); [write(n, f(), 'music') for n, f in [('theme-menu', music_menu), ('theme-battle', music_battle), ('theme-intense', music_intense), ('theme-duel', music_duel), ('theme-gm', music_gm)]]
    print('sfx'); [write(k, v) for k, v in sfx_all().items()]
