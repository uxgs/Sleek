"""The film's score and sound effects, made from nothing but arithmetic: original pieces, so there
is nothing to license. 120 beats a minute, to match the film's cuts. There are five tracks to choose
from (STYLES below): the same film, a different feel. The effects (a finger snap on every change of
view, clicks, the shimmer on the before/after wipe, the hits on the big lines) are placed from the
film's own cue sheet, so sound and picture can't drift apart.

    python3 tools/film/score.py cues.json outdir [style ...]     (cues.json: render.mjs --cues)

writes outdir/score-<style>.wav for each style named, or for all of them.
"""
import json, subprocess, sys
import numpy as np

SR = 48000
BPM = 120.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
cues = json.load(open(sys.argv[1]))
CH_T = {c['id']: c['t'] for c in cues if c['k'] == 'chapter'}
DUR = CH_T['out']
N = int(SR * (DUR + 3.0))
rng = np.random.default_rng(11)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def bus():
    return np.zeros((2, N))


def put(b, x, at, gain=1.0, pan=0.0):
    """Add a mono (n,) or stereo (2,n) sound to a bus at a time in seconds. pan: -1 left .. 1 right."""
    i = int(round(at * SR))
    if i >= N:
        return
    if i < 0:
        x = x[..., -i:]
        i = 0
    n = min(x.shape[-1], N - i)
    if n <= 0:
        return
    if x.ndim == 1:
        a = np.pi / 4 * (pan + 1)
        b[0, i:i + n] += x[:n] * gain * np.cos(a) * 1.4142
        b[1, i:i + n] += x[:n] * gain * np.sin(a) * 1.4142
    else:
        b[:, i:i + n] += x[:, :n] * gain


def shape(x, lo=None, hi=None, order=2):
    """A zero-phase filter by shaping the spectrum: keep lo..hi Hz (Butterworth-like slopes)."""
    X = np.fft.rfft(x, axis=-1)
    f = np.fft.rfftfreq(x.shape[-1], 1.0 / SR)
    H = np.ones_like(f)
    if hi:
        H *= 1.0 / np.sqrt(1 + (f / hi) ** (2 * order))
    if lo:
        H *= 1.0 / np.sqrt(1 + (lo / np.maximum(f, 1e-6)) ** (2 * order))
    return np.fft.irfft(X * H, n=x.shape[-1], axis=-1)


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def fade(x, a=0.005, r=0.02):
    n = x.shape[-1]
    na, nr = min(n // 2, int(a * SR)), min(n // 2, int(r * SR))
    e = np.ones(n)
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return x * e


# ---------------------------------------------------------------- instruments
def pad_note(f, dur, bright=1.0):
    """Three detuned saw-like voices spread left and right, slow in and slow out."""
    t = tt(dur)
    out = np.zeros((2, t.size))
    for det, pan in ((-7, -0.8), (0, 0.0), (7, 0.8)):
        ff = f * 2 ** (det / 1200.0)
        x = np.zeros(t.size)
        for h in range(1, 15):
            if ff * h > 7000:
                break
            x += np.sin(2 * np.pi * ff * h * t + rng.uniform(0, 6.28)) / h ** (1.9 - 0.5 * bright)
        a = np.pi / 4 * (pan + 1)
        out[0] += x * np.cos(a)
        out[1] += x * np.sin(a)
    att, rel = min(0.9, dur * 0.35), min(1.1, dur * 0.4)
    e = np.minimum(1, t / att) ** 1.5 * np.minimum(1, (dur - t) / rel) ** 1.5
    return out * e * 0.3


def pluck(f, dur=1.3, bright=1.0):
    t = tt(dur)
    x = np.zeros(t.size)
    for h in range(1, 10):
        if f * h > 10000:
            break
        x += np.sin(2 * np.pi * f * h * t) * np.exp(-t * (3.2 + h * 2.4 / bright)) / h
    return x * (1 - np.exp(-t * 1200))


def bell(f, dur=2.6):
    t = tt(dur)
    x = np.zeros(t.size)
    for ratio, amp, dec in ((1, 1, 2.2), (2.0, .5, 3.2), (2.76, .32, 4.5), (5.4, .16, 7.0), (8.93, .08, 10.0)):
        if f * ratio < 12000:
            x += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * dec)
    return x * (1 - np.exp(-t * 800))


def kick():
    t = tt(0.55)
    f = 44 + 120 * np.exp(-t * 40)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.0)
    x += 0.2 * shape(rng.standard_normal(t.size), lo=2000) * np.exp(-t * 320)
    return fade(x, 0.001, 0.05)


def hat(open_=False):
    t = tt(0.3 if open_ else 0.09)
    x = shape(rng.standard_normal(t.size), lo=7500, order=3) * np.exp(-t * (16 if open_ else 80))
    return fade(x, 0.0005, 0.01)


def clap():
    t = tt(0.4)
    n = shape(rng.standard_normal(t.size), lo=900, hi=5200)
    e = sum(np.exp(-np.maximum(0, t - d) * 180) * (t >= d) for d in (0.0, 0.011, 0.023)) * 0.5 + np.exp(-t * 16) * (t >= 0.03)
    return fade(n * e, 0.0005, 0.05)


def shaker():
    t = tt(0.07)
    return fade(shape(rng.standard_normal(t.size), lo=5000, hi=11000) * np.exp(-t * 60), 0.004, 0.01)


def sub(f, dur):
    t = tt(dur)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    return fade(x, 0.012, min(0.12, dur * 0.3))


def snap(bright=1.0):
    """A finger snap: a tiny slide, then the pop and its ring."""
    t = tt(0.16)
    n = rng.standard_normal(t.size)
    pop = shape(n, lo=1300, hi=5200, order=2) * np.exp(-t * 46)
    pop += 0.55 * np.sin(2 * np.pi * 2350 * bright * t + 0.6) * np.exp(-t * 62)
    pop += 0.35 * np.sin(2 * np.pi * 1250 * bright * t) * np.exp(-t * 80)
    pre = np.zeros(t.size)
    k = int(0.013 * SR)
    pre[:k] = shape(rng.standard_normal(k), lo=3500) * np.linspace(0.2, 1, k) * 0.18
    x = np.concatenate([pre[:k], pop[:-k] * (1 - np.exp(-t[:-k] * 2600))])
    return fade(x, 0.0003, 0.02)


def rim():
    t = tt(0.06)
    x = np.sin(2 * np.pi * 820 * t) * np.exp(-t * 110) + 0.4 * np.sin(2 * np.pi * 1730 * t) * np.exp(-t * 150) + 0.3 * shape(rng.standard_normal(t.size), lo=2500) * np.exp(-t * 300)
    return fade(x, 0.0003, 0.01)


def saw_bass(f, dur):
    t = tt(dur)
    x = np.zeros(t.size)
    for h in range(1, 9):
        x += np.sin(2 * np.pi * f * h * t) / h * np.exp(-t * h * 2.2)
    return fade(x * np.exp(-t * 3.0), 0.004, min(0.05, dur * 0.3))


def keys(f, dur=1.6):
    """A soft, felt-piano-like note."""
    t = tt(dur)
    x = np.zeros(t.size)
    for h, a in ((1, 1), (2, .42), (3, .2), (4, .1), (5, .05)):
        x += a * np.sin(2 * np.pi * f * h * t * (1 + 0.0004 * h * h)) * np.exp(-t * (2.0 + h * 1.4))
    return x * (1 - np.exp(-t * 500))


# ---------------------------------------------------------------- effects
def click(high=False):
    t = tt(0.05)
    x = np.sin(2 * np.pi * (2300 if high else 1500) * t) * np.exp(-t * 190) + 0.5 * shape(rng.standard_normal(t.size), lo=3000) * np.exp(-t * 500)
    return fade(x, 0.0003, 0.01)


def whoosh(dur=0.5, lo=500, hi=7000):
    t = tt(dur)
    n = rng.standard_normal((2, t.size))
    e = np.sin(np.pi * t / dur) ** 2.2
    k = int(t.size * 0.5)                         # darker first half, brighter second: it sounds like a pass
    a = shape(n, lo=lo, hi=hi * 0.35) * np.linspace(1, 0, t.size) ** 1.5
    b = shape(n, lo=lo * 2.5, hi=hi) * np.linspace(0, 1, t.size) ** 1.5
    return (a + b) * e


def riser(dur=1.2):
    t = tt(dur)
    u = t / dur
    n = rng.standard_normal((2, t.size))
    x = shape(n, lo=1800, hi=9000) * u ** 2.4 * 0.7
    f = 220 * 2 ** (u * 2.0)
    x += 0.25 * np.sin(2 * np.pi * np.cumsum(f) / SR) * u ** 2
    return fade(x, 0.01, 0.012)


def impact(deep=1.0):
    t = tt(2.2)
    f = 36 + 60 * np.exp(-t * 9)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.4) * deep * 0.55
    x += 0.5 * shape(rng.standard_normal(t.size), hi=420) * np.exp(-t * 11)
    x += 0.12 * shape(rng.standard_normal(t.size), lo=2500) * np.exp(-t * 26)
    return fade(x, 0.001, 0.2)


def shimmer(dur, up=True, notes=(81, 84, 86, 88, 91, 93, 96, 98, 100)):
    out = np.zeros((2, int((dur + 1.4) * SR)))
    k = 26
    for j in range(k):
        u = (j + rng.uniform(-0.4, 0.4)) / k
        u = min(max(u, 0), 1)
        m = notes[int((u if up else 1 - u) * (len(notes) - 1) + rng.uniform(-0.5, 0.5) + 0.5) % len(notes)]
        t = tt(0.9)
        g = np.sin(2 * np.pi * hz(m) * t) * np.exp(-t * 6.5) * (1 - np.exp(-t * 300))
        a = np.pi / 4 * (rng.uniform(-1, 1) + 1)
        i = int(u * dur * SR)
        out[0, i:i + g.size] += g * np.cos(a)
        out[1, i:i + g.size] += g * np.sin(a)
    return out * 0.2


# ---------------------------------------------------------------- the tracks
def maj(r): return [r, r + 4, r + 7, r + 14]
def mnr(r): return [r, r + 3, r + 7, r + 14]
def ch(notes, bass): return (notes, bass)

STYLES = {
    # the first cut's feel, faster: plucked sixteenths over a steady kick. A minor, ending in C.
    'pulse': dict(loop=[ch([57, 60, 64, 71], 33), ch([57, 60, 65, 67], 29), ch([55, 60, 62, 64], 36), ch([55, 59, 62, 64], 31)],
                  stabs=[ch([57, 60, 64, 71], 33), ch([57, 60, 65, 67], 29), ch([55, 59, 62, 67], 31)], end=ch([55, 60, 64, 67, 74], 36),
                  kick=(0, 8, 11), hat=True, clap=(4, 12), backsnap=(), shaker=True, bass='sub', bassline=(0, 2, 4, 6, 8, 10, 12, 14),
                  arp='pluck', arp_steps=range(16), arp_lvl=0.2, pad=0.2, swing=0.0, bell_notes=[81, 84, 88, 91, 96, 100]),
    # bright and light: bells, a kick only on the one, finger snaps for a backbeat. D major.
    'glass': dict(loop=[ch([62, 66, 69, 76], 38), ch([59, 62, 66, 73], 35), ch([55, 62, 67, 71], 31), ch([57, 61, 64, 73], 33)],
                  stabs=[ch([59, 62, 66, 73], 35), ch([55, 62, 67, 71], 31), ch([57, 61, 64, 69], 33)], end=ch([62, 66, 69, 74, 78], 38),
                  kick=(0, 10), hat=False, clap=(), backsnap=(4, 12), shaker=True, bass='sub', bassline=(0, 6, 8, 14),
                  arp='bell', arp_steps=(0, 3, 6, 8, 11, 14), arp_lvl=0.16, pad=0.22, swing=0.0, bell_notes=[86, 90, 93, 98, 102, 105]),
    # punchy: four on the floor, a bouncing saw bass, off-beat hats, short chord stabs. E minor.
    'drive': dict(loop=[ch([52, 59, 64, 67], 28), ch([55, 60, 64, 67], 24 + 12), ch([55, 59, 62, 67], 31), ch([54, 57, 62, 66], 26 + 12)],
                  stabs=[ch([52, 59, 64, 67], 28), ch([55, 60, 64, 67], 36), ch([54, 57, 62, 69], 38)], end=ch([55, 59, 62, 67, 74], 31),
                  kick=(0, 4, 8, 12), hat=True, clap=(4, 12), backsnap=(), shaker=False, bass='saw', bassline=(0, 3, 6, 8, 11, 14),
                  arp='pluck', arp_steps=(2, 6, 10, 14), arp_lvl=0.16, pad=0.14, stab=(3, 6, 11, 14), swing=0.0, bell_notes=[88, 91, 95, 98, 100, 103]),
    # calm and spacious: soft keys over long chords, no kick, a rim and finger snaps keeping time. F major.
    'air': dict(loop=[ch([53, 57, 60, 64, 69], 29), ch([50, 57, 60, 65], 26 + 12), ch([46 + 12, 62, 65, 69], 34), ch([48 + 12, 64, 67, 72], 36)],
                stabs=[ch([50, 57, 60, 65], 38), ch([58, 62, 65, 69], 34), ch([60, 64, 67, 70], 36)], end=ch([53, 57, 60, 65, 72], 29),
                kick=(), hat=False, clap=(), backsnap=(4, 12), rim=(0, 6, 10), shaker=False, bass='sub', bassline=(0, 8),
                arp='keys', arp_steps=(0, 4, 6, 10, 12), arp_lvl=0.2, pad=0.3, swing=0.0, bell_notes=[84, 88, 91, 93, 96, 100]),
    # playful: a swung groove, a walking plucked bass, rims and snaps. G major.
    'bounce': dict(loop=[ch([55, 59, 62, 69], 31), ch([52, 55, 59, 66], 28), ch([48 + 12, 64, 67, 71], 36), ch([50 + 12, 66, 69, 72], 38)],
                   stabs=[ch([52, 55, 59, 64], 28), ch([60, 64, 67, 71], 36), ch([62, 66, 69, 72], 38)], end=ch([55, 59, 62, 67, 74], 31),
                   kick=(0, 7, 10), hat=True, clap=(), backsnap=(4, 12), rim=(2, 9, 14), shaker=False, bass='saw', bassline=(0, 3, 4, 8, 11, 12, 14),
                   arp='bell', arp_steps=(0, 2, 5, 8, 10, 13), arp_lvl=0.13, pad=0.16, swing=0.34, bell_notes=[79, 83, 86, 91, 95, 98])
}
T = CH_T
RANGES = dict(
    kick=[(T['hero'], T['ba2'] + 0.0), (T['apart'], T['pres']), (T['pres'] + 4, T['share'])],
    hat=[(T['pick'], T['ba2']), (T['apart'], T['share'])],
    clap=[(T['move'], T['ba2']), (T['apart'], T['pres']), (T['pres'] + 4, T['share'])],
    shaker=[(T['ann'], T['pres']), (T['theme'], T['share'])],
    bass=[(T['hero'], T['ba2']), (T['apart'], T['share'])],
    arp=[(T['hero'], T['share'])])


def within(t, ranges):
    return any(a <= t < b for a, b in ranges)


def render(style, out_path):
    global rng
    rng = np.random.default_rng(11)
    P = STYLES[style]
    drums, bassb, padb, arpb, fx, verb = bus(), bus(), bus(), bus(), bus(), bus()
    kick_times = []
    S16 = BEAT / 4
    nb = int(np.ceil(DUR / BAR))
    loop = P['loop']
    voice = {'pluck': lambda f, br: pluck(f, 1.0, br), 'bell': lambda f, br: bell(f, 1.6) * 0.8, 'keys': lambda f, br: keys(f) * 1.1}[P['arp']]

    # pads: one chord a bar; under the three big lines only the stabs; then the end chord
    for b in range(nb):
        t0 = b * BAR
        if t0 >= T['share']:
            break
        notes, _ = loop[max(b - 1, 0) % 4] if b else loop[0]
        peak = T['theme'] <= t0 < T['share']
        for m in notes + ([notes[-1] + 12] if peak else []):
            put(padb, pad_note(hz(m), BAR + 0.8, 0.6 if t0 < T['hero'] else 1.25 if peak else 0.95), t0 - 0.12, P['pad'] * (1.25 if t0 < T['hero'] else 1.0))
    for j, (notes, bs) in enumerate(P['stabs']):
        t0 = T['share'] + j * 1.0
        for m in notes + [notes[0] - 12]:
            put(padb, pad_note(hz(m), 1.5, 1.4), t0 - 0.02, 0.34)
        put(bassb, sub(hz(bs + 12), 0.8), t0, 0.26)
    en, eb = P['end']
    for m in en + [en[0] - 12, en[-1] + 5]:
        put(padb, pad_note(hz(m), DUR - T['end'] + 0.6, 1.25), T['end'] - 0.05, 0.30)
    put(bassb, sub(hz(eb + 12), 4.0) * np.exp(-tt(4.0) * 0.55), T['end'], 0.26)

    ARP = [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 3, 1, 2, 3, 1, 2]
    ACC = [1, .45, .7, .5, .9, .45, .7, .55, 1, .45, .7, .5, .85, .5, .75, .6]
    for i in range(int(T['share'] / S16)):
        b, s = i // 16, i % 16
        t0 = i * S16 + (P['swing'] * S16 if s % 2 else 0)
        notes, root = loop[max(b - 1, 0) % 4] if b else loop[0]
        peak = T['theme'] <= t0 < T['share']
        if within(t0, RANGES['kick']) and s in P['kick']:
            put(drums, kick(), t0, 0.8 if s in (0, 4, 8, 12) else 0.5)
            kick_times.append(t0)
        if P['hat'] and within(t0, RANGES['hat']):
            if s % 4 == 2:
                put(drums, hat(open_=(s == 14 and b % 2 == 1)), t0, 0.26, 0.25)
            elif s % 2 == 0:
                put(drums, hat(), t0, 0.12, -0.2)
            elif s in (3, 7, 15):
                put(drums, hat(), t0, 0.06, 0.3)
        if within(t0, RANGES['clap']):
            if s in P['clap']:
                c = clap(); put(drums, c, t0, 0.32, 0.05); put(verb, c, t0, 0.10)
            if s in P['backsnap']:
                c = snap(0.94); put(drums, c, t0, 0.34, -0.15); put(verb, c, t0, 0.14)
        if within(t0, RANGES['hat']) and s in P.get('rim', ()):
            put(drums, rim(), t0, 0.2, 0.3)
        if P['shaker'] and within(t0, RANGES['shaker']) and s % 2 == 1:
            put(drums, shaker(), t0, 0.11 * ACC[s], 0.5 if s % 4 == 1 else -0.5)
        if within(t0, RANGES['bass']) and s in P['bassline']:
            k = P['bassline'].index(s)
            if P['bass'] == 'saw':
                m = root + 12 + (12 if k % 3 == 2 else 7 if k % 4 == 3 else 0)
                put(bassb, saw_bass(hz(m), S16 * 2.4), t0, 0.30)
            else:
                m = root + 12 + (12 if s in (6, 14) else 0)
                put(bassb, sub(hz(m), S16 * (1.7 if len(P['bassline']) > 5 else 3.4)), t0, 0.22 * (1.0 if s % 4 == 0 else 0.8))
        if within(t0, RANGES['arp']) and s in P['arp_steps']:
            m = notes[ARP[s] % len(notes)] + 12
            lvl = P['arp_lvl'] * (0.75 if t0 < T['move'] else 1.25 if peak else 1.0)
            if T['ba2'] <= t0 < T['apart']:
                lvl *= 0.75
            p = voice(hz(m), 1.5 if peak else 1.0) * ACC[s]
            pan = 0.55 * np.sin(i * 0.9)
            put(arpb, p, t0, lvl, pan)
            put(arpb, p, t0 + 3 * S16, lvl * 0.3, -pan)
            put(arpb, p, t0 + 6 * S16, lvl * 0.11, pan)
            put(verb, p, t0, lvl * 0.5)
        if 'stab' in P and within(t0, RANGES['clap']) and s in P['stab']:
            for m in notes:
                put(padb, pad_note(hz(m + 12), 0.22, 1.5), t0, 0.16)

    # long bass under the wipe, where the drums step back
    for k, t0 in enumerate((T['ba2'], T['ba2'] + 2.0)):
        put(bassb, sub(hz(loop[k][1] + 12), 1.9), t0, 0.15)
    # the opening: a low pulse as the mark arrives, a bell as the name does, a lift into the app
    put(fx, impact(0.9), 0.18, 0.75); put(verb, impact(0.6), 0.18, 0.4)
    for m, d in zip(loop[0][0][:3], (0.0, 0.06, 0.12)):
        bb = bell(hz(m + 12)); put(arpb, bb, 0.7 + d, 0.10, (m - 64) / 10.0); put(verb, bb, 0.7 + d, 0.12)
    put(fx, riser(1.1), T['hero'] - 1.1, 0.2)

    # ---- effects from the cue sheet
    tb = 0
    for c in cues:
        t, k, cid = c['t'], c['k'], c.get('id', '')
        if (k == 'cut' and cid not in ('open', 'share', 'end')) or k == 'snap':        # a finger snap on every change of view
            sn = snap(1.0 + 0.04 * ((tb * 7) % 5 - 2))
            put(fx, sn, t - 0.012, 0.62, 0.12 * ((int(t * 2) % 3) - 1)); put(verb, sn, t - 0.012, 0.32)
            w = whoosh(0.3); put(fx, w, t - 0.2, 0.07)
            if T['theme'] <= t < T['build'] or T['move'] <= t < T['ba']:                # the looks and the montage ring a note each
                bb = bell(hz(P['bell_notes'][tb % len(P['bell_notes'])])); tb += 1
                put(arpb, bb, t + 0.01, 0.11, (tb % 3 - 1) * 0.5); put(verb, bb, t + 0.01, 0.14)
        elif k in ('click', 'grab'):
            put(fx, click(), t, 0.20, 0.1)
        elif k == 'release':
            put(fx, click(high=True), t, 0.13, -0.1)
        elif k == 'wipe':                              # all Before (1.3 s), a breath, then all After (1.6 s)
            s1, s2 = shimmer(1.3, up=False), shimmer(1.6, up=True)
            put(fx, s1, t, 0.55); put(verb, s1, t, 0.5)
            put(fx, s2, t + 1.95, 0.8); put(verb, s2, t + 1.95, 0.7)
            put(fx, whoosh(1.5, 300, 5000), t - 0.1, 0.10); put(fx, whoosh(1.7, 400, 8000), t + 1.9, 0.12)
        elif k == 'line':
            put(fx, impact(1.0), t, 0.7); put(verb, impact(0.7), t, 0.5)
            sn = snap(0.9); put(fx, sn, t - 0.012, 0.5); put(verb, sn, t - 0.012, 0.3)
        elif k == 'chapter' and cid == 'end':
            put(fx, impact(1.1), t, 0.8); put(verb, impact(0.8), t, 0.55)
            for m, d in zip(en[:4], (0.0, 0.06, 0.12, 0.2)):
                bb = bell(hz(m + 12), 4.0); put(arpb, bb, t + 0.75 + d, 0.12, (m - 64) / 12.0); put(verb, bb, t + 0.75 + d, 0.16)
    for t_end, d, g in ((T['move'], 0.9, 0.2), (T['ba'], 0.9, 0.2), (T['apart'], 1.4, 0.30), (T['pres'] + 4, 1.0, 0.2), (T['theme'], 1.2, 0.28), (T['build'], 0.8, 0.18), (T['share'], 1.0, 0.32), (T['end'], 0.9, 0.3)):
        put(fx, riser(d), t_end - d, g)
    for t_hit, g in ((T['hero'], 0.5), (T['ba'], 0.45), (T['apart'], 0.6), (T['theme'], 0.55)):
        put(fx, impact(0.8), t_hit, g); put(verb, impact(0.5), t_hit, g * 0.5)
    for j in range(8):                                   # a roll into the three lines
        tj = T['share'] - 1.0 + j * 0.125
        put(drums, clap() if P['clap'] else snap(0.9), tj, 0.07 + 0.02 * j)

    # ---- the mix
    tfull = np.arange(N) / SR
    duck = np.ones(N)
    for kt in kick_times:
        i = int(kt * SR); n = min(N - i, int(0.4 * SR))
        duck[i:i + n] = np.minimum(duck[i:i + n], 1 - 0.55 * np.exp(-np.arange(n) / SR / 0.13))
    padb2 = shape(padb, lo=150, hi=4200) * duck
    bassb2 = shape(bassb, hi=1100) * (0.5 + 0.5 * duck)
    arpb2 = shape(arpb, lo=300, hi=11000)
    ir_n = int(3.0 * SR); ti = np.arange(ir_n) / SR
    ir = shape(rng.standard_normal((2, ir_n)), lo=250, hi=5200) * np.exp(-ti * 2.1) * np.minimum(1, ti / 0.012)
    send = shape(verb + 0.25 * padb2 + 0.05 * drums, lo=200)
    M = N + ir_n
    wet = np.fft.irfft(np.fft.rfft(send, M, axis=-1) * np.fft.rfft(ir, M, axis=-1), M, axis=-1)[:, :N] * 0.011
    mix = 0.95 * shape(drums, lo=28) + 0.9 * bassb2 + 0.85 * padb2 + 1.0 * arpb2 + 1.0 * shape(fx, lo=30) + wet
    env = np.ones(N)
    a, b = int((DUR - 1.5) * SR), int((DUR - 0.12) * SR)
    env[a:b] = np.cos(np.linspace(0, np.pi / 2, b - a)) ** 2; env[b:] = 0
    env[:int(0.02 * SR)] = np.linspace(0, 1, int(0.02 * SR))
    # the shape of the whole piece, in decibels: a quiet opening, a dip under the wipe and the presenter's
    # first bars, the fullest part from theming on
    SHAPE = [(0, -6), (T['hero'] - 0.1, -6), (T['hero'] + 0.1, -3), (T['move'] - 0.1, -2.5), (T['move'] + 0.1, -1), (T['ba2'] - 0.1, -1), (T['ba2'] + 0.2, -4.5), (T['apart'] - 0.1, -4), (T['apart'] + 0.05, -0.5),
             (T['pres'] - 0.1, -0.5), (T['pres'] + 0.1, -3), (T['pres'] + 3.9, -2.5), (T['pres'] + 4.1, -0.5), (T['theme'] - 0.1, -0.5), (T['theme'] + 0.1, 0), (T['share'] - 0.1, 0), (T['share'] + 0.1, -0.5), (T['end'] + 0.1, -1.5), (DUR, -3)]
    mix = mix * env * 10 ** (np.interp(tfull, [p[0] for p in SHAPE], [p[1] for p in SHAPE]) / 20.0)
    mix = mix[:, :int(DUR * SR)]
    peak = np.abs(mix).max()
    mix = mix / peak * 0.9
    raw = out_path + '.f32'
    mix.T.astype('<f4').tofile(raw)
    # the master: gentle glue and a touch of air, then one fixed gain to streaming level (-14 LUFS) and a limiter
    pre = out_path + '.pre.wav'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', raw,
                    '-af', 'acompressor=threshold=-14dB:ratio=1.6:attack=30:release=250:makeup=1,highshelf=f=7000:g=3', '-c:a', 'pcm_f32le', pre], check=True)
    meter = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', pre, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    loud = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', meter)[-1])
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', pre, '-af', 'volume=%.2fdB,alimiter=limit=0.68:level=false:attack=3:release=60' % (-14.0 - loud),
                    '-ar', str(SR), '-c:a', 'pcm_s24le', out_path], check=True)
    os.remove(raw); os.remove(pre)
    print('%-7s %s  (levelled by %+.1f dB)' % (style, out_path, -14.0 - loud))


import os, re
outdir = sys.argv[2] if len(sys.argv) > 2 else '.'
os.makedirs(outdir, exist_ok=True)
for st in (sys.argv[3:] or list(STYLES)):
    render(st, os.path.join(outdir, 'score-%s.wav' % st))
