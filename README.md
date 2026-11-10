# Ryan Arcade 🕹️

A small, growing arcade of browser games made as gifts for Ryan, with a new game for each
birthday, Christmas, and Easter. The lobby is a 3D arcade room. Each game is an upright
cabinet whose screen runs in attract mode, cycling gameplay, its top three scores, and
INSERT COIN.

| Game | Occasion | Path |
| --- | --- | --- |
| **Fore Ryan!** ⛳ | Birthday 2026 | `/games/birthday-2026/` |

Coded by Rainer B.

## Getting started

```sh
npm install
npm run dev        # lobby, games, and the API, with hot reload
npm run build      # typecheck, then bundle every page to dist/
npm run preview    # serve the production build
npm test           # build, then rules, scores, API, lobby, and game UI tests
npm run smoke      # build, then play both golf modes headlessly in jsdom
npm run check      # typecheck, tests, and smoke test together
npm run thumbs     # regenerate the cabinet-screen thumbnails (see below)
```

On this machine the repo lives on a WSL path, so run npm inside WSL rather than from Windows.

## Layout

| Path | Purpose |
| --- | --- |
| `index.html`, `src/lobby/` | The 3D arcade lobby |
| `games/<id>/` | One folder per game, each with its own `index.html` |
| `shared/games.ts` | The game registry: id, title, occasion, year, sort order, path |
| `shared/scores.ts` | The scores adapter every game uses to start runs, post scores, and read standings |
| `shared/names.ts` | Name cleaning, shared by browser and server (1–20 characters) |
| `shared/storage.ts` | `localStorage` that never throws |
| `shared/three.ts`, `shared/webgl.ts` | Renderer setup and the WebGL check for 3D pages |
| `netlify/functions/` | The leaderboard API: token issue, submission, standings |
| `supabase/schema.sql` | Tables, indexes, and the lockdown, run once by hand |
| `public/assets/ryan/` | The head cutout every game uses |
| `public/assets/af/` | Action Furnace logo and mascot for the lobby poster |
| `public/assets/thumbs/` | Gameplay thumbnails for the cabinet screens |
| `scripts/` | Generates thumbnails, the link-preview card, and the favicons |
| `test/` | Unit, API, lobby, and game UI tests, plus the headless smoke test |

**Keep the arcade thin.** A module moves into `shared/` only once two games actually need it.
Game-specific code, including scoring rules the server checks, stays inside the game's
folder.

## The lobby

`src/lobby/` builds the room in Three.js:
- `arcade.ts`: the cabinet row and the camera on rails
- `cabinet.ts`: one upright cabinet
- `screen.ts`: the attract-mode CRT
- `room.ts`: carpet, wall, neon sign, and lighting
- `look.ts`: reflections and bloom
- `poster.ts`: the Action Furnace poster

Arrow keys, swipes, taps, or the on-screen buttons move between cabinets. Enter, PLAY, or
a tap on the focused cabinet zooms into its screen and loads the game.

Each playable game gets a lit cabinet. A "Coming soon" cabinet and a few "Out of order"
machines fill out the row; they're scenery only.

- **Phones** get a smaller shadow map and half-resolution bloom. The pixel ratio is capped
  at 1.5 everywhere.
- **Three.js** loads only once the 3D lobby starts.
- **Without WebGL**, the same games show as a plain list with their top three scores. The
  list is always in the page, visually hidden beside the 3D room, so keyboard and
  screen-reader users can use it too.

### Cabinet thumbnails

Each cabinet's screen shows `public/assets/thumbs/<game id>.jpg` when it exists. The
thumbnails are real gameplay, captured by driving the built game in headless Chrome:

```sh
npm run build && npx vite preview --port 4199     # leave running
CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe" npm run thumbs
```

`scripts/make-thumbnails.mjs` lists the steps that bring each game to a good moment. It
needs Node 22 or later, for the built-in WebSocket.

## Adding a game

1. Create `games/<occasion>-<year>/` with its own `index.html`, and name it by occasion
   and year, never by mechanic.
2. Add it to `GAMES` in `shared/games.ts`, and add its page to `rollupOptions.input` in
   `vite.config.ts`.
3. Use `shared/scores.ts` for runs and standings.
4. Add a capture step to `scripts/make-thumbnails.mjs` and run `npm run thumbs`.

## Scores

Games call three functions in `shared/scores.ts`:

```ts
startRun(gameId)                                            // a run token, or null
submitRun(gameId, token, { displayName, points, durationMs, details })
getLeaderboard(gameId, limit = 10)                          // best run per player
```

`details` carries the game's own stats. The server derives the score from them and never
trusts the claimed points.

**When the backend is down, the games still work.** If the API is unreachable or returns a
server error, runs and standings fall back to this device's `localStorage`, and a warning
goes to the console. If the server *refuses* a run, the player sees why and the run is
never saved locally. That covers a closed contest, a rate limit, or a run that didn't add
up.

## Leaderboard backend

Runs go to Netlify Functions, which are the only thing that talks to Supabase. Row Level
Security is on with no policies granted, so the anon key opens nothing and never ships to
the browser.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/run-start` | Issues the token a run must present to be submitted |
| `POST /api/submit-run` | Validates a finished run and stores it |
| `GET /api/leaderboard` | Top standings, one best run per person |

`npm run dev` mounts the same handlers on the same paths, compiled from source, so one
command runs the whole thing against a real Supabase project. Copy `.env.example` to `.env`
and fill it in; `.env` is gitignored. Without it, the games use the local fallback.

`supabase/schema.sql` creates the tables. Run it once in the Supabase SQL editor.

### What stops a fake score

The client is assumed to be hostile. `submit-run` treats the score attached to a run as a
claim to be thrown away:

1. The game's validator recomputes the score from the stats, and checks the stats themselves
   are physically possible.
2. The run token must exist, be unused, and be less than six hours old.
3. Wall clock: a run claiming 90 seconds of play can't be submitted 10 seconds after its
   token was issued.
4. Consuming the token is a conditional update, so two racing submissions can't both win.
   That's the replay check.
5. Rate limits: 20 submissions per player per hour, and 60 run starts per address.

The stored score is always the server's own number. The client's claim is kept in
`client_meta`, so a suspicious run can be looked at rather than guessed about.

### Identity

A first name is all anyone is asked for. Alongside it the browser keeps a random player id
in `localStorage`, so a person's runs collapse to their best and they can see their own
standing. Nothing is trusted to it: clearing site data makes you a new player. Addresses
are only ever stored hashed, for rate limiting.

### Environment variables

Set these in Netlify under **Site configuration → Environment variables**:

| Variable | Where it comes from |
| --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → Data API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys. Server only |
| `HASH_SALT` | Any long random string you generate once. `EMAIL_HASH_SALT` is still accepted |
| `CONTEST_ENDS_AT` | Optional ISO timestamp closing the Fore Ryan! contest. After it, runs can't be started or posted; the standings stay readable. Each game names its own variable in `netlify/functions/_games.ts` |

The service role key bypasses Row Level Security. It belongs only in Netlify's environment,
never in the repo or in client code.

## Deploy (Netlify)

Netlify builds with `npm run build` and publishes `dist/`; both are set in `netlify.toml`.
The site root serves the lobby, so the shareable link is just the domain.

The link preview (`public/og.png`) and the favicons are generated by `scripts/make-og.mjs`
and `scripts/make-icons.mjs`, then committed, so a build never needs the image tools. The
absolute URL the preview tags need is filled in at build time from Netlify's own `URL`.

---

## Fore Ryan! ⛳ (Birthday 2026)

Ryan's floating head launches golf balls at holes sliding across the top of the screen,
while dodging falling trees and water hazards.

- **Birthday Round**: the gift. Sink 5 holes and the payoff fires: slow motion on the
  winning shot, a screen flash, confetti, a party hat, and the "Happy Birthday" melody.
- **Contest Mode**: the leaderboard run. Five lives, carried across levels that keep
  getting harder until one of them finishes you.

### Controls

- **Desktop:** ← / → or A / D to move, hold Space to shoot, Enter starts and restarts.
- **Mobile:** touch and drag to move; balls fire automatically while you hold.

Hazards block shots mid-air and cost a life on contact. Each hole sunk makes Ryan's head
bigger, and it resets at the start of every level.

### Where things are

Everything lives under `games/birthday-2026/`:

| Path | Purpose |
| --- | --- |
| `rules/rules.ts` | Levels, hazards, and the constants the server also needs |
| `rules/scoring.ts` | The points formula and the submission validator |
| `rules/types.ts` | Level and run shapes exchanged with the backend |
| `index.html` | Page shell: HUD, level banner, and the overlay screens |
| `src/main.ts` | Bootstrap: wires buttons, loads images, starts the loop |
| `src/game/` | Config, state, progression, world, simulation, input, audio |
| `src/render/` | Canvas drawing, per-level themes and scenery, overlay portraits |
| `src/ui/` | DOM refs, HUD, banner, screens, and the leaderboard |

**Why `rules/` sits apart from `src/`.** The server can only decide whether a score is real
if it knows the level table, the fire rate, and the formula. `netlify/functions/` imports
this one copy, so the game and the validator can't drift apart. A duplicated constant would
eventually reject a legitimate top score mid-contest.

### Levels

Five levels are hand-tuned in `rules/rules.ts`. Past those, the tail is generated from the
last one and keeps tightening with no plateau, so a contest run always ends on its own and
the board ranks skill rather than stamina.

| Level | Name | Holes | Hazards |
| --- | --- | --- | --- |
| 1 | Driving Range | 5 | 💧 🌳 |
| 2 | Front Nine | 6 | 🌧️ 🌾 |
| 3 | Water Hazard | 7 | 🌊 🦆 |
| 4 | The Woods | 8 | 🍂 🌲 |
| 5 | Championship | 9 | 🏌️ 🚩 |
| 6+ | Sudden Death | up to 12 | ❄️ ⭐ / ☄️ 🌋 |

Each level has its own sky and a procedurally drawn horizon (`src/render/scenery.ts`). It's
seeded, so a skyline looks the same every time, and painted once offscreen. Reskinning a
hazard only changes its glyph: there are still two hazard slots, and the slot drives
spawning and collision.

### Scoring

Contest Mode only. Every award is multiplied by the level number.

| Award | Value | When |
| --- | --- | --- |
| Hole | 100 × level | Each hole sunk, even on the level you die on |
| Level clear | 500 × level | Clearing the level |
| Flawless | 300 × level | Clearing it without losing a life |
| Speed | 20 × level | Per whole second under the level's par |

### Sound

On by default. The audio context starts on the first tap of a mode button, so autoplay
blocking never trips. Everything is synthesized with WebAudio, with no audio files. The win
melody, "Happy Birthday to You", has been public domain since 2016. On iOS, the silent
switch also mutes WebAudio.

### Swapping the photo

In `src/game/config.ts`, `HEAD_IMAGE_SRC` points at `/assets/ryan/ryan-head-floating.png`,
and `HEAD_TRIM` marks where the head sits inside the PNG's transparent margins. For a
different cutout:
1. Put it in `public/assets/ryan/` and point `HEAD_IMAGE_SRC` at it.
2. Set `HEAD_TRIM = null`.

Use a transparent background; a rectangular photo will show as a box.

### Tuning

Per-level difficulty lives in `rules/rules.ts`. Everything else is in `src/game/config.ts`:
- `HEAD_GROW`: head growth per hole sunk
- `HAZARD_FALL`: base hazard fall speed
- `RAMP_EVERY_MS`, `RAMP_SPEED_STEP`: the in-level difficulty ramp
- `FINALE_MS`, `FINALE_SLOW`: length and time-scale of the winning-shot slow motion
- `INVULN_MS`: grace period after a hit
- `HITBOX_SCALE`: lower is more forgiving

### Notes

- The page is hidden until its stylesheet loads, so it never flashes unstyled.
- Collision uses an ellipse matched to the head image. Shot checks are swept, so fast shots
  can't skip through between frames.
- The smoke test seeds `Math.random`, so a headless run always passes or always fails,
  never intermittently.
- The original single-file version is preserved at the `v1-single-file` tag.
