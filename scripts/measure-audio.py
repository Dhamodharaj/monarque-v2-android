#!/usr/bin/env python3
"""Audio QA helper. `python3 scripts/measure-audio.py`          -> report (duration, peak, RMS, edges, loop seam)
                       `python3 scripts/measure-audio.py --gain` -> also rewrites src/utils/audioGain.json
Gain formula (reverse-engineered from the original table): gain = min(0.1 / R, 0.891 / peak), rounded down to 3 decimals, where
R = RMS over 50 ms windows that are within 30 dB of the loudest window (i.e. 'active' RMS, so a short hit with a long quiet tail is not
over-boosted), 0.1 = -20 dBFS reference, 0.891 = -1 dBFS peak ceiling after gain. Extra safety cap: gain <= 4."""
import os, sys, json, wave, glob
import numpy as np
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
AUD = os.path.join(ROOT, 'public', 'audio'); GAINF = os.path.join(ROOT, 'src', 'utils', 'audioGain.json')
LOOPS = ('music/', 'arenas/', 'menu-cinematic-ambient.wav')

def load(p):
    with wave.open(p) as w:
        ch, sr, n = w.getnchannels(), w.getframerate(), w.getnframes(); sw = w.getsampwidth()
        x = np.frombuffer(w.readframes(n), '<i2').astype(float) / 32768
    return x.reshape(-1, ch), sr, sw
def active_rms(x, sr):
    W = int(sr * 0.05); m = x.mean(1) if x.shape[1] == 1 else x; n = len(x) // W
    if n < 1: return np.sqrt(np.mean(x ** 2))
    fr = np.mean(x[:n * W].reshape(n, W, -1) ** 2, axis=(1, 2)); keep = fr > fr.max() * 10 ** (-30 / 10)
    return np.sqrt(fr[keep].mean())
def db(v): return 20 * np.log10(max(v, 1e-9))

def main():
    files = sorted(os.path.relpath(p, AUD) for p in glob.glob(os.path.join(AUD, '**', '*.wav'), recursive=True))
    gains = {}; tot = 0
    for f in files:
        x, sr, sw = load(os.path.join(AUD, f)); n = len(x); pk = np.abs(x).max(); R = active_rms(x, sr); full = np.sqrt(np.mean(x ** 2))
        g = min(0.1 / R, 0.891 / pk, 4.0); g = np.floor(g * 1000) / 1000; gains[f] = float(g)
        e = int(sr * 0.003); edge = max(np.abs(x[0]).max(), np.abs(x[-e:]).max())  # first sample and max of last 3 ms (the head has a 3 ms fade-in from 0)
        loop = f.startswith(LOOPS); seam = ''
        if loop:
            m = x.mean(1); jump = abs(m[0] - m[-1]); typ = np.median(np.abs(np.diff(m))) + 1e-9
            seam = f' seam_jump={jump:.5f} ({jump / typ:.1f}x median|diff|, {jump / (np.abs(np.diff(m)).max()+1e-9):.2f}x max|diff|)'
        dc = np.abs(x.mean(0)).max(); size = os.path.getsize(os.path.join(AUD, f)); tot += size
        print(f'{f:62s} {n / sr:6.2f}s {sr}Hz x{x.shape[1]} pk={db(pk):6.1f} rms={db(full):6.1f} act={db(R):6.1f} edge={edge:.4f} dc={dc:.4f} g={g:.3f} {size / 1e6:.2f}MB{seam}')
    print(f'TOTAL {tot / 1e6:.2f} MB, {len(files)} files')
    if '--gain' in sys.argv:
        with open(GAINF, 'w') as fh: json.dump(gains, fh, indent=1); fh.write('\n')
        print('wrote', GAINF)
if __name__ == '__main__': main()
