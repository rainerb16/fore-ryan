# Ryan Arcade 🕹️

A small, growing arcade of browser games made as gifts for Ryan, with a new game for each
birthday, Christmas, and Easter. The lobby is a 3D arcade room. Each game is an upright
cabinet whose screen runs in attract mode, cycling gameplay, its top three scores, and
INSERT COIN.

| Game | Occasion | Path |
| --- | --- | --- |
| **Ryan Ski Jump** 🎿 | Christmas 2026 | `/games/christmas-2026/` |
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
- `season.ts`, `festive.ts`: the Christmas dressing (see below)

Arrow keys, swipes, taps, or the on-screen buttons move between cabinets. Enter, PLAY, or
a tap on the focused cabinet zooms into its screen and loads the game.

**From 1 December to 6 January** the room dresses for Christmas: twinkling bulbs along the
trim above the cabinets, a lit tree with presents between the poster and the first cabinet,
and snow drifting through the room (left out for anyone who prefers reduced motion). Add
`?season=christmas` to the address to preview it, or `?season=none` to turn it off.

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

`supabase/schema.sql` creates or upgrades the tables. It's one transaction and safe to re-run;
paste the whole file into the Supabase SQL editor. Each game's runs are tagged with its id,
and the `leaderboard` view keeps each player's best run per game, in that game's sort order.
`supabase/inspect.sql` is a read-only query that reports the live setup (view definition,
RLS, policies, grants, functions, constraints); run it before changing the schema.

To hide a run without deleting it, set `flagged = true` on it.

### Keeping the database awake

Supabase pauses a free project after a week without activity.
`.github/workflows/keep-alive.yml` reads the top birthday score through the live site on
Mondays and Thursdays, which counts as activity. If the read fails, the workflow fails and
GitHub emails you. It needs one repository variable, `SITE_URL` (the site's address), set
under **Settings → Secrets and variables → Actions → Variables**. Scheduled workflows only
run from the default branch, so it starts once this is merged to `main`.

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
| `CONTEST_ENDS_AT` | Optional ISO timestamp closing the Fore Ryan! contest. After it, runs can't be started or posted; the standings stay readable. A game opts into a closing date with `closesAtVar` in `netlify/functions/_games.ts`; Ryan Ski Jump has none, so its podium never closes |

The service role key bypasses Row Level Security. It belongs only in Netlify's environment,
never in the repo or in client code.

## Deploy (Netlify)

Netlify builds with `npm run build` and publishes `dist/`; both are set in `netlify.toml`.
The site root serves the lobby, so the shareable link is just the domain.

The link preview (`public/og.png`) and the favicons are generated by `scripts/make-og.mjs`
and `scripts/make-icons.mjs`, then committed, so a build never needs the image tools. The
absolute URL the preview tags need is filled in at build time from Netlify's own `URL`.

---

## Ryan Ski Jump 🎿 (Christmas 2026)

It's Christmas Eve at Canada Olympic Park in Calgary. Ryan, in a Santa suit with a sack of
presents, takes one ski jump at a time, with the city lit up below. The longest jumps go on
the "Happy Holidays from Action Furnace" podium. There's no closing date, so the board stays
open.

### Controls

The whole game is one button: Space, a click, or a tap.

1. **Push off:** press to leave the start gate.
2. **Take off:** tap just before the glowing lip. The closer to the lip, the bigger the pop:
   *perfect*, *good*, or *late* if you never tap.
3. **Glide:** hold to lean forward and fly further, then **let go before touchdown**. Still
   holding when you land is a crash, and crashes don't count.

While holding, drag to look around mid-glide. Take-off plays in slow motion, with Santa's
sleigh crossing the sky.

### The Christmas line

A glowing gold line crosses the landing hill at 130 m, with a lit star beside it. Land cleanly
past it for the payoff: "Happy Holidays!", fireworks over Calgary, and "Jingle Bells" (1857, public
domain). It takes a good or perfect take-off and a long glide, and a late take-off can never
reach it; `test/skijump.test.mjs` holds it to that. It's `CHRISTMAS_LINE_M` in
`rules/rules.ts`, and it changes nothing about the score. Any jump that misses the payoff
gets a gold hint on its result screen saying how far short it fell (or that a crash past the
line needs a clean landing), so players know there's something to reach.

### Sound

Like the golf game's, every sound is synthesized with WebAudio, with no audio files
(`src/audio.ts`): skis hissing on the inrun, wind in flight that rises as you lean in and
deepens in slow motion, sleigh bells panning across with Santa, a landing thud and a crowd
that roars louder for longer jumps, the crash, and the fireworks. The 🔊 button mutes it, and
the choice is remembered. Sound pauses when the tab is hidden, and stops completely when you
leave the game, even in browsers that keep the page cached for Back.

### Scoring

The score is the distance in centimetres, so a 90.5 m jump scores 9050. The server re-judges
every jump against the simulation itself (`rules/rules.ts`):
- **Refused:** malformed stats and crashes.
- **Kept but flagged for a look:** a jump farther than its take-off grade allows (with 2%
  headroom), outside 0–250 m, a run quicker than the shortest possible jump, or a glide
  longer than any flight.

### Where things are

Everything lives under `games/christmas-2026/`:

| Path | Purpose |
| --- | --- |
| `rules/hill.ts` | The hill's side profile in metres, read by the simulation, the renderer, and the server |
| `rules/sim.ts` | The deterministic jump simulation: inrun, take-off timing, flight, landing |
| `rules/rules.ts` | Points, the submitted details, and the server's plausibility limits |
| `src/main.ts` | Bootstrap and the screen flow |
| `src/scene.ts`, `src/world.ts` | The 3D view, the night sky, the Rockies, the distance markers, falling snow |
| `src/structure.ts`, `src/terrain.ts`, `src/trees.ts`, `src/snow.ts` | The jump tower and inrun, the hillside, the spruce, and the snow surface |
| `src/city.ts` | Calgary at night, landmarks included |
| `src/ryan.ts`, `src/head.ts` | Ryan's jointed body and his photo head with Santa's hat and beard |
| `src/lip.ts`, `src/sleigh.ts` | The lit lip, sponsor boards, and the Christmas line; Santa's sleigh and the presents spilled in a crash |
| `src/audio.ts`, `src/fireworks.ts` | All the sound, and the fireworks |
| `src/board.ts` | Posting a jump, and the podium |

Like the golf game, `rules/` has no rendering in it, so `netlify/functions/` and
`test/skijump.test.mjs` run the same simulation the player sees. Without WebGL, the page
says so and still shows the podium.

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
