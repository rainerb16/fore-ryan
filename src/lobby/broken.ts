// What the "Out of order" machines do when kicked. Each has a personality:
// a glitchy one that sparks and flickers messages, and an overheating one that
// vents steam and asks for Action Furnace. Every kick rocks the cabinet, now
// and then a coin rattles out of the return slot, and ten kicks in a row make
// it splutter to life for a few seconds before it dies again.
// Cabinet-local metres: the cabinet stands on y = 0 facing +z.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SRGBColorSpace,
} from "three";

export type Personality = "glitchy" | "overheating";

/** What a kick set off, so the arcade can play the matching sounds. */
export type Cue = "kick" | "spark" | "flicker" | "steam" | "coinOut" | "secret" | "powerDown";

export interface Broken {
  /** A kick. Returns what happened, for the sound. */
  poke(): Cue[];
  /** Advances the effects; called every frame with seconds elapsed. */
  update(time: number): void;
  /** Cues raised by the effects themselves since last asked (the power-down after a secret). */
  takeCues(): Cue[];
}

const GLITCHY_LINES = [
  ["INSERT COIN...", "JUST KIDDING"],
  ["ERROR 404:", "FUN NOT FOUND"],
  ["TRY TURNING IT", "OFF AND ON AGAIN"],
  ["RAINER'S ON IT", "(SINCE 2026)"],
  ["PLEASE STOP", "KICKING ME"],
];
const HOT_LINES = [
  ["OVERHEATING!", "CALL ACTION FURNACE"],
  ["TOO HOT TO PLAY", "CALL ACTION FURNACE"],
  ["HEATING. COOLING.", "NOT GAMING."],
];
const SCORES = [
  ["1ST", "RYAN", "999,999"],
  ["2ND", "RAINER", "     12"],
  ["3RD", "SANTA", "      3"],
];

/** Kicks this close together count towards the secret. */
const STREAK_GAP = 3;
const SECRET_AFTER = 10;
const SECRET_FOR = 4.5;
const SPARKS = 40;
const STEAM = 60;

const PIXEL_FONT = `"Courier New", ui-monospace, monospace`;
/** A chunky arcade token, big enough to catch the eye as it flies. */
const COIN_RADIUS = 0.035;

/** A soft round dot, so sparks and steam aren't drawn as squares. */
function dot(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g2 = c.getContext("2d");
  if (g2) {
    const g = g2.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    g2.fillStyle = g;
    g2.fillRect(0, 0, 32, 32);
  }
  return new CanvasTexture(c);
}

export interface BrokenParts {
  group: Group;
  /** The screen's bezel, which carries the screen and the taped-on sign. */
  bezel: Mesh;
  sign: Mesh;
  screenSize: [number, number];
  /** Where the coin door's slots are, and the front face of the kick panel. */
  slot: [number, number, number];
}

export function breakDown(parts: BrokenParts, personality: Personality): Broken {
  const { group, bezel, sign, screenSize, slot } = parts;

  // --- the screen: a canvas over the dead tube, shown in flickers ---------------
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 332;
  const ctx = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const screenMaterial = new MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false });
  const screen = new Mesh(new PlaneGeometry(...screenSize), screenMaterial);
  screen.position.z = 0.0215; // just over the dark tube, under the glass
  bezel.add(screen);

  const colour = personality === "overheating" ? "#ff5a3c" : "#5dff8a";
  function drawLines(lines: string[]): void {
    if (!ctx) return;
    ctx.fillStyle = "#020403";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = colour;
    ctx.font = `bold 30px ${PIXEL_FONT}`;
    ctx.textAlign = "center";
    // Above the taped-on sign, which covers the middle.
    lines.forEach((line, i) => ctx.fillText(line, 240, 44 + i * 36, 450));
    scanlines();
    texture.needsUpdate = true;
  }
  function drawScores(): void {
    if (!ctx) return;
    ctx.fillStyle = "#020403";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd166";
    ctx.font = `bold 36px ${PIXEL_FONT}`;
    ctx.fillText("HIGH SCORES", 240, 66);
    ctx.font = `bold 32px ${PIXEL_FONT}`;
    SCORES.forEach(([rank, name, score], i) => {
      const y = 140 + i * 56;
      ctx.fillStyle = i === 0 ? "#5dff8a" : "#36e2ff";
      ctx.textAlign = "left";
      ctx.fillText(rank, 40, y);
      ctx.fillText(name, 130, y);
      ctx.textAlign = "right";
      ctx.fillText(score, 440, y);
    });
    scanlines();
    texture.needsUpdate = true;
  }
  function scanlines(): void {
    if (!ctx) return;
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    for (let y = 0; y < canvas.height; y += 4) ctx.fillRect(0, y, canvas.width, 2);
  }

  // --- sparks from the coin door, and steam from the top vents ------------------
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkGeometry = new BufferGeometry();
  sparkGeometry.setAttribute("position", new BufferAttribute(sparkPos, 3));
  const soft = dot();
  const sparkMaterial = new PointsMaterial({
    map: soft,
    color: "#ffb347",
    size: 0.018,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const sparks = new Points(sparkGeometry, sparkMaterial);
  sparks.frustumCulled = false;
  // Never a tap target: three gives Points a 1 m pick radius, so even faded
  // particles would catch taps meant for the wall or the next cabinet.
  sparks.raycast = () => {};
  group.add(sparks);
  let sparkAge = Infinity;

  const steamPos = new Float32Array(STEAM * 3);
  const steamVel = new Float32Array(STEAM * 3);
  const steamGeometry = new BufferGeometry();
  steamGeometry.setAttribute("position", new BufferAttribute(steamPos, 3));
  // Grey, not white: the ceiling spotlight makes anything pale glow.
  const steamMaterial = new PointsMaterial({ map: soft, color: "#8a8a96", size: 0.12, transparent: true, opacity: 0, depthWrite: false });
  const steam = new Points(steamGeometry, steamMaterial);
  steam.frustumCulled = false;
  steam.raycast = () => {};
  group.add(steam);
  let steamAge = Infinity;

  // --- a coin out of the return slot ----------------------------------------------
  const coin = new Mesh(
    new CylinderGeometry(COIN_RADIUS, COIN_RADIUS, 0.006, 24),
    new MeshStandardMaterial({ color: "#e0b040", emissive: "#d9a93a", emissiveIntensity: 0.35, metalness: 0.9, roughness: 0.3 }),
  );
  // On its edge (axis along x) and spinning on that axis; its holder carries
  // it along and turns it to face the way it's rolling.
  coin.rotation.order = "ZYX";
  coin.rotation.z = Math.PI / 2;
  const coinHolder = new Group();
  coinHolder.add(coin);
  coinHolder.visible = false;
  group.add(coinHolder);
  const coinState = { age: Infinity, vx: 0, vy: 0, vz: 0 };

  // --- state -------------------------------------------------------------------------
  let last = 0;
  let now = 0;
  let kicks = 0;
  let lastKick = -Infinity;
  let line = 0;
  let rock = 0; // the cabinet's rocking, radians, decaying
  let rockVel = 0;
  /** The screen showing something: when it started, how long for, and whether it's the secret. */
  let showing: { from: number; until: number; secret: boolean } | null = null;
  const pending: Cue[] = [];

  function burstSparks(): void {
    for (let i = 0; i < SPARKS; i++) {
      sparkPos.set(slot, i * 3);
      const a = Math.random() * Math.PI * 2;
      const up = 0.6 + Math.random() * 1.4;
      sparkVel.set([Math.cos(a) * 0.9 * Math.random(), up, 0.4 + Math.random() * 0.9], i * 3);
    }
    sparkAge = 0;
  }

  function ventSteam(): void {
    for (let i = 0; i < STEAM; i++) {
      // Out of the top, spread across the cabinet's width.
      steamPos.set([(Math.random() - 0.5) * 0.6, 1.94, -0.2 + Math.random() * 0.3], i * 3);
      steamVel.set([(Math.random() - 0.5) * 0.08, 0.25 + Math.random() * 0.3, (Math.random() - 0.3) * 0.08], i * 3);
    }
    steamAge = 0;
  }

  function dropCoin(): void {
    coinHolder.position.set(slot[0] + 0.06, slot[1] - 0.12, slot[2] + 0.02);
    // Spat out of the return, up past the on-screen controls (which cover the
    // coin door) so the camera sees it, before it falls to the carpet below the view.
    coinState.vx = (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.15);
    coinState.vy = 3.3;
    coinState.vz = 0.6;
    coinState.age = 0;
    coinHolder.visible = true;
  }

  function show(lines: string[] | null, secs: number): void {
    if (lines) drawLines(lines);
    else drawScores();
    showing = { from: now, until: now + secs, secret: lines === null };
  }

  return {
    poke() {
      if (showing?.secret) return []; // it's busy showing off
      const cues: Cue[] = ["kick"];
      rockVel += 0.35 * (Math.random() < 0.5 ? -1 : 1);
      kicks = now - lastKick < STREAK_GAP ? kicks + 1 : 1;
      lastKick = now;

      if (kicks >= SECRET_AFTER) {
        kicks = 0;
        sign.visible = false; // the sign falls off as it comes to life
        show(null, SECRET_FOR);
        cues.push("secret");
        return cues;
      }

      if (personality === "glitchy") {
        // Sparks on odd kicks, a message on even ones, and both on every third.
        if (kicks % 2 === 1 || kicks % 3 === 0) {
          burstSparks();
          cues.push("spark");
        }
        if (kicks % 2 === 0 || kicks % 3 === 0) {
          show(GLITCHY_LINES[line++ % GLITCHY_LINES.length], 1.6);
          cues.push("flicker");
        }
      } else {
        ventSteam();
        cues.push("steam");
        show(HOT_LINES[line++ % HOT_LINES.length], 1.8);
        cues.push("flicker");
      }
      if (kicks % 4 === 0) {
        dropCoin();
        cues.push("coinOut");
      }
      return cues;
    },

    takeCues() {
      return pending.splice(0);
    },

    update(time) {
      const dt = Math.min(time - last, 0.1);
      last = time;
      now = time;

      // Rocking on its base after a kick, like a heavy cabinet on a carpet.
      // A stiff spring, well damped: a couple of sways, a few degrees at most.
      rockVel += (-150 * rock - 6 * rockVel) * dt;
      rock += rockVel * dt;
      group.rotation.z = rock;

      // The screen: flickering on, holding, and dropping out.
      if (showing) {
        const t = now - showing.from;
        const left = showing.until - now;
        if (left <= 0) {
          screenMaterial.opacity = 0;
          if (showing.secret) {
            sign.visible = true;
            pending.push("powerDown");
          }
          showing = null;
        } else {
          const flickerIn = t < 0.25 ? (Math.random() < 0.5 ? 0.2 : 1) : 1;
          const dying = left < 0.3 ? Math.random() * left * 3 : 1;
          const unsteady = showing.secret ? 0.92 + Math.random() * 0.08 : 0.85 + Math.random() * 0.15;
          screenMaterial.opacity = flickerIn * dying * unsteady;
        }
      }

      if (sparkAge < 1.2) {
        sparkAge += dt;
        for (let i = 0; i < SPARKS * 3; i += 3) {
          sparkVel[i + 1] -= 4 * dt;
          sparkPos[i] += sparkVel[i] * dt;
          sparkPos[i + 1] = Math.max(0.005, sparkPos[i + 1] + sparkVel[i + 1] * dt);
          sparkPos[i + 2] += sparkVel[i + 2] * dt;
        }
        sparkMaterial.opacity = Math.max(0, 1 - sparkAge / 0.6);
        sparkGeometry.getAttribute("position").needsUpdate = true;
      }

      if (steamAge < 2.4) {
        steamAge += dt;
        for (let i = 0; i < STEAM * 3; i += 3) {
          steamVel[i] *= 1 + dt * 0.8; // billowing out as it rises
          steamPos[i] += steamVel[i] * dt;
          steamPos[i + 1] += steamVel[i + 1] * dt;
          steamPos[i + 2] += steamVel[i + 2] * dt;
        }
        steamMaterial.opacity = 0.3 * Math.min(1, steamAge * 4) * Math.max(0, 1 - steamAge / 2.4);
        steamMaterial.size = 0.12 + steamAge * 0.12;
        steamGeometry.getAttribute("position").needsUpdate = true;
      }

      if (coinState.age < 4) {
        coinState.age += dt;
        if (coinHolder.position.y > COIN_RADIUS || coinState.vy > 0) {
          // Falling out of the slot.
          coinState.vy -= 9.8 * dt;
          coinHolder.position.y = Math.max(COIN_RADIUS, coinHolder.position.y + coinState.vy * dt);
          if (coinHolder.position.y <= COIN_RADIUS && coinState.vy < 0) coinState.vy = Math.abs(coinState.vy) > 0.6 ? -coinState.vy * 0.35 : 0;
        }
        // Rolling across the carpet and slowing to a stop.
        coinHolder.position.x += coinState.vx * dt;
        coinHolder.position.z += coinState.vz * dt;
        coinState.vx *= 1 - dt * 1.5;
        coinState.vz *= 1 - dt * 1.5;
        // Facing the way it's going, and rolling rather than sliding.
        coinHolder.rotation.y = Math.atan2(coinState.vx, coinState.vz);
        coin.rotation.y -= (Math.hypot(coinState.vx, coinState.vz) / COIN_RADIUS) * dt;
        if (coinState.age > 3.4) coinHolder.visible = Math.random() < (4 - coinState.age) / 0.6;
        if (coinState.age >= 4) coinHolder.visible = false;
      }
    },
  };
}
