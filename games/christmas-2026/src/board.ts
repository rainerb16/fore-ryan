// Posting a jump, and the podium: "Happy Holidays from Action Furnace" over the
// top three on their steps, with the rest of the top ten listed below. Screens
// are shown and hidden by main.ts; this fills them in.

import { cleanName } from "../../../shared/names";
import { getLeaderboard, rememberName, savedName, submitRun, type LeaderboardEntry } from "../../../shared/scores";
import { detailsOf, GAME_ID, pointsFor, type Jump, type JumpDetails } from "../rules";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const form = $<HTMLFormElement>("postForm");
const nameInput = $<HTMLInputElement>("nameInput");
const postBtn = $<HTMLButtonElement>("postBtn");
const postStatus = $("postStatus");
const podium = $<HTMLOListElement>("podium");
const boardList = $<HTMLOListElement>("boardList");
const boardStatus = $("boardStatus");

/** The podium plus the list under it. */
const BOARD_LIMIT = 10;

/** Points are centimetres. */
export const metres = (points: number): string => `${(points / 100).toFixed(1)} m`;

let pending: { details: JumpDetails; token: string } | null = null;
let posting = false;
/** Counts jumps armed, so a slow token for an earlier jump never arms the form for it. */
let armed = 0;
let onPosted: (note: string) => void = () => undefined;

/**
 * Sets up the result screen's form for a finished jump. `token` is the run
 * token asked for when the jump began; null if the server would not issue one.
 */
export async function armPost(jump: Jump, token: Promise<string | null>, posted: (note: string) => void): Promise<void> {
  const turn = ++armed;
  pending = null;
  posting = false;
  onPosted = posted;
  form.hidden = true;
  postStatus.textContent = "";

  if (jump.crashed) {
    postStatus.textContent = "Wipeouts don't make the podium. Land one to post it!";
    return;
  }
  const issued = await token;
  if (turn !== armed) return; // another jump has finished since
  if (!issued) {
    postStatus.textContent = "The podium isn't taking jumps right now, so this one can't be posted.";
    return;
  }
  pending = { details: detailsOf(jump), token: issued };
  nameInput.value = savedName();
  postBtn.disabled = false;
  form.hidden = false;
}

async function post(event: Event): Promise<void> {
  event.preventDefault();
  const displayName = cleanName(nameInput.value);
  if (posting || !pending || !displayName) return;

  posting = true;
  postBtn.disabled = true;
  postStatus.textContent = "Posting…";
  const { details, token } = pending;
  const result = await submitRun(GAME_ID, token, {
    displayName,
    points: pointsFor(details.distance_m),
    durationMs: details.duration_ms,
    details,
  });
  posting = false;

  if (!result.ok) {
    postBtn.disabled = false;
    postStatus.textContent = result.error;
    return;
  }
  rememberName(displayName); // so the next jump is not a retype
  pending = null;
  form.hidden = true;
  postStatus.textContent = "";
  onPosted(
    result.local
      ? `The podium is offline, so your ${metres(result.points)} is saved on this device.`
      : `Posted: ${metres(result.points)}!`,
  );
}

form.addEventListener("submit", (e) => void post(e));

// --- the podium -------------------------------------------------------------

const MEDALS = ["🥇", "🥈", "🥉"];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

/** One step: second, first, third from left to right, as podiums stand. */
function step(place: number, entry: LeaderboardEntry | undefined, mine: boolean): HTMLLIElement {
  const li = el("li", `step place-${place}${mine ? " mine" : ""}`);
  li.append(
    el("span", "medal", MEDALS[place - 1]),
    el("span", "who", entry?.display_name ?? "—"),
    el("span", "far", entry ? metres(entry.points) : ""),
    el("span", "block", String(place)),
  );
  return li;
}

function row(entry: LeaderboardEntry, mine: boolean): HTMLLIElement {
  const li = el("li", mine ? "mine" : "");
  li.append(el("span", "rank", String(entry.rank ?? "—")), el("span", "who", entry.display_name), el("span", "far", metres(entry.points)));
  return li;
}

function deadlineNote(closesAt: string | null, closed: boolean): string {
  if (!closesAt) return "";
  const when = new Date(closesAt);
  if (Number.isNaN(when.getTime())) return "";
  const date = when.toLocaleDateString(undefined, { day: "numeric", month: "long" });
  return closed ? `The podium closed on ${date}.` : `The podium closes ${date}.`;
}

/** Fetches the standings and fills in the podium, with `note` (e.g. "Posted!") on top. */
export async function loadPodium(note = ""): Promise<void> {
  podium.replaceChildren();
  boardList.replaceChildren();
  boardStatus.textContent = note ? `${note} Loading…` : "Loading…";

  try {
    const { top, mine, closesAt, closed, local } = await getLeaderboard(GAME_ID, BOARD_LIMIT);
    const isMine = (e: LeaderboardEntry): boolean => !local && mine?.rank != null && e.rank === mine.rank;
    podium.append(...[2, 1, 3].map((place) => step(place, top[place - 1], !!top[place - 1] && isMine(top[place - 1]))));
    boardList.append(...top.slice(3).map((e) => row(e, isMine(e))));
    if (!local && mine?.rank != null && mine.rank > top.length) {
      // Ranked, but below the cut: pin it under the list.
      boardList.append(el("li", "gap", "⋯"), row(mine, true));
    }

    const status = local
      ? "The podium is offline, so these are jumps saved on this device."
      : top.length === 0
        ? closed ? "The podium closed with no jumps posted." : "No jumps posted yet. Be the first!"
        : mine?.rank ? `You're #${mine.rank}.` : "";
    boardStatus.textContent = [note, status, local ? "" : deadlineNote(closesAt, closed)].filter(Boolean).join(" ");
  } catch (err) {
    boardStatus.textContent = err instanceof Error ? err.message : "Could not load the podium.";
  }
}
