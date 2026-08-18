import "./styles.css";
import "./game/input";

import { STATE } from "./game/config";
import { initImages } from "./game/images";
import { startLoop } from "./game/loop";
import { game } from "./game/state";
import { redrawPortraits } from "./render/portraits";
import { reset, resize } from "./game/world";
import { loseBtn, startBtn, startHint, winBtn } from "./ui/dom";
import { startGame } from "./ui/screens";

startBtn.addEventListener("click", startGame);
winBtn.addEventListener("click", startGame);
loseBtn.addEventListener("click", startGame);

initImages(
  () => {
    resize();
    redrawPortraits();
  },
  () => redrawPortraits(),
);

resize();
reset();
game.state = STATE.START;
redrawPortraits();
startHint.textContent =
  "ontouchstart" in window
    ? "👆 Drag to move · balls fire while you hold"
    : "← → or A / D to move · Space to shoot";
startLoop();
