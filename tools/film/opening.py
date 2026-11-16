"""The sound of Sleek for iPhone's opening: the film's opening sting on its own, made the same way as the
film's score (score.py), from arithmetic, so there is nothing to license. The same low pulse as the mark
arrives and the same three bells as the name writes itself in, in the "glass" track's key (D major), over a
soft chord, then a breath of air as the mark flies up into the page. Timed to LaunchView in ios/Sources/Intro.swift.

    python3 tools/film/opening.py ios/Sounds/opening.m4a
"""
import os, subprocess, sys
import numpy as np

SR = 48000
DUR = 3.0
N = int(SR * DUR)
rng = np.random.default_rng(11)


def hz(m): return 440.0 * 2 ** ((m - 69) / 12.0)
def tt(dur): return np.arange(int(dur * SR)) / SR
def bus(): return np.zeros((2, N))


def put(b, x, at, gain=1.0, pan=0.0):
    i = int(round(at * SR)); n = min(x.shape[-1], N - i)
    if n <= 0: return
    if x.ndim == 1:
        a = np.pi / 4 * (pan + 1)
        b[0, i:i + n] += x[:n] * gain * np.cos(a) * 1.4142; b[1, i:i + n] += x[:n] * gain * np.sin(a) * 1.4142
    else:
        b[:, i:i + n] += x[:, :n] * gain


def shape(x, lo=None, hi=None, order=2):
    X = np.fft.rfft(x, axis=-1); f = np.fft.rfftfreq(x.shape[-1], 1.0 / SR); H = np.ones_like(f)
    if hi: H *= 1.0 / np.sqrt(1 + (f / hi) ** (2 * order))
    if lo: H *= 1.0 / np.sqrt(1 + (lo / np.maximum(f, 1e-6)) ** (2 * order))
    return np.fft.irfft(X * H, n=x.shape[-1], axis=-1)


def fade(x, a=0.005, r=0.02):
    n = x.shape[-1]; na, nr = min(n // 2, int(a * SR)), min(n // 2, int(r * SR)); e = np.ones(n)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return x * e


# the film's instruments (score.py), unchanged
def bell(f, dur=2.6):
    t = tt(dur); x = np.zeros(t.size)
    for ratio, amp, dec in ((1, 1, 2.2), (2.0, .5, 3.2), (2.76, .32, 4.5), (5.4, .16, 7.0), (8.93, .08, 10.0)):
        if f * ratio < 12000: x += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * dec)
    return x * (1 - np.exp(-t * 800))


def impact(deep=1.0):
    t = tt(2.2); f = 36 + 60 * np.exp(-t * 9)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.4) * deep * 0.55
    x += 0.5 * shape(rng.standard_normal(t.size), hi=420) * np.exp(-t * 11)
    x += 0.12 * shape(rng.standard_normal(t.size), lo=2500) * np.exp(-t * 26)
    return fade(x, 0.001, 0.2)


def pad_note(f, dur, bright=1.0):
    t = tt(dur); out = np.zeros((2, t.size))
    for det, pan in ((-7, -0.8), (0, 0.0), (7, 0.8)):
        ff = f * 2 ** (det / 1200.0); x = np.zeros(t.size)
        for h in range(1, 15):
            if ff * h > 7000: break
            x += np.sin(2 * np.pi * ff * h * t + rng.uniform(0, 6.28)) / h ** (1.9 - 0.5 * bright)
        a = np.pi / 4 * (pan + 1); out[0] += x * np.cos(a); out[1] += x * np.sin(a)
    att, rel = min(0.9, dur * 0.35), min(1.1, dur * 0.4)
    return out * np.minimum(1, t / att) ** 1.5 * np.minimum(1, (dur - t) / rel) ** 1.5 * 0.3


def whoosh(dur=0.5, lo=500, hi=7000):
    t = tt(dur); n = rng.standard_normal((2, t.size)); e = np.sin(np.pi * t / dur) ** 2.2
    a = shape(n, lo=lo, hi=hi * 0.35) * np.linspace(1, 0, t.size) ** 1.5
    b = shape(n, lo=lo * 2.5, hi=hi) * np.linspace(0, 1, t.size) ** 1.5
    return (a + b) * e


fx, pad, arp, verb = bus(), bus(), bus(), bus()
chord = [62, 66, 69, 76]                                   # the glass track's first chord
put(fx, impact(0.9), 0.06, 0.75); put(verb, impact(0.6), 0.06, 0.4)                       # the bars slide together
for m, d in zip(chord[:3], (0.0, 0.06, 0.12)):                                              # the name writes itself in
    bb = bell(hz(m + 12)); put(arp, bb, 0.45 + d, 0.10, (m - 64) / 10.0); put(verb, bb, 0.45 + d, 0.12)
for m in chord:
    put(pad, pad_note(hz(m), 2.6, 1.25), 0.0, 0.10)
put(fx, whoosh(0.55, 400, 8000), 1.08, 0.08)                                                # up into the page

ir_n = int(2.4 * SR); ti = np.arange(ir_n) / SR
ir = shape(rng.standard_normal((2, ir_n)), lo=250, hi=5200) * np.exp(-ti * 2.1) * np.minimum(1, ti / 0.012)
send = shape(verb + 0.25 * pad, lo=200); M = N + ir_n
wet = np.fft.irfft(np.fft.rfft(send, M, axis=-1) * np.fft.rfft(ir, M, axis=-1), M, axis=-1)[:, :N] * 0.011
mix = 0.85 * shape(pad, lo=150, hi=4200) + shape(arp, lo=300, hi=11000) + shape(fx, lo=30) + wet
t = np.arange(N) / SR
mix *= np.clip((DUR - t) / 0.9, 0, 1) ** 2                 # fades away as the page settles
mix[:, :int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
mix = mix / np.abs(mix).max() * 0.9

out = sys.argv[1]; raw = out + '.f32'
mix.T.astype('<f4').tofile(raw)
# quieter than the film (-14 LUFS): it plays as an app opens, often in a quiet room
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', raw,
                '-af', 'loudnorm=I=-22:TP=-3:LRA=11', '-ar', '44100', '-c:a', 'aac', '-b:a', '128k', out], check=True)
os.remove(raw)
print(out)
