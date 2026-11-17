/**
 * Row building for the scorecard and the standings. Always textContent, never
 * innerHTML — display names are typed by other people.
 */

export function cell(className: string, text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

/** A list row of labelled cells, given the class for each column in order. */
export function row(
  rowClass: string,
  columns: readonly string[],
  values: readonly string[],
): HTMLLIElement {
  const li = document.createElement("li");
  if (rowClass) li.className = rowClass;
  li.append(...values.map((text, i) => cell(columns[i] ?? "", text)));
  return li;
}
