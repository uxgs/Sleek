"""Writes the sample deck's placeholder art for "Pace", a made-up fitness app: screen mock-ups
as SVG (today's workout, a move, the week's plan, stats), rough wireframe versions of them for the
before / after slides, and short gradient videos (needs ffmpeg). Everything here is generated,
so the sample deck ships no outside images.

    python3 tools/make-placeholders.py
"""
import math, os, random, shutil, subprocess

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sample')
W, H = 1920, 1080
FONT = 'Inter, Helvetica, Arial, sans-serif'

# bg, surface, accent, highlight, ink
FINISHED = ('#140e1b', '#1f1729', '#ff6a3d', '#ffd2c2', '#f7f1ee')
SKETCH = ('#f3f1ea', '#ffffff', '#9a968b', '#c9c5ba', '#4a4740')     # the "before": pencil wireframes


def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;')


class Svg:
    def __init__(self, pal, sketch=False):
        self.p, self.sketch, self.g = pal, sketch, []

    def add(self, s):
        self.g.append(s)

    def box(self, x, y, w, h, r=18, fill=None, op=1.0):
        bg, surf, acc, hi, ink = self.p
        if self.sketch:     # outlines only, slightly wobbly
            self.add('<rect x="%d" y="%d" width="%d" height="%d" rx="%d" fill="none" stroke="%s" stroke-width="3" stroke-dasharray="%s"/>'
                     % (x, y, w, h, r, ink, '14 6' if fill == 'dash' else 'none'))
        else:
            self.add('<rect x="%d" y="%d" width="%d" height="%d" rx="%d" fill="%s" opacity="%.2f"/>' % (x, y, w, h, r, fill or surf, op))

    def bar(self, x, y, w, h=22, fill=None, op=0.8):
        bg, surf, acc, hi, ink = self.p
        self.add('<rect x="%d" y="%d" width="%d" height="%d" rx="%d" fill="%s" opacity="%.2f"/>'
                 % (x, y, w, h, h // 2, ink if self.sketch else (fill or hi), 0.35 if self.sketch else op))

    def text(self, x, y, s, size=30, weight=600, op=0.9, fill=None):
        self.add('<text x="%d" y="%d" font-family="%s" font-size="%d" font-weight="%d" fill="%s" opacity="%.2f">%s</text>'
                 % (x, y, FONT, size, weight, fill or self.p[4], op, esc(s)))

    def chart(self, x, y, w, h, seed=3):
        rnd = random.Random(seed)
        bg, surf, acc, hi, ink = self.p
        pts, n = [], 28
        for k in range(n + 1):
            v = 0.5 + 0.35 * math.sin(k / n * math.pi * 1.6 + 0.4) + rnd.uniform(-0.06, 0.06)
            pts.append((x + k * w / n, y + h - v * h))
        line = ' '.join('%.1f,%.1f' % p for p in pts)
        if not self.sketch:
            self.add('<polygon points="%s %.1f,%.1f %.1f,%.1f" fill="%s" opacity="0.28"/>' % (line, x + w, y + h, x, y + h, acc))
        self.add('<polyline points="%s" fill="none" stroke="%s" stroke-width="5" stroke-linejoin="round" opacity="0.95"/>' % (line, ink if self.sketch else acc))

    def topbar(self, title, tabs, active=0):
        bg, surf, acc, hi, ink = self.p
        self.add('<path d="M64 108 L100 50 L136 108 Z" fill="%s" stroke="%s" stroke-width="3"/>' % ('none' if self.sketch else acc, ink if self.sketch else acc))
        self.text(160, 92, title, 34, 700)
        for k, t in enumerate(tabs):
            x = 440 + k * 200
            if k == active and not self.sketch:
                self.box(x - 20, 58, 150, 48, 24, hi, 0.16)
            self.text(x, 92, t, 26, 600 if k == active else 500, 0.95 if k == active else 0.55)
        self.box(W - 380, 56, 316, 52, 26, None, 0.9)

    def write(self, name, label=None):
        bg = self.p[0]
        head = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (W, H, W, H) +
                '<defs><radialGradient id="glow" cx="0.85" cy="0.05" r="0.8"><stop offset="0" stop-color="%s" stop-opacity="%s"/>'
                '<stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient></defs>' % (self.p[2], '0' if self.sketch else '0.28', self.p[2]) +
                '<rect width="100%%" height="100%%" fill="%s"/><rect width="100%%" height="100%%" fill="url(#glow)"/>' % bg)
        tail = ''
        if label:
            tail = '<text x="64" y="%d" font-family="%s" font-size="28" font-weight="600" fill="%s" opacity="0.5">%s</text>' % (H - 40, FONT, self.p[4], esc(label))
        with open(os.path.join(OUT, name + '.svg'), 'w') as f:
            f.write(head + ''.join(self.g) + tail + '</svg>')


def rings(s, cx, cy, r, fills, width=34, op=1.0):
    """Concentric progress rings; fills are 0..1, outermost first."""
    bg, surf, acc, hi, ink = s.p
    cols = [acc, '#ffb648', '#7ad3ff'] if not s.sketch else [ink, ink, ink]
    for k, f in enumerate(fills):
        rr = r - k * (width + 10)
        c = 2 * math.pi * rr
        s.add('<circle cx="%d" cy="%d" r="%d" fill="none" stroke="%s" stroke-width="%d" opacity="%.2f"/>' % (cx, cy, rr, cols[k], width, 0.18 * op))
        s.add('<circle cx="%d" cy="%d" r="%d" fill="none" stroke="%s" stroke-width="%d" stroke-linecap="round" stroke-dasharray="%.1f %.1f" '
              'transform="rotate(-90 %d %d)" opacity="%.2f"%s/>' % (cx, cy, rr, cols[k], width if not s.sketch else 4, c * f, c, cx, cy, op,
              ' stroke-dashoffset="0"' ))


TABS = ['Today', 'Workouts', 'Plan', 'You']


def today_screen(sketch):
    s = Svg(SKETCH if sketch else FINISHED, sketch)
    s.topbar('Pace', TABS, 0)
    s.text(64, 220, 'Good morning', 54, 700)
    s.box(64, 270, 1100, 440, 28, None, 0.8)
    s.text(110, 360, 'Morning strength', 60, 700); s.text(110, 416, '35 min  ·  6 moves  ·  Moderate', 28, 500, 0.6)
    for k in range(6):
        s.box(110 + k * 160, 460, 136, 120, 18, s.p[2], 0.25 + k * 0.08)
    s.box(110, 610, 220, 70, 35, s.p[2]); s.text(170, 656, 'Start', 30, 700, 1, s.p[0] if not sketch else None)
    s.box(1220, 270, 636, 440, 28, None, 0.6)
    rings(s, 1538, 490, 180, [0.72, 0.55, 0.88])
    for k, (v, l) in enumerate([('7 h 40', 'Sleep'), ('82%', 'Recovery'), ('12 days', 'Streak')]):
        s.box(64 + k * 610, 760, 580, 250, 24, None, 0.9)
        s.text(110 + k * 610, 880, v, 72, 700); s.text(110 + k * 610, 940, l, 28, 500, 0.55)
    s.write('today-sketch' if sketch else 'today', 'Today' + (' · v0.1' if sketch else ''))


def workout_screen(sketch):
    s = Svg(SKETCH if sketch else FINISHED, sketch)
    s.topbar('Pace', TABS, 1)
    s.box(64, 150, 1040, 560, 28, None, 0.6)
    rings(s, 584, 430, 210, [0.64], 40)
    s.text(500, 455, '0:42', 84, 700)
    s.text(1160, 230, 'Goblet squat', 60, 700)
    s.bar(1160, 270, 420, 22, None, 0.4)
    for k, (v, l) in enumerate([('3', 'Sets'), ('12', 'Reps'), ('60 s', 'Rest')]):
        s.box(1160 + k * 240, 330, 220, 150, 20, None, 0.9)
        s.text(1190 + k * 240, 400, v, 40, 700); s.text(1190 + k * 240, 446, l, 22, 500, 0.55)
    s.box(1160, 520, 300, 70, 35, s.p[2]); s.text(1205, 566, 'Next move', 28, 700, 1, s.p[0] if not sketch else None)
    s.box(64, 750, W - 128, 270, 24, None, 0.7)
    s.text(100, 800, 'Heart rate', 26, 600, 0.7)
    s.chart(100, 820, W - 200, 170)
    s.write('workout-sketch' if sketch else 'workout', 'Workout' + (' · v0.1' if sketch else ''))


def plan_screen(sketch):
    s = Svg(SKETCH if sketch else FINISHED, sketch)
    s.topbar('Pace', TABS, 2)
    s.text(64, 220, 'This week', 54, 700)
    s.bar(64, 250, 1200, 18, s.p[3], 0.18); s.bar(64, 250, 780, 18, s.p[2], 1)
    items = ['Mon · Strength, 35 min', 'Tue · Easy run, 5 km', 'Wed · Mobility, 20 min', 'Thu · Intervals, 25 min', 'Fri · Rest', 'Sat · Long ride, 60 min']
    for k, it in enumerate(items):
        y = 310 + k * 118
        s.box(64, y, 1200, 96, 20, None, 0.85)
        done = k < 4
        s.add('<circle cx="120" cy="%d" r="22" fill="%s" stroke="%s" stroke-width="4"/>' % (y + 48, s.p[2] if done and not sketch else 'none', s.p[4] if sketch else s.p[2]))
        s.text(168, y + 58, it, 30, 600, 0.45 if done else 0.95)
    s.box(1320, 310, 536, 690, 24, None, 0.7)
    s.text(1360, 380, 'Minutes', 30, 600, 0.8)
    for k in range(5):
        h = [180, 240, 300, 210, 150][k]
        s.box(1370 + k * 96, 940 - h, 64, h, 14, s.p[2], 0.55 + k * 0.08)
    s.write('plan-sketch' if sketch else 'plan', 'Plan' + (' · v0.1' if sketch else ''))


def you_screen():
    s = Svg(FINISHED)
    s.topbar('Pace', TABS, 3)
    s.text(64, 220, 'This year', 54, 700)
    for k, (v, l) in enumerate([('148', 'Workouts'), ('5,920 min', 'Moving'), ('12 days', 'Best streak')]):
        s.box(64 + k * 610, 270, 580, 220, 24, None, 0.9)
        s.text(110 + k * 610, 380, v, 72, 700); s.text(110 + k * 610, 440, l, 28, 500, 0.55)
    s.box(64, 530, W - 128, 490, 24, None, 0.7)
    for k in range(18):
        h = 80 + (math.sin(k * 0.7) + 1) * 150
        s.box(110 + k * 96, 980 - h, 60, h, 12, s.p[2], 0.5 + (k % 4) * 0.12)
    s.write('you', 'You')


def card_art():
    """The take-apart sample's flat image: a workout card."""
    s = Svg(FINISHED)
    s.box(0, 0, W, H, 0, '#2a1420')
    rings(s, 1540, 520, 330, [0.78, 0.6, 0.9], 60)
    s.text(120, 560, 'Morning strength', 110, 800)
    s.text(124, 640, 'Today\'s pick', 44, 600, 0.7)
    for k, t in enumerate(['35 min', '6 moves', '320 kcal']):
        s.box(120 + k * 300, 760, 270, 110, 55, '#ffd2c2', 0.16); s.text(160 + k * 300, 832, t, 40, 700)
    s.write('card')


def rings_layer():
    """Transparent activity rings only, for the take-apart's rings layer."""
    s = Svg(FINISHED)
    rings(s, 1540, 520, 330, [0.78, 0.6, 0.9], 60)
    with open(os.path.join(OUT, 'card-rings.svg'), 'w') as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">%s</svg>' % (W, H, W, H, ''.join(s.g)))


def backdrop():
    s = Svg(FINISHED)
    rings(s, 1500, 760, 620, [0.7, 0.5, 0.85], 90, 0.35)
    s.chart(0, 300, W, 420, 9)
    s.write('backdrop')


def video(name, c0, c1, seconds=8):
    ff = shutil.which('ffmpeg')
    if not ff:
        print('ffmpeg not found: skipped', name); return
    src = 'gradients=s=1280x720:c0=%s:c1=%s:x0=0:y0=0:x1=1280:y1=720:speed=0.02:d=%d' % (c0, c1, seconds)
    subprocess.run([ff, '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', src, '-vf', 'format=yuv420p',
                    '-c:v', 'libx264', '-crf', '30', '-preset', 'slow', '-an', '-movflags', '+faststart',
                    os.path.join(OUT, name + '.mp4')], check=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(('.svg', '.mp4')): os.remove(os.path.join(OUT, f))
    for sk in (False, True):
        today_screen(sk); workout_screen(sk); plan_screen(sk)
    you_screen(); card_art(); rings_layer(); backdrop()
    video('clip-a', '0x2a1020', '0xff6a3d'); video('clip-b', '0x2a1a08', '0xffb648', 6); video('clip-c', '0x0a1a2a', '0x7ad3ff', 6)
    print('wrote', os.path.normpath(OUT))
