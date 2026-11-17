// When the lobby dresses up for Christmas: 1 December to 6 January (Twelfth
// Night), whatever the year. `?season=christmas` or `?season=none` in the
// address forces it either way, for previewing.

export type Season = "christmas" | null;

export function seasonOf(date: Date, search = ""): Season {
  const forced = new URLSearchParams(search).get("season");
  if (forced === "christmas") return "christmas";
  if (forced === "none") return null;
  const month = date.getMonth(); // 0 = January
  const day = date.getDate();
  return month === 11 || (month === 0 && day <= 6) ? "christmas" : null;
}
