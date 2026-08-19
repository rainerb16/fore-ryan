# Fore Ryan! ⛳🎉

A browser game. Ryan's floating head launches golf balls at holes sliding across the top of
the screen while dodging falling trees and water hazards.

Two ways to play:

- **Birthday Round** — the gift. Sink 5 holes and the payoff fires: slow-motion on the
  winning shot, a screen flash, confetti rain, a party hat, and the "Happy Birthday" melody.
- **Contest Mode** — the leaderboard run. Five lives, carried across levels that keep
  getting harder until one of them finishes you. Points rank the contest.

No runtime dependencies and no audio or image files beyond the one head cutout — the only
tooling is Vite and TypeScript for the build.

## Getting started

```sh
npm install
npm run dev        # local dev server with hot reload
npm run build      # typecheck, then bundle to dist/
npm run preview    # serve the production build
npm test           # build, then rules, API, and leaderboard UI
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
| `src/render/` | Canvas drawing, per-level themes and scenery, overlay portraits |
| `src/ui/` | DOM refs, HUD, banner, screens, and the leaderboard |
| `src/net/api.ts` | Calls to the leaderboard endpoints |
| `netlify/functions/` | The leaderboard API — token issue, submission, standings |
| `supabase/schema.sql` | Tables, indexes, and the lockdown, run once by hand |
| `test/harness.mjs` | Boots the built bundle in jsdom for the UI tests |
| `test/` | Rule, API, and UI tests, plus the headless boot check |
| `public/assets/ryan-head-floating.png` | Head cutout (300×300, transparent background) |
| `netlify.toml` | Netlify build and publish config |
| `scripts/` | Regenerates the link-preview card and the favicons |

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
last one and keeps tightening on every axis with no plateau.

| Level | Name | Holes | Backdrop | Horizon | Hazards |
| --- | --- | --- | --- | --- | --- |
| 1 | Driving Range | 5 | Purple night | Mounds and distance flags | 💧 🌳 |
| 2 | Front Nine | 6 | Sunrise | Rolling hills | 🌧️ 🌾 |
| 3 | Water Hazard | 7 | Deep teal | A pond with ripples | 🌊 🦆 |
| 4 | The Woods | 8 | Dark forest | A treeline of pines | 🍂 🌲 |
| 5 | Championship | 9 | Royal and gold | Grandstands and pennants | 🏌️ 🚩 |
| 6+ | Sudden Death | up to 12 | Midnight / fire | Starlit peaks / a lit volcano | ❄️ ⭐ / ☄️ 🌋 |

The horizon is drawn procedurally in `src/render/scenery.ts` — still no image files.
Layout comes from a seeded generator, so a level's skyline is the same every time you see
it rather than crawling about between frames, and the whole thing is painted once into an
offscreen canvas and blitted, so it costs one `drawImage` per frame no matter how many
trees are in it.

Level 1 is the birthday round and is unchanged from the original game. Each level starts
from a clean board, its own difficulty baseline, and its own sky; a timed ramp then builds
pressure within the level.

Themes live in `src/render/theme.ts` and are client-only — the server never needs to know
about them. Reskinning a hazard changes nothing about how it behaves: there are still only
two hazard slots, and the slot drives spawn weighting and collision. Only the glyph and its
spark colour change, so a level can look completely different while scoring identically.

### Why the tail has no ceiling

A contest run has to end on its own, or the leaderboard ranks stamina rather than skill. An
earlier version capped every axis around level 15, after which difficulty was flat and a
good player could in principle continue indefinitely. Now it keeps climbing:

| Level | Hole speed | Hazard gap | Fall speed |
| --- | --- | --- | --- |
| 5 | 1.60× | 380–620 ms | 1.30× |
| 11 | 2.27× | 262–428 ms | 1.64× |
| 20 | 3.83× | 150–245 ms | 2.34× |
| 30 | 6.87× | 90–150 ms | 3.47× |

The bounds in `SAFETY` are not difficulty caps — they sit far past any reachable level and
exist so the simulation stays honest. A hazard falling further than the player is tall
between two frames could cross them without registering a hit, which would make deep levels
*easier*, not harder.

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

`npm run dev` serves the functions as well as the game. A Vite plugin mounts the
same handlers Netlify will run on the same `/api/*` paths, compiled from source,
so one command exercises the whole thing against a real Supabase project — no
Netlify CLI and no deploy needed.

Copy `.env.example` to `.env` and fill in the three values. `.env` is gitignored.

With no `.env` the endpoints return a clean error and the game reports the
leaderboard as offline, which is itself a state worth testing.

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
5. Twenty submissions per player per hour, and sixty run starts per address —
   `run-start` is the one endpoint that needs no credentials and writes a row.

### Closing the contest

Set `CONTEST_ENDS_AT` to an ISO timestamp and both `run-start` and `submit-run`
refuse after it, so nobody can take the top spot once a winner is announced. The
standings stay readable, and the leaderboard screen shows the date. Leave it
unset and the contest runs indefinitely; an unparseable value is ignored rather
than locking everyone out.

### The link preview

`public/og.png` is what Slack, Teams, and mail show when the link is pasted, and
the favicons are cropped from the same photo — `scripts/make-icons.mjs` measures
where the head actually sits rather than assuming, since the game's own crop is
portrait and includes the shoulders, which at 32 pixels leaves the face a speck.

Both are generated and committed, so a normal install and a
Netlify build never need the rasteriser. The absolute URL the tags require is
filled in at build time from Netlify's own `URL`, so there is no domain hardcoded
anywhere.

The stored score is always the server's recomputation. The client's claim is kept
in `client_meta` so a suspicious run can be looked at rather than guessed about.

### Environment variables

Set these in Netlify under **Site configuration -> Environment variables**:

| Variable | Where it comes from |
| --- | --- |
| `SUPABASE_URL` | Supabase -> Project Settings -> Data API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase -> Project Settings -> API Keys. Server only |
| `HASH_SALT` | Any long random string you generate once. `EMAIL_HASH_SALT` is still accepted |
| `CONTEST_ENDS_AT` | Optional ISO timestamp. After it, runs cannot be started or posted; the standings stay readable |

The service role key bypasses Row Level Security. It belongs only in Netlify's
environment, never in the repo and never in client code.

### Identity

A name is all anyone is asked for. Alongside it the browser generates a random
player id, keeps it in `localStorage`, and sends it with each run so a person's
runs collapse to their best and they can be shown their own standing.

It is not an identity claim and nothing is trusted to it: clearing site data
makes you a new player, and playing on a second device makes you a second one.
That is the accepted cost of not asking a whole company for an email address for
a birthday game. Addresses are the only thing still hashed, for rate limiting.

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
| `BIRTHDAY_LIVES` / `CONTEST_LIVES` | lives per run (3 / 5) — in `shared/rules.ts` |
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
