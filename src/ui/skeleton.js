/**
 * Hide the skeleton loading UI.
 * @param {Element|null|undefined} el - The skeleton DOM element
 */
export function hideSkeleton(el) {
  if (!el) return;
  el.classList.add("skeleton-hidden");
}
