#!/usr/bin/env python3
"""Procedural music + ambience for Dragon Ball: Ki Clash (numpy/scipy only, deterministic, original compositions).
Writes (stereo 16-bit WAV; music 32 kHz, ambience 22.05 kHz):
  public/audio/menu-cinematic-ambient.wav     A minor, 72 BPM, 12 bars (40.0 s)   seed 101
  public/audio/music/battle-theme.wav         A minor, 120 BPM, 20 bars (40.0 s)  seed 102
  public/audio/music/battle-theme-intense.wav A minor, 144 BPM, 24 bars (40.0 s)  seed 103
  public/audio/music/final-duel-theme.wav     A phrygian-minor, 152 BPM, 20 bars  seed 104
  public/audio/music/gm-decree-theme.wav      A (drone, b2 colour), 60 BPM, 6 bars (24 s) seed 105
  public/audio/arenas/*.wav                   4 x 20 s seamless stereo beds       seeds 201-204
Loops are exact bar counts; reverb / delay tails are folded back onto the start and every master-bus stage runs on a 3x tiled
copy (middle third kept) so the wrap point is continuous. Usage: python3 scripts/make-music.py [name-substring ...]"""
import os, sys, wave
import numpy as np
from scipy import signal

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'audio')
SR = 32000
R = np.random.default_rng(0)

def midi(n): return 440.0 * 2 ** ((np.asarray(n, float) - 69) / 12)
def _sos(kind, fc, o): 
    fc = np.atleast_1d(fc).astype(float) / (SR / 2); fc = np.clip(fc, 1e-4, 0.995); return signal.butter(o, fc if len(fc) > 1 else fc[0], kind, output='sos')
def lp(x, fc, o=2): return signal.sosfilt(_sos('low', fc, o), x, axis=0)
def hp(x, fc, o=2): return signal.sosfilt(_sos('high', fc, o), x, axis=0)
def bp(x, lo, hi, o=2): return signal.sosfilt(_sos('band', [lo, hi], o), x, axis=0)
def N(d): return int(round(d * SR))
def tt(d): return np.arange(N(d)) / SR
def noise(d): return R.standard_normal(N(d))
def env(n, atk=0.003, tau=0.2): t = np.arange(n) / SR; return np.minimum(t / max(atk, 1e-4), 1.0) * np.exp(-t / tau)
def adsr(n, a, d, s, r):
    t = np.arange(n) / SR; T = n / SR; e = np.minimum(t / max(a, 1e-4), 1.0) * (s + (1 - s) * np.exp(-np.clip(t - a, 0, None) / d))
    return e * np.clip((T - t) / max(r, 1e-4), 0, 1)
def sat(x, d=1.5): return np.tanh(x * d) / np.tanh(d)
def ph(f, sr=None): return 2 * np.pi * np.cumsum(f) / (sr or SR)
def svf(x, fc, q=2.0, mode='bp'):
    x = np.asarray(x, float); fc = np.broadcast_to(np.asarray(fc, float), x.shape)
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR); k = 1.0 / q
    a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2; out = np.empty(len(x)); ic1 = ic2 = 0.0
    for i, (xi, A1, A2, A3) in enumerate(zip(x.tolist(), a1.tolist(), a2.tolist(), a3.tolist())):
        v3 = xi - ic2; v1 = A1 * ic1 + A2 * v3; v2 = ic2 + A2 * ic1 + A3 * v3; ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2
        out[i] = v1 if mode == 'bp' else v2 if mode == 'lp' else xi - k * v1 - v2
    return out
def pan2(x, p=0.0): a = (p + 1) * np.pi / 4; return np.stack([x * np.cos(a), x * np.sin(a)], 1)
def sawk(p, K): return sum(np.sin(k * p) / k for k in range(1, K + 1)) * 0.62

# ---------------- drum + percussion voices ----------------
def kick(v=1.0):
    t = tt(0.4); f = 50 + 120 * np.exp(-t / 0.025); p = ph(f)
    x = np.sin(p) * np.exp(-t / 0.17) + 0.4 * np.sin(2 * p) * np.exp(-t / 0.05)
    x = sat(x * 1.3, 1.4) + 0.35 * hp(R.standard_normal(len(t)), 1800) * np.exp(-t / 0.004)
    return x * v
def taiko(v=1.0, f0=88):
    t = tt(0.9); f = f0 * 0.75 + f0 * 0.9 * np.exp(-t / 0.05); p = ph(f)
    x = np.sin(p) * np.exp(-t / 0.4) + 0.5 * np.sin(1.5 * p + 1) * np.exp(-t / 0.2) + 0.3 * np.sin(2.4 * p) * np.exp(-t / 0.09)
    x += lp(R.standard_normal(len(t)), 1400) * np.exp(-t / 0.035) * 0.8 + bp(R.standard_normal(len(t)), 200, 700) * np.exp(-t / 0.12) * 0.35
    return sat(x, 1.3) * v
def snare(v=1.0):
    t = tt(0.3); n = bp(R.standard_normal(len(t)), 1400, 9000)
    x = n * np.exp(-t / 0.09) * 0.8 + np.sin(2 * np.pi * (180 + 70 * np.exp(-t / 0.02)) * t) * np.exp(-t / 0.07) * 0.8 + np.sin(2 * np.pi * 330 * t) * np.exp(-t / 0.04) * 0.25
    return sat(x, 1.4) * v
def clap(v=1.0):
    t = tt(0.3); x = np.zeros(len(t)); n = bp(R.standard_normal(len(t)), 900, 6000)
    for d_ in (0, 0.011, 0.023): i = N(d_); x[i:] += n[:len(t) - i] * np.exp(-np.arange(len(t) - i) / SR / 0.006)
    x += n * np.exp(-t / 0.1) * np.minimum(t / 0.03, 1) * 0.6
    return x * v * 0.6
def hat(v=1.0, op=False):
    t = tt(0.22 if op else 0.07); n = bp(R.standard_normal(len(t)), 6500, 14000)
    return n * np.exp(-t / (0.09 if op else 0.014)) * v * 0.7
def shaker(v=1.0):
    t = tt(0.08); return bp(R.standard_normal(len(t)), 4500, 11000) * np.minimum(t / 0.012, 1) * np.exp(-t / 0.025) * v * 0.5
def tom(f, v=1.0):
    t = tt(0.4); p = ph(f * (1 + 0.5 * np.exp(-t / 0.04)))
    return (np.sin(p) * np.exp(-t / 0.16) + 0.4 * lp(R.standard_normal(len(t)), 1500) * np.exp(-t / 0.02)) * v
def crash(v=1.0, d=1.6):
    t = tt(d); n = bp(R.standard_normal(len(t)), 3000, 14000) * np.exp(-t / (d / 4)) * np.minimum(t / 0.004, 1)
    return (n + 0.4 * lp(n, 6000)) * v * 0.55
def revcrash(d, v=1.0):
    t = tt(d); n = bp(R.standard_normal(len(t)), 2500, 13000); return n * (t / d) ** 2.5 * v * 0.6
def riser(d, v=1.0, f0=300, f1=9000):
    n = N(d); t = np.linspace(0, 1, n); x = svf(R.standard_normal(n), f0 * (f1 / f0) ** t, 1.5) * t ** 2
    return x * v * 1.3

# ---------------- melodic voices ----------------
def subbass(f, d, v=1.0, bright=0.5):
    n = N(d); t = np.arange(n) / SR; p = 2 * np.pi * f * t
    x = np.sin(p) + 0.45 * np.sin(2 * p) * np.exp(-t / 0.3) + 0.25 * np.sin(3 * p) * np.exp(-t / 0.2)         # harmonics keep it audible on laptop speakers
    x = sat(x * 0.9, 1.6)
    s = lp(sawk(p, 14), 900 + 600 * bright) * 0.45
    return (x + s) * adsr(n, 0.006, 0.25, 0.75, min(0.06, d * 0.4)) * v
def pluck(f, d, v=1.0, bright=1.0, K=14):
    n = N(d); t = np.arange(n) / SR; p = 2 * np.pi * f * t; K = int(max(2, min(K, 11000 / f)))
    x = sum(np.sin(k * p) / k * np.exp(-t * (3 + 5.5 * k / bright)) for k in range(1, K + 1))
    return x * np.minimum(t / 0.002, 1) * np.exp(-t / (d * 0.6)) * v * 0.9
def bellpluck(f, d, v=1.0):
    n = N(d); t = np.arange(n) / SR; x = np.zeros(n)
    for r_, a, k in [(1, 1, 1), (2.0, .35, 1.8), (2.76, .25, 2.3), (4.1, .1, 3.2)]:
        if f * r_ < 12000: x += a * np.sin(2 * np.pi * f * r_ * t) * np.exp(-t / (d / (1.5 * k)))
    return x * np.minimum(t / 0.003, 1) * v * 0.6
def stab(freqs, d, v=1.0, bright=1.0):
    n = N(d); t = np.arange(n) / SR; x = np.zeros(n)
    for f in freqs:
        for det in (0.996, 1.004): x += sawk(2 * np.pi * f * det * t, int(max(3, min(18, 9000 / f))))
    x /= len(freqs) * 1.2
    a = lp(x, 900 * bright); b = lp(x, 4200 * bright); m = np.exp(-t / 0.09)
    return (a * (1 - m) + b * m) * adsr(n, 0.004, d * 0.4, 0.6, min(0.06, d * 0.5)) * v
def chordpad(freqs, d, v=1.0, voices=3, spread=0.007, side=0, att=0.35, rel=0.35):
    """naive-saw super-saw pad, one stereo side (0=L,1=R) gets mirrored detunes. lowpassed later by the caller's sweep filter."""
    n = N(d); t = np.arange(n) / SR; x = np.zeros(n)
    for f in freqs:
        for k in range(voices):
            det = 1 + spread * ((k - (voices - 1) / 2) / max((voices - 1) / 2, 1)) * (1 if side == 0 else -1) + 0.0007 * (side * 2 - 1)
            x += ((f * det * t + R.uniform()) % 1.0) * 2 - 1
    x /= (len(freqs) * voices) ** 0.8
    a = np.clip(t / (d * att), 0, 1) ** 1.5 * np.clip((d - t) / (d * rel), 0, 1) ** 1.2
    return x * a * v

def lead_line(notes, L, beat, sr_L, sh=0, wave_k=11, portamento=0.035, vib_rate=5.4, vib_depth=0.0055, att=0.02, rel=0.05, tilt=1.1):
    """monophonic lead for the whole timeline. notes: (start_beat, midi, beats, vel). Legato notes glide (one-pole portamento)."""
    f = np.zeros(L); a = np.zeros(L); since = np.zeros(L)
    for sb, m, ln, vel in sorted(notes):
        i = int(round(sb * beat * SR)); j = min(L, int(round((sb + ln * 0.97) * beat * SR)))
        if i >= L: continue
        n = j - i; f[i:j] = midi(m + sh); tt_ = np.arange(n) / SR
        a[i:j] = vel * np.minimum(tt_ / att, 1) * np.clip((n / SR - tt_) / rel, 0, 1) * (0.85 + 0.15 * np.exp(-tt_ / 0.25)); since[i:j] = tt_
    # fill gaps with the previous pitch so the glide starts from it (amp is zero there)
    idx = np.where(f > 0, np.arange(L), 0); idx = np.maximum.accumulate(idx); fl = f[idx]; fl[fl == 0] = 440.0
    c = 1 - np.exp(-1 / (portamento * SR)); fs = signal.lfilter([c], [1, -(1 - c)], fl)
    fs = fs * (1 + vib_depth * np.sin(2 * np.pi * vib_rate * np.arange(L) / SR) * np.clip((since - 0.18) / 0.3, 0, 1))
    p = ph(fs); K = int(max(4, min(wave_k, 9000 / max(fs.max(), 50))))
    x = sum(np.sin(k * p) / k ** tilt for k in range(1, K + 1))
    return x * a * 0.8

# ---------------- reverb / delay / master ----------------
def make_ir(rt=1.8, damp=4500, pre=0.015, seed=3, early=True):
    r = np.random.default_rng(seed); n = int(rt * 1.1 * SR); t = np.arange(n) / SR; ch = []
    for _ in range(2):
        x = r.standard_normal(n) * np.exp(-6.9 * t / rt) * (1 - np.exp(-t / 0.012)); x = lp(x, damp, 1); x = hp(x, 160, 1)
        ch.append(np.concatenate([np.zeros(int(pre * SR)), x]))
    L, Rr = ch; k = np.sqrt(np.sum(L ** 2)); return np.stack([L / k, Rr / k], 1)
def reverb(x, ir): return np.stack([signal.fftconvolve(x[:, 0], ir[:, 0])[:len(x)], signal.fftconvolve(x[:, 1], ir[:, 1])[:len(x)]], 1)
def pingpong(x, delay, fb=0.4, taps=5, lpf=3200):
    y = np.zeros_like(x); cur = x.copy(); d = int(delay * SR)
    for k in range(taps):
        cur = np.roll(cur, d, 0); cur[:d] = 0; cur = lp(cur, lpf, 1) * fb; cur = cur[:, ::-1]; y += cur
    return y
def sidechain(Ltot, kicks, depth=0.5, rel=0.16, loopL=None):
    g = np.ones(Ltot); t = np.arange(Ltot)
    for k in kicks:
        d = t - k; m = d >= 0; g[m] = np.minimum(g[m], 1 - depth * np.exp(-d[m] / (rel * SR)) * (1 - np.exp(-d[m] / (0.004 * SR))) - 0 * d[m])
    return g[:, None]
def fold(y, L):
    out = y[:L].copy(); e = len(y) - L
    while e > 0:
        seg = y[L:L + min(e, L)]; out[:len(seg)] += seg; y = y[L + len(seg):] if False else y; break
    return out
def softlimit(x, ceil=0.89, knee=0.6):
    k = ceil * knee; a = np.abs(x); y = np.where(a < k, a, k + (ceil - k) * np.tanh((a - k) / (ceil - k))); return np.sign(x) * y
def master(y, rms_db=-18.0, comp=(0.2, 2.2), lowcut=32, hf=14000):
    z = np.tile(y, (3, 1)); L = len(y)
    z = hp(z, lowcut, 2); z = lp(z, hf, 2)
    thr, ratio = comp; m = z.mean(1) ** 2; c = 1 - np.exp(-1 / (0.05 * SR)); env_ = np.sqrt(signal.lfilter([c], [1, -(1 - c)], m) + 1e-12)
    g = np.where(env_ > thr, (env_ / thr) ** (1 / ratio - 1), 1.0); z = z * g[:, None]
    z = sat(z / (np.abs(z).max() + 1e-9) * 1.3, 1.25) / np.tanh(1.25) * 0.8
    z = z[L:2 * L]; z -= z.mean(0)
    for _ in range(3):
        z = z * (10 ** (rms_db / 20) / np.sqrt(np.mean(z ** 2))); z = softlimit(z)
    pk = np.abs(z).max()
    if pk > 10 ** (-1.0 / 20): z = z * (10 ** (-1.0 / 20) / pk)
    return z
def write(name, z, sr=SR):
    path = os.path.join(OUT, name); os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(z, -1, 1) * 32767).round().astype('<i2').tobytes())
    m = z.mean(1); jump = abs(m[0] - m[-1]); typ = np.median(np.abs(np.diff(m)))
    print(f'{name}: {len(z) / sr:.2f}s rms={20 * np.log10(np.sqrt(np.mean(z ** 2))):.1f}dB peak={20 * np.log10(np.abs(z).max()):.1f}dB seam={jump:.5f} ({jump / typ:.1f}x median diff)')

# ---------------- voice leading ----------------
def voice(prev, pcs, lo=50, hi=74):
    """choose octave placements of the chord tones (pitch classes) minimising total movement from the previous voicing."""
    import itertools
    cand = [[n for n in range(lo, hi + 1) if n % 12 == pc % 12] for pc in pcs]
    best = None
    for combo in itertools.product(*cand):
        c = sorted(combo)
        if prev is None: cost = abs(np.mean(c) - 62) * 2 + (max(c) - min(c)) * 0.1
        else: cost = sum(abs(a - b) for a, b in zip(c, prev[:len(c)])) + abs(len(c) - len(prev))
        if best is None or cost < best[0]: best = (cost, c)
    return best[1]

# ======================= song engine =======================
class Song:
    def __init__(s, bpm, bars, tail=4.0):
        s.bars = bars; s.L = int(round(bars * 4 * 60 / bpm * SR)); s.beat = s.L / (bars * 4) / SR; s.bar = s.beat * 4; s.T = s.L + N(tail)
        s.bpm = 60 / s.beat; s.stems = {}
    def stem(s, name):
        if name not in s.stems: s.stems[name] = np.zeros((s.T, 2))
        return s.stems[name]
    def put(s, name, bar, beat, x, g=1.0, pan=0.0):
        b = s.stem(name); i = int(round((bar * 4 + beat) * s.beat * SR)); x = np.asarray(x, float)
        if x.ndim == 1: x = pan2(x, pan)
        e = min(s.T - i, len(x))
        if i < s.T and e > 0: b[i:i + e] += x[:e] * g
        # wrap-around of notes starting near the end is handled by tail folding
    def sweep_filter(s, name, curve, q=1.0):   # curve: cutoff per sample (length T)
        b = s.stem(name)
        for c in (0, 1): b[:, c] = svf(b[:, c], curve, q, 'lp')
    def cut_curve(s, pts):
        """pts: list of (bar, cutoff Hz) -> piecewise-linear (in log freq) cutoff curve, per sample."""
        bx = np.array([p[0] for p in pts]) * s.bar * SR; by = np.log([p[1] for p in pts])
        return np.exp(np.interp(np.arange(s.T), bx, by))
    def lvl_curve(s, pts):
        bx = np.array([p[0] for p in pts]) * s.bar * SR; by = np.array([p[1] for p in pts], float)
        return np.interp(np.arange(s.T), bx, by)[:, None]

# 16th-step drum patterns: key -> list of (step, velocity)
PAT = {
    'none': {},
    'intro': {'t': [(0, 1.0), (8, .7)]},
    'battleA1': {'k': [(0, 1), (7, .6), (10, .8)], 't': [(0, .9), (6, .6), (14, .7)], 's': [(4, 1), (12, 1)], 'h': [(i, .55 if i % 4 == 0 else .35) for i in range(0, 16, 2)], 'oh': [(14, .5)]},
    'battleA2': {'k': [(0, 1), (7, .6), (8, .9), (10, .8), (14, .5)], 't': [(0, .9), (6, .6), (11, .6)], 's': [(4, 1), (12, 1), (15, .35)], 'c': [(12, .8)],
                 'h': [(i, .6 if i % 4 == 0 else .4 if i % 2 == 0 else .25) for i in range(16)], 'oh': [(6, .5), (14, .6)], 'sh': [(i, .5) for i in range(1, 16, 2)]},
    'battleB': {'k': [(0, 1), (4, .9), (8, 1), (12, .9)], 's': [(4, 1), (12, 1)], 'c': [(4, .6), (12, .6)], 'h': [(i, .5 if i % 4 == 0 else .35) for i in range(0, 16, 2)] + [(i, .2) for i in range(1, 16, 2)], 't': [(0, .8)]},
    'break': {'k': [(0, .8)], 't': [(0, .8), (8, .5)]},
    'int_A': {'k': [(0, 1), (3, .5), (4, .9), (8, 1), (10, .8), (12, .9), (14, .6)], 't': [(0, .9), (6, .7), (11, .7)], 's': [(4, 1), (12, 1), (7, .3), (15, .35)], 'c': [(4, .6), (12, .6)],
              'h': [(i, .65 if i % 4 == 0 else .4 if i % 2 == 0 else .28) for i in range(16)], 'oh': [(2, .4), (6, .5), (10, .4), (14, .6)], 'sh': [(i, .4) for i in range(1, 16, 2)]},
    'int_B': {'k': [(0, 1), (4, 1), (8, 1), (12, 1)], 's': [(4, 1), (12, 1), (14, .5), (15, .6)], 'c': [(4, .7), (12, .7)], 'h': [(i, .6 if i % 2 == 0 else .35) for i in range(16)], 't': [(0, .9), (8, .7)], 'oh': [(2, .5), (6, .5), (10, .5), (14, .5)]},
    'int_break': {'k': [(0, .9), (8, .7)], 't': [(0, .9), (4, .6), (8, .8), (12, .6)], 'h': [(i, .3) for i in range(0, 16, 4)]},
    'duelA': {'k': [(0, 1), (3, .6), (8, 1), (10, .8), (11, .6)], 't': [(0, .9), (6, .7), (14, .6)], 's': [(4, 1), (12, 1), (15, .4)], 'c': [(12, .6)],
              'h': [(i, .65 if i % 4 == 0 else .4 if i % 2 == 0 else .28) for i in range(16)], 'oh': [(6, .5), (14, .5)]},
    'duelB': {'k': [(0, 1), (2, .5), (3, .7), (6, .8), (8, 1), (10, .6), (11, .8), (14, .7)], 't': [(0, 1), (6, .7), (12, .7)], 's': [(4, 1), (12, 1), (7, .4), (15, .5)], 'c': [(4, .7), (12, .8)],
              'h': [(i, .7 if i % 4 == 0 else .45) for i in range(16)], 'oh': [(2, .5), (6, .5), (10, .5), (14, .6)], 'sh': [(i, .4) for i in range(1, 16, 2)]},
    'duelS': {'k': [(0, 1), (8, .8)], 't': [(0, 1), (3, .6), (6, .7), (8, 1), (11, .6), (14, .7)], 'h': [(i, .35) for i in range(0, 16, 4)]},
}
def drum_bar(S, bar, pat, vel=1.0, swing=0.0, fill=None, kv=1.0):
    step = S.beat / 4; hits = PAT[pat]; kicks = []
    cache = S.__dict__.setdefault('_dc', {})
    def voice_(kind, v, op=False):
        key = (kind, round(v, 1), op)
        if key not in cache: cache[key] = {'k': kick, 't': taiko, 's': snare, 'c': clap, 'oh': lambda v: hat(v, True), 'h': hat, 'sh': shaker}[kind](v)
        return cache[key]
    for kind, lst in hits.items():
        for st, v in lst:
            if fill and st >= fill[0] and kind in ('s', 'h', 'oh', 'sh', 'c'): continue
            if fill and st >= fill[0] and kind == 'k' and st >= fill[0] + 2: continue
            sw = swing * step if (st % 2 == 1 and kind in ('h', 'sh', 'oh')) else 0.0
            pan = {'h': 0.25, 'oh': -0.3, 'sh': -0.35, 'c': 0.1}.get(kind, 0.0)
            x = voice_(kind, v * vel * (kv if kind == 'k' else 1.0))
            dest = 'drums' if kind in ('k', 't', 'h', 'sh', 'oh') else 'snr'
            S.put(dest, bar, (st * step + sw) / S.beat, x * (1.0 if kind != 't' else 0.9), 1.0, pan)
            if kind == 'k': kicks.append(int(round((bar * 4 + (st * step + sw) / S.beat) * S.beat * SR)))
            if kind == 't': S.put('taikoverb', bar, (st * step) / S.beat, x, 0.5)
    if fill:
        s0, kind = fill; n = int(16 - s0)
        for i in range(n):
            v = 0.45 + 0.55 * i / max(n - 1, 1)
            if kind == 'snare': S.put('snr', bar, (s0 + i) * step / S.beat, snare(v * vel))
            else:
                f = [200, 170, 140, 110][min(3, i * 4 // n)]; S.put('drums', bar, (s0 + i) * step / S.beat, tom(f * 0.9, v * vel), 1.0, (-0.4 + 0.8 * i / max(n - 1, 1)))
        S.put('drums', bar, s0 * step / S.beat, kick(0.9 * vel)); kicks.append(int(round((bar * 4 + s0 * step / S.beat) * S.beat * SR)))
    return kicks

def mix_down(S, levels, rev_send, dly_send, sc_stems, sc_depth, kicks, ir, delay_beats=0.75, rms=-18.0, post=None):
    """sidechain, reverb/delay sends, tail fold, master."""
    st = S.stems; sc = sidechain(S.T, kicks, sc_depth, 0.16)
    for k in sc_stems:
        if k in st: st[k] = st[k] * (sc ** (1.0))
    dry = np.zeros((S.T, 2)); 
    for k, v in st.items(): dry += v * levels.get(k, 1.0)
    rin = np.zeros((S.T, 2)); din = np.zeros((S.T, 2))
    for k, v in rev_send.items():
        if k in st: rin += st[k] * v
    for k, v in dly_send.items():
        if k in st: din += st[k] * v
    wet = reverb(rin, ir) + 0.0
    dl = pingpong(din, delay_beats * S.beat, 0.42, 5, 3000); wet2 = reverb(dl, ir) * 0.35
    y = dry + wet + dl * 0.8 + wet2
    out = y[:S.L].copy(); tail = y[S.L:]; out[:len(tail)] += tail[:S.L]           # wrap reverb / delay tails around the loop point
    if post is not None: out = post(out)
    return master(out, rms)

def chords_voicings(chords, lo=50, hi=74):
    v = []; prev = None
    for pcs in chords:
        prev = voice(prev, pcs, lo, hi); v.append(prev)
    return v
def ABS(base_list): return base_list

# ============ shared harmony (A minor) ============
Am, F, C, G, E, Dm, Em, Bb = [57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62], [56, 59, 64], [50, 53, 57], [55, 59, 64], [58, 62, 65]
ROOT = {'Am': 33, 'F': 29 + 12, 'C': 36, 'G': 31 + 12, 'E': 28 + 12, 'Dm': 38, 'Em': 28 + 12, 'Bb': 34 + 12}
CH = {'Am': Am, 'F': F, 'C': C, 'G': G, 'E': E, 'Dm': Dm, 'Em': Em, 'Bb': Bb}
def bassroot(name): return {'Am': 45, 'F': 41, 'C': 48, 'G': 43, 'E': 40, 'Dm': 38, 'Em': 40, 'Bb': 46}[name]   # all >= 55 Hz (E2..C3) so laptop speakers reproduce them

def bass_notes(S, bar, name, style, vel=1.0):
    r = bassroot(name); b = S.beat
    if style == 'pump':   # driving 8ths with octave jumps
        for i in range(8):
            n = r + (12 if i in (3, 7) else 0); S.put('bass', bar, i * .5, subbass(midi(n), b * .46, 0.85 if i % 2 == 0 else 0.6))
    elif style == 'drive':   # syncopated 16ths
        pat = [(0, 0, 1), (0.5, 0, .5), (0.75, 12, .5), (1.5, 0, .7), (2, 0, 1), (2.5, 0, .5), (3, 7, .6), (3.5, 12, .6), (3.75, 0, .5)]
        for off, iv, v in pat: S.put('bass', bar, off, subbass(midi(r + iv), b * .22 if off % 1 else b * .45, v))
    elif style == 'gallop':
        for i in range(16):
            if i % 4 == 2: continue
            n = r + (12 if i in (6, 14) else 0); S.put('bass', bar, i * .25, subbass(midi(n), b * .2, 0.9 if i % 4 == 0 else 0.55, 0.3))
    elif style == 'long':
        S.put('bass', bar, 0, subbass(midi(r), b * 3.9, 0.9))
    elif style == 'half':
        S.put('bass', bar, 0, subbass(midi(r), b * 1.9, 0.9)); S.put('bass', bar, 2, subbass(midi(r + 7 if r < 44 else r), b * 1.9, 0.7))

def arp_bar(S, bar, chord, pat, g=0.35, octave=12, bright=1.0, dur=0.4, pan_w=0.5):
    ch = sorted(chord); full = [n + octave for n in ch] + [ch[0] + octave + 12]
    step = S.beat / 4
    for i, idx in enumerate(pat):
        if idx is None: continue
        n = full[idx % len(full)]
        S.put('arp', bar, i * .25, pluck(midi(n), dur * S.beat, 1.0, bright), g * (0.8 + 0.2 * (i % 4 == 0)), pan=((i % 4) - 1.5) / 1.5 * pan_w)

def stab_bar(S, bar, chord, pattern, g=0.4, octave=12, dur=0.22):
    for off, v in pattern: S.put('stab', bar, off, stab([midi(n + octave) for n in chord], dur * S.beat, 1.0), g * v, pan=0.0)

# ============================================================
# 1) BATTLE THEME  (A minor, 120 BPM, 20 bars)
# ============================================================
def battle():
    global R; R = np.random.default_rng(102)
    S = Song(120, 20)
    prog = ['Am', 'Am'] + ['Am', 'F', 'C', 'G'] * 2 + ['F', 'G', 'Am', 'E'] + ['F', 'G'] + ['Am', 'F', 'C', 'E']
    sec = lambda b: 'intro' if b < 2 else 'A1' if b < 6 else 'A2' if b < 10 else 'B' if b < 14 else 'brk' if b < 16 else 'F'
    vox = chords_voicings([CH[p] for p in prog]); kicks = []
    for b, name in enumerate(prog):
        s = sec(b); t = b * 4
        # pad (two stereo sides, detuned saws) + octave-up string layer
        for side in (0, 1):
            S.put('padL' if side == 0 else 'padR', b, 0, chordpad([midi(n) for n in vox[b]] + [midi(vox[b][0] - 12)], S.bar * 1.15, 1.0, 3, 0.008, side, 0.3, 0.4))
        # drums
        pat = {'intro': 'intro', 'A1': 'battleA1', 'A2': 'battleA2', 'B': 'battleB', 'brk': 'break', 'F': 'battleA2'}[s]
        fill = (12, 'snare') if b in (5, 9, 13, 19) else (8, 'tom') if b in (15,) else None
        if b == 15: fill = (8, 'snare')
        kicks += drum_bar(S, b, pat, 1.0, swing=0.14, fill=fill, kv=1.0)
        if b in (0, 2, 6, 10, 16): S.put('fx', b, 0, crash(0.9))
        if b == 1: S.put('fx', b, 2, revcrash(S.beat * 2, 0.9)); S.put('fx', b, 0, riser(S.bar * 1.0, 0.5))
        if b in (9, 13, 19, 15): S.put('fx', b, 2, revcrash(S.beat * 2, 0.9)); S.put('fx', b, 0, riser(S.beat * 4, 0.35))
        # bass
        if b >= 2 and s != 'brk': bass_notes(S, b, name, 'pump' if s in ('A1', 'B') else 'drive')
        elif s == 'brk': bass_notes(S, b, name, 'long')
        else: bass_notes(S, b, name, 'long')
        # arps
        if s in ('A1', 'A2', 'B', 'F') and b >= 4: arp_bar(S, b, CH[name], [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 2, 1], 0.33 if s != 'A1' else 0.26, 12, 1.0)
        if s == 'brk': arp_bar(S, b, CH[name], [0, None, 1, None, 2, None, 3, None, 2, None, 1, None, 2, None, 3, None], 0.3, 12, 1.2, 0.8)
        # stabs: syncopated brass
        if s in ('A2', 'F'): stab_bar(S, b, CH[name], [(0, 1), (1.5, .8), (2.5, .8), (3.25, .6)] if b % 2 == 0 else [(0, 1), (0.75, .6), (2, .9), (3.5, .7)], 0.34)
        if s == 'B': stab_bar(S, b, CH[name], [(0, 1), (2, .7)], 0.3, 12, 1.5)
    # ---- lead melody (beat positions are absolute)
    def bars(start, rows): return [(( start + i) * 4 + sb, m, ln, v) for i, row in enumerate(rows) for sb, m, ln, v in row]
    ph1 = [[(0, 76, 1.5, 1), (1.5, 79, .5, .9), (2, 81, 1, 1), (3, 76, 1, .9)], [(0, 77, 1.5, 1), (1.5, 76, .5, .9), (2, 72, 1, 1), (3, 69, 1, .9)],
           [(0, 72, 1, 1), (1, 76, 1, .9), (2, 79, 1.5, 1), (3.5, 76, .5, .8)], [(0, 74, 1.5, 1), (1.5, 76, .5, .9), (2, 79, 2, 1)]]
    ph2 = [[(0, 81, 1.5, 1), (1.5, 79, .5, .9), (2, 76, 1, 1), (3, 81, 1, 1)], [(0, 84, 1.5, 1), (1.5, 81, .5, .9), (2, 77, 1, 1), (3, 81, 1, .9)],
           [(0, 84, 1, 1), (1, 83, .5, .8), (1.5, 81, .5, .8), (2, 79, 1, 1), (3, 76, 1, .9)], [(0, 74, 1, .9), (1, 79, 1, 1), (2, 83, 1.5, 1), (3.5, 79, .5, .8)]]
    bl = [[(0, 77, 2, 1), (2, 81, 2, 1)], [(0, 83, 2, 1), (2, 79, 1, .9), (3, 83, 1, .9)], [(0, 84, 3, 1), (3, 81, 1, .9)], [(0, 80, 1.5, 1), (1.5, 83, .5, .9), (2, 88, 2, 1)]]
    fin = [[(0, 88, 1.5, 1), (1.5, 91, .5, .9), (2, 93, 1, 1), (3, 88, 1, .9)], [(0, 89, 1.5, 1), (1.5, 88, .5, .9), (2, 84, 1, 1), (3, 81, 1, .9)],
           [(0, 84, 1, 1), (1, 88, 1, .9), (2, 91, 1.5, 1), (3.5, 88, .5, .8)], [(0, 83, 1, .9), (1, 88, 1, 1), (2, 92, 2, 1)]]
    brk = [[(0, 81, 4, .6)], [(0, 83, 3, .6), (3, 84, 1, .7)]]
    notes = bars(2, ph1) + bars(6, ph2) + bars(10, bl) + bars(14, brk) + bars(16, fin)
    ld = lead_line(notes, S.T, S.beat, S.T)
    S.put('lead', 0, 0, ld, 0.55, -0.1)
    ld2 = lead_line([(a, m, l, v) for a, m, l, v in bars(6, ph2) + bars(10, bl) + bars(16, fin)], S.T, S.beat, S.T, sh=-12, vib_depth=0.004)
    S.put('lead2', 0, 0, lp(ld2, 2600), 0.28, 0.25)
    # ---- processing
    cc = S.cut_curve([(0, 500), (2, 900), (6, 1800), (10, 2600), (14, 1100), (15.9, 3500), (16, 2800), (20, 600)])
    S.sweep_filter('padL', cc, 0.9); S.sweep_filter('padR', cc, 0.9)
    S.stems['pad'] = S.stems.pop('padL')[:, :1] * np.array([[1.0, 0.0]]) + S.stems.pop('padR')[:, 1:] * np.array([[0.0, 1.0]]) if False else None
    padL = S.stems.pop('padL'); padR = S.stems.pop('padR'); S.stems['pad'] = np.stack([padL[:, 0] * 0.8 + padR[:, 0] * 0.2, padR[:, 1] * 0.8 + padL[:, 1] * 0.2], 1)
    S.stems['pad'] *= S.lvl_curve([(0, .8), (2, .55), (10, .8), (14, 1.0), (16, .6), (20, .6)])
    S.stems['lead'] = lp(S.stems['lead'], 4800) + 0.15 * (S.stems['lead'] - lp(S.stems['lead'], 4800))
    S.stems['taikoverb'] = S.stems.get('taikoverb', np.zeros((S.T, 2)))
    ir = make_ir(1.9, 4200, 0.016, 11)
    lv = {'drums': 1.0, 'snr': 0.9, 'bass': 0.95, 'pad': 0.6, 'arp': 0.7, 'stab': 0.8, 'lead': 0.95, 'lead2': 0.8, 'fx': 0.6, 'taikoverb': 0.0}
    y = mix_down(S, lv, {'pad': 0.22, 'lead': 0.32, 'lead2': 0.3, 'stab': 0.22, 'arp': 0.25, 'snr': 0.28, 'taikoverb': 0.5, 'fx': 0.25}, {'lead': 0.25, 'arp': 0.28}, ['pad', 'arp', 'stab', 'bass'], 0.38, kicks, ir, 0.75)
    write('music/battle-theme.wav', y)

# ============================================================
# 2) BATTLE THEME INTENSE (A minor, 144 BPM, 24 bars)
# ============================================================
def intense():
    global R; R = np.random.default_rng(103)
    S = Song(144, 24)
    prog = ['Am', 'Am'] + ['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm', 'E'] + ['F', 'G', 'Am', 'E'] + ['Dm', 'E'] + ['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm', 'E']
    # indexes: 0-1 intro, 2-9 A, 10-13 B, 14-15 breakdown, 16-23 final  => but the lists above total 2+8+4+2+8=24
    sec = lambda b: 'intro' if b < 2 else 'A' if b < 10 else 'B' if b < 14 else 'brk' if b < 16 else 'F'
    vox = chords_voicings([CH[p] for p in prog]); kicks = []
    for b, name in enumerate(prog):
        s = sec(b)
        for side in (0, 1): S.put('padL' if side == 0 else 'padR', b, 0, chordpad([midi(n) for n in vox[b]] + [midi(vox[b][0] - 12)], S.bar * 1.15, 1.0, 3, 0.009, side, 0.25, 0.4))
        pat = {'intro': 'intro', 'A': 'int_A', 'B': 'int_B', 'brk': 'int_break', 'F': 'int_A'}[s]
        fill = (12, 'snare') if b in (5, 9, 13, 15, 21) else (10, 'tom') if b == 23 else None
        if b == 15: fill = (8, 'snare')
        kicks += drum_bar(S, b, pat, 1.0, swing=0.06, fill=fill)
        if b in (0, 2, 6, 10, 16, 20): S.put('fx', b, 0, crash(1.0))
        if b in (1, 9, 13, 15, 23): S.put('fx', b, 2, revcrash(S.beat * 2, 0.9)); S.put('fx', b, 0, riser(S.beat * 4, 0.4))
        if b >= 2 and s != 'brk': bass_notes(S, b, name, 'gallop' if s in ('A', 'F') else 'drive')
        else: bass_notes(S, b, name, 'half' if s == 'brk' else 'long')
        if s in ('A', 'B', 'F') and b >= 3: arp_bar(S, b, CH[name], [0, 2, 1, 3, 0, 2, 1, 3, 2, 3, 1, 3, 0, 2, 3, 4], 0.34, 12, 1.2, 0.3)
        if s == 'brk': arp_bar(S, b, CH[name], [0, 1, 2, 3] * 4, 0.3, 12, 1.0, 0.25)
        if s in ('A', 'F') and b >= 4: stab_bar(S, b, CH[name], [(0, 1), (0.75, .7), (1.5, .8), (2.25, .7), (3, .8), (3.5, .6)], 0.34, 12, 0.18)
        if s == 'B': stab_bar(S, b, CH[name], [(0, 1), (1.5, .8), (2, .9), (3.5, .7)], 0.32, 12, 0.3)
    def bars(start, rows): return [((start + i) * 4 + sb, m, ln, v) for i, row in enumerate(rows) for sb, m, ln, v in row]
    mA = [[(0, 81, .75, 1), (.75, 79, .25, .8), (1, 76, .5, 1), (1.5, 79, .5, .9), (2, 81, 1, 1), (3, 84, 1, 1)],
          [(0, 84, .75, 1), (.75, 81, .25, .8), (1, 77, .5, 1), (1.5, 81, .5, .9), (2, 84, 1.5, 1), (3.5, 81, .5, .8)],
          [(0, 84, .5, 1), (.5, 83, .5, .8), (1, 79, 1, 1), (2, 76, .5, .9), (2.5, 79, .5, .9), (3, 84, 1, 1)],
          [(0, 83, .75, 1), (.75, 79, .25, .8), (1, 74, .5, 1), (1.5, 79, .5, .9), (2, 83, 2, 1)],
          [(0, 88, .75, 1), (.75, 84, .25, .8), (1, 81, .5, 1), (1.5, 84, .5, .9), (2, 88, 1, 1), (3, 91, 1, 1)],
          [(0, 89, .75, 1), (.75, 88, .25, .8), (1, 84, .5, 1), (1.5, 81, .5, .9), (2, 77, 1.5, 1), (3.5, 81, .5, .8)],
          [(0, 86, .5, 1), (.5, 88, .5, .8), (1, 89, 1, 1), (2, 86, .5, .9), (2.5, 84, .5, .9), (3, 81, 1, 1)],
          [(0, 80, .5, 1), (.5, 83, .5, .9), (1, 88, 1, 1), (2, 87, .5, .9), (2.5, 88, .5, .9), (3, 92, 1, 1)]]
    mB = [[(0, 89, 2, 1), (2, 91, 2, 1)], [(0, 91, 1.5, 1), (1.5, 95, .5, .9), (2, 93, 2, 1)], [(0, 93, 3, 1), (3, 91, 1, .9)], [(0, 92, 1, 1), (1, 95, 1, .9), (2, 100, 2, 1)]]
    mbk = [[(0, 86, 4, .6)], [(0, 88, 3, .6), (3, 92, 1, .7)]]
    mF = [[(a, m + 0, l, v) for a, m, l, v in row] for row in mA]
    notes = bars(2, mA) + bars(10, mB) + bars(14, mbk) + bars(16, mF)
    S.put('lead', 0, 0, lead_line(notes, S.T, S.beat, S.T, vib_rate=6.0, portamento=0.03), 0.5, -0.1)
    h = [(a, m, l, v) for a, m, l, v in bars(2, mA) + bars(10, mB) + bars(16, mF)]
    S.put('lead2', 0, 0, lp(lead_line(h, S.T, S.beat, S.T, sh=-5, vib_depth=0.004), 3000), 0.26, 0.3)
    S.put('lead3', 0, 0, lp(lead_line(bars(16, mF), S.T, S.beat, S.T, sh=-12, vib_depth=0.004), 2400), 0.28, -0.3)
    cc = S.cut_curve([(0, 600), (2, 1200), (10, 3000), (14, 1200), (15.9, 4000), (16, 3200), (24, 700)])
    S.sweep_filter('padL', cc, 0.9); S.sweep_filter('padR', cc, 0.9)
    padL = S.stems.pop('padL'); padR = S.stems.pop('padR'); S.stems['pad'] = np.stack([padL[:, 0] * 0.8 + padR[:, 0] * 0.2, padR[:, 1] * 0.8 + padL[:, 1] * 0.2], 1)
    S.stems['pad'] *= S.lvl_curve([(0, .8), (2, .5), (10, .75), (14, 1.0), (16, .55), (24, .6)])
    ir = make_ir(1.7, 4500, 0.014, 12)
    lv = {'drums': 1.0, 'snr': 0.9, 'bass': 0.95, 'pad': 0.55, 'arp': 0.7, 'stab': 0.85, 'lead': 0.95, 'lead2': 0.8, 'lead3': 0.8, 'fx': 0.6, 'taikoverb': 0.0}
    y = mix_down(S, lv, {'pad': 0.2, 'lead': 0.3, 'lead2': 0.25, 'lead3': 0.25, 'stab': 0.2, 'arp': 0.22, 'snr': 0.25, 'taikoverb': 0.4, 'fx': 0.2}, {'lead': 0.22, 'arp': 0.26}, ['pad', 'arp', 'stab', 'bass'], 0.45, kicks, ir, 0.75)
    write('music/battle-theme-intense.wav', y)

# ============================================================
# 3) FINAL DUEL (A phrygian-minor, 152 BPM, 20 bars)
# ============================================================
def duel():
    global R; R = np.random.default_rng(104)
    S = Song(152, 20)
    cyc = ['Am', 'Bb', 'F', 'E']
    prog = cyc * 5
    sec = lambda b: 'intro' if b < 4 else 'A' if b < 12 else 'T' if b < 16 else 'F'
    vox = chords_voicings([CH[p] for p in prog]); kicks = []
    for b, name in enumerate(prog):
        s = sec(b)
        for side in (0, 1): S.put('padL' if side == 0 else 'padR', b, 0, chordpad([midi(n) for n in vox[b]] + [midi(vox[b][0] - 12)], S.bar * 1.1, 1.0, 3, 0.01, side, 0.2, 0.3))
        # tremolo strings (16th repeated)
        if s in ('T', 'F', 'A') and b >= 4:
            x = chordpad([midi(n + 12) for n in vox[b]], S.bar * 1.05, 1.0, 2, 0.006, 0, 0.1, 0.1)
            S.put('trem', b, 0, lp(x, 2200) * (0.55 + 0.45 * np.sin(2 * np.pi * (S.beat * 4 / 1) ** -1 * 0 + 2 * np.pi * 4 / S.beat * np.arange(len(x)) / SR - 1.2)), 0.5 if s != 'A' else 0.3)
        pat = {'intro': 'duelS', 'A': 'duelA' if b < 8 else 'duelB', 'T': 'duelS', 'F': 'duelB'}[s]
        fill = (12, 'snare') if b in (3, 11, 19) else (8, 'tom') if b == 15 else None
        kicks += drum_bar(S, b, pat, 1.0 if s != 'intro' else 0.85, swing=0.0, fill=fill)
        if b in (0, 4, 8, 12, 16): S.put('fx', b, 0, crash(1.0))
        if b in (3, 11, 15, 19): S.put('fx', b, 2, revcrash(S.beat * 2, 0.9)); S.put('fx', b, 0, riser(S.beat * 4, 0.4, 250, 8000))
        # palm-muted 16th ostinato bass (plucked saw, kept above 55 Hz) + sub on downbeats
        r = bassroot(name)
        for i in range(16):
            if s == 'T' and i % 2: continue
            n = r + (12 if i in (6, 14) else 7 if i == 10 else 0) + (1 if (name == 'Am' and i == 11) else 0)
            S.put('bass', b, i * .25, subbass(midi(n), S.beat * .2, 0.95 if i % 4 == 0 else 0.5, 0.15))
        if s in ('A', 'F', 'T'): arp_bar(S, b, CH[name], [3, None, 2, 3, None, 1, 3, None, 2, None, 3, 1, None, 2, 3, None], 0.26, 12, 1.4, 0.28, 0.6)
        if s in ('A', 'F') and b >= 8: stab_bar(S, b, CH[name], [(0, 1), (0.75, .7), (1.5, .9), (2.25, .7), (3.0, .8), (3.5, .6)], 0.34, 12, 0.16)
        if s == 'intro': stab_bar(S, b, CH[name], [(0, 1), (2.5, .6)], 0.22, 12, 0.3)
    def bars(start, rows): return [((start + i) * 4 + sb, m, ln, v) for i, row in enumerate(rows) for sb, m, ln, v in row]
    f1 = [[(0, 76, .5, 1), (.5, 77, .5, .9), (1, 76, .5, 1), (1.5, 72, .5, .9), (2, 69, 1, 1), (3, 72, .5, .9), (3.5, 76, .5, 1)],
          [(0, 77, .5, 1), (.5, 79, .5, .9), (1, 77, .5, 1), (1.5, 74, .5, .9), (2, 70, 1, 1), (3, 74, .5, .9), (3.5, 77, .5, 1)],
          [(0, 81, 1, 1), (1, 79, .5, .9), (1.5, 77, .5, .9), (2, 76, 1, 1), (3, 72, .5, .9), (3.5, 77, .5, .9)],
          [(0, 76, .5, 1), (.5, 80, .5, .9), (1, 83, 1, 1), (2, 81, .5, .9), (2.5, 80, .5, .9), (3, 76, 1, 1)]]
    f2 = [[(a, m + 12 if (i % 4 in (0, 2)) else m, l, v) for a, m, l, v in row] for i, row in enumerate(f1)]
    tns = [[(0, 80, 4, .7)], [(0, 81, 2, .7), (2, 82, 2, .8)], [(0, 84, 2, .8), (2, 81, 2, .8)], [(0, 83, 3, .9), (3, 88, .5, 1), (3.5, 87, .5, 1)]]
    notes = bars(4, f1) + bars(8, f1) + bars(12, tns) + bars(16, f2)
    S.put('lead', 0, 0, lead_line(notes, S.T, S.beat, S.T, vib_rate=6.5, vib_depth=0.007, portamento=0.02), 0.5, -0.1)
    S.put('lead2', 0, 0, lp(lead_line(bars(8, f1) + bars(16, f2), S.T, S.beat, S.T, sh=-12, vib_depth=0.004), 2400), 0.26, 0.3)
    cc = S.cut_curve([(0, 500), (4, 900), (12, 1000), (15.9, 3800), (16, 3000), (20, 600)])
    S.sweep_filter('padL', cc, 1.0); S.sweep_filter('padR', cc, 1.0)
    padL = S.stems.pop('padL'); padR = S.stems.pop('padR'); S.stems['pad'] = np.stack([padL[:, 0] * 0.8 + padR[:, 0] * 0.2, padR[:, 1] * 0.8 + padL[:, 1] * 0.2], 1)
    S.stems['pad'] *= S.lvl_curve([(0, .7), (4, .5), (12, .9), (16, .6), (20, .6)])
    ir = make_ir(1.4, 4000, 0.012, 13)
    lv = {'drums': 1.0, 'snr': 0.9, 'bass': 0.95, 'pad': 0.5, 'trem': 0.55, 'arp': 0.7, 'stab': 0.85, 'lead': 0.95, 'lead2': 0.8, 'fx': 0.6, 'taikoverb': 0.0}
    y = mix_down(S, lv, {'pad': 0.2, 'trem': 0.25, 'lead': 0.28, 'lead2': 0.25, 'stab': 0.2, 'arp': 0.22, 'snr': 0.22, 'taikoverb': 0.4, 'fx': 0.2}, {'lead': 0.2, 'arp': 0.25}, ['pad', 'trem', 'arp', 'stab', 'bass'], 0.42, kicks, ir, 0.75)
    write('music/final-duel-theme.wav', y)

# ============================================================
# 4) MENU THEME (A minor, 72 BPM, 12 bars, atmospheric + melodic, no heavy drums)
# ============================================================
def menu():
    global R; R = np.random.default_rng(101)
    S = Song(72, 12)
    prog = ['Am', 'Am'] + ['Am', 'F', 'C', 'G'] + ['F', 'G', 'Am', 'E'] + ['F', 'G']
    ext = {'Am': [57, 60, 64, 67], 'F': [53, 57, 60, 64], 'C': [55, 60, 64, 71], 'G': [55, 59, 62, 69], 'E': [56, 59, 64, 62], 'Em': [55, 59, 64]}
    vox = chords_voicings([ext[p] if p in ext else CH[p] for p in prog], 48, 76)
    for b, name in enumerate(prog):
        for side in (0, 1): S.put('padL' if side == 0 else 'padR', b, 0, chordpad([midi(n) for n in vox[b]] + [midi(vox[b][0] - 12)], S.bar * 1.25, 1.0, 3, 0.009, side, 0.4, 0.45))
        S.put('bass', b, 0, subbass(midi(bassroot(name)), S.bar * 1.0, 0.8, 0.1)) if False else S.put('bass', b, 0, subbass(midi(bassroot(name) - 0), S.beat * 3.8, 0.75, 0.05))
        if b >= 2:   # slow bell arpeggio (8ths, ping-pong delayed)
            ch = sorted(ext.get(name, CH[name])); seq = [0, 2, 1, 3, 2, 1, 3, 2]
            for i, k in enumerate(seq):
                S.put('bell', b, i * 0.5, bellpluck(midi(ch[k % len(ch)] + 24 if (i % 4) else ch[k % len(ch)] + 12), S.beat * 1.2, 1.0), 0.3 if b < 10 else 0.22, pan=(-0.5 + (i % 4) / 3))
        if b % 2 == 0 and b >= 2: S.put('perc', b, 0, taiko(0.5, 70), 0.35); 
        if b in (0, 6): S.put('fx', b, 0, crash(0.5, 3.0), 0.5)
        if b in (5, 11): S.put('fx', b, 0, revcrash(S.beat * 4, 0.5)); 
    def bars(start, rows): return [((start + i) * 4 + sb, m, ln, v) for i, row in enumerate(rows) for sb, m, ln, v in row]
    m1 = [[(0, 76, 2, 1), (2, 79, 1, .9), (3, 81, 1, 1)], [(0, 77, 2, 1), (2, 76, 1, .9), (3, 72, 1, .9)], [(0, 76, 1, 1), (1, 79, 1, .9), (2, 84, 2, 1)], [(0, 83, 2, 1), (2, 79, 2, .9)]]
    m2 = [[(0, 81, 2, 1), (2, 77, 2, 1)], [(0, 79, 1.5, 1), (1.5, 83, .5, .9), (2, 86, 2, 1)], [(0, 84, 3, 1), (3, 81, 1, .8)], [(0, 83, 1, 1), (1, 80, 1, .9), (2, 88, 2, 1)]]
    m3 = [[(0, 84, 3, .8), (3, 81, 1, .7)], [(0, 79, 4, .8)]]
    notes = bars(2, m1) + bars(6, m2) + bars(10, m3)
    ld = lead_line(notes, S.T, S.beat, S.T, wave_k=5, portamento=0.07, vib_rate=4.8, vib_depth=0.007, att=0.08, rel=0.2, tilt=1.8)
    S.put('lead', 0, 0, lp(ld, 3200), 0.6, 0.0)
    S.put('lead2', 0, 0, lp(lead_line(bars(6, m2) , S.T, S.beat, S.T, sh=-12, wave_k=4, att=0.1, rel=0.3, tilt=2), 1800), 0.35, 0.25)
    # airy shimmer swell
    n = S.T; t = np.arange(n) / SR
    sh = svf(R.standard_normal(n), 2800 + 1500 * np.sin(2 * np.pi * t / (S.L / SR)), 3.0) * (0.5 + 0.5 * np.sin(2 * np.pi * 2 * t / (S.L / SR) - 1.2)) * 0.5
    S.put('air', 0, 0, np.stack([sh, np.roll(sh, 900)], 1), 0.12)
    cc = S.cut_curve([(0, 450), (2, 800), (6, 1400), (10, 1700), (12, 600)])
    S.sweep_filter('padL', cc, 0.8); S.sweep_filter('padR', cc, 0.8)
    padL = S.stems.pop('padL'); padR = S.stems.pop('padR'); S.stems['pad'] = np.stack([padL[:, 0] * 0.85 + padR[:, 0] * 0.15, padR[:, 1] * 0.85 + padL[:, 1] * 0.15], 1)
    S.stems['pad'] *= S.lvl_curve([(0, .9), (2, .7), (6, .9), (10, 1.0), (12, .9)])
    ir = make_ir(3.2, 5000, 0.02, 14)
    lv = {'pad': 0.7, 'bass': 0.8, 'bell': 0.8, 'lead': 0.9, 'lead2': 0.8, 'perc': 0.6, 'fx': 0.5, 'air': 0.8}
    y = mix_down(S, lv, {'pad': 0.3, 'lead': 0.5, 'lead2': 0.4, 'bell': 0.4, 'perc': 0.6, 'fx': 0.4, 'air': 0.3}, {'lead': 0.3, 'bell': 0.4}, ['pad'], 0.15, [], ir, 0.75, comp=None) if False else mix_down(S, lv, {'pad': 0.3, 'lead': 0.5, 'lead2': 0.4, 'bell': 0.4, 'perc': 0.6, 'fx': 0.4, 'air': 0.3}, {'lead': 0.3, 'bell': 0.4}, ['pad'], 0.1, [], ir, 0.75)
    write('menu-cinematic-ambient.wav', y)

# ============================================================
# 5) GM DECREE (ominous, 60 BPM, 6 bars = 24 s)
# ============================================================
def formant_pad(freq, d, vowel, voices=4):
    forms = {'ah': [(730, 1.0), (1090, .5), (2440, .2)], 'oh': [(570, 1.0), (840, .5), (2410, .12)], 'oo': [(300, 1.0), (870, .22), (2240, .08)]}[vowel]
    n = N(d); t = np.arange(n) / SR; x = np.zeros(n)
    for v in range(voices):
        f = freq * (1 + R.uniform(-0.006, 0.006)) * (1 + 0.004 * np.sin(2 * np.pi * (4.5 + v * .3) * t + v))
        x += sawk(ph(f), 20) / voices
    out = sum(a * bp(x, fc * 0.85, fc * 1.15, 2) for fc, a in forms) * 4.0
    return out * np.clip(t / (d * .35), 0, 1) ** 1.5 * np.clip((d - t) / (d * .35), 0, 1) ** 1.5
def gong(f, d, v=1.0):
    n = N(d); t = np.arange(n) / SR; x = np.zeros(n)
    for r_, a, tau in [(1, 1, 3.0), (1.47, .6, 2.4), (2.02, .5, 2.0), (2.43, .35, 1.6), (3.11, .3, 1.2), (4.1, .2, .9), (5.3, .1, .6)]:
        if f * r_ < 9000: x += a * np.sin(2 * np.pi * f * r_ * t * (1 + 0.0012 * np.sin(2 * np.pi * (2.7 + r_) * t)) + R.uniform(0, 6)) * np.exp(-t / tau)
    return (x * np.minimum(t / 0.006, 1) + 0.3 * bp(R.standard_normal(n), 400, 3500) * np.exp(-t / 0.4)) * v * 0.5
def decree():
    global R; R = np.random.default_rng(105)
    S = Song(60, 6, tail=5.0); t = np.arange(S.T) / SR; Ls = S.L / SR
    # drones (A1 + E2 + Bb2 colour), slow breathing
    dr = np.zeros(S.T)
    for f, a, k in [(55, 1.0, 1), (110, .5, 2), (82.4, .4, 3), (116.5, .22, 1), (220, .15, 2), (164.8, .1, 3)]:
        dr += a * np.sin(2 * np.pi * f * t + R.uniform(0, 6)) * (0.75 + 0.25 * np.sin(2 * np.pi * k * t / Ls + R.uniform(0, 6)))
    dr = sat(dr * 0.6, 1.5) + 0.3 * lp(sawk(2 * np.pi * 55 * t, 20), 400)
    S.put('drone', 0, 0, dr, 0.8)
    # choir-like formant pads: Am(add b2) cluster, slow evolve
    chords = [[45, 52, 58], [45, 52, 57], [43, 50, 58], [45, 52, 57], [45, 53, 58], [44, 52, 57]]
    for b, ch in enumerate(chords):
        for i, n_ in enumerate(ch):
            for side in (0, 1):
                S.put('choir', b, 0, formant_pad(midi(n_ + 12 * (1 if i == 2 else 0)), S.bar * 1.5, ['oh', 'ah', 'oo'][(b + i) % 3]), 0.22, (-0.5 + 0.5 * i) * (1 if side else -1) * 0.7)
    # gongs / bells
    for b, f in ((0, 55), (2, 61.7), (4, 55)): S.put('gong', b, 0, gong(f * 2, 7.0, 1.0), 0.9, -0.1)
    for b, beat, n_ in ((1, 2, 93), (3, 2, 91), (5, 2, 88), (5, 3.5, 85), (3, 3.5, 94)): S.put('bell', b, beat, bellpluck(midi(n_), 4.0, 1.0), 0.28, (R.uniform(-0.8, 0.8)))
    # slow pulse: low taiko heartbeat on 1 and 3 (soft), and a deep boom on bar downbeats
    for b in range(6):
        S.put('pulse', b, 0, taiko(0.9, 62), 0.7); S.put('pulse', b, 2, taiko(0.55, 62), 0.5)
        if b % 2 == 1: S.put('pulse', b, 3.5, taiko(0.4, 70), 0.4)
    # rising/falling swells (reverse cymbal) + whisper noise with moving formant
    for b in (1, 3, 5): S.put('fx', b, 0, revcrash(S.bar * 1.0, 0.8), 0.5)
    wh = svf(R.standard_normal(S.T), 600 + 500 * np.sin(2 * np.pi * 2 * t / Ls) , 5.0) * (0.35 + 0.35 * np.sin(2 * np.pi * 3 * t / Ls))
    S.put('whisper', 0, 0, np.stack([wh, np.roll(wh, 1500)], 1), 0.25)
    S.put('sub', 0, 0, np.sin(2 * np.pi * 55 * t) * (0.7 + 0.3 * np.sin(2 * np.pi * 6 * t / Ls)), 0.5)
    ir = make_ir(3.8, 3800, 0.025, 15)
    lv = {'drone': 0.9, 'choir': 0.9, 'gong': 0.85, 'bell': 0.8, 'pulse': 0.9, 'fx': 0.7, 'whisper': 0.6, 'sub': 0.8}
    y = mix_down(S, lv, {'choir': 0.6, 'gong': 0.5, 'bell': 0.7, 'pulse': 0.6, 'fx': 0.5, 'whisper': 0.5, 'drone': 0.2}, {'bell': 0.3}, [], 0, [], ir, 1.0)
    write('music/gm-decree-theme.wav', y)

# ============================================================
# 6) ARENA AMBIENCES (22.05 kHz stereo, 20 s seamless)
# ============================================================
def amb_setup():
    global SR; SR = 22050
    return 20.0
def circ_noise(n, seed_off=0):
    return R.standard_normal(n)
def per_lfo(t, D, parts):   # periodic LFO: frequencies are integer multiples of 1/D -> exact loop
    return sum(a * np.sin(2 * np.pi * k * t / D + p) for k, a, p in parts)
def wrap_add(buf, i, x):
    idx = (np.arange(len(x)) + i) % len(buf); np.add.at(buf, idx, x)
def make_amb(name, builder, seed):
    global R, SR
    old = SR; SR = 22050; R = np.random.default_rng(seed)
    D = 20.0; n = int(D * SR); t = np.arange(n) / SR
    L3 = builder(n, t, D)                                         # stereo (n,2) generated on a periodic basis
    z = np.tile(L3, (3, 1)) if False else L3
    z = z - z.mean(0); z = hp(z, 25, 2)
    z = z * (10 ** (-26 / 20) / np.sqrt(np.mean(z ** 2)))
    z = softlimit(z, 0.89)
    write(name, z, SR); SR = old
def tiled_svf(x, fc, q, mode='bp'):
    """svf on a 3x tile of a periodic signal, middle copy kept -> seamless periodic filtering."""
    n = len(x); y = svf(np.tile(x, 3), np.tile(fc, 3) if np.ndim(fc) else fc, q, mode); return y[n:2 * n]
def tiled_f(x, fn): n = len(x); return fn(np.tile(x, (3, 1) if x.ndim == 2 else 3))[n:2 * n]
def sparse_events(n, D, count, voice, gmin, gmax, pan=True, rng=None):
    buf = np.zeros((n, 2)); r = rng or R
    for _ in range(count):
        i = int(r.uniform(0, n)); x = voice(); g = r.uniform(gmin, gmax); p = r.uniform(-0.9, 0.9) if pan else 0
        a = (p + 1) * np.pi / 4
        for c, w in ((0, np.cos(a)), (1, np.sin(a))): wrap_add(buf[:, c], i, x * g * w)
    return buf

def amb_tournament(n, t, D):
    ch = []
    for c in range(2):
        base = R.standard_normal(n)
        fc = 380 + 260 * per_lfo(t, D, [(1, 1, c * 1.1), (3, .4, 0.7 + c)]) / 1.4 + 120
        w = tiled_svf(base, fc, 1.8, 'bp') * (0.55 + 0.45 * per_lfo(t, D, [(1, .6, .3 + c), (2, .3, 1.7), (5, .2, 2.2 + c)]))
        low = tiled_svf(R.standard_normal(n), 140 + 40 * per_lfo(t, D, [(1, 1, c)]), 0.8, 'lp') * (0.6 + 0.4 * per_lfo(t, D, [(2, 1, c * 2)]))
        hiss = tiled_svf(R.standard_normal(n), 2400 + 800 * per_lfo(t, D, [(3, 1, c)]), 1.2, 'bp') * 0.12 * (0.5 + 0.5 * per_lfo(t, D, [(4, 1, 1 + c)]))
        ch.append(w * 1.2 + low * 1.5 + hiss)
    x = np.stack(ch, 1)
    # gust: slow louder swell around 0.62 D
    gust = np.exp(-((t - 0.62 * D) ** 2) / (2 * 1.6 ** 2)) + np.exp(-((t - 0.62 * D + D) ** 2) / (2 * 1.6 ** 2)) + np.exp(-((t - 0.62 * D - D) ** 2) / (2 * 1.6 ** 2))
    x = x * (1 + 0.6 * gust[:, None])
    def pebble():
        d = 0.05; tt_ = np.arange(int(d * SR)) / SR; return bp(R.standard_normal(len(tt_)), 900, 4500) * np.exp(-tt_ / 0.008) * np.minimum(tt_ / 0.001, 1)
    def rumble():
        d = 1.6; tt_ = np.arange(int(d * SR)) / SR; return lp(R.standard_normal(len(tt_)), 90, 2) * np.sin(np.pi * tt_ / d) ** 2 * 4
    x += sparse_events(n, D, 22, pebble, 0.15, 0.7) * 0.5 + sparse_events(n, D, 3, rumble, 0.4, 0.9, False)
    # distant low horn-like tone (stadium drone) very soft
    horn = np.sin(2 * np.pi * 73.4 * t) + 0.5 * np.sin(2 * np.pi * 110.1 * t) + 0.3 * np.sin(2 * np.pi * 146.8 * t)
    x += (horn * (0.5 + 0.5 * per_lfo(t, D, [(1, 1, 0)]) ) * 0.06)[:, None]
    return x
def amb_ruined(n, t, D):
    ch = []
    for c in range(2):
        w = tiled_svf(R.standard_normal(n), 300 + 200 * per_lfo(t, D, [(1, 1, c), (2, .4, 1 + c)]) + 200, 1.5, 'bp') * (0.5 + 0.5 * per_lfo(t, D, [(1, .6, 0.3 + c), (3, .3, 1.1)]))
        howl = tiled_svf(R.standard_normal(n), 470 + 70 * per_lfo(t, D, [(2, 1, c * 2.1), (3, .4, c)]), 14.0, 'bp') * (0.2 + 0.2 * per_lfo(t, D, [(2, 1, 0.7 + c)]))
        rum = tiled_svf(R.standard_normal(n), 80, 0.7, 'lp') * 1.8
        ch.append(w * 1.0 + howl * 1.2 + rum)
    x = np.stack(ch, 1)
    def ember():
        d = 0.04; tt_ = np.arange(int(d * SR)) / SR; return hp(R.standard_normal(len(tt_)), 1800, 2) * np.exp(-tt_ / R.uniform(0.002, 0.008))
    x += sparse_events(n, D, 170, ember, 0.04, 0.45) * 0.55
    def tick():
        d = 0.25; tt_ = np.arange(int(d * SR)) / SR; f = R.choice([1800, 2300, 3100]); return np.sin(2 * np.pi * f * tt_) * np.exp(-tt_ / 0.03) * 0.3
    x += sparse_events(n, D, 6, tick, 0.1, 0.4)
    def creak():
        d = 1.4; tt_ = np.arange(int(d * SR)) / SR; f = R.uniform(380, 650) * (1 + 0.1 * np.sin(2 * np.pi * 0.8 * tt_))
        return (np.sin(ph(f, SR)) + 0.5 * np.sin(2.01 * ph(f, SR)) + 0.3 * np.sin(3.02 * ph(f, SR))) * np.sin(np.pi * tt_ / d) ** 2 * 0.1
    x += sparse_events(n, D, 3, creak, 0.5, 1.0)
    def thump():
        d = 1.3; tt_ = np.arange(int(d * SR)) / SR; return (np.sin(2 * np.pi * (45 + 25 * np.exp(-tt_ / 0.2)) * tt_) * np.exp(-tt_ / 0.4) + lp(R.standard_normal(len(tt_)), 160, 2) * np.exp(-tt_ / 0.3)) * 0.8
    x += sparse_events(n, D, 2, thump, 0.4, 0.8, False)
    return x
def amb_alien(n, t, D):
    ch = []
    for c in range(2):
        hum = np.zeros(n)
        for k, (f, a) in enumerate([(98, 1), (147, .6), (196.5, .5), (294.5, .3), (441, .2), (588, .12)]):
            hum += a * np.sin(2 * np.pi * f * t * (1 + 0.003 * (c * 2 - 1) * (k + 1) / 3) + 0.4 * np.sin(2 * np.pi * 2 * t / D * (k + 1)) + k) * (0.6 + 0.4 * per_lfo(t, D, [(k + 1, 1, k * 1.3 + c)]))
        air = tiled_svf(R.standard_normal(n), 1400 + 900 * per_lfo(t, D, [(1, 1, c), (2, .5, 1)]), 4.0, 'bp') * (0.4 + 0.4 * per_lfo(t, D, [(2, 1, 2 + c)]))
        low = tiled_svf(R.standard_normal(n), 120, 0.7, 'lp') * 0.8
        ch.append(hum * 0.35 + air * 0.8 + low)
    x = np.stack(ch, 1)
    def chirp():
        d = 0.9; tt_ = np.arange(int(d * SR)) / SR; f = R.uniform(900, 2200) * np.exp(-tt_ * R.uniform(0.2, 0.7)); f = f * (1 + 0.02 * np.sin(2 * np.pi * 9 * tt_))
        return np.sin(ph(f, SR)) * np.sin(np.pi * tt_ / d) ** 2 * 0.25
    x += sparse_events(n, D, 5, chirp, 0.2, 0.7)
    def gl():
        d = 1.2; tt_ = np.arange(int(d * SR)) / SR; f = R.choice([660, 880, 1320, 1760]); return np.sin(2 * np.pi * f * tt_ + 3 * np.sin(2 * np.pi * f * 1.5 * tt_) * np.exp(-tt_ / 0.2)) * np.exp(-tt_ / 0.3) * 0.12
    x += sparse_events(n, D, 5, gl, 0.3, 0.8)
    return x
def amb_cosmic(n, t, D):
    ch = []
    for c in range(2):
        d_ = np.zeros(n)
        for k, (f, a) in enumerate([(55, 1.0), (82.5, .55), (110, .5), (165, .35), (220, .25), (330, .15), (440.5, .1)]):
            d_ += a * np.sin(2 * np.pi * f * t * (1 + 0.0015 * (1 if c else -1) * (k % 3)) + k * 1.7) * (0.55 + 0.45 * per_lfo(t, D, [(1 + k % 4, 1, k * 0.9 + c * 1.3)]))
        sh = np.zeros(n)
        for k in range(10):
            f = [1318.5, 1760, 1975.5, 2349.3, 2637, 3136, 3520, 3951, 2093, 1568][k]
            sh += np.sin(2 * np.pi * f * t + k) * (0.5 + 0.5 * per_lfo(t, D, [(2 + k % 5, 1, k + c * 2)])) ** 3 * 0.09
        air = tiled_svf(R.standard_normal(n), 700 + 500 * per_lfo(t, D, [(1, 1, c)]), 3.0, 'bp') * 0.3
        ch.append(d_ * 0.45 + sh + air)
    x = np.stack(ch, 1)
    def bellv():
        d = 5.0; tt_ = np.arange(int(d * SR)) / SR; f = R.choice([523.3, 784, 1046.5, 1568]); s = sum(a * np.sin(2 * np.pi * f * r_ * tt_) * np.exp(-tt_ / (d / (1.5 * k))) for r_, a, k in [(1, 1, 1), (2.76, .3, 2), (5.4, .1, 3)])
        return s * np.minimum(tt_ / 0.05, 1) * 0.12
    x += sparse_events(n, D, 4, bellv, 0.5, 1.0)
    return x

ARENAS = {'arenas/tournament-arena-rocky-wind-ambience.wav': (amb_tournament, 201), 'arenas/ruined-city-wind-and-embers.wav': (amb_ruined, 202),
          'arenas/alien-arena-ethereal-wind-hum.wav': (amb_alien, 203), 'arenas/cosmic-other-world-celestial-drone.wav': (amb_cosmic, 204)}
def arenas(only=None):
    for k, (fn, seed) in ARENAS.items():
        if only and not any(o in k for o in only): continue
        make_amb(k, fn, seed)

TRACKS = {'menu': menu, 'battle-theme.': battle, 'intense': intense, 'duel': duel, 'decree': decree}
if __name__ == '__main__':
    args = sys.argv[1:]
    for k, fn in TRACKS.items():
        if not args or any(a in k or k in a for a in args): fn()
    if not args or any(a in ('arena', 'arenas', 'ambience') for a in args): arenas()
