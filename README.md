# Alien Ant Farm — Sandscape Evolution

A falling-sand ecosystem simulation with five evolving kingdoms.

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Push this repo to GitHub
2. Import in Vercel → Framework: **Other** → Root: `/`
3. No build step needed — pure static ES modules

## Local Development

```bash
# Any static server works:
npx serve .
# or
python3 -m http.server 8080
```

Then open http://localhost:8080

## File Structure

```
├── index.html          # Shell — HTML + imports main.js
├── style.css           # All UI styles
├── vercel.json         # Vercel static routing
└── src/
    ├── constants.js    # Element types, world size, colors, caps
    ├── state.js        # All mutable game state (grid, POP, etc.)
    ├── utils.js        # Grid helpers, type checks, entity factories
    ├── genome.js       # Genome generation, mutation, strain registry
    ├── physics.js      # Gravity, flow, light, environment damage
    ├── elements.js     # Abiotic step functions (fire, water, clay, clouds…)
    ├── kingdoms.js     # Creature step functions (ant, plant, spider, frogstone…)
    ├── sim.js          # Simulation loop, particle dispatch, renderer
    ├── world.js        # World generation, seed life, reset
    ├── lab.js          # Creature Lab — define custom organisms
    └── ui.js           # All UI: drawing, stamps, inspector, narrator, events
```

## Tweaking Individual Aspects

| Want to change | Edit file |
|---|---|
| Creature behavior (ants, spiders…) | `src/kingdoms.js` |
| Physics (fire, water, clouds…) | `src/elements.js` |
| World generation | `src/world.js` |
| Creature Lab | `src/lab.js` |
| HUD / UI | `src/ui.js` |
| Add new element type | `src/constants.js` + `src/elements.js` |
| Simulation speed / render | `src/sim.js` |
