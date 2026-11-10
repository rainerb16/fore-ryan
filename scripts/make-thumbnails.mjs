// Regenerates the gameplay thumbnails shown on the lobby's cabinet screens.
//
//   npm run build && npx vite preview --port 4199     (leave it running)
//   CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe" npm run thumbs
//
// Drives headless Chrome over the DevTools protocol: opens each game, plays a
// few seconds of it, and saves a 4:3 screenshot to public/assets/thumbs/.
// Needs Node 22+ for the built-in WebSocket.

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:4199";
const CHROME = process.env.CHROME;
const PORT = 9333;
const OUT = new URL("../public/assets/thumbs/", import.meta.url);

/** How to get each game to an interesting moment. */
const SHOTS = {
  "birthday-2026": [
    { eval: "document.getElementById('startBtn').click()" },
    { key: " " }, // hold fire
    { wait: 2600 },
  ],
};

if (!CHROME) {
  console.error("Set CHROME to the path of a Chrome or Edge executable.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "thumbs-"))}`,
  "--window-size=800,600",
  "--hide-scrollbars",
  "about:blank",
]);

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    target = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      .then((r) => r.json())
      .then((list) => list.find((t) => t.type === "page"))
      .catch(() => undefined);
  }
  if (!target) throw new Error("Chrome never opened a debugging port");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    pending.get(msg.id)?.(msg);
    pending.delete(msg.id);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  await send("Page.enable");
  for (const [game, steps] of Object.entries(SHOTS)) {
    await send("Page.navigate", { url: `${BASE}/games/${game}/` });
    await sleep(1500);
    for (const step of steps) {
      if (step.eval) await send("Runtime.evaluate", { expression: step.eval });
      if (step.key) await send("Input.dispatchKeyEvent", { type: "keyDown", key: step.key, code: "Space", windowsVirtualKeyCode: 32 });
      if (step.wait) await sleep(step.wait);
    }
    const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 82 });
    const file = new URL(`${game}.jpg`, OUT);
    writeFileSync(file, Buffer.from(data, "base64"));
    console.log("wrote", file.pathname);
  }
  ws.close();
} finally {
  browser.kill();
}
