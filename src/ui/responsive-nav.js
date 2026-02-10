/**
 * Responsive global navigation controller.
 * Desktop keeps links expanded; mobile toggles through hamburger state.
 */
const DESKTOP_BREAKPOINT = 980;

export function mountResponsiveNav({
  mainNav,
  navToggle,
  navMenu,
  documentRef,
  windowRef,
}) {
  if (!mainNav || !navToggle || !navMenu || !documentRef || !windowRef) {
    return () => {};
  }

  const closeNavMenu = () => {
    mainNav.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  };

  const onToggleClick = () => {
    const isOpen = mainNav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  };

  const onMenuClick = (e) => {
    if (e.target.closest(".nav-link") || e.target.closest("#globalSearchBtn")) {
      closeNavMenu();
    }
  };

  const onDocClick = (e) => {
    if (!mainNav.contains(e.target)) closeNavMenu();
  };

  const onResize = () => {
    // Ensure stale mobile-open state does not leak into desktop layout.
    if (windowRef.innerWidth > DESKTOP_BREAKPOINT) closeNavMenu();
  };

  navToggle.addEventListener("click", onToggleClick);
  navMenu.addEventListener("click", onMenuClick);
  documentRef.addEventListener("click", onDocClick);
  windowRef.addEventListener("resize", onResize);

  return () => {
    navToggle.removeEventListener("click", onToggleClick);
    navMenu.removeEventListener("click", onMenuClick);
    documentRef.removeEventListener("click", onDocClick);
    windowRef.removeEventListener("resize", onResize);
  };
}
