window.SEED = {
  "notes": [],
  "annotations": {
    "screens": [
      {
        "name": "Annotated screen",
        "notes": "<p>A screen with notes pinned to it. Click a pin, box or arrow to open its note; press <b>A</b> to hide or show them all.</p>",
        "img": "assets/sample/workout.svg",
        "ann": [
          { "x": 76, "y": 51.4, "title": "One tap forward", "note": "Big enough to hit mid-set, with sweaty hands.", "color": "#7AD3FF" },
          { "x": 72.4, "y": 30.5, "title": "Sets, reps, rest", "note": "The three numbers people glance at between sets. Each one feeds the week's plan.", "color": "#FFB648", "images": ["assets/sample/plan.svg"] }
        ],
        "shapes": [
          { "type": "box", "x": 3.3, "y": 69.4, "w": 93.4, "h": 25, "title": "Heart rate", "note": "Live effort, so the session can ease off before it gets too hard.", "spot": true },
          { "type": "arrow", "x1": 82, "y1": 30, "x2": 88, "y2": 11, "title": "Search", "note": "Search by move, by muscle or by how long you have." }
        ]
      }
    ]
  },
  "theme": { "mode": "dark", "accent": "#FF6A3D", "glow": "aurora", "glowColor": "ember", "motion": "on", "fx": "grid" }
};
