# The Sleek film

A film of Sleek, under a minute long, made from the real app: `film.html` holds the app in frames, moves a
camera over it and lays the type on top, and headless Chrome renders it a frame at a time.

```
clock.js      the film's clock: timers, animations and videos move only when the renderer steps them
film.html     the film page (film.css, film.js); ?shape=wide or ?shape=tall
timeline.js   the cue sheet: shots, camera, pointer, clicks, captions
render.mjs    steps the page and pipes frames to ffmpeg
art/          the film decks' pictures: three made-up products, each screen as a finished design
              and as a pencil wireframe (art.html, art2.html; art.mjs renders them to art/*.webp)
score.py      the score and sound effects, from the cue sheet: five tracks to choose from
reels.js      the helper clips' cue sheets (film.html?reel=<name>): short silent loops for Settings
proof.html    a short test of the clock on the app's hardest motion
```

## Make it

Needs Node, Python with numpy, ffmpeg and Chrome. Serve the repo first:

```bash
python3 -m http.server 8100 --bind 127.0.0.1
```

Then, from the repo's root:

```bash
node tools/film/art.mjs                                               # the pictures (only when art.html changes)
node tools/film/render.mjs --shape wide --out out/wide.mp4 --cues out/cues.json
node tools/film/render.mjs --shape tall --out out/tall.mp4
python3 tools/film/score.py out/cues.json out/tracks               # every track, or name some: ... out/tracks pulse air
```

and join picture and sound:

```bash
ffmpeg -i out/wide.mp4 -i out/tracks/score-glass.wav -vf scale=1920:1080:flags=lanczos -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -c:a aac -b:a 256k -movflags +faststart film-16x9.mp4
ffmpeg -i out/tall.mp4 -i out/tracks/score-glass.wav -vf scale=1080:1920:flags=lanczos -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -c:a aac -b:a 256k -movflags +faststart film-9x16.mp4
```

The start screen plays a smaller encode of the wide cut, `assets/film/sleek.mp4`, with
`assets/film/poster.jpg` as its still.

## Check a part of it

`render.mjs` always runs the film from its start, so the app is in the right state, but only
captures what you ask for:

```bash
node tools/film/render.mjs --stills out/stills --at 13.4,29.6,44.6      # full-size stills at these seconds
node tools/film/render.mjs --stills out/stills --from 31 --to 41 --every 30 --scale 1
node tools/film/render.mjs --from 12 --to 14 --probe "FILM.frames.B.el.contentDocument.body.className"   # ask the page, frame by frame
```

## Change it

Timing, camera, pointer and captions are all in `timeline.js`. The music is 120 beats a minute, so
a beat is half a second; keep cuts on a beat and the score stays in step. Sound effects
follow the cue sheet by themselves.
