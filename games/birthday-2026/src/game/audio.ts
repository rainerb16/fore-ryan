import { muteBtn } from "../ui/dom";
import { createAudio } from "../../../../shared/audio";

const audio = createAudio({ muteKey: "ryanbday.muted", level: 1, playOnSilent: true });
const { tone } = audio;
audio.listen();

const updateMuteBtn = (): void => {
  muteBtn.textContent = audio.isMuted() ? "🔇" : "🔊";
};
updateMuteBtn();

muteBtn.addEventListener("click", () => {
  audio.setMuted(!audio.isMuted());
  updateMuteBtn();
});

// "Happy Birthday to You" — [frequency, beats]. Public domain since 2016.
const BIRTHDAY_MELODY: Array<[number, number]> = [
  [392, 0.75], [392, 0.25], [440, 1], [392, 1], [523.25, 1], [493.88, 2],
  [392, 0.75], [392, 0.25], [440, 1], [392, 1], [587.33, 1], [523.25, 2],
  [392, 0.75], [392, 0.25], [783.99, 1], [659.25, 1], [523.25, 1], [493.88, 1], [440, 2],
  [698.46, 0.75], [698.46, 0.25], [659.25, 1], [523.25, 1], [587.33, 1], [523.25, 2],
];

function playBirthdaySong(): void {
  const beat = 0.3;
  let at = 0;
  for (const [freq, beats] of BIRTHDAY_MELODY) {
    tone(freq, beats * beat * 0.9, "triangle", at, 0.17);
    tone(freq / 2, beats * beat * 0.9, "sine", at, 0.06);
    at += beats * beat;
  }
}

export const sfx = {
  shoot: () => tone(720, 0.06, "square", 0, 0.07),
  sink: () => {
    tone(880, 0.09, "triangle");
    tone(1320, 0.14, "triangle", 0.06);
  },
  block: () => tone(180, 0.08, "square", 0, 0.09),
  hit: () => {
    tone(150, 0.2, "sawtooth", 0, 0.14);
    tone(96, 0.26, "sawtooth", 0.05, 0.12);
  },
  levelUp: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "triangle", i * 0.075, 0.1)),
  win: playBirthdaySong,
  lose: () => [392, 349, 294].forEach((f, i) => tone(f, 0.24, "sine", i * 0.13, 0.14)),
};
