/**
 * DOM event mount helpers per page.
 * Each mount returns a disposer to make route transitions safe.
 */
export function mountCompareEvents({
  getById,
  documentRef,
  state,
  debounce,
  delay,
  onSearch,
  onAddPlayer,
  onRemovePlayer,
  onExecute,
}) {
  const input = getById("compareSearchInput");
  const suggestions = getById("compareSuggestions");
  const selected = getById("compareSelected");
  const button = getById("compareBtn");
  if (!input && !suggestions && !selected && !button) return () => {};

  const listeners = [];
  const on = (el, type, fn) => {
    if (!el) return;
    el.addEventListener(type, fn);
    listeners.push([el, type, fn]);
  };

  on(
    input,
    "input",
    debounce((e) => onSearch(e.target.value.trim()), delay),
  );
  on(input, "focus", () => {
    if (state.compareSearchResults.length > 0)
      suggestions?.classList.add("active");
  });

  on(suggestions, "click", (e) => {
    const item = e.target.closest(".compare-suggestion-item");
    if (!item || !item.dataset.id) return;
    onAddPlayer({
      id: item.dataset.id,
      name: item.dataset.name,
      team: item.dataset.team,
    });
  });

  on(selected, "click", (e) => {
    if (e.target.classList.contains("compare-tag-remove")) {
      onRemovePlayer(e.target.dataset.id);
    }
  });

  on(button, "click", onExecute);

  on(documentRef, "click", (e) => {
    const searchBox = e.target.closest?.(".compare-search-box");
    if (!searchBox && suggestions) suggestions.classList.remove("active");
  });

  return () => {
    // Remove all listeners registered through this mount call.
    listeners.forEach(([el, type, fn]) => el.removeEventListener(type, fn));
  };
}

export function mountPredictEvents({
  getById,
  documentRef,
  debounce,
  delay,
  onSearch,
  onSelectPlayer,
}) {
  const input = getById("predictSearchInput");
  const suggestions = getById("predictSuggestions");
  if (!input && !suggestions) return () => {};

  const listeners = [];
  const on = (el, type, fn) => {
    if (!el) return;
    el.addEventListener(type, fn);
    listeners.push([el, type, fn]);
  };

  on(
    input,
    "input",
    debounce((e) => onSearch(e.target.value.trim()), delay),
  );
  on(input, "focus", () => {
    if (suggestions && suggestions.innerHTML.trim())
      suggestions.classList.add("active");
  });

  on(suggestions, "click", (e) => {
    const item = e.target.closest(".predict-suggestion-item");
    if (!item || !item.dataset.id) return;
    onSelectPlayer(item.dataset.id, item.dataset.name);
  });

  on(documentRef, "click", (e) => {
    const searchBox = e.target.closest?.(".predict-search-box");
    if (!searchBox && suggestions) suggestions.classList.remove("active");
  });

  return () => {
    listeners.forEach(([el, type, fn]) => el.removeEventListener(type, fn));
  };
}

export function mountGlobalSearchEvents({
  getById,
  documentRef,
  debounce,
  delay,
  onOpen,
  onClose,
  onSearch,
  onNavigate,
  onSelect,
  onResultSelect,
}) {
  const button = getById("globalSearchBtn");
  const modal = getById("searchModal");
  const input = getById("globalSearchInput");
  const results = getById("globalSearchResults");

  const listeners = [];
  const on = (el, type, fn) => {
    if (!el) return;
    el.addEventListener(type, fn);
    listeners.push([el, type, fn]);
  };

  on(button, "click", onOpen);

  const backdrop = modal?.querySelector?.(".search-modal-backdrop");
  on(backdrop, "click", onClose);

  on(
    input,
    "input",
    debounce((e) => onSearch(e.target.value.trim()), delay),
  );
  on(input, "keydown", (e) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onNavigate(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      onNavigate(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onSelect();
    }
  });

  on(results, "click", (e) => {
    const item = e.target.closest(".search-result-item");
    if (!item) return;
    onResultSelect(item.dataset.type, item.dataset.id);
  });

  on(documentRef, "keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      onOpen();
    }
  });

  return () => {
    listeners.forEach(([el, type, fn]) => el.removeEventListener(type, fn));
  };
}

export function mountPlayersTableSortEvents({ tableEl, onSort }) {
  if (!tableEl || typeof onSort !== "function") return () => {};

  const handleClick = (e) => {
    const th = e.target?.closest?.("th[data-key]");
    const key = th?.dataset?.key;
    if (!key) return;
    onSort(key);
  };

  tableEl.addEventListener("click", handleClick);
  return () => {
    tableEl.removeEventListener("click", handleClick);
  };
}
