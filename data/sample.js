/* The sample deck: one slide per layout, about Pace, a made-up fitness app. Sleek adds it the first
   time it opens in a browser, and again from the start screen's "Add the sample deck". Its slides
   are the layouts in deck.html, as written there ("fill": "sample"). */
window.SLEEK_SAMPLE = {
  "title": "Pace",
  "seed": {
    "annotations": {
      "screens": [
        {
          "name": "Annotated screen",
          "notes": "<p>A screen with notes pinned to it. Click a pin, box or arrow to open its note; press <b>A</b> to hide or show them all.</p>",
          "img": "assets/sample/workout.svg",
          "ann": [
            {
              "x": 76,
              "y": 51.4,
              "title": "One tap forward",
              "note": "Big enough to hit mid-set, with sweaty hands.",
              "color": "#7AD3FF"
            },
            {
              "x": 72.4,
              "y": 30.5,
              "title": "Sets, reps, rest",
              "note": "The three numbers people glance at between sets. Each one feeds the week's plan.",
              "color": "#FFB648",
              "images": [
                "assets/sample/plan.svg"
              ]
            }
          ],
          "shapes": [
            {
              "type": "box",
              "x": 3.3,
              "y": 69.4,
              "w": 93.4,
              "h": 25,
              "title": "Heart rate",
              "note": "Live effort, so the session can ease off before it gets too hard.",
              "spot": true
            },
            {
              "type": "arrow",
              "x1": 82,
              "y1": 30,
              "x2": 88,
              "y2": 11,
              "title": "Search",
              "note": "Search by move, by muscle or by how long you have."
            }
          ]
        }
      ]
    },
    "theme": {
      "mode": "dark",
      "accent": "#9A7CF0",
      "glow": "aurora",
      "glowColor": "dusk",
      "motion": "on",
      "fx": "grid"
    },
    "added": [
      {
        "id": "title",
        "t": "title",
        "name": "Title",
        "fill": "sample"
      },
      {
        "id": "bullets",
        "t": "bullets",
        "name": "Bullets",
        "fill": "sample"
      },
      {
        "id": "bullets-video",
        "t": "bullets-video",
        "name": "Bullets with video",
        "fill": "sample"
      },
      {
        "id": "bullets-two-videos",
        "t": "bullets-two-videos",
        "name": "Bullets with two videos",
        "fill": "sample"
      },
      {
        "id": "statement",
        "t": "statement",
        "name": "Statement",
        "fill": "sample"
      },
      {
        "id": "cards",
        "t": "cards",
        "name": "Cards",
        "fill": "sample"
      },
      {
        "id": "divider",
        "t": "divider",
        "name": "Section divider",
        "fill": "sample"
      },
      {
        "id": "gallery",
        "t": "gallery",
        "name": "Gallery",
        "fill": "sample"
      },
      {
        "id": "moodboard",
        "t": "collage",
        "name": "Moodboard",
        "fill": "sample"
      },
      {
        "id": "carousel",
        "t": "carousel",
        "name": "Carousel",
        "fill": "sample"
      },
      {
        "id": "before-after",
        "t": "before-after",
        "name": "Before and after",
        "fill": "sample"
      },
      {
        "id": "take-apart",
        "t": "take-apart",
        "name": "Take apart",
        "fill": "sample"
      },
      {
        "id": "full-video",
        "t": "full-video",
        "name": "Full video",
        "fill": "sample"
      },
      {
        "id": "results",
        "t": "results",
        "name": "Results",
        "fill": "sample"
      },
      {
        "id": "chart",
        "t": "chart",
        "name": "Chart",
        "fill": "sample"
      },
      {
        "id": "lessons",
        "t": "lessons",
        "name": "Lessons",
        "fill": "sample"
      },
      {
        "id": "wrap-up",
        "t": "wrap-up",
        "name": "Wrap up",
        "fill": "sample"
      }
    ]
  }
};
