# Fore Ryan! ⛳🎉

A browser game. Ryan's floating head launches golf balls at holes sliding across
the top of the screen while dodging falling trees and water hazards. Sink 5 holes and the
birthday payoff fires: slow-motion on the winning shot, a screen flash, confetti rain, a
party hat, and the "Happy Birthday" melody. Take 3 hits and it's back to the clubhouse.

No runtime dependencies and no audio or image files beyond the one head cutout — the only
tooling is Vite and TypeScript for the build.

## Getting started

```sh
npm install
npm run dev        # local dev server with hot reload
npm run build      # typecheck, then bundle to dist/
npm run preview    # serve the production build
npm run smoke      # build, then boot the bundle headlessly and tick 4s of frames
```

## Layout

| Path | Purpose |
| --- | --- |
| `index.html` | Page shell — HUD and the three overlay screens |
| `src/main.ts` | Bootstrap: wires buttons, loads images, starts the loop |
| `src/styles.css` | All styling |
| `src/game/config.ts` | Every tuning constant |
| `src/game/state.ts` | Shared mutable game state |
| `src/game/world.ts` | Viewport sizing, holes, spawning, round reset |
| `src/game/update.ts` | Per-frame simulation and collision |
| `src/game/input.ts` | Keyboard, touch, and mouse handling |
| `src/game/audio.ts` | WebAudio synthesis and the mute toggle |
| `src/game/images.ts` | Head cutout loading and trim |
| `src/game/metrics.ts` | Derived sizes — head radius, ground line, hole width |
| `src/render/` | Canvas drawing: shapes, the scene, and the overlay portraits |
| `src/ui/` | DOM refs, HUD, and screen transitions |
| `test/smoke.mjs` | Headless boot check against the built bundle |
| `public/assets/ryan-head-floating.png` | Head cutout (300×300, transparent background) |
| `netlify.toml` | Netlify build and publish config |

## How to play

- **Desktop:** ← / → or A / D to move · hold Space to shoot · Enter starts and restarts
- **Mobile:** touch and drag to move — balls fire automatically while you hold

One input does everything on mobile; there's no separate fire button. Hazards block shots
mid-air and cost a life on contact. Each hole sunk makes Ryan's head bigger.

## Sound

On by default. The audio context is created on the first tap of **Tee Off**, so it never
trips browser autoplay blocking. The 🔊 toggle sits in the top-right and stays reachable
on every screen, including before the game starts.

Everything is synthesized with WebAudio oscillators — there are no audio files. The win
melody is "Happy Birthday to You", which entered the public domain in 2016.

To ship it muted by default, change the fallback in `src/game/audio.ts` to `"1"`:

```ts
let muted = store.get("ryanbday.muted", "0") === "1";
```

Note: iOS honors the physical silent switch for WebAudio, so a phone on silent stays
silent regardless.

## Swapping the photo

In `src/game/config.ts`:

```ts
export const HEAD_IMAGE_SRC = "assets/ryan-head-floating.png";
export const HEAD_TRIM = { x: 67 / 300, y: 21 / 300, w: 189 / 300, h: 259 / 300 };
```

`HEAD_TRIM` marks where the head sits inside the PNG's transparent margins (measured from
this specific file). For a different image: drop it in `public/assets/`, update
`HEAD_IMAGE_SRC`, set `HEAD_TRIM = null`, and use a cutout with a transparent background —
a rectangular photo will show as a box. With no image present the game falls back to a
placeholder, so it always runs.

`HEAD_PARTY_IMAGE_SRC` is optional. When empty, the win-screen party hat is drawn
programmatically; point it at a party-hat photo to use that instead.

## Deploy (Netlify)

1. Push this folder to GitHub.
2. Netlify → **Add new site → Import an existing project** → pick the repo.
3. Build command `npm run build`, publish directory `dist` (already set in `netlify.toml`).

The site root serves the game directly, so the shareable link is just the domain.

## Tuning

Everything lives in `src/game/config.ts`:

| Constant | Purpose |
| --- | --- |
| `HOLES_TO_WIN` | holes needed to win (5) |
| `START_LIVES` | lives (3) |
| `HEAD_GROW` | head growth per hole sunk (0.06 = 6%) |
| `SHOT_COOLDOWN` | ms between shots while holding fire |
| `HOLE_COUNT` | holes on screen at once |
| `HOLE_SPEED_MIN/MAX` | how fast holes slide |
| `SPAWN_MIN_MS` / `SPAWN_MAX_MS` | hazard spawn interval |
| `HAZARD_FALL` | hazard fall speed |
| `FINALE_MS` / `FINALE_SLOW` | length and time-scale of the winning-shot slow-motion |
| `RAMP_EVERY_MS`, `RAMP_SPEED_STEP` | difficulty ramp |
| `INVULN_MS` | grace period after a hit |
| `HITBOX_SCALE` | lower = more forgiving collisions |

## Notes

- Round count and best time persist via `localStorage`, guarded so private browsing and
  `file://` degrade quietly.
- Collision uses an ellipse matched to the head image. Shot-vs-hole and shot-vs-hazard
  checks are swept so fast shots can't skip through between frames.
- Overlay screens shrink at three viewport-height breakpoints, since they can't scroll.
- The pre-build single-file version is preserved at the `v1-single-file` tag.
