// The frame loop the 3D pages share. Kept apart from shared/three.ts, which
// pulls in Three.js, so a page can import it before that download has finished.

export interface LoopOptions {
  /**
   * Draw at most this often while `busy` says nothing is moving quickly, to
   * save a phone's battery and heat. Omit to draw every frame.
   */
  idleFps?: number;
  /** Whether something on screen is moving quickly right now, so needs every frame. */
  busy?: () => boolean;
}

export interface Loop {
  /** Starts it again after `stop`, without jumping the scene ahead. */
  start(): void;
  /** No more frames until `start`, e.g. once the page is on its way to another. */
  stop(): void;
}

/**
 * Calls `frame` with seconds elapsed and the time since the last frame drawn,
 * every animation frame or at `idleFps` while idle. Starts straight away.
 */
export function runLoop(frame: (time: number, dt: number) => void, opts: LoopOptions = {}): Loop {
  const minGap = opts.idleFps ? 1 / opts.idleFps : 0;
  let last = 0;
  let handle = 0;
  let running = false;
  const tick = (now: number): void => {
    // A frame stamped before start() read the clock would step backwards.
    const gap = Math.max(0, (now - last) / 1000);
    // Slack for frames landing off time (Safari's do, by a few ms), yet still
    // short of the frame after on a 120 Hz screen.
    if (gap < minGap - 0.008 && !opts.busy?.()) {
      handle = requestAnimationFrame(tick);
      return;
    }
    last = now;
    const mine = handle;
    // Clamp, so a tab returning from the background does not jump the scene.
    frame(now / 1000, Math.min(gap, 0.1));
    // Asked for after the frame: one that throws ends the loop, as one that
    // stops it does. (One that stopped and restarted it has asked already.)
    if (running && handle === mine) handle = requestAnimationFrame(tick);
  };
  const loop: Loop = {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      handle = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(handle);
    },
  };
  loop.start();
  return loop;
}
