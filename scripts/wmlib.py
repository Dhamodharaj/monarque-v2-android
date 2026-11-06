"""Invisible, keyed watermark for images (numpy + Pillow only).

How it works: the picture is cut into 8x8 blocks; in each block a few mid-frequency DCT coefficients are nudged onto a
secret lattice (quantisation index modulation) that encodes ONE bit of a 64-bit owner code. Which block carries which bit,
and each block's lattice offset, come from a secret key, so without the key the mark can be neither found nor forged.
Every bit is repeated in hundreds of blocks and read back by soft majority vote, which is why it survives WebP/JPEG
re-compression, mild scaling and screenshots. It does not survive heavy cropping or a determined, key-aware attack.
"""
import hashlib, hmac, math
import numpy as np

OWNER_TEXT = b'owner:dhamo ss|MONARQUE: Cards of the Fallen'
BITS = 64
POS = ((1, 1), (1, 2), (2, 1), (2, 2), (1, 3), (3, 1))   # low/mid-frequency coefficients: invisible, yet they survive lossy coding and rescaling
DELTAS = (28.0, 38.0, 50.0)                      # lattice step: embed tries these in turn until the saved file reads back clean
MIN_MEAN, MAX_MEAN = 22.0, 235.0                 # skip near-black / near-white blocks (a pattern would show there or be clipped)

def _dct_matrix():
    c = np.zeros((8, 8))
    for k in range(8):
        for n in range(8):
            c[k, n] = math.sqrt((1 if k else 0.5) * 2 / 8) * math.cos((2 * n + 1) * k * math.pi / 16)
    return c
C = _dct_matrix()

def payload_bits(key):
    d = hmac.new(key.encode(), OWNER_TEXT, hashlib.sha256).digest()[:BITS // 8]
    return np.unpackbits(np.frombuffer(d, dtype=np.uint8)).astype(int)

def _layout(key, n):
    seed = int.from_bytes(hashlib.sha256(key.encode() + b'|layout|' + str(n).encode()).digest()[:8], 'big')
    rng = np.random.default_rng(seed)
    perm = rng.permutation(n)
    bit_of = np.empty(n, dtype=int); bit_of[perm] = np.arange(n) % BITS
    return bit_of, rng.random(n)                  # which bit each block carries, and its unit lattice offset

def _luma_blocks(rgb):
    y = rgb[..., :3].astype(np.float64) @ np.array([0.299, 0.587, 0.114])
    hb, wb = (y.shape[0] // 8) * 8, (y.shape[1] // 8) * 8
    nby, nbx = hb // 8, wb // 8
    blocks = y[:hb, :wb].reshape(nby, 8, nbx, 8).transpose(0, 2, 1, 3).reshape(-1, 8, 8)
    return blocks, nby, nbx

def _opaque_blocks(alpha, nby, nbx):
    if alpha is None: return np.ones(nby * nbx, dtype=bool)
    a = alpha[:nby * 8, :nbx * 8].reshape(nby, 8, nbx, 8).transpose(0, 2, 1, 3).reshape(-1, 64)
    return (a == 255).all(axis=1)

def embed(rgb, key, delta, alpha=None):
    """rgb: HxWx3 uint8 (alpha: HxW uint8 or None). Returns a new uint8 array with the mark added."""
    blocks, nby, nbx = _luma_blocks(rgb)
    n = blocks.shape[0]
    bit_of, u = _layout(key, n)
    bits = payload_bits(key)[bit_of]
    mean = blocks.mean(axis=(1, 2))
    ok = (mean > MIN_MEAN) & (mean < MAX_MEAN) & _opaque_blocks(alpha, nby, nbx)
    d_old = C @ blocks @ C.T
    d_new = d_old.copy()
    lattice0 = u * delta
    for (i, j) in POS:
        lat = lattice0 + bits * delta / 2
        q = lat + delta * np.round((d_old[:, i, j] - lat) / delta)
        d_new[:, i, j] = np.where(ok, q, d_old[:, i, j])
    change = C.T @ (d_new - d_old) @ C                              # pixel-domain luma change per block
    ch = change.reshape(nby, nbx, 8, 8).transpose(0, 2, 1, 3).reshape(nby * 8, nbx * 8)
    out = rgb.astype(np.float64).copy()
    out[:nby * 8, :nbx * 8, :3] += ch[..., None]
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)

def extract(rgb, key, delta, alpha=None):
    """Return (estimated bits, per-bit confidence 0..1) read from an image of the SAME pixel size the mark was embedded at."""
    blocks, nby, nbx = _luma_blocks(rgb)
    n = blocks.shape[0]
    if n < BITS * 8: return np.zeros(BITS, dtype=int), np.zeros(BITS)
    bit_of, u = _layout(key, n)
    d = C @ blocks @ C.T
    use = _opaque_blocks(alpha, nby, nbx)
    m = np.zeros(n)
    for (i, j) in POS:
        m += np.cos(2 * np.pi * (d[:, i, j] - u * delta) / delta)
    m = (m / len(POS)) * use
    sums = np.bincount(bit_of, weights=m, minlength=BITS)
    cnt = np.maximum(np.bincount(bit_of, weights=use.astype(float), minlength=BITS), 1)
    return (sums < 0).astype(int), np.abs(sums) / cnt

def best_read(rgb, key, alpha=None, deltas=DELTAS, shifts=((0, 0),)):
    """Try each lattice step (and pixel shifts); return (matches, bits_total, delta, shift) of the best fit to the owner code."""
    want = payload_bits(key); best = (-1, None, None)
    for dy, dx in shifts:
        sub = rgb[dy:, dx:]; sa = None if alpha is None else alpha[dy:, dx:]
        for dl in deltas:
            est, _ = extract(sub, key, dl, sa)
            hit = int((est == want).sum())
            if hit > best[0]: best = (hit, dl, (dy, dx))
    return best[0], BITS, best[1], best[2]

def chance(matches, bits=BITS):
    """Probability that an unmarked image matches at least this many bits by luck."""
    return sum(math.comb(bits, k) for k in range(matches, bits + 1)) / 2 ** bits
