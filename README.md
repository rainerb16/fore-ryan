# Fore Ryan! ⛳🎉

A browser game. Ryan's floating head launches golf balls at holes sliding across the top of
the screen while dodging falling trees and water hazards.

Two ways to play:

- **Birthday Round** — the gift. Sink 5 holes and the payoff fires: slow-motion on the
  winning shot, a screen flash, confetti rain, a party hat, and the "Happy Birthday" melody.
- **Contest Mode** — the leaderboard run. Levels get harder, lives carry across them, and
  the run ends when you're out of hearts. Points rank the contest.

No runtime dependencies and no audio or image files beyond the one head cutout — the only
tooling is Vite and TypeScript for the build.

## Getting started

```sh
npm install
npm run dev        # local dev server with hot reload
npm run build      # typecheck, then bundle to dist/
npm run preview    # serve the production build
npm test           # rules, API, and leaderboard UI
npm run smoke      # build, then play both modes headlessly in jsdom
npm run check      # all three
```

## Layout

| Path | Purpose |
| --- | --- |
| `shared/rules.ts` | Levels, hazards, and the constants the server also needs |
| `shared/scoring.ts` | The points formula and the submission validator |
| `shared/types.ts` | Level and run shapes exchanged with the backend |
| `index.html` | Page shell — HUD, level banner, and the overlay screens |
| `src/main.ts` | Bootstrap: wires buttons, loads images, starts the loop |
| `src/styles.css` | All styling |
| `src/game/config.ts` | Client-only tuning constants |
| `src/game/state.ts` | Shared mutable game state |
| `src/game/progression.ts` | Level and run bookkeeping |
| `src/game/world.ts` | Viewport sizing, holes, spawning, board reset |
| `src/game/update.ts` | Per-frame simulation and collision |
| `src/game/input.ts` | Keyboard, touch, and mouse handling |
| `src/game/audio.ts` | WebAudio synthesis and the mute toggle |
| `src/game/images.ts` | Head cutout loading and trim |
| `src/game/metrics.ts` | Derived sizes — head radius, ground line, hole width |
| `src/render/` | Canvas drawing: shapes, the scene, and the overlay portraits |
| `src/ui/` | DOM refs, HUD, banner, screens, and the leaderboard |
| `src/net/api.ts` | Calls to the leaderboard endpoints |
| `netlify/functions/` | The leaderboard API — token issue, submission, standings |
| `supabase/schema.sql` | Tables, indexes, and the lockdown, run once by hand |
| `test/harness.mjs` | Boots the built bundle in jsdom for the UI tests |
| `test/` | Rule, API, and UI tests, plus the headless boot check |
| `public/assets/ryan-head-floating.png` | Head cutout (300×300, transparent background) |
| `netlify.toml` | Netlify build and publish config |

### Why `shared/`

A leaderboard means a server that decides whether a submitted score is real, and it can
only do that if it knows the level table, the fire rate, and the scoring formula. Keeping
one copy in `shared/` means the client and the validator can't drift apart — a duplicated
constant would eventually reject a legitimate top score mid-contest.

## How to play

- **Desktop:** ← / → or A / D to move · hold Space to shoot · Enter starts and restarts
- **Mobile:** touch and drag to move — balls fire automatically while you hold

One input does everything on mobile; there's no separate fire button. Hazards block shots
mid-air and cost a life on contact. Each hole sunk makes Ryan's head bigger, and the head
resets to normal at the start of every level.

## Levels

Five levels are hand-tuned in `shared/rules.ts`; past those the tail is generated from the
last one, tightening on every axis until it hits a cap so deep levels stay hard rather than
impossible.

| Level | Name | Holes | Flavour |
| --- | --- | --- | --- |
| 1 | Driving Range | 5 | The birthday round — unchanged from the original game |
| 2 | Front Nine | 6 | Faster cups, tighter hazard spacing |
| 3 | Water Hazard | 7 | Three cups, mostly water |
| 4 | The Woods | 8 | Mostly trees |
| 5 | Championship | 9 | Everything at once |
| 6+ | Sudden Death | up to 12 | Generated, alternating flavour |

Each level starts from a clean board and its own difficulty baseline; a timed ramp then
builds pressure within the level.

## Scoring

Contest Mode only. Every award is multiplied by the level number, so depth is worth far
more than grinding the early levels.

| Award | Value | When |
| --- | --- | --- |
| Hole | 100 × level | Each hole sunk, even on the level you die on |
| Level clear | 500 × level | Clearing the level |
| Flawless | 300 × level | Clearing it without losing a life |
| Speed | 20 × level | Per whole second under the level's par |

The level you die on still pays for the holes you sank — progress counts — but none of the
bonuses. Full rules and the numbers live in `shared/scoring.ts`.

## Running the API locally

`npm run dev` serves the game only, so the leaderboard reports itself as offline —
which is a valid state to test. To run the functions too, use the Netlify CLI:

```sh
npm i -g netlify-cli
netlify link          # once, to connect this folder to the site
netlify dev           # game plus /api/* on one port
```

`netlify dev` pulls the environment variables down from the linked site, so there
is no local copy of the service key to leak.

## Leaderboard backend

Contest runs are submitted to Netlify Functions, which are the only thing that
talks to Supabase. The database has Row Level Security on with no policies
granted, so the anon key opens nothing and never ships to the browser.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/run-start` | Issues the token a run must present to be submitted |
| `POST /api/submit-run` | Validates a finished run and stores it |
| `GET /api/leaderboard` | Top standings, one best run per person |

`supabase/schema.sql` creates the tables; run it once in the Supabase SQL editor.

### What stops a fake score

The client is assumed to be hostile. A submission carries per-level stats, and
`submit-run` treats the score attached to it as a claim to be discarded:

1. `validateRun()` recomputes the score from the stats and checks the stats
   themselves — fire rate, holes per level, lives spent, totals that agree.
2. The run token must exist, be unused, and be less than six hours old.
3. Wall clock: a run claiming 90 seconds of play cannot be submitted 10 seconds
   after its token was issued.
4. Consuming the token is a conditional update, so two racing submissions cannot
   both win — that is the replay check.
5. Twenty submissions per person per hour.

The stored score is always the server's recomputation. The client's claim is kept
in `client_meta` so a suspicious run can be looked at rather than guessed about.

### Environment variables

Set these in Netlify under **Site configuration -> Environment variables**:

| Variable | Where it comes from |
| --- | --- |
| `SUPABASE_URL` | Supabase -> Project Settings -> Data API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase -> Project Settings -> API Keys. Server only |
| `EMAIL_HASH_SALT` | Any long random string you generate once |

The service role key bypasses Row Level Security. It belongs only in Netlify's
environment, never in the repo and never in client code.

### Identity

The leaderboard shows a display name. The work email is salted and hashed on the
server, used only to keep one person from filling the top ten and to rate limit,
and is never stored or displayed in the clear.

## Sound

On by default. The audio context is created on the first tap of a mode button, so it never
trips browser autoplay blocking. The 🔊 toggle sits in the top-right and stays reachable on
every screen, including before the game starts.

Everything is synthesized with WebAudio oscillators — there are no audio files. The win
melody is "Happy Birthday to You", which entered the public domain in 2016.

To ship it muted by default, change the fallback in `src/game/audio.ts` to `"1"`:

```ts
let muted = store.get("ryanbday.muted", "0") === "1";
```

Note: iOS honors the physical silent switch for WebAudio, so a phone on silent stays silent
regardless.

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

Per-level difficulty lives in `shared/rules.ts`. Everything else is in `src/game/config.ts`:

| Constant | Purpose |
| --- | --- |
| `START_LIVES` | lives per run (3) — in `shared/rules.ts` |
| `SHOT_COOLDOWN` | ms between shots while holding fire — in `shared/rules.ts` |
| `HEAD_GROW` | head growth per hole sunk (0.06 = 6%) |
| `HAZARD_FALL` | base hazard fall speed, scaled per level |
| `SPAWN_FLOOR_RATIO` | how tight the in-level ramp may squeeze hazard spawns |
| `RAMP_EVERY_MS`, `RAMP_SPEED_STEP` | in-level difficulty ramp |
| `FINALE_MS` / `FINALE_SLOW` | length and time-scale of the winning-shot slow-motion |
| `INVULN_MS` | grace period after a hit |
| `HITBOX_SCALE` | lower = more forgiving collisions |

## Notes

- Round count, best time, and best contest score persist via `localStorage`, guarded so
  private browsing and `file://` degrade quietly.
- Collision uses an ellipse matched to the head image. Shot-vs-hole and shot-vs-hazard
  checks are swept so fast shots can't skip through between frames.
- Overlay screens shrink at three viewport-height breakpoints, since they can't scroll.
- The smoke test seeds `Math.random`, so a headless run either always passes or always
  fails — never intermittently.
- The pre-build single-file version is preserved at the `v1-single-file` tag.
