const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escape dynamic text before injecting into HTML strings.
 */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

/**
 * Escape values used inside HTML attributes.
 */
export function escapeAttr(value) {
  return escapeHtml(value);
}

/**
 * Encode route params used in hash links.
 */
export function encodeRouteParam(value) {
  return encodeURIComponent(String(value ?? ""));
}
