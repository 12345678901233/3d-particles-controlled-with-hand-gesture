# Gesture-Controlled 3D Particle System (Three.js)

A real-time interactive particle playground powered by **Three.js** + **MediaPipe Hand Landmarker**.

## Features

- Camera-based hand tracking in real time.
- Gesture-driven particle reactions:
  - **Pinch** → expansion burst + warm color palette.
  - **Open palm** → calmer contraction + cool palette.
- Multiple particle templates you can switch at runtime:
  - Heart
  - Flower
  - Saturn
  - Firework sphere
  - Spiral nebula
- Mini camera preview with tracked hand landmark overlay.

## Run locally

Because browser camera APIs require secure or localhost contexts, serve the folder with a local web server:

```bash
python3 -m http.server 4173
```

Then open:

- `http://localhost:4173`

Allow camera permission when prompted.
