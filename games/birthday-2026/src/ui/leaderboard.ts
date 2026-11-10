// The standings screen and the submission form. Owns no overlay visibility —
// screens.ts decides what is on show, so the two do not import each other.

import { cleanName } from "../../../../shared/names";
import { getLeaderboard, submitRun, type LeaderboardEntry } from "../../../../shared/scores";
import { store } from "../../../../shared/storage";
import { GAME_ID } from "../game/config";
import type { RunSummary } from "../../rules/types";
import {
  boardList,
  boardStatus,
  nameInput,
  submitBtn,
  submitForm,
  submitStatus,
} from "./dom";
import { row } from "./elements";
import { formatDuration, formatPoints } from "./format";

const NAME_KEY = "ryanbday.name";
/** The standings screen's length, as the API served it before the arcade. */
const BOARD_LIMIT = 25;

/** The run waiting to be posted. Cleared once it is in. */
let pending: { summary: RunSummary; token: string | null } | null = null;
let posting = false;

function deadlineNote(closesAt: string | null, closed: boolean): string {
  if (!closesAt) return "";
  const when = new Date(closesAt);
  if (Number.isNaN(when.getTime())) return "";
  const date = when.toLocaleDateString(undefined, { day: "numeric", month: "long" });
  return closed ? `Contest closed on ${date}` : `Contest closes ${date}`;
}

// --- submission -------------------------------------------------------------

/** Arms the form on the run screen when a contest run ends. */
export function armSubmission(summary: RunSummary, token: string | null): void {
  pending = { summary, token };
  posting = false;

  nameInput.value = store.get(NAME_KEY, "");
  submitForm.hidden = false;
  submitBtn.disabled = false;

  if (!token) {
    // The server refused to start the run (closed or rate limited).
    submitForm.hidden = true;
    submitStatus.textContent = "The leaderboard isn't taking runs right now — this one can't be posted.";
  } else if (summary.points <= 0) {
    submitForm.hidden = true;
    submitStatus.textContent = "Sink at least one hole to post a score.";
  } else {
    submitStatus.textContent = "";
  }
}

async function post(event: Event): Promise<void> {
  event.preventDefault();
  if (posting || !pending?.token) return;

  const displayName = cleanName(nameInput.value);
  if (!displayName) return;

  posting = true;
  submitBtn.disabled = true;
  submitStatus.textContent = "Posting…";

  const { summary } = pending;
  const result = await submitRun(GAME_ID, pending.token, {
    displayName,
    points: summary.points,
    durationMs: summary.durationMs,
    details: summary,
  });

  if (!result.ok) {
    posting = false;
    submitBtn.disabled = false;
    submitStatus.textContent = result.error;
    return;
  }

  store.set(NAME_KEY, displayName); // so a second run is not a retype

  submitForm.hidden = true;
  pending = null;

  if (result.local) {
    submitStatus.textContent =
      `The leaderboard is offline — ${formatPoints(result.points)} points saved on this device.`;
    return;
  }
  submitStatus.textContent = `Posted — ${formatPoints(result.points)} points.`;

  // The rank is a payoff, not worth failing the submission over.
  try {
    const { mine } = await getLeaderboard(GAME_ID, BOARD_LIMIT);
    if (mine?.rank) {
      submitStatus.textContent =
        `Posted — ${formatPoints(result.points)} points. You're #${mine.rank}. 🏆`;
    }
  } catch {
    // leave the plain confirmation in place
  }
}

submitForm.addEventListener("submit", (e) => void post(e));

// --- standings --------------------------------------------------------------

const COLUMNS = ["rank", "who", "meta", "pts"];

function entryRow(entry: LeaderboardEntry, isMine: boolean): HTMLLIElement {
  const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : "";
  return row(isMine ? "mine" : "", COLUMNS, [
    medal || String(entry.rank ?? "—"),
    entry.display_name,
    // Scores kept on this device carry no level.
    [entry.level_reached && `LVL ${entry.level_reached}`, formatDuration(entry.duration_ms)]
      .filter(Boolean)
      .join(" · "),
    formatPoints(entry.points),
  ]);
}

export async function loadBoard(): Promise<void> {
  boardList.replaceChildren();
  boardStatus.textContent = "Loading…";

  try {
    const { top, mine, closesAt, closed, local } = await getLeaderboard(GAME_ID, BOARD_LIMIT);
    const deadline = deadlineNote(closesAt, closed);

    if (local) {
      boardStatus.textContent = top.length
        ? "The leaderboard is offline — showing scores saved on this device."
        : "The leaderboard is offline, and no scores are saved on this device yet.";
      boardList.append(...top.map((e) => entryRow(e, false)));
      return;
    }

    if (top.length === 0) {
      boardStatus.textContent = closed
        ? "The contest closed with no runs posted."
        : ["No runs posted yet — be the first. ⛳", deadline].filter(Boolean).join(" · ");
      return;
    }

    const mineIsListed = mine?.rank != null && mine.rank <= top.length;
    boardList.append(...top.map((e) => entryRow(e, mineIsListed && e.rank === mine?.rank)));

    if (mine && !mineIsListed) {
      // Ranked, but below the cut — pin it under the list.
      boardList.append(row("gap", [], ["⋯"]), entryRow(mine, true));
    }

    const prompt = mine ? "" : "Play a contest run to get on the board.";
    boardStatus.textContent = [deadline, prompt].filter(Boolean).join(" · ");
  } catch (err) {
    boardStatus.textContent =
      err instanceof Error ? err.message : "Could not load the leaderboard";
  }
}
