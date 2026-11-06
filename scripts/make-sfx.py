#!/usr/bin/env python3
"""Procedural one-shot SFX for Dragon Ball: Ki Clash (numpy/scipy only, deterministic).
Layered synthesis: transient + body + tail, FM / ring-mod energy tones, pitch sweeps, swept-filter noise and
synthetic-IR reverb. 44.1 kHz 16-bit WAV, mono for ui/cards, stereo elsewhere. Peak is normalised to -1.5 dBFS.
Usage: python3 scripts/make-sfx.py [name-substring ...]      (no args = every file)"""
import os, sys, wave, zlib
import numpy as np
from scipy import signal

SR = 44100
SEED = 20241
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'audio')
R = np.random.default_rng(SEED)

def midi(n): return 440.0 * 2 ** ((np.asarray(n, float) - 69) / 12)
def N(d): return int(round(d * SR))
def tt(d): return np.arange(N(d)) / SR
def _sos(kind, fc, o):
    fc = np.atleast_1d(fc).astype(float) / (SR / 2); fc = np.clip(fc, 1e-4, 0.995)
    return signal.butter(o, fc if len(fc) > 1 else fc[0], kind, output='sos')
def lp(x, fc, o=2): return signal.sosfilt(_sos('low', fc, o), x, axis=0)
def hp(x, fc, o=2): return signal.sosfilt(_sos('high', fc, o), x, axis=0)
def bp(x, lo, hi, o=2): return signal.sosfilt(_sos('band', [lo, hi], o), x, axis=0)
def noise(d): return R.standard_normal(N(d))
def pink(d):
    x = noise(d); return lp(x, 3000) * 0.6 + lp(x, 400) * 1.2 + x * 0.15

def svf(x, fc, q=2.0, mode='bp'):
    """Time-varying state-variable filter (TPT). fc may be an array (Hz)."""
    x = np.asarray(x, float); fc = np.broadcast_to(np.asarray(fc, float), x.shape)
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR); k = 1.0 / q
    a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2
    out = np.empty(len(x)); ic1 = ic2 = 0.0
    for i, (xi, A1, A2, A3) in enumerate(zip(x.tolist(), a1.tolist(), a2.tolist(), a3.tolist())):
        v3 = xi - ic2; v1 = A1 * ic1 + A2 * v3; v2 = ic2 + A2 * ic1 + A3 * v3
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2
        out[i] = v1 if mode == 'bp' else v2 if mode == 'lp' else xi - k * v1 - v2
    return out

# ---------- envelopes / oscillators ----------
def env(n, atk=0.003, tau=0.2):
    t = np.arange(n) / SR; return np.minimum(t / max(atk, 1e-4), 1.0) * np.exp(-t / tau)
def adsr(d, a, dcy, s, r):
    n = N(d); t = np.arange(n) / SR; e = np.minimum(t / max(a, 1e-4), 1.0)
    e = e * (s + (1 - s) * np.exp(-np.clip(t - a, 0, None) / dcy)); rel = np.clip((d - t) / max(r, 1e-4), 0, 1)
    return e * rel
def bell_env(n, power=2.0): return np.sin(np.pi * np.arange(n) / n) ** power
def sweep(f0, f1, d, curve='exp'):
    t = np.linspace(0, 1, N(d))
    return f0 * (f1 / f0) ** t if curve == 'exp' else f0 + (f1 - f0) * t
def ph(f): return 2 * np.pi * np.cumsum(np.broadcast_to(f, np.shape(f))) / SR
def saw(f, nh=None):
    f = np.asarray(f, float); p = ph(f); K = int(min(40, 9000 / max(f.max(), 20))) if nh is None else nh
    return sum(np.sin(k * p) / k for k in range(1, max(K, 1) + 1)) * 0.6
def square(f):
    f = np.asarray(f, float); p = ph(f); K = int(min(30, 9000 / max(f.max(), 20)))
    return sum(np.sin(k * p) / k for k in range(1, K + 1, 2)) * 0.9
def vib(f, d, rate=5.5, depth=0.006, delay=0.15):
    t = tt(d); return f * (1 + depth * np.sin(2 * np.pi * rate * t) * np.clip(t / max(delay, 1e-3), 0, 1))
def fmtone(fc, d, ratio=2.0, idx=3.0, tau=0.25, atk=0.003, idx_tau=0.12):
    t = tt(d); fc = fit(fc, len(t))
    c = ph(fc); m = c * ratio
    return np.sin(c + idx * np.exp(-t / idx_tau) * np.sin(m)) * env(len(t), atk, tau)
def fit(a, n):
    a = np.asarray(a, float)
    if a.ndim == 0: return np.full(n, float(a))
    return a[:n] if len(a) >= n else np.concatenate([a, np.full(n - len(a), a[-1])])
def bell(f, d, tau=0.5, atk=0.001):
    t = tt(d); x = np.zeros_like(t)
    for r, a, k in [(1, 1, 1), (2.0, .45, 1.6), (2.76, .5, 1.9), (4.07, .25, 2.6), (5.4, .2, 3.2), (8.93, .08, 5)]:
        if f * r < 14000: x += a * np.sin(2 * np.pi * f * r * t + R.uniform(0, 6.28)) * np.exp(-t / (tau / k))
    return x * np.minimum(t / atk, 1) * 0.55
def boom(d, f0=130, f1=38, tau=0.35, click=0.3, body=0.55):
    t = tt(d); f = f1 + (f0 - f1) * np.exp(-t / 0.05); p = ph(f)
    x = np.sin(p) * np.exp(-t / tau) + 0.35 * np.sin(2 * p + 0.5) * np.exp(-t / (tau * 0.35))
    n = lp(noise(d), 900) * np.exp(-t / (tau * 0.5)) * body + hp(noise(d), 2500) * np.exp(-t / 0.006) * click
    return x + n
def nburst(d, tau, lo, hi, atk=0.001): return bp(noise(d), lo, hi) * env(N(d), atk, tau)
def whoosh(d, f0, f1, q=1.6, power=1.6, skew=0.5):
    n = N(d); t = np.linspace(0, 1, n); fc = f0 * (f1 / f0) ** t
    e = np.sin(np.pi * t ** (np.log(0.5) / np.log(max(skew, 0.05)))) ** power
    return svf(noise(d), fc, q) * e * 1.4
def riser(d, f0=300, f1=6000, power=2.0): 
    n = N(d); t = np.linspace(0, 1, n); return svf(noise(d), f0 * (f1 / f0) ** t, 1.2) * t ** power * 1.5
def sparkle(d, n_pings, flo, fhi, tau=0.12, power=1.0, rng=None):
    r = rng or R; x = np.zeros(N(d))
    for _ in range(n_pings):
        a = d * r.uniform(0, 0.85) ** power; f = r.uniform(flo, fhi); p = tt(min(0.5, d))
        i = N(a); s = np.sin(2 * np.pi * f * p) * np.exp(-p / tau) * r.uniform(0.2, 1)
        e = min(len(x) - i, len(s)); x[i:i + e] += s[:e]
    return x
def choir(freq, d, vowel='ah', voices=5, rate=5.0, depth=0.004):
    forms = {'ah': [(730, 1.0), (1090, .5), (2440, .25)], 'oh': [(570, 1.0), (840, .5), (2410, .15)], 'oo': [(300, 1.0), (870, .25), (2240, .1)]}[vowel]
    f = vib(np.full(N(d), float(freq)), d, rate, depth, 0.3); x = np.zeros(N(d))
    for v in range(voices):
        det = 1 + R.uniform(-0.007, 0.007); x += saw(f * det, 24) * (1 / voices)
    return sum(a * svf(x, fc, 7.0) for fc, a in forms) * 0.6
def ring(x, f): return x * np.sin(2 * np.pi * f * np.arange(len(x)) / SR)
def sat(x, drive=1.5): return np.tanh(x * drive) / np.tanh(drive)

# ---------- stereo mix + reverb ----------
def pan2(x, p=0.0):
    a = (p + 1) * np.pi / 4; return np.stack([x * np.cos(a), x * np.sin(a)], 1)
class Track:
    def __init__(self, d, tail=0.0): self.d = d; self.n = N(d + tail); self.b = np.zeros((self.n, 2))
    def add(self, at, x, g=1.0, pan=0.0):
        x = np.asarray(x, float); i = N(at)
        if i >= self.n: return self
        if x.ndim == 1: x = pan2(x, pan)
        e = min(self.n - i, len(x)); self.b[i:i + e] += x[:e] * g; return self
def ir(rt=0.6, damp=6000, seed=1, pre=0.008, stereo=True):
    r = np.random.default_rng(seed); n = N(rt * 1.2); t = np.arange(n) / SR
    out = []
    for _ in range(2):
        x = r.standard_normal(n) * np.exp(-6.9 * t / rt) * (1 - np.exp(-t / 0.004))
        x = lp(x, damp, 1); x = np.concatenate([np.zeros(N(pre)), x]); out.append(x)
    L, Rr = out; Rr = Rr * 1.0
    nrm = np.sqrt(np.sum(L ** 2)); return np.stack([L / nrm, Rr / nrm], 1)
def rev(b, wet=0.25, rt=0.6, damp=6000, seed=1, pre=0.008, stereo=True):
    h = ir(rt, damp, seed, pre)
    if not stereo: h = np.stack([h[:, 0], h[:, 0]], 1)
    y = np.stack([signal.fftconvolve(b[:, 0], h[:, 0]) + 0 * 1, signal.fftconvolve(b[:, 1], h[:, 1])], 1)[:len(b)]
    # cross feed for width
    y = np.stack([y[:, 0] * 0.8 + y[:, 1] * 0.2, y[:, 1] * 0.8 + y[:, 0] * 0.2], 1)
    return b * (1 - wet * 0.5) + y * wet * 2.2
def echo(b, delay=0.18, fb=0.35, n=4, lpf=3500, wet=0.5):
    y = np.zeros_like(b); cur = b.copy()
    for k in range(n):
        cur = np.roll(cur, N(delay), 0); cur[:N(delay)] = 0; cur = lp(cur, lpf, 1) * fb
        y += cur[:, ::-1] if k % 2 == 0 else cur
    return b + y * wet

def finish(name, b, d, stereo, peak_db=-1.5, drive=1.0, fade_out=0.03):
    n = N(d); b = b[:n].copy()
    if b.shape[0] < n: b = np.vstack([b, np.zeros((n - len(b), 2))])
    if not stereo: b = np.repeat(b.mean(1, keepdims=True), 2, 1)
    sos = signal.butter(2, 28 / (SR / 2), 'high', output='sos'); b = signal.sosfilt(sos, b, axis=0)
    b = lp(b, 12500, 2); b = b - 0.4 * hp(b, 7000, 1)  # tame HF fizz (gentle shelf above 7 kHz, low-pass at 12.5 kHz)
    if drive != 1.0: b = sat(b, drive)
    fi = N(0.003); fo = N(max(fade_out, 0.005))
    b[:fi] *= np.sin(np.linspace(0, np.pi / 2, fi))[:, None]; b[-fo:] *= np.cos(np.linspace(0, np.pi / 2, fo))[:, None] ** 2
    # soft limiter then peak normalise
    pk = np.abs(b).max(); b = b / pk * 0.9; b = np.tanh(b * 1.15) / np.tanh(1.15)
    b = b / np.abs(b).max() * 10 ** (peak_db / 20)
    path = os.path.join(OUT, name); os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, 'wb') as w:
        if stereo: data = b
        else: data = b[:, :1]
        w.setnchannels(data.shape[1]); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(data, -1, 1) * 32767).round().astype('<i2').tobytes())
    return path

# ====================== RECIPES ======================
SFX = {}
def sfx(name, d, stereo=True, drive=1.0, fade=0.03):
    def deco(fn): SFX[name] = (d, stereo, drive, fade, fn); return fn
    return deco

# ---------------- UI ----------------
@sfx('ui/button-click-confirmation-tap.wav', 0.16, False)
def _():
    T = Track(0.16, 0.1)
    T.add(0, hp(noise(0.01), 3000) * env(N(0.01), .0005, .002), 0.5)
    T.add(0, fmtone(1320, 0.14, 2.0, 2.0, 0.035, 0.001, 0.02), 0.7)
    T.add(0, fmtone(180, 0.1, 1.0, 0.5, 0.03, 0.001), 0.8)
    T.add(0.035, fmtone(1980, 0.1, 1.5, 1.0, 0.04, 0.001), 0.3)
    return rev(T.b, 0.12, 0.2, 5000, 2)
@sfx('ui/invalid-action-rejection-pulse.wav', 0.34, False)
def _():
    T = Track(0.34, 0.1)
    for i, f in enumerate((233, 175)):
        d = 0.13; x = lp(square(np.full(N(d), f)) + 0.6 * saw(np.full(N(d), f * 1.01)), 1400) * adsr(d, .004, .05, .6, .03)
        T.add(i * 0.15, ring(x, f * 0.5) * 0.4 + x * 0.7, 0.8)
    return rev(T.b, 0.1, 0.2, 4000, 3)
@sfx('ui/modal-open-interface-transition.wav', 0.38, False)
def _():
    T = Track(0.38, 0.2)
    T.add(0, whoosh(0.3, 500, 3500, 1.2, 1.3, 0.7), 0.55)
    T.add(0, fmtone(sweep(330, 760, 0.3), 0.3, 2.0, 1.5, 0.2, 0.1) * bell_env(N(0.3), 0.7), 0.4)
    T.add(0.2, bell(1175, 0.18, 0.12), 0.35)
    return rev(T.b, 0.18, 0.3, 6000, 4)
@sfx('ui/modal-close-energy-release.wav', 0.34, False)
def _():
    T = Track(0.34, 0.2)
    T.add(0, whoosh(0.28, 3200, 400, 1.2, 1.3, 0.3), 0.55)
    T.add(0.02, fmtone(sweep(900, 260, 0.28), 0.28, 2.0, 1.2, 0.12, 0.1), 0.45)
    T.add(0.22, boom(0.12, 150, 90, 0.05, 0.1, 0.1), 0.45)
    return rev(T.b, 0.15, 0.3, 5000, 5)
@sfx('ui/settings-toggle-clean-click.wav', 0.1, False)
def _():
    T = Track(0.1, 0.05)
    T.add(0, hp(noise(0.01), 2500) * env(N(0.01), .0003, .002), 0.7)
    T.add(0, fmtone(1760, 0.08, 1.0, 0.8, 0.02, 0.0007, 0.01), 0.6)
    T.add(0, fmtone(260, 0.06, 1, 0.3, 0.015, 0.0007), 0.5)
    return rev(T.b, 0.06, 0.12, 5000, 6)
@sfx('ui/tab-menu-navigation-transition.wav', 0.3, False)
def _():
    T = Track(0.3, 0.15)
    T.add(0, whoosh(0.22, 1200, 3800, 2.0, 1.3, 0.5), 0.5)
    T.add(0.08, fmtone(660, 0.2, 2, 1.5, 0.08, 0.002), 0.35)
    T.add(0.15, fmtone(990, 0.15, 2, 1.2, 0.06, 0.002), 0.3)
    return rev(T.b, 0.14, 0.25, 6000, 7)
@sfx('ui/arena-select-confirm-energy-lock.wav', 0.4, False)
def _():
    T = Track(0.4, 0.3)
    T.add(0, boom(0.3, 110, 50, 0.16, 0.5, 0.3), 0.9)
    T.add(0.0, bell(587, 0.35, 0.22), 0.5); T.add(0.0, bell(880, 0.3, 0.15), 0.3)
    T.add(0, sat(whoosh(0.18, 400, 4000, 1.5, 1.5, 0.9)), 0.4)
    T.add(0.12, fmtone(sweep(440, 1320, 0.2), 0.2, 2.0, 2, 0.15, 0.1), 0.25)
    return rev(T.b, 0.2, 0.35, 6000, 8)

# ---------------- CARDS ----------------
def flick(brightness=1.0, d=0.12):
    n = N(d); sw = whoosh(d, 1500 * brightness, 6500 * brightness, 1.4, 1.2, 0.8) * 0.9
    tick = hp(noise(0.012), 2500) * env(N(0.012), .0004, .003) + fmtone(900 * brightness, 0.012, 1, 0, 0.004, 0.0005) * 0.5
    x = np.zeros(n + N(0.03)); x[:len(sw)] += sw * 0.7; i = int(n * 0.72); x[i:i + len(tick)] += tick * 0.9
    return x
@sfx('cards/deal-card-flick.wav', 0.18, False)
def _():
    T = Track(0.18, 0.05); T.add(0, flick(1.0, 0.13), 0.9); T.add(0.1, boom(0.06, 400, 200, 0.012, 0.0, 0.0), 0.12)
    return T.b
@sfx('cards/card-hover-energy-tick.wav', 0.16, False)
def _():
    T = Track(0.16, 0.08)
    T.add(0, fmtone(sweep(900, 1500, 0.08), 0.08, 2.0, 1.5, 0.04, 0.001), 0.6)
    T.add(0, hp(noise(0.01), 4000) * env(N(0.01), .0003, .002), 0.3)
    T.add(0.02, fmtone(2400, 0.1, 1.5, 1, 0.05, 0.002), 0.2)
    return rev(T.b, 0.1, 0.2, 6000, 9)
@sfx('cards/card-deselected-release.wav', 0.22, False)
def _():
    T = Track(0.22, 0.1)
    T.add(0, fmtone(sweep(1100, 520, 0.14), 0.14, 2.0, 1.5, 0.06, 0.05), 0.55)
    T.add(0, whoosh(0.15, 3000, 800, 1.5, 1.2, 0.3), 0.35)
    T.add(0.1, boom(0.08, 200, 120, 0.03, 0.2, 0.1), 0.25)
    return rev(T.b, 0.1, 0.2, 5000, 10)
@sfx('cards/card-committed-energy-lock.wav', 0.5, False)
def _():
    T = Track(0.5, 0.3)
    T.add(0, whoosh(0.12, 800, 5000, 1.3, 1.0, 0.9), 0.4)
    T.add(0.09, boom(0.4, 140, 55, 0.18, 0.6, 0.3), 0.95)
    T.add(0.09, fmtone(440, 0.35, 2.01, 3.0, 0.2, 0.001, 0.08), 0.5)
    T.add(0.09, bell(1320, 0.3, 0.14), 0.25)
    T.add(0.09, nburst(0.1, 0.03, 3000, 8000), 0.35)
    return rev(T.b, 0.2, 0.35, 5500, 11)
@sfx('cards/card-reveal-energy-burst.wav', 0.75, False)
def _():
    T = Track(0.75, 0.3)
    T.add(0, riser(0.18, 500, 7000, 1.5), 0.5)
    T.add(0.17, boom(0.5, 160, 60, 0.2, 0.5, 0.5), 0.9)
    T.add(0.17, nburst(0.4, 0.12, 800, 7000), 0.5)
    T.add(0.17, fmtone(sweep(330, 1320, 0.4), 0.4, 3.0, 3.0, 0.2, 0.1), 0.3)
    T.add(0.17, sparkle(0.5, 14, 2200, 6000, 0.1), 0.25)
    return rev(T.b, 0.28, 0.5, 6000, 12)
@sfx('cards/card-shuffle-energy-flicks.wav', 0.8, False)
def _():
    T = Track(0.8, 0.1)
    for i in range(9):
        T.add(0.02 + i * 0.075 + R.uniform(0, .01), flick(R.uniform(0.8, 1.3), 0.08), R.uniform(0.35, 0.7))
    T.add(0, sparkle(0.8, 6, 2500, 5000, 0.05), 0.12)
    return rev(T.b, 0.12, 0.2, 6000, 13)
@sfx('cards/initial-hand-deal-staggered.wav', 0.8, False)
def _():
    T = Track(0.8, 0.2)
    for i in range(5):
        T.add(0.02 + i * 0.14, flick(1.0 + 0.06 * i, 0.12), 0.65 + 0.07 * i)
        T.add(0.02 + i * 0.14 + 0.09, fmtone(500 + i * 90, 0.08, 2, 1, 0.03, 0.001), 0.2)
    T.add(0.6, bell(1568, 0.2, 0.12), 0.15)
    return rev(T.b, 0.14, 0.25, 6000, 14)
@sfx('cards/random-card-draw-suspense-reveal.wav', 0.8, False)
def _():
    T = Track(0.8, 0.3)
    T.add(0, riser(0.5, 400, 5000, 1.8), 0.45)
    T.add(0, fmtone(sweep(220, 880, 0.5), 0.5, 2.0, 2.0, 0.5, 0.2) * np.linspace(0.2, 1, N(0.5)), 0.3)
    T.add(0.5, boom(0.3, 200, 70, 0.1, 0.4, 0.3), 0.7)
    T.add(0.5, bell(988, 0.3, 0.25), 0.4); T.add(0.5, bell(1480, 0.25, 0.2), 0.25)
    T.add(0.5, sparkle(0.3, 8, 3000, 7000, 0.08), 0.2)
    return rev(T.b, 0.25, 0.45, 6000, 15)
@sfx('cards/card-flip-reveal.wav', 0.4, False)
def _():
    T = Track(0.4, 0.2)
    T.add(0, whoosh(0.14, 900, 4500, 1.5, 1.2, 0.5), 0.5)
    T.add(0.1, hp(noise(0.012), 2000) * env(N(0.012), .0004, .003), 0.5)
    T.add(0.1, fmtone(sweep(500, 1000, 0.15), 0.2, 2, 2, 0.1, 0.05), 0.35)
    T.add(0.12, bell(1760, 0.25, 0.14), 0.3)
    T.add(0.12, sparkle(0.25, 6, 3000, 6500, 0.06), 0.15)
    return rev(T.b, 0.2, 0.35, 6000, 16)
@sfx('cards/card-slam-table.wav', 0.45, False)
def _():
    T = Track(0.45, 0.2)
    T.add(0, whoosh(0.08, 2000, 800, 1.2, 1.0, 0.8), 0.3)
    T.add(0.07, boom(0.35, 170, 60, 0.12, 0.8, 0.5), 1.0)
    T.add(0.07, bp(noise(0.06), 700, 3500) * env(N(0.06), .0005, .012), 0.8)
    T.add(0.07, fmtone(220, 0.12, 1.5, 1.0, 0.04, 0.001), 0.3)
    return rev(T.b, 0.14, 0.2, 4500, 17)

# ---------------- COMBAT ----------------
def coin(f, d=0.3):
    return (bell(f, d, 0.12) * 0.8 + bell(f * 1.5, d, 0.08) * 0.3 + np.pad(hp(noise(0.006), 5000) * env(N(0.006), .0002, .001), (0, N(d) - N(0.006))) * 0.3)
@sfx('combat/coins-earned-reward-chime.wav', 0.75)
def _():
    T = Track(0.75, 0.4)
    for i, n in enumerate((79, 84, 88, 91)): T.add(i * 0.075, coin(midi(n), 0.4), 0.7 - 0.05 * i, pan=-0.3 + 0.2 * i)
    T.add(0.3, bell(midi(96), 0.4, 0.3), 0.3); T.add(0.2, sparkle(0.5, 10, 4000, 7000, 0.07), 0.15)
    return rev(T.b, 0.22, 0.6, 7000, 18)
@sfx('combat/coins-spent-confirmation.wav', 0.5)
def _():
    T = Track(0.5, 0.3)
    for i, n in enumerate((88, 83, 79)): T.add(i * 0.07, coin(midi(n), 0.3), 0.7 - 0.1 * i, pan=0.3 - 0.3 * i)
    T.add(0.2, boom(0.12, 180, 100, 0.04, 0.1, 0.05), 0.4)
    return rev(T.b, 0.18, 0.4, 6000, 19)
@sfx('combat/cooldown-unavailable-pulse.wav', 0.5)
def _():
    T = Track(0.5, 0.2)
    for i in range(2):
        d = 0.16; x = lp(square(np.full(N(d), 196.0)) * 0.5 + fmtone(98, d, 1, 0, 0.1, 0.002) , 900) * adsr(d, .004, .06, .5, .05)
        T.add(i * 0.2, x, 0.9 - 0.2 * i, pan=-0.15 + 0.3 * i)
    T.add(0, bp(noise(0.3), 300, 1200) * env(N(0.3), .01, .08), 0.15)
    return rev(T.b, 0.12, 0.25, 3500, 20)
@sfx('combat/hp-damage-impact.wav', 0.65)
def _():
    T = Track(0.65, 0.3)
    T.add(0, boom(0.6, 180, 48, 0.25, 0.9, 0.7), 1.0)
    T.add(0, bp(noise(0.12), 600, 4500) * env(N(0.12), .0005, .03), 0.8)
    T.add(0, sat(fmtone(sweep(900, 150, 0.2), 0.2, 1.7, 4, 0.08, 0.05), 2), 0.35)
    T.add(0.01, sparkle(0.3, 5, 3000, 5000, 0.04), 0.1)
    return rev(T.b, 0.18, 0.4, 4500, 21)
@sfx('combat/hp-healing-restorative-pulse.wav', 0.95)
def _():
    T = Track(0.95, 0.5)
    for i, n in enumerate((67, 71, 74, 79)): T.add(0.05 + i * 0.11, fmtone(midi(n), 0.6, 1.0, 0.6, 0.35, 0.01, 0.2), 0.45, pan=-0.25 + 0.17 * i)
    T.add(0, bell(midi(86), 0.8, 0.5), 0.25)
    pad = sum(saw(np.full(N(0.9), midi(n)) * (1 + dt), 12) for n in (55, 62, 67) for dt in (-0.004, 0.004))
    T.add(0, lp(pad, 1400) * bell_env(N(0.9), 1.0), 0.12)
    T.add(0.15, sparkle(0.8, 16, 3500, 8000, 0.15), 0.14)
    return rev(T.b, 0.3, 0.8, 7000, 22)
@sfx('combat/insufficient-ki-coins-warning.wav', 0.55)
def _():
    T = Track(0.55, 0.25)
    for i in range(2):
        d = 0.2; f = 150 if i else 190
        x = lp(saw(np.full(N(d), f)) + 0.8 * saw(np.full(N(d), f * 1.5 * 1.01)), 1100) * adsr(d, .005, .08, .7, .05)
        T.add(i * 0.22, sat(ring(x, 40) * 0.3 + x, 1.8), 0.7)
    T.add(0, nburst(0.1, 0.03, 400, 2000), 0.2)
    return rev(T.b, 0.12, 0.3, 3500, 23)
@sfx('combat/ki-gain-energy-pickup.wav', 0.65)
def _():
    T = Track(0.65, 0.3)
    T.add(0, fmtone(sweep(350, 1400, 0.3), 0.3, 2.0, 2.5, 0.25, 0.2) * bell_env(N(0.3), 0.3), 0.5)
    T.add(0, whoosh(0.3, 600, 5000, 1.3, 1.2, 0.8), 0.35)
    T.add(0.26, bell(1568, 0.35, 0.2), 0.45); T.add(0.26, bell(2349, 0.3, 0.15), 0.3)
    T.add(0.26, boom(0.15, 200, 90, 0.05, 0.2, 0.1), 0.3)
    T.add(0.25, sparkle(0.4, 12, 3500, 7500, 0.1), 0.2)
    return rev(T.b, 0.22, 0.45, 7000, 24)
@sfx('combat/ki-loss-descending-drain.wav', 0.7)
def _():
    T = Track(0.7, 0.3)
    T.add(0, fmtone(sweep(900, 110, 0.6), 0.6, 2.0, 3.0, 0.5, 0.4) * np.linspace(1, 0.2, N(0.6)), 0.7)
    T.add(0, whoosh(0.6, 3500, 200, 1.4, 1.0, 0.25), 0.4)
    T.add(0, sat(ring(fmtone(sweep(500, 90, 0.5), 0.5, 1, 0, 0.4, 0.002), 55), 1.5), 0.25)
    return rev(T.b, 0.2, 0.4, 4000, 25)
@sfx('combat/ki-spent-boosted-drain.wav', 0.65)
def _():
    T = Track(0.65, 0.3)
    T.add(0, whoosh(0.5, 400, 4500, 1.3, 1.0, 0.75), 0.5)
    T.add(0, fmtone(sweep(200, 900, 0.4), 0.4, 3, 2, 0.4, 0.2), 0.4)
    T.add(0.38, boom(0.25, 170, 50, 0.1, 0.5, 0.3), 0.8)
    T.add(0.38, fmtone(sweep(1400, 300, 0.2), 0.2, 2, 2, 0.1, 0.05), 0.3)
    return rev(T.b, 0.2, 0.4, 5000, 26)
@sfx('combat/power-comparison-energy-clash.wav', 1.0)
def _():
    T = Track(1.0, 0.5)
    T.add(0, fmtone(sweep(220, 660, 0.5), 0.5, 2.0, 2.0, 0.4, 0.3), 0.4, pan=-0.6)
    T.add(0, fmtone(sweep(1320, 660, 0.5), 0.5, 2.0, 2.0, 0.4, 0.3), 0.4, pan=0.6)
    T.add(0, riser(0.5, 300, 6000, 1.6), 0.4)
    T.add(0.5, boom(0.5, 200, 45, 0.28, 0.9, 0.7), 1.0)
    T.add(0.5, bp(noise(0.5), 500, 7000) * env(N(0.5), .001, .1), 0.55)
    T.add(0.5, sat(ring(saw(np.full(N(0.5), 330.0)), 247), 2) * env(N(0.5), .002, .15), 0.3)
    T.add(0.5, sparkle(0.5, 18, 2500, 7000, 0.1), 0.2)
    return rev(T.b, 0.25, 0.7, 6000, 27)
@sfx('combat/power-rank-call-charge.wav', 1.2)
def _():
    T = Track(1.2, 0.4)
    f = sweep(110, 440, 1.0)
    x = saw(f) * np.linspace(0.2, 1, N(1.0)); x = svf(x, np.linspace(300, 3500, N(1.0)), 1.5, 'lp')
    T.add(0, x, 0.5)
    T.add(0, ring(fmtone(sweep(220, 880, 1.0), 1.0, 1, 0, 2.0, 0.01), 14) , 0.25)
    T.add(0, riser(1.0, 300, 7000, 2.2), 0.35)
    T.add(0, lp(noise(1.0), 120) * np.linspace(0.1, 1, N(1.0)), 1.0)
    T.add(0.98, boom(0.22, 220, 80, 0.08, 0.4, 0.2), 0.7)
    T.add(0.98, bell(880, 0.22, 0.15), 0.35)
    return rev(T.b, 0.22, 0.5, 6000, 28)
@sfx('combat/winner-reveal-triumphant-sting.wav', 1.4)
def _():
    T = Track(1.4, 0.6)
    def brass(n, d, at, g):
        f = np.full(N(d), float(midi(n))); x = saw(f * 1.004) + saw(f * 0.996)
        x = svf(x, 400 + 3200 * np.minimum(np.arange(N(d)) / SR / 0.08, 1) , 1.0, 'lp') * adsr(d, .02, .15, .8, .15)
        T.add(at, x, g, pan=0)
    for at, ns, d in ((0, (62, 69), 0.22), (0.2, (66, 73), 0.22), (0.4, (69, 76, 81), 0.9)):
        for n in ns: brass(n, d, at, 0.35)
    T.add(0.4, boom(0.5, 120, 45, 0.25, 0.6, 0.4), 0.7)
    T.add(0.4, bell(midi(93), 1.0, 0.5), 0.3); T.add(0.4, sparkle(0.9, 24, 3500, 8000, 0.15), 0.18)
    T.add(0.4, nburst(0.5, 0.2, 1000, 7000), 0.3)
    return rev(T.b, 0.3, 0.9, 7000, 29)
@sfx('combat/shield-guard-pulse.wav', 0.6)
def _():
    T = Track(0.6, 0.3)
    T.add(0, boom(0.4, 130, 70, 0.14, 0.5, 0.3), 0.8)
    x = sum(bell(f, 0.5, 0.35) for f in (523, 784, 1046)); T.add(0, x, 0.35)
    T.add(0, sat(ring(fmtone(sweep(300, 900, 0.3), 0.3, 2, 2, 0.15, 0.002), 90) , 1.4), 0.4)
    T.add(0, whoosh(0.35, 3000, 700, 1.3, 1.0, 0.2), 0.35)
    T.add(0.02, sparkle(0.4, 10, 3000, 7000, 0.08), 0.15)
    T.add(0.15, fmtone(220, 0.3, 1.0, 0, 0.25, 0.01) * (1 + 0.5 * np.sin(2 * np.pi * 18 * tt(0.3))), 0.2)
    return rev(T.b, 0.3, 0.5, 5500, 30)

# ---------------- REWARDS ----------------
@sfx('rewards/purchase-confirmed-coin-energy-chime.wav', 0.8)
def _():
    T = Track(0.8, 0.4)
    for i, n in enumerate((79, 83, 86, 91)): T.add(i * 0.08, coin(midi(n), 0.4), 0.55, pan=-0.3 + 0.2 * i)
    T.add(0.04, fmtone(sweep(300, 1200, 0.3), 0.3, 2, 2, 0.2, 0.1), 0.25)
    T.add(0.3, bell(midi(98), 0.5, 0.35), 0.25); T.add(0, boom(0.12, 180, 90, 0.04, 0.1, 0.1), 0.3)
    T.add(0.2, sparkle(0.5, 10, 4000, 8000, 0.1), 0.15)
    return rev(T.b, 0.25, 0.7, 7000, 31)
@sfx('rewards/shop-purchase-failed-rejection.wav', 0.5)
def _():
    T = Track(0.5, 0.2)
    for i, f in enumerate((196, 147)):
        d = 0.2; x = lp(saw(np.full(N(d), float(f))) + 0.5 * saw(np.full(N(d), f * 1.5)), 1000) * adsr(d, .005, .08, .6, .06)
        T.add(i * 0.2, sat(x, 1.6), 0.7)
    T.add(0.4, boom(0.1, 90, 50, 0.04, 0.1, 0.1), 0.3)
    return rev(T.b, 0.12, 0.25, 3500, 32)
@sfx('rewards/shop-open-close-interface-flourish.wav', 0.65)
def _():
    T = Track(0.65, 0.3)
    T.add(0, whoosh(0.3, 800, 5000, 1.2, 1.2, 0.6), 0.4)
    for i, n in enumerate((79, 84, 88, 91, 96)): T.add(0.05 + i * 0.06, bell(midi(n), 0.35, 0.18), 0.4, pan=-0.4 + 0.2 * i)
    T.add(0.32, sparkle(0.3, 8, 4000, 8000, 0.08), 0.15)
    return rev(T.b, 0.22, 0.5, 7000, 33)
@sfx('rewards/reward-claim-celebration.wav', 1.4)
def _():
    T = Track(1.4, 0.7)
    T.add(0, boom(0.3, 140, 50, 0.12, 0.3, 0.2), 0.6)
    seq = (72, 76, 79, 84, 88, 91, 96)
    for i, n in enumerate(seq):
        T.add(0.04 + i * 0.075, fmtone(midi(n), 0.5, 2.0, 1.5, 0.25, 0.002, 0.08), 0.35, pan=-0.5 + i * 0.16)
        T.add(0.04 + i * 0.075, bell(midi(n + 12), 0.3, 0.15), 0.18, pan=0.5 - i * 0.16)
    for n in (72, 79, 84, 88): T.add(0.6, bell(midi(n), 0.9, 0.7), 0.3)
    T.add(0.6, nburst(0.35, 0.12, 1000, 7000), 0.35)
    T.add(0.6, sparkle(0.8, 36, 3000, 8500, 0.2), 0.22)
    pad = sum(saw(np.full(N(1.0), midi(n)) * (1 + dt), 10) for n in (48, 55, 60, 64) for dt in (-0.004, 0.004))
    T.add(0.55, lp(pad, 1800) * adsr(1.0, .05, .3, .5, .5), 0.12)
    return rev(T.b, 0.28, 0.9, 7000, 34)

# ---------------- EVENTS ----------------
def sealtone(d, f, g=1.0):
    x = sat(ring(saw(np.full(N(d), float(f))), f * 1.5), 1.5) * adsr(d, .01, .2, .5, .2)
    return lp(x, 2500) * g
@sfx('events/public-forecast-scan-reveal.wav', 1.3)
def _():
    T = Track(1.3, 0.5)
    T.add(0, whoosh(0.7, 500, 6000, 3.0, 1.0, 0.9), 0.45, pan=-0.5)
    T.add(0, fmtone(sweep(400, 2400, 0.7), 0.7, 3, 1.0, 0.7, 0.4) * bell_env(N(0.7), 0.5), 0.25, pan=0.3)
    for i, t0 in enumerate((0.55, 0.73, 0.91)):
        T.add(t0, fmtone(1760 * (1.125 ** i), 0.22, 2.01, 1.5, 0.1, 0.001, 0.04), 0.4, pan=-0.4 + 0.4 * i)
    T.add(0.95, bell(2349, 0.5, 0.4), 0.3); T.add(0.9, boom(0.25, 150, 70, 0.08, 0.2, 0.15), 0.4)
    T.add(0.9, sparkle(0.4, 10, 3500, 7500, 0.1), 0.2)
    return echo(rev(T.b, 0.25, 0.8, 7000, 40), 0.12, 0.3, 3, 4000, 0.4)
@sfx('events/no-apex-power-suppression-seal.wav', 1.0)
def _():
    T = Track(1.0, 0.5)
    T.add(0, fmtone(sweep(1000, 120, 0.5), 0.5, 2, 3, 0.4, 0.3), 0.55)
    T.add(0, whoosh(0.45, 5000, 300, 1.3, 1.0, 0.3), 0.45)
    T.add(0.4, boom(0.6, 120, 40, 0.3, 0.7, 0.6), 1.0)
    T.add(0.4, sealtone(0.55, 110), 0.5); T.add(0.4, bell(220, 0.7, 0.5), 0.25)
    T.add(0.45, hp(noise(0.2), 4000) * env(N(0.2), .001, .03), 0.2)
    return rev(T.b, 0.3, 0.7, 4000, 41)
@sfx('events/wildcard-lockout-energy-seal.wav', 0.9)
def _():
    T = Track(0.9, 0.4)
    for i, t0 in enumerate((0, 0.12, 0.24)): T.add(t0, boom(0.15, 250 - 40 * i, 120 - 20 * i, 0.04, 0.3, 0.1), 0.5)
    T.add(0.3, boom(0.5, 110, 40, 0.28, 0.8, 0.5), 1.0)
    T.add(0.3, sealtone(0.5, 165), 0.5); T.add(0.3, bell(330, 0.6, 0.4), 0.25)
    T.add(0, fmtone(sweep(1500, 400, 0.3), 0.3, 2, 2, 0.2, 0.1), 0.35)
    T.add(0.3, hp(noise(0.3), 3500) * env(N(0.3), .001, .04), 0.2)
    return rev(T.b, 0.25, 0.6, 4500, 42)
@sfx('events/ki-surge-charge-release.wav', 1.3)
def _():
    T = Track(1.3, 0.5)
    f = sweep(90, 700, 0.75)
    T.add(0, svf(saw(f), np.linspace(300, 5000, N(0.75)), 1.3, 'lp') * np.linspace(0.2, 1, N(0.75)), 0.5)
    T.add(0, riser(0.75, 300, 8000, 2.0), 0.4); T.add(0, lp(noise(0.75), 100) * np.linspace(0.1, 1, N(0.75)), 1.0)
    T.add(0.74, boom(0.55, 170, 45, 0.25, 0.8, 0.7), 1.0)
    T.add(0.74, nburst(0.5, 0.15, 600, 8000), 0.6)
    T.add(0.74, sat(ring(saw(np.full(N(0.6), 440.0)), 330), 2) * env(N(0.6), .002, .2), 0.3)
    T.add(0.74, sparkle(0.5, 20, 3000, 8000, 0.1), 0.2)
    return rev(T.b, 0.25, 0.7, 6500, 43)
@sfx('events/high-stakes-tension-confirmation.wav', 1.2)
def _():
    T = Track(1.2, 0.5)
    for i, t0 in enumerate((0, 0.3)): T.add(t0, boom(0.3, 100, 45, 0.15, 0.4, 0.3), 0.8)
    pad = sum(saw(np.full(N(1.0), midi(n)) * (1 + dt), 10) for n in (45, 52, 57, 60) for dt in (-0.005, 0.005))
    T.add(0, svf(pad, np.linspace(300, 1200, N(1.0)), 1.0, 'lp') * adsr(1.0, .3, .3, .6, .4), 0.35)
    T.add(0.6, fmtone(220, 0.5, 2.01, 2, 0.4, 0.002, 0.2), 0.4); T.add(0.6, bell(440, 0.6, 0.45), 0.3)
    T.add(0.6, boom(0.5, 120, 40, 0.28, 0.5, 0.3), 0.9)
    T.add(0, whoosh(0.6, 300, 2000, 1.5, 1.2, 0.8), 0.3)
    return rev(T.b, 0.3, 0.7, 4500, 44)
@sfx('events/divine-challenge-signal.wav', 1.4)
def _():
    T = Track(1.4, 0.6)
    for i, n in enumerate((74, 81, 86)): T.add(i * 0.22, bell(midi(n), 1.0, 0.8), 0.45, pan=-0.3 + 0.3 * i)
    for n in (62, 69): T.add(0, lp(saw(np.full(N(1.3), midi(n)) * 1.003) + saw(np.full(N(1.3), midi(n)) * 0.997), 1100) * adsr(1.3, .4, .3, .6, .5), 0.18)
    T.add(0.5, boom(0.6, 90, 40, 0.3, 0.4, 0.3), 0.7)
    T.add(0, whoosh(1.0, 500, 4000, 2.0, 1.2, 0.5), 0.25)
    T.add(0.5, sparkle(0.9, 20, 3000, 8000, 0.15), 0.18)
    return echo(rev(T.b, 0.3, 1.0, 6500, 45), 0.22, 0.35, 4, 3500, 0.35)
@sfx('events/forced-sacrifice-decisive-impact.wav', 1.3)
def _():
    T = Track(1.3, 0.6)
    T.add(0, riser(0.25, 300, 3000, 1.2), 0.3)
    T.add(0.25, boom(1.0, 150, 36, 0.45, 1.0, 0.9), 1.1)
    T.add(0.25, bp(noise(0.7), 300, 6000) * env(N(0.7), .001, .15), 0.7)
    T.add(0.25, sat(fmtone(sweep(800, 80, 0.6), 0.6, 1.7, 5, 0.3, 0.2), 2), 0.45)
    T.add(0.25, bell(110, 1.0, 0.8), 0.25)
    return rev(T.b, 0.3, 0.9, 4500, 46)
@sfx('events/game-master-intervention-warning-surge.wav', 1.6)
def _():
    T = Track(1.6, 0.6)
    n = N(1.4); t = np.linspace(0, 1, n)
    f = sweep(70, 260, 1.4)
    T.add(0, svf(saw(f) + saw(f * 1.007), 200 + 2800 * t ** 2, 1.4, 'lp') * t ** 1.3, 0.5)
    T.add(0, sat(ring(fmtone(sweep(140, 520, 1.4), 1.4, 1, 0, 3, 0.01), 7 + 18 * t[0]), 1.4) * t ** 1.6, 0.3)
    T.add(0, lp(noise(1.4), 150) * t ** 1.5, 1.2)
    T.add(0, riser(1.4, 400, 9000, 2.4), 0.3)
    T.add(1.35, boom(0.6, 120, 40, 0.3, 0.7, 0.6), 1.0)
    T.add(1.35, bell(147, 1.2, 0.9), 0.3); T.add(1.35, nburst(0.4, 0.15, 800, 7000), 0.4)
    return rev(T.b, 0.28, 0.9, 5000, 47)
@sfx('events/crazy-round-start-chaotic-burst.wav', 1.25)
def _():
    T = Track(1.25, 0.5)
    for i in range(12):
        f = R.choice([220, 277, 330, 415, 554, 740, 988, 1318]); T.add(i * 0.045, fmtone(f, 0.12, R.uniform(1.5, 3.5), 3, 0.06, 0.001, 0.03), 0.3, pan=R.uniform(-0.8, 0.8))
    T.add(0, riser(0.55, 400, 8000, 1.5), 0.35)
    T.add(0.55, boom(0.6, 190, 48, 0.25, 0.9, 0.6), 1.0)
    T.add(0.55, bp(noise(0.6), 400, 8000) * env(N(0.6), .001, .2), 0.55)
    T.add(0.55, sat(ring(saw(np.full(N(0.7), 311.0)), 233 * 1.3), 2.2) * env(N(0.7), .002, .3), 0.35)
    T.add(0.6, sparkle(0.6, 30, 2500, 8000, 0.12), 0.25)
    return rev(T.b, 0.25, 0.7, 6500, 48)
# --- new events ---
@sfx('events/gm-decree-gong.wav', 2.8, True, 1.0, 0.25)
def _():
    T = Track(2.8, 1.0)
    g = np.zeros(N(2.8))
    for r, a, tau in [(1, 1, 2.2), (1.47, .6, 1.8), (2.02, .5, 1.5), (2.43, .35, 1.3), (3.11, .3, 1.0), (3.8, .2, .8), (5.2, .12, .5)]:
        tm = tt(2.8); f = 82 * r
        g += a * np.sin(2 * np.pi * f * tm * (1 + 0.0015 * np.sin(2 * np.pi * (3.3 + r) * tm)) + R.uniform(0, 6)) * np.exp(-tm / tau) * np.minimum(tm / 0.01, 1)
    T.add(0, g, 0.7)
    T.add(0, boom(1.2, 90, 36, 0.5, 0.6, 0.3), 0.9)
    T.add(0, bp(noise(0.5), 600, 5000) * env(N(0.5), .001, .1), 0.4)
    for i, n in enumerate((43, 50, 55, 58)):
        T.add(0.15, choir(midi(n), 2.5, 'oh' if i % 2 else 'ah', 5) * adsr(2.5, .8, .5, .8, 1.0), 0.3, pan=-0.4 + 0.27 * i)
    T.add(0, lp(noise(2.0), 100) * bell_env(N(2.0), 1.0), 0.8)
    return rev(T.b, 0.4, 2.0, 5000, 50)
@sfx('events/gm-telegraph-rumble.wav', 1.6)
def _():
    T = Track(1.6, 0.8); n = N(1.6); t = np.linspace(0, 1, n)
    T.add(0, svf(noise(1.6), 90 + 120 * t, 0.8, "lp") * (0.2 + t ** 1.5), 1.6)
    f = sweep(46, 70, 1.6); T.add(0, np.sin(ph(f)) * (0.3 + 0.7 * t), 0.9)
    T.add(0, sat(np.sin(ph(f * 2)) * (1 + 0.6 * np.sin(2 * np.pi * (5 + 8 * t) * tt(1.6))), 1.2) * t ** 1.2, 0.5)
    pad = sum(saw(np.full(n, midi(m)) * (1 + dt), 14) for m in (38, 45, 46) for dt in (-0.006, 0.006))
    T.add(0, svf(pad, 150 + 900 * t ** 2, 1.2, 'lp') * t ** 1.5, 0.35)
    T.add(0.7, whoosh(0.9, 200, 1800, 1.5, 1.4, 0.8), 0.25)
    for i, t0 in enumerate((0.9, 1.15, 1.35)): T.add(t0, boom(0.25, 90, 45, 0.1, 0.1, 0.1), 0.25 + 0.15 * i)
    return rev(T.b, 0.3, 0.9, 3500, 51)
@sfx('events/crazy-round-siren.wav', 1.8)
def _():
    T = Track(1.8, 0.7)
    n = N(1.1); t = np.linspace(0, 1, n)
    wob = 600 + 500 * np.sin(2 * np.pi * (3 + 6 * t) * np.arange(n) / SR) + 900 * t
    s = lp(square(wob) , 3500) * (0.3 + 0.7 * t)
    T.add(0, s, 0.35, pan=-0.3); T.add(0.02, lp(saw(wob * 1.5), 3000) * t, 0.2, pan=0.3)
    for i in range(18):
        f = R.choice([262, 330, 392, 523, 659, 784, 1047, 1318, 1568]); T.add(0.1 + i * 0.05, fmtone(f, 0.15, R.uniform(1.5, 3.5), 3, 0.08, 0.001, 0.04), 0.22, pan=R.uniform(-0.9, 0.9))
    T.add(0, riser(1.1, 300, 9000, 1.8), 0.4)
    T.add(1.1, boom(0.7, 190, 42, 0.3, 1.0, 0.7), 1.1)
    T.add(1.1, bp(noise(0.7), 300, 8000) * env(N(0.7), .001, .25), 0.6)
    T.add(1.1, sat(ring(saw(np.full(N(0.7), 220.0)), 311), 2.5) * env(N(0.7), .002, .3), 0.35)
    T.add(1.12, sparkle(0.7, 30, 2500, 8000, 0.15), 0.25)
    return rev(T.b, 0.25, 0.8, 6000, 52)
@sfx('events/draft-pick-chime.wav', 0.6)
def _():
    T = Track(0.6, 0.4)
    T.add(0, bell(midi(81), 0.5, 0.3), 0.55); T.add(0.09, bell(midi(88), 0.5, 0.32), 0.5, pan=0.2)
    T.add(0, fmtone(midi(69), 0.3, 2.0, 1.5, 0.12, 0.002), 0.3); T.add(0, boom(0.12, 200, 100, 0.04, 0.1, 0.1), 0.3)
    T.add(0.05, sparkle(0.4, 8, 4000, 8000, 0.07), 0.15)
    return rev(T.b, 0.22, 0.5, 7000, 53)
@sfx('events/auction-bid-tick.wav', 0.25)
def _():
    T = Track(0.25, 0.15)
    T.add(0, hp(noise(0.01), 3500) * env(N(0.01), .0004, .003), 0.5)
    T.add(0, fmtone(1568, 0.15, 3.0, 2.0, 0.05, 0.0008, 0.02), 0.6); T.add(0, boom(0.06, 300, 150, 0.015, 0.0, 0.0), 0.3)
    T.add(0.07, bell(2093, 0.15, 0.06), 0.3)
    return rev(T.b, 0.12, 0.25, 6000, 54)
@sfx('events/auction-reveal-hit.wav', 0.9)
def _():
    T = Track(0.9, 0.5)
    T.add(0, whoosh(0.15, 800, 5000, 1.3, 1.0, 0.9), 0.35)
    T.add(0.14, boom(0.7, 150, 50, 0.25, 0.8, 0.5), 1.0)
    T.add(0.14, bp(noise(0.3), 500, 7000) * env(N(0.3), .001, .08), 0.5)
    for n in (74, 81, 86): T.add(0.14, bell(midi(n), 0.7, 0.45), 0.3)
    T.add(0.14, sparkle(0.6, 18, 3000, 8000, 0.1), 0.2)
    T.add(0.14, fmtone(sweep(500, 1000, 0.3), 0.3, 2, 2, 0.1, 0.05), 0.2)
    return rev(T.b, 0.28, 0.7, 6500, 55)
@sfx('events/training-powerup.wav', 1.25)
def _():
    T = Track(1.25, 0.5); n = N(0.95)
    for k, (a, b) in enumerate(((110, 440), (165, 660), (220, 880))):
        f = sweep(a, b, 0.95); T.add(0, svf(saw(f * (1 + 0.003 * k)), np.linspace(400, 4500, n), 1.2, 'lp') * np.linspace(0.3, 1, n), 0.25, pan=-0.4 + 0.4 * k)
    T.add(0, fmtone(sweep(440, 1760, 0.95), 0.95, 2.0, 3, 1.0, 0.5), 0.25)
    T.add(0, riser(0.95, 400, 8000, 1.8), 0.3)
    for i in range(6): T.add(0.1 + i * 0.14, boom(0.1, 150 + 20 * i, 80, 0.04, 0.1, 0.05), 0.2 + 0.05 * i)
    T.add(0.93, boom(0.3, 170, 55, 0.14, 0.5, 0.4), 0.8)
    for nn in (72, 79, 84, 88): T.add(0.93, bell(midi(nn), 0.6, 0.4), 0.28)
    T.add(0.93, sparkle(0.3, 14, 3500, 8000, 0.1), 0.2)
    return rev(T.b, 0.25, 0.6, 6500, 56)
@sfx('events/bounty-mark-sting.wav', 1.2)
def _():
    T = Track(1.2, 0.5)
    for i, (t0, n) in enumerate(((0, 57), (0.16, 56))): T.add(t0, lp(saw(np.full(N(0.5), midi(n))) + saw(np.full(N(0.5), midi(n)) * 1.006), 900) * adsr(0.5, .01, .15, .5, .2), 0.5)
    T.add(0.35, fmtone(sweep(2200, 1100, 0.15), 0.15, 2, 2, 0.08, 0.001), 0.3)
    for i in range(3): T.add(0.45 + i * 0.12, fmtone(1760, 0.1, 3, 2, 0.04, 0.001, 0.02) , 0.4, pan=0.5)
    T.add(0.82, boom(0.38, 120, 42, 0.18, 0.6, 0.4), 1.0)
    T.add(0.82, sat(ring(saw(np.full(N(0.5), 110.0)), 164), 2) * env(N(0.5), .003, .25), 0.4)
    T.add(0.82, bell(880, 0.4, 0.3), 0.2)
    T.add(0, lp(noise(0.8), 200) * np.linspace(0.2, 1, N(0.8)), 0.8)
    return rev(T.b, 0.28, 0.7, 4500, 57)
@sfx('events/time-chamber-warp.wav', 1.8)
def _():
    T = Track(1.8, 0.8); n = N(1.7)
    T.add(0, whoosh(1.7, 300, 5000, 2.0, 1.2, 0.35), 0.5, pan=-0.4)
    T.add(0, whoosh(1.7, 5000, 250, 2.0, 1.2, 0.65), 0.5, pan=0.4)
    f = 300 * (1 + 0.5 * np.sin(2 * np.pi * 0.9 * np.arange(n) / SR))
    T.add(0, sat(fmtone(f, 1.7, 3.0, 4, 2.0, 0.2, 1.0) * bell_env(n, 1.0), 1.4), 0.3)
    T.add(0, ring(lp(noise(1.7), 1500), 7 + 0 * 1) * bell_env(n, 1.2), 0.2)
    for i in range(8): T.add(0.2 + i * 0.17, bell(R.choice([523, 659, 784, 1047, 1319]) * (1 + 0.01 * i), 0.5, 0.3), 0.15 * np.sin(np.pi * i / 8) + 0.03, pan=R.uniform(-0.8, 0.8))
    T.add(1.5, boom(0.3, 120, 50, 0.12, 0.3, 0.2), 0.5)
    return echo(rev(T.b, 0.35, 1.2, 6000, 58), 0.25, 0.4, 4, 3000, 0.4)
@sfx('events/wish-round-glow.wav', 1.4)
def _():
    T = Track(1.4, 0.8)
    for i, n in enumerate((84, 88, 91, 95, 96, 100, 103)):
        T.add(0.05 + i * 0.09, bell(midi(n), 0.9, 0.5), 0.28, pan=-0.6 + 0.2 * i)
    pad = sum(saw(np.full(N(1.3), midi(n)) * (1 + dt), 12) for n in (60, 67, 72, 76) for dt in (-0.004, 0.004))
    T.add(0, lp(pad, 2200) * adsr(1.3, .4, .3, .6, .5), 0.2)
    T.add(0, sparkle(1.3, 50, 3000, 9000, 0.2, 0.7), 0.25)
    T.add(0, fmtone(sweep(500, 1500, 0.5), 0.5, 1.0, 0.5, 0.5, 0.3), 0.25)
    T.add(0.7, boom(0.2, 130, 60, 0.1, 0.1, 0.1), 0.35)
    return echo(rev(T.b, 0.35, 1.2, 8000, 59), 0.19, 0.4, 4, 5000, 0.45)
@sfx('events/total-might-balance-chime.wav', 1.2)
def _():
    T = Track(1.2, 0.8)
    n = N(0.6); a = fmtone(sweep(330, 495, 0.6), 0.6, 2.0, 0.8, 1.2, 0.05, 0.4); b = fmtone(sweep(990, 495, 0.6), 0.6, 2.0, 0.8, 1.2, 0.05, 0.4)
    T.add(0, a, 0.45, pan=-0.6); T.add(0, b, 0.45, pan=0.6)
    T.add(0, whoosh(0.6, 700, 2500, 2, 1.0, 0.8), 0.2)
    T.add(0.6, bell(495, 1.0, 0.8), 0.5); T.add(0.6, bell(990, 0.9, 0.6), 0.3); T.add(0.6, bell(1485, 0.8, 0.5), 0.2)
    T.add(0.6, boom(0.25, 120, 60, 0.1, 0.2, 0.1), 0.4); T.add(0.6, sparkle(0.6, 16, 3500, 8000, 0.15), 0.18)
    return rev(T.b, 0.3, 0.9, 7000, 60)
@sfx('events/backwards-rewind.wav', 1.4)
def _():
    T = Track(1.4, 0.5)
    # reverse-sweep: a reversed cymbal/impact plus tape-style descending pitch with wobble
    imp = boom(0.7, 150, 50, 0.3, 0.8, 0.8) + bp(noise(0.7), 600, 7000) * env(N(0.7), .001, .2)
    T.add(0.55, imp[::-1].copy(), 0.8)
    n = N(1.0); t = np.linspace(0, 1, n)
    f = 1800 * (150 / 1800) ** t
    f = f * (1 + 0.03 * np.sin(2 * np.pi * 9 * np.arange(n) / SR))
    T.add(0, lp(square(f) , 4000) * (1 - t) ** 0.5 * 0.7, 0.35, pan=0.2)
    T.add(0, whoosh(1.0, 4500, 300, 1.8, 1.0, 0.3), 0.4)
    for i in range(10): T.add(i * 0.09, hp(noise(0.02), 3000) * env(N(0.02), .0005, .006), 0.25 * (1 - i / 12), pan=R.uniform(-.5, .5))
    T.add(1.1, fmtone(sweep(300, 600, 0.2), 0.2, 2, 1, 0.1, 0.002), 0.35)
    return rev(T.b, 0.22, 0.5, 5500, 61)
@sfx('events/side-quest-fanfare.wav', 1.2)
def _():
    T = Track(1.2, 0.8)
    def brass(n, at, d, g=0.3):
        f = np.full(N(d), float(midi(n)))
        x = saw(vib(f, d, 5.5, 0.004, 0.1) * 1.003) + saw(f * 0.997)
        x = svf(x, 500 + 3000 * np.minimum(np.arange(N(d)) / SR / 0.07, 1), 1.0, 'lp') * adsr(d, .015, .12, .8, min(.1, d * .5))
        T.add(at, x, g, pan=0)
    for n_, at, d in ((67, 0, 0.2), (72, 0.2, 0.2), (76, 0.4, 0.2), (79, 0.6, 0.65)):
        brass(n_, at, d, 0.35); brass(n_ - 12, at, d, 0.25)
    for n_ in (64, 67, 72): brass(n_, 0.6, 0.65, 0.2)
    for at in (0, 0.2, 0.4): T.add(at, boom(0.15, 150, 70, 0.05, 0.2, 0.1), 0.45)
    T.add(0.6, boom(0.5, 130, 45, 0.2, 0.5, 0.3), 0.8)
    T.add(0.6, bell(midi(91), 0.6, 0.4), 0.2); T.add(0.6, sparkle(0.5, 14, 3000, 8000, 0.1), 0.15)
    T.add(0.6, nburst(0.3, 0.1, 1000, 6000), 0.25)
    return rev(T.b, 0.28, 0.9, 6000, 62)

# ---------------- MATCH ----------------
@sfx('match/countdown-match-ready-three-beats.wav', 1.7)
def _():
    T = Track(1.7, 0.6)
    for i, t0 in enumerate((0, 0.45, 0.9)):
        T.add(t0, boom(0.2, 160, 70, 0.07, 0.3, 0.2), 0.6)
        T.add(t0, fmtone(659, 0.3, 2.0, 1.5, 0.12, 0.002, 0.05), 0.5); T.add(t0, bell(1318, 0.25, 0.12), 0.2)
    T.add(1.35, boom(0.35, 180, 55, 0.14, 0.5, 0.3), 0.9)
    for n in (79, 84, 88): T.add(1.35, bell(midi(n), 0.35, 0.25), 0.3)
    T.add(1.35, fmtone(sweep(440, 880, 0.3), 0.3, 2, 2, 0.2, 0.1), 0.35); T.add(1.35, nburst(0.25, 0.08, 1000, 7000), 0.3)
    return rev(T.b, 0.25, 0.7, 6500, 70)
@sfx('match/defeat-descending-energy-fade.wav', 3.0, True, 1.0, 0.2)
def _():
    T = Track(3.0, 1.0)
    for i, n in enumerate((69, 65, 62, 57)):
        d = 0.9; f = np.full(N(d), float(midi(n)))
        x = lp(saw(f * 1.004) + saw(f * 0.996), 1200) * adsr(d, .04, .3, .6, .4); T.add(i * 0.4, x, 0.3, pan=-0.2 + 0.13 * i)
    T.add(0, fmtone(sweep(700, 70, 2.2), 2.2, 2, 3, 2.0, 1.0) * np.linspace(1, 0.1, N(2.2)), 0.45)
    T.add(0.0, whoosh(2.2, 4000, 150, 1.4, 1.0, 0.3), 0.3)
    T.add(1.4, boom(1.4, 90, 34, 0.6, 0.3, 0.3), 0.9)
    T.add(1.4, bell(110, 1.5, 1.1), 0.25)
    T.add(0.4, lp(noise(2.0), 400) * bell_env(N(2.0), 1.2), 0.25)
    return rev(T.b, 0.35, 1.4, 4000, 71)
@sfx('match/game-over-final-results-transition.wav', 3.0, True, 1.0, 0.2)
def _():
    T = Track(3.0, 1.0)
    T.add(0, whoosh(0.8, 500, 4000, 1.4, 1.2, 0.6), 0.4)
    for i, n in enumerate((62, 69, 74, 77, 81)): T.add(0.3 + i * 0.12, bell(midi(n), 1.5, 1.0), 0.35, pan=-0.5 + 0.25 * i)
    pad = sum(saw(np.full(N(2.6), midi(n)) * (1 + dt), 14) for n in (38, 50, 57, 62, 65) for dt in (-0.005, 0.005))
    T.add(0.2, svf(pad, np.linspace(300, 1600, N(2.6)), 1.0, 'lp') * adsr(2.6, .6, .6, .6, 1.2), 0.3)
    T.add(0.3, boom(0.8, 110, 40, 0.4, 0.4, 0.3), 0.8)
    T.add(0.5, sparkle(2.2, 30, 3000, 8000, 0.25), 0.15)
    return echo(rev(T.b, 0.35, 1.6, 6500, 72), 0.3, 0.35, 4, 3500, 0.35)
@sfx('match/last-two-players-endgame-tension.wav', 2.5, True, 1.0, 0.2)
def _():
    T = Track(2.5, 0.8)
    for i, t0 in enumerate((0, 0.55, 1.1, 1.65)):
        T.add(t0, boom(0.45, 110 + 10 * i, 44, 0.2, 0.5, 0.3), 0.7 + 0.1 * i)
        T.add(t0, bell(midi(57 + (i % 2)), 0.7, 0.5), 0.15 + 0.05 * i)
    pad = sum(saw(np.full(N(2.4), midi(n)) * (1 + dt), 12) for n in (45, 52, 57, 58) for dt in (-0.006, 0.006))
    T.add(0, svf(pad, np.linspace(250, 1600, N(2.4)), 1.2, 'lp') * adsr(2.4, 1.2, .3, .8, .5), 0.35)
    T.add(0.6, riser(1.8, 300, 8000, 2.0), 0.25)
    T.add(1.9, fmtone(sweep(440, 1760, 0.4), 0.4, 2, 2, 0.4, 0.2), 0.25)
    T.add(1.9, sparkle(0.5, 10, 3500, 8000, 0.1), 0.15)
    return rev(T.b, 0.3, 1.0, 4500, 73)
@sfx('match/match-start-arena-energy.wav', 2.4, True, 1.0, 0.2)
def _():
    T = Track(2.4, 0.8); n = N(1.4)
    T.add(0, svf(saw(sweep(60, 330, 1.4)), np.linspace(200, 5500, n), 1.3, 'lp') * np.linspace(0.2, 1, n), 0.45)
    T.add(0, riser(1.4, 300, 9000, 2.0), 0.35); T.add(0, lp(noise(1.4), 110) * np.linspace(0.1, 1, n), 1.0)
    for i, t0 in enumerate((0.7, 0.95, 1.15, 1.3)): T.add(t0, boom(0.2, 160, 70, 0.07, 0.3, 0.2), 0.4 + 0.1 * i)
    T.add(1.4, boom(1.0, 160, 38, 0.5, 0.9, 0.8), 1.1)
    T.add(1.4, bp(noise(0.8), 400, 8000) * env(N(0.8), .001, .2), 0.55)
    for nn in (62, 69, 74, 78): T.add(1.4, lp(saw(np.full(N(0.9), midi(nn)) * 1.004) + saw(np.full(N(0.9), midi(nn)) * 0.996), 3000) * adsr(0.9, .01, .2, .6, .4), 0.2)
    T.add(1.4, bell(midi(86), 0.9, 0.6), 0.25); T.add(1.4, sparkle(0.9, 30, 3000, 8000, 0.15), 0.2)
    return rev(T.b, 0.3, 1.0, 6500, 74)
@sfx('match/player-elimination-defeat-impact.wav', 1.7, True, 1.0, 0.2)
def _():
    T = Track(1.7, 0.7)
    T.add(0, boom(1.3, 150, 34, 0.55, 1.0, 0.9), 1.1)
    T.add(0, bp(noise(0.7), 300, 5000) * env(N(0.7), .001, .15), 0.6)
    T.add(0, sat(fmtone(sweep(900, 60, 1.0), 1.0, 1.7, 5, 0.5, 0.3), 2), 0.4)
    T.add(0.1, whoosh(1.0, 4000, 150, 1.3, 1.0, 0.2), 0.3)
    T.add(0.15, bell(98, 1.4, 1.0), 0.3); T.add(0.15, bell(147, 1.2, 0.8), 0.2)
    T.add(0.5, lp(noise(1.0), 600) * env(N(1.0), .05, .35), 0.2)
    return rev(T.b, 0.32, 1.0, 4000, 75)
@sfx('match/round-start-combat-ready.wav', 1.5, True, 1.0, 0.15)
def _():
    T = Track(1.5, 0.5)
    T.add(0, whoosh(0.4, 400, 5500, 1.4, 1.3, 0.8), 0.45)
    T.add(0.3, boom(0.8, 160, 45, 0.3, 0.8, 0.6), 1.0)
    for n_ in (62, 69, 74): T.add(0.3, lp(saw(np.full(N(0.7), midi(n_)) * 1.004) + saw(np.full(N(0.7), midi(n_)) * 0.996), 2800) * adsr(0.7, .01, .15, .6, .3), 0.2)
    T.add(0.3, bell(midi(86), 0.8, 0.5), 0.3); T.add(0.3, nburst(0.4, 0.12, 800, 7000), 0.4)
    T.add(0.3, fmtone(sweep(440, 880, 0.2), 0.3, 2, 2, 0.2, 0.1), 0.25); T.add(0.3, sparkle(0.6, 16, 3000, 8000, 0.1), 0.18)
    return rev(T.b, 0.25, 0.6, 6000, 76)
@sfx('match/victory-triumphant-energy-fanfare.wav', 3.6, True, 1.0, 0.25)
def _():
    T = Track(3.6, 1.2)
    def brass(n, at, d, g=0.28):
        f = np.full(N(d), float(midi(n))); x = saw(vib(f, d, 5.5, 0.004, 0.2) * 1.003) + saw(f * 0.997)
        x = svf(x, 500 + 3500 * np.minimum(np.arange(N(d)) / SR / 0.08, 1), 1.0, 'lp') * adsr(d, .02, .15, .8, min(.2, d / 2)); T.add(at, x, g)
    mel = [(67, 0, 0.3), (72, 0.3, 0.3), (76, 0.6, 0.3), (79, 0.9, 0.5), (76, 1.4, 0.25), (79, 1.65, 0.25), (84, 1.9, 1.5)]
    for n_, at, d in mel: brass(n_, at, d); brass(n_ - 12, at, d, 0.22)
    for n_ in (64, 67, 72): brass(n_, 1.9, 1.5, 0.15)
    for at in (0, 0.3, 0.6, 0.9, 1.4, 1.65): T.add(at, boom(0.2, 150, 65, 0.06, 0.3, 0.1), 0.55)
    T.add(1.9, boom(1.0, 130, 40, 0.4, 0.8, 0.6), 1.0)
    T.add(1.9, nburst(0.8, 0.25, 800, 7000), 0.4)
    for nn in (84, 88, 91, 96): T.add(1.9, bell(midi(nn), 1.6, 1.2), 0.2)
    T.add(1.9, sparkle(1.6, 50, 3000, 8500, 0.25), 0.25)
    pad = sum(saw(np.full(N(1.7), midi(n)) * (1 + dt), 12) for n in (48, 55, 60, 64) for dt in (-0.005, 0.005))
    T.add(1.9, lp(pad, 2000) * adsr(1.7, .1, .4, .7, .8), 0.18)
    return rev(T.b, 0.32, 1.4, 7000, 77)
@sfx('match/last-stand-heartbeat.wav', 2.0, True, 1.0, 0.2)
def _():
    T = Track(2.0, 0.8)
    for t0, g in ((0.0, 1.0), (0.26, 0.75), (0.95, 1.0), (1.21, 0.75)):
        T.add(t0, boom(0.3, 80, 42, 0.1, 0.1, 0.5), g)
        T.add(t0, np.sin(ph(np.full(N(0.2), 60.0))) * env(N(0.2), .004, .06), 0.5 * g)
    n = N(0.9); f = sweep(300, 1800, 0.9)
    T.add(1.55, fmtone(f, 0.9, 2.0, 2.0, 0.6, 0.15, 0.4), 0.3)
    T.add(1.55, riser(0.45, 500, 7000, 1.6), 0.25)
    T.add(1.9, bell(2093, 0.9, 0.7), 0.3)
    T.add(1.9, sparkle(0.6, 12, 4000, 8500, 0.1), 0.15)
    T.add(0, lp(noise(2.0), 180) * 0.07, 1.0)
    return rev(T.b, 0.25, 0.8, 4500, 78)

# ---------------- WILDCARDS ----------------
@sfx('wildcards/wildcard-activation-mystic-surge.wav', 1.4)
def _():
    T = Track(1.4, 0.7)
    T.add(0, fmtone(sweep(200, 1200, 0.6), 0.6, 2.01, 3, 0.6, 0.3) * bell_env(N(0.6), 0.4), 0.4)
    T.add(0, whoosh(0.6, 400, 6000, 1.5, 1.2, 0.8), 0.4)
    T.add(0.55, boom(0.6, 150, 50, 0.25, 0.6, 0.5), 0.9)
    for n_ in (69, 76, 81, 88): T.add(0.55, bell(midi(n_), 0.9, 0.6), 0.3, pan=R.uniform(-0.5, 0.5))
    T.add(0.55, sparkle(0.8, 30, 3000, 9000, 0.15), 0.25)
    T.add(0.55, sat(ring(saw(np.full(N(0.6), 220.0)), 330), 1.8) * env(N(0.6), .005, .2), 0.25)
    return echo(rev(T.b, 0.3, 0.9, 7000, 80), 0.16, 0.35, 3, 4000, 0.35)
@sfx('wildcards/senzu-healing-restoration-burst.wav', 1.3)
def _():
    T = Track(1.3, 0.7)
    T.add(0, boom(0.12, 220, 100, 0.04, 0.2, 0.1), 0.4)
    for i, n in enumerate((67, 71, 74, 79, 83)): T.add(0.04 + i * 0.1, fmtone(midi(n), 0.7, 1.0, 0.6, 0.4, 0.01, 0.2), 0.4, pan=-0.4 + 0.2 * i)
    pad = sum(saw(np.full(N(1.2), midi(n)) * (1 + dt), 12) for n in (55, 62, 67, 71) for dt in (-0.004, 0.004))
    T.add(0, lp(pad, 1800) * adsr(1.2, .3, .3, .6, .5), 0.18)
    T.add(0.4, whoosh(0.7, 800, 6000, 1.2, 1.2, 0.5), 0.2)
    T.add(0.2, sparkle(1.0, 36, 3500, 8500, 0.15), 0.22); T.add(0.4, bell(midi(95), 0.8, 0.5), 0.2)
    return rev(T.b, 0.3, 0.9, 7000, 81)
@sfx('wildcards/final-atonement-sacrifice-explosion.wav', 1.9, True, 1.0, 0.25)
def _():
    T = Track(1.9, 0.8)
    T.add(0, riser(0.5, 300, 7000, 1.5), 0.4); T.add(0, fmtone(sweep(100, 600, 0.5), 0.5, 2, 3, 0.5, 0.3), 0.3)
    T.add(0.5, boom(1.4, 160, 32, 0.6, 1.0, 1.0), 1.2)
    T.add(0.5, bp(noise(1.0), 200, 6000) * env(N(1.0), .001, .3), 0.8)
    T.add(0.5, sat(fmtone(sweep(900, 50, 1.0), 1.0, 1.7, 5, 0.5, 0.3), 2.2), 0.4)
    T.add(0.5, bell(110, 1.4, 1.0), 0.3)
    for n_ in (86, 91, 95): T.add(0.9, bell(midi(n_), 1.0, 0.7), 0.15)
    T.add(0.7, sparkle(1.0, 24, 3000, 8000, 0.2), 0.2)
    return rev(T.b, 0.35, 1.2, 5500, 82)
@sfx('wildcards/mafuba-capture-sealing-vortex.wav', 1.6)
def _():
    T = Track(1.6, 0.7); n = N(1.2); t = np.linspace(0, 1, n)
    f = 200 * (1 + 3 * t) * (1 + 0.04 * np.sin(2 * np.pi * (5 + 20 * t) * np.arange(n) / SR))
    T.add(0, svf(saw(f), 400 + 3000 * t, 2.0, 'lp') * np.sin(np.pi * t) ** 0.8, 0.4)
    T.add(0, whoosh(1.2, 500, 5000, 2.5, 1.0, 0.5), 0.4, pan=-0.5); T.add(0, whoosh(1.2, 4500, 400, 2.5, 1.0, 0.5), 0.4, pan=0.5)
    T.add(0, sat(ring(lp(noise(1.2), 2000), 30 + 200 * t[0]), 1.5) * np.sin(np.pi * t), 0.3)
    T.add(1.15, boom(0.4, 130, 50, 0.15, 0.5, 0.3), 0.9); T.add(1.15, bell(165, 0.5, 0.4), 0.3)
    T.add(1.15, sealtone(0.4, 110), 0.5)
    return rev(T.b, 0.28, 0.7, 5000, 83)
@sfx('wildcards/scouter-lock-on-scan-beep.wav', 1.1)
def _():
    T = Track(1.1, 0.4)
    for i, t0 in enumerate((0, 0.13, 0.26)): T.add(t0, fmtone(1760 * (1 + 0.12 * i), 0.1, 2.0, 1.5, 0.04, 0.001, 0.02) , 0.4, pan=0.3)
    T.add(0, whoosh(0.5, 2500, 7000, 3.0, 1.0, 0.6), 0.25)
    for i, t0 in enumerate((0.55, 0.7, 0.85)): T.add(t0, hp(square(np.full(N(0.09), 2093.0)), 1200) * adsr(0.09, .001, .03, .5, .02), 0.3, pan=0.3)
    T.add(0.85, fmtone(2349, 0.2, 2, 1, 0.15, 0.001), 0.3)
    T.add(0.9, boom(0.15, 200, 100, 0.04, 0.1, 0.1), 0.3)
    return rev(T.b, 0.18, 0.35, 7000, 84)
@sfx('wildcards/solar-flare-blinding-burst.wav', 1.3)
def _():
    T = Track(1.3, 0.5)
    T.add(0, riser(0.35, 1000, 9000, 1.2), 0.35)
    T.add(0.33, bp(noise(0.9), 1500, 9000) * env(N(0.9), .001, .18), 0.7)
    T.add(0.33, boom(0.6, 160, 50, 0.25, 0.5, 0.4), 0.9)
    T.add(0.33, fmtone(sweep(2000, 800, 0.9), 0.9, 2, 3, 0.5, 0.2), 0.3)
    for n_ in (88, 95, 100): T.add(0.33, bell(midi(n_), 1.0, 0.8), 0.18)
    T.add(0.33, sparkle(0.9, 36, 3000, 8000, 0.2), 0.2)
    return rev(T.b, 0.3, 0.8, 8000, 85)
@sfx('wildcards/domain-inversion-other-world-shift.wav', 1.7)
def _():
    T = Track(1.7, 0.8); n = N(1.5)
    T.add(0, whoosh(1.5, 300, 4000, 2.0, 1.2, 0.35), 0.4, pan=-0.5); T.add(0, whoosh(1.5, 4000, 300, 2.0, 1.2, 0.65), 0.4, pan=0.5)
    f = sweep(400, 100, 1.5)
    T.add(0, sat(fmtone(f, 1.5, 1.41, 4, 1.5, 0.3, 0.8), 1.4), 0.3)
    T.add(0, fmtone(sweep(100, 400, 1.5), 1.5, 1.41, 4, 1.5, 0.3, 0.8), 0.25)
    T.add(0.3, ring(lp(noise(1.2), 1200), 41) * bell_env(N(1.2), 1.0), 0.25)
    for i, n_ in enumerate((60, 63, 66, 69)): T.add(1.0 + i * 0.05, bell(midi(n_ + 12), 0.8, 0.6), 0.15)
    T.add(1.0, boom(0.5, 100, 40, 0.2, 0.3, 0.3), 0.7)
    return echo(rev(T.b, 0.35, 1.2, 5500, 86), 0.2, 0.4, 4, 3500, 0.4)
@sfx('wildcards/curse-reveal-destruction-transfer.wav', 1.3)
def _():
    T = Track(1.3, 0.6)
    T.add(0, lp(saw(np.full(N(0.7), 55.0)) + saw(np.full(N(0.7), 58.3)), 600) * adsr(0.7, .1, .2, .7, .3), 0.5)
    T.add(0, sat(ring(fmtone(sweep(220, 110, 0.6), 0.6, 1, 0, 1.0, 0.01), 77), 1.8), 0.4)
    T.add(0, whoosh(0.5, 3000, 200, 1.5, 1.0, 0.3), 0.3)
    T.add(0.5, boom(0.7, 120, 36, 0.35, 0.9, 0.6), 1.0)
    T.add(0.5, sat(fmtone(sweep(700, 90, 0.6), 0.6, 1.7, 5, 0.3, 0.2), 2.2), 0.4)
    T.add(0.5, bp(noise(0.4), 300, 5000) * env(N(0.4), .001, .12), 0.5)
    T.add(0.55, bell(233, 0.8, 0.6), 0.2); T.add(0.55, bell(247, 0.8, 0.6), 0.15)
    T.add(0.9, whoosh(0.35, 400, 3000, 1.5, 1.0, 0.7), 0.25, pan=0.6)
    return rev(T.b, 0.3, 0.8, 4500, 87)
@sfx('wildcards/shenron-interaction-summoning-cue.wav', 2.2, True, 1.0, 0.2)
def _():
    T = Track(2.2, 0.9)
    T.add(0, lp(noise(2.0), 130) * bell_env(N(2.0), 1.0), 0.9)
    for i, n_ in enumerate((38, 45, 50, 53)): T.add(0.1, choir(midi(n_), 1.9, 'oh', 4) * adsr(1.9, .6, .4, .8, .6), 0.25, pan=-0.4 + 0.27 * i)
    T.add(0, whoosh(1.2, 300, 3000, 1.5, 1.3, 0.7), 0.35)
    T.add(0.2, riser(1.2, 300, 6000, 1.8), 0.2)
    for t0 in (0.9, 1.2): T.add(t0, boom(0.5, 100, 36, 0.25, 0.3, 0.3), 0.7)
    T.add(1.3, bell(147, 1.6, 1.3), 0.35); T.add(1.3, bell(220, 1.4, 1.0), 0.25); T.add(1.3, sparkle(0.9, 24, 2500, 7000, 0.2), 0.2)
    T.add(0.2, ring(lp(noise(1.5), 800), 11) * bell_env(N(1.5), 1.0), 0.2)
    return rev(T.b, 0.38, 1.4, 5000, 88)
@sfx('wildcards/shenrons-wish-granted-chime.wav', 2.0, True, 1.0, 0.2)
def _():
    T = Track(2.0, 1.0)
    for i, n_ in enumerate((72, 76, 79, 84, 88, 91, 96)): T.add(i * 0.1, bell(midi(n_), 1.3, 0.9), 0.35, pan=-0.6 + 0.2 * i)
    T.add(0.6, boom(0.4, 120, 55, 0.18, 0.3, 0.2), 0.5)
    for i, n_ in enumerate((48, 55, 60, 64, 67)): T.add(0.5, choir(midi(n_), 1.4, 'ah', 4, 5, 0.003) * adsr(1.4, .4, .4, .8, .6), 0.14, pan=-0.4 + 0.2 * i)
    T.add(0.4, sparkle(1.5, 60, 3000, 9000, 0.25), 0.25)
    T.add(0.6, nburst(0.5, 0.2, 1500, 7000), 0.2)
    return echo(rev(T.b, 0.38, 1.6, 8000, 89), 0.22, 0.4, 4, 5000, 0.4)
@sfx('wildcards/immortality-shield-blocked-damage.wav', 1.1)
def _():
    T = Track(1.1, 0.5)
    T.add(0, boom(0.5, 150, 60, 0.18, 0.9, 0.5), 0.95)
    T.add(0, bp(noise(0.1), 800, 6000) * env(N(0.1), .0005, .02), 0.6)
    for f in (523, 784, 1046, 1568): T.add(0.02, bell(f, 0.9, 0.5), 0.22)
    T.add(0.02, sat(ring(fmtone(sweep(500, 1500, 0.3), 0.3, 2, 2, 0.2, 0.002), 110), 1.5), 0.3)
    T.add(0.05, whoosh(0.7, 4500, 600, 1.5, 1.0, 0.2), 0.3)
    T.add(0.05, fmtone(330, 0.8, 1.0, 0, 0.6, 0.01) * (1 + 0.4 * np.sin(2 * np.pi * 14 * tt(0.8))), 0.2)
    T.add(0.1, sparkle(0.8, 24, 3000, 8000, 0.15), 0.22)
    return rev(T.b, 0.3, 0.7, 6500, 90)

def build(only=None):
    for name, (d, stereo, drive, fade, fn) in SFX.items():
        if only and not any(o in name for o in only): continue
        global R
        R = np.random.default_rng(SEED ^ zlib.crc32(name.encode()))   # per-file seed -> order independent
        b = fn(); finish(name, b, d, stereo, drive=drive, fade_out=fade)
        print(f'{name}: {d:.2f}s {"stereo" if stereo else "mono"}')

if __name__ == '__main__':
    build(sys.argv[1:] or None)
