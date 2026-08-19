// The leaderboard screen and the submission form. Owns no overlay visibility —
// screens.ts decides what is on show, so these two do not import each other.

import { fetchLeaderboard, submitRun, type LeaderboardEntry } from "../net/api";
import { store } from "../game/storage";
import type { RunSummary } from "../../shared/types";
import {
  boardList,
  boardStatus,
  emailInput,
  nameInput,
  submitBtn,
  submitForm,
  submitStatus,
} from "./dom";
import { formatPoints } from "./hud";

const NAME_KEY = "ryanbday.name";
const EMAIL_KEY = "ryanbday.email";

/** The run waiting to be posted, if any. Cleared once it is in. */
let pending: { summary: RunSummary; token: string | null } | null = null;
let posting = false;

/** "Closes on 3 September" while it runs, past tense once it has. */
function deadlineNote(closesAt: string, closed: boolean): string {
  const when = new Date(closesAt);
  if (Number.isNaN(when.getTime())) return "";
  const date = when.toLocaleDateString(undefined, { day: "numeric", month: "long" });
  return closed ? `Contest closed on ${date}` : `Contest closes ${date}`;
}

export const formatDuration = (ms: number): string => {
  const total = Math.round(ms / 1000);
  const mins = Math.floor(total / 60);
  return mins > 0 ? `${mins}m ${String(total % 60).padStart(2, "0")}s` : `${total}s`;
};

// --- submission -------------------------------------------------------------

/** Called when a contest run ends, to arm the form on the run screen. */
export function armSubmission(summary: RunSummary, token: string | null): void {
  pending = { summary, token };
  posting = false;

  nameInput.value = store.get(NAME_KEY, "");
  emailInput.value = store.get(EMAIL_KEY, "");
  submitForm.hidden = false;
  submitBtn.disabled = false;
  submitBtn.textContent = "Post to Leaderboard 🏆";

  if (!token) {
    // No token means run-start never answered, so this run can never be posted.
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
  const email = emailInput.value.trim();
  if (!displayName || !email) return;

  posting = true;
  submitBtn.disabled = true;
  submitStatus.textContent = "Posting…";

  const result = await submitRun({
    token: pending.token,
    displayName,
    email,
    summary: pending.summary,
  });

  if (!result.ok) {
    posting = false;
    submitBtn.disabled = false;
    submitStatus.textContent = result.error;
    return;
  }

  // Remembered so a second run does not mean typing it all again.
  store.set(NAME_KEY, displayName);
  store.set(EMAIL_KEY, email);

  submitForm.hidden = true;
  submitStatus.textContent = `Posted — ${formatPoints(result.points)} points.`;
  pending = null;

  // The rank is a nice payoff but not worth failing the submission over.
  try {
    const { mine } = await fetchLeaderboard(email);
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

const cell = (className: string, text: string): HTMLElement => {
  const span = document.createElement("span");
  span.className = className;
  // textContent, not innerHTML — display names are typed by other people.
  span.textContent = text;
  return span;
};

function row(entry: LeaderboardEntry, isMine: boolean): HTMLLIElement {
  const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : "";
  const li = document.createElement("li");
  if (isMine) li.className = "mine";
  li.append(
    cell("rank", medal || String(entry.rank ?? "—")),
    cell("who", entry.display_name),
    cell("meta", `LVL ${entry.level_reached} · ${formatDuration(entry.duration_ms)}`),
    cell("pts", formatPoints(entry.points)),
  );
  return li;
}

export async function loadBoard(): Promise<void> {
  boardList.replaceChildren();
  boardStatus.textContent = "Loading…";

  try {
    const email = store.get(EMAIL_KEY, "") || null;
    const { top, mine, closesAt, closed } = await fetchLeaderboard(email);

    const deadline = closesAt ? deadlineNote(closesAt, closed === true) : "";

    if (top.length === 0) {
      boardStatus.textContent = closed
        ? "The contest closed with no runs posted."
        : `No runs posted yet — be the first. ⛳${deadline ? ` ${deadline}` : ""}`;
      return;
    }

    const mineIsListed = mine?.rank != null && mine.rank <= top.length;
    boardList.append(...top.map((e) => row(e, mineIsListed && e.rank === mine?.rank)));

    if (mine && !mineIsListed) {
      // Ranked, but below the cut — pin it under the list.
      const gap = document.createElement("li");
      gap.className = "gap";
      gap.textContent = "⋯";
      boardList.append(gap, row(mine, true));
    }
    const prompt = mine ? "" : "Play a contest run to get on the board.";
    boardStatus.textContent = [deadline, prompt].filter(Boolean).join(" · ");
  } catch (err) {
    boardStatus.textContent =
      err instanceof Error ? err.message : "Could not load the leaderboard";
  }
}
