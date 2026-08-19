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
  loseContestBtn,
  loseHomeBtn,
  runAgainBtn,
  runBoardBtn,
  runHomeBtn,
  startBtn,
  startHint,
  winBtn,
  winContestBtn,
  winHomeBtn,
} from "./ui/dom";
import { showBoard, showStart, startGame } from "./ui/screens";

startBtn.addEventListener("click", () => startGame(MODE.BIRTHDAY));
winBtn.addEventListener("click", () => startGame(MODE.BIRTHDAY));
loseBtn.addEventListener("click", () => startGame(MODE.BIRTHDAY));

contestBtn.addEventListener("click", () => startGame(MODE.CONTEST));
runAgainBtn.addEventListener("click", () => startGame(MODE.CONTEST));
// The birthday round is a dead end without these: win or lose, you could only
// play it again, never reach the contest.
winContestBtn.addEventListener("click", () => startGame(MODE.CONTEST));
loseContestBtn.addEventListener("click", () => startGame(MODE.CONTEST));

boardBtn.addEventListener("click", showBoard);
runBoardBtn.addEventListener("click", showBoard);
boardBackBtn.addEventListener("click", showStart);
runHomeBtn.addEventListener("click", showStart);
winHomeBtn.addEventListener("click", showStart);
loseHomeBtn.addEventListener("click", showStart);

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
