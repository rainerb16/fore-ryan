import "./styles.css";
import "./game/input";

import { MODE } from "./game/config";
import { initImages } from "./game/images";
import { startLoop } from "./game/loop";
import { redrawPortraits } from "./render/portraits";
import { resize } from "./game/world";
import {
  boardBackBtn,
  boardBtn,
  contestBtn,
  loseBtn,
  runAgainBtn,
  runBoardBtn,
  runHomeBtn,
  startBtn,
  startHint,
  winBtn,
} from "./ui/dom";
import { showBoard, showStart, startGame } from "./ui/screens";

startBtn.addEventListener("click", () => startGame(MODE.BIRTHDAY));
winBtn.addEventListener("click", () => startGame(MODE.BIRTHDAY));
loseBtn.addEventListener("click", () => startGame(MODE.BIRTHDAY));

contestBtn.addEventListener("click", () => startGame(MODE.CONTEST));
runAgainBtn.addEventListener("click", () => startGame(MODE.CONTEST));

boardBtn.addEventListener("click", showBoard);
runBoardBtn.addEventListener("click", showBoard);
boardBackBtn.addEventListener("click", showStart);
runHomeBtn.addEventListener("click", showStart);

initImages(
  () => {
    resize();
    redrawPortraits();
  },
  () => redrawPortraits(),
);

resize();
showStart();
redrawPortraits();
startHint.textContent =
  "ontouchstart" in window
    ? "👆 Drag to move · balls fire while you hold"
    : "← → or A / D to move · Space to shoot";
startLoop();
