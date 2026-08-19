// The standings screen and the submission form. Owns no overlay visibility —
// screens.ts decides what is on show, so the two do not import each other.

import { fetchLeaderboard, submitRun, type LeaderboardEntry } from "../net/api";
import { store } from "../game/storage";
import type { RunSummary } from "../../shared/types";
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
const PLAYER_KEY = "ryanbday.player";

/**
 * A random id this browser keeps, so a person's runs collapse to their best and
 * they can be shown their own standing. It identifies nobody and proves nothing:
 * clearing site data makes you a new player, which is the accepted cost of not
 * asking for an email.
 */
function playerId(): string {
  const saved = store.get(PLAYER_KEY, "");
  if (saved) return saved;
  const id = crypto.randomUUID();
  store.set(PLAYER_KEY, id);
  return id;
}

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
    // run-start never answered, so this run can never be posted.
    submitForm.hidden = true;
    submitStatus.textContent = "The leaderboard is offline — this run can't be posted.";
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

  const displayName = nameInput.value.trim();
  if (!displayName) return;

  posting = true;
  submitBtn.disabled = true;
  submitStatus.textContent = "Posting…";

  const result = await submitRun({
    token: pending.token,
    displayName,
    playerId: playerId(),
    summary: pending.summary,
  });

  if (!result.ok) {
    posting = false;
    submitBtn.disabled = false;
    submitStatus.textContent = result.error;
    return;
  }

  store.set(NAME_KEY, displayName); // so a second run is not a retype

  submitForm.hidden = true;
  submitStatus.textContent = `Posted — ${formatPoints(result.points)} points.`;
  pending = null;

  // The rank is a payoff, not worth failing the submission over.
  try {
    const { mine } = await fetchLeaderboard(playerId());
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
    `LVL ${entry.level_reached} · ${formatDuration(entry.duration_ms)}`,
    formatPoints(entry.points),
  ]);
}

export async function loadBoard(): Promise<void> {
  boardList.replaceChildren();
  boardStatus.textContent = "Loading…";

  try {
    const { top, mine, closesAt, closed } = await fetchLeaderboard(store.get(PLAYER_KEY, "") || null);
    const deadline = deadlineNote(closesAt, closed);

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
