#!/usr/bin/env python3
"""Draws the logos of Sleek's three apps: Slides, Docs and Tasks.

Sleek's own mark (icons/logo.svg) is two bars, each with one round end and one square end, stacked
with a step, in a run of colour from blue through violet to pink. Each app's mark is built from the
same parts in its own run of colour:

  Slides   a deck: three slides fanned, the front one with a title         purple
  Docs     a page cut with the Sleek mark's own corners, a title and lines  blue
  Tasks    two tasks, one ticked and one still to do                        green

For each app this writes, into icons/:
  <app>.svg            the mark alone, for beside the app's name
  <app>-icon.svg       the mark on a dark tile with round corners: the app icon
  <app>-favicon.svg    the same, with the mark larger, for a browser tab
  <app>-maskable.svg   the tile with no corners and a smaller mark, for phones that cut their own shape
  <app>-touch.svg      the tile with no corners, for an iPhone's home screen

The .png files beside them are pictures of these at the sizes phones and browsers ask for. Run this
from the folder that holds index.html:  python3 tools/make-icons.py
"""
import os

RUN = {"slides": ["#7C5CFF", "#A77BFF", "#E58CFF"], "docs": ["#3D8BFF", "#5FA8FF", "#7EDBFF"], "tasks": ["#0FA968", "#2CC88E", "#7FE3B5"]}
NAME = {"slides": "Sleek Slides", "docs": "Sleek Docs", "tasks": "Sleek Tasks"}


def box(x, y, w, h, r):
    """A box whose corners are round by r: top-left, top-right, bottom-right, bottom-left."""
    a, b, c, d = r
    out = "M%d %dH%d" % (x + a, y, x + w - b)
    if b: out += "a%d %d 0 0 1 %d %d" % (b, b, b, b)
    out += "V%d" % (y + h - c)
    if c: out += "a%d %d 0 0 1 %d %d" % (c, c, -c, c)
    out += "H%d" % (x + d)
    if d: out += "a%d %d 0 0 1 %d %d" % (d, d, -d, -d)
    out += "V%d" % (y + a)
    if a: out += "a%d %d 0 0 1 %d %d" % (a, a, a, -a)
    return out + "Z"


def line(x1, y, x2, w):
    return '<path d="M%d %dH%d" fill="none" stroke="#fff" stroke-width="%d" stroke-linecap="round"/>' % (x1, y, x2, w)


def shape(app, f):
    """The mark itself, in a 512 square, filled with f."""
    if app == "slides":
        r = [30, 30, 30, 30]
        return ('<path d="%s" fill="%s" opacity=".28"/><path d="%s" fill="%s" opacity=".55"/><path d="%s" fill="%s"/>' % (box(176, 144, 220, 148, r), f, box(146, 182, 220, 148, r), f, box(116, 220, 220, 148, r), f)
                + line(154, 272, 254, 22) + line(154, 316, 216, 16))
    if app == "docs":
        return ('<path d="%s" fill="%s"/>' % (box(158, 130, 196, 252, [56, 0, 56, 0]), f)
                + line(202, 206, 288, 28) + line(200, 264, 312, 18) + line(200, 306, 312, 18) + line(200, 348, 262, 18))
    return ('<circle cx="172" cy="186" r="56" fill="%s"/><path d="M147 187l18 18 33-38" fill="none" stroke="#fff" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>'
            '<path d="M256 130H340a56 56 0 0 1 0 112H256Z" fill="%s"/><circle cx="172" cy="326" r="56" fill="%s" opacity=".42"/><path d="M256 270H340a56 56 0 0 1 0 112H256Z" fill="%s"/>') % (f, f, f, f)


def run(app, gid):
    c = RUN[app]
    return ('<linearGradient id="%s" x1="150" y1="130" x2="362" y2="382" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="%s"/><stop offset=".5" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient>' % (gid, c[0], c[1], c[2]))


def mark(app):
    g = "sleek-%s-g" % app
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="116 130 280 252"><title>%s</title><defs>%s</defs>%s</svg>\n' % (NAME[app], run(app, g), shape(app, "url(#%s)" % g))


def tile(app, corners, scale):
    """The mark on Sleek's dark tile, with a glow of its own colours from the bottom corners."""
    g, c = "sleek-%s-g" % app, RUN[app]
    glow = ('<radialGradient id="%s-a" cx=".2" cy="1.1" r=".75"><stop offset="0" stop-color="%s" stop-opacity=".55"/><stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="%s-b" cx=".95" cy="1.05" r=".6"><stop offset="0" stop-color="%s" stop-opacity=".45"/><stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient>') % (g, c[0], c[0], g, c[2], c[2])
    rx = ' rx="116"' if corners else ""
    body = shape(app, "url(#%s)" % g)
    if scale != 1: body = '<g transform="translate(256 256) scale(%s) translate(-256 -256)">%s</g>' % (scale, body)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>%s%s</defs><rect width="512" height="512"%s fill="#0B0B0D"/><rect width="512" height="512"%s fill="url(#%s-a)"/><rect width="512" height="512"%s fill="url(#%s-b)"/>%s</svg>\n'
            % (run(app, g), glow, rx, rx, g, rx, g, body))


def main():
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
    for app in ("slides", "docs", "tasks"):
        files = {"%s.svg" % app: mark(app), "%s-icon.svg" % app: tile(app, True, 1), "%s-favicon.svg" % app: tile(app, True, 1.3), "%s-maskable.svg" % app: tile(app, False, 0.82), "%s-touch.svg" % app: tile(app, False, 1)}
        for name, text in files.items():
            with open(os.path.join(here, name), "w") as out: out.write(text)
            print("wrote icons/" + name)


if __name__ == "__main__":
    main()
