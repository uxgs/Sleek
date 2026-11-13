# The Viewers service

The one server Sleek has. It lets the owner of a published deck see who is viewing it, and it runs
only for decks whose owner switched on **See who's viewing** when publishing. It is a Cloudflare
Worker with one small Durable Object per deck, asleep whenever nobody is connected. It holds no
secrets.

## What it knows

A deck is two random codes that Sleek makes in the owner's browser:

- `room`, public. It travels inside the published page.
- `key`, private. It never leaves the owner's browser except to prove ownership, and only its
  SHA-256 is stored here.

A viewer's page sends a random id for that browser and the number of the slide showing. For each
deck the service keeps:

| Kept | Why |
|---|---|
| the hash of the private code | to know the owner |
| views, people, when it was last opened | the totals |
| how many views reached each slide | "how far people got" |
| the random viewer ids seen | so one person is counted once |

It keeps no names, no network addresses, nothing about the device and nothing from the deck. A
deck's record deletes itself a year after it was last opened, and at once when its owner presses
Stop counting.

## Calls

All under `/v1`. `src/worker.js` has the detail.

```
POST /rooms                 { room, hash }              register a deck; the first hash wins
POST /counts                { decks: [{ room, key }] }  totals, for the start screen
GET  /rooms/<room>/view     WebSocket, a viewer         { w, s } then { s } as the slide changes
GET  /rooms/<room>/own      WebSocket, the owner        { k } first; then it is sent the state
POST /rooms/<room>/clear    { key }                     forget the totals
POST /rooms/<room>/stop     { key }                     forget the deck
```

Guards: messages over 300 characters or more than 20 in five seconds close the connection, a deck
takes at most 100 viewers at once, an address may register 20 decks and open 120 connections a
minute, and nothing is accepted for a deck that was never registered.

## Run it on your machine

```bash
npm install
```

```bash
npm run dev
```

That serves it at `http://127.0.0.1:8787` with no Cloudflare account. To point a local copy of
Sleek at it, run this in the browser console on the local Sleek page, then reload:

```js
localStorage.setItem('sleek-online', 'http://127.0.0.1:8787')
```

## Test it

With it running:

```bash
node test.mjs
```

The test plays an owner and several viewers and checks the counting, the refusals and the cleanup.

## Deploy it

```bash
npx wrangler login
```

```bash
npm run deploy
```

Wrangler prints the address it deployed to. Put that in `ADDRESS` at the top of `core/online.js`.
The free plan covers 100,000 requests a day; a view costs two or three.
