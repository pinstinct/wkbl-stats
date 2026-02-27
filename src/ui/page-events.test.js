import { describe, expect, it, vi } from "vitest";

import {
  mountCompareEvents,
  mountGlobalSearchEvents,
  mountPlayersTableSortEvents,
  mountPredictEvents,
} from "./page-events.js";

function emitter() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type, fn) {
      if (listeners.get(type) === fn) listeners.delete(type);
    },
    emit(type, event = {}) {
      const fn = listeners.get(type);
      if (fn) fn(event);
    },
  };
}

function classList() {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
  };
}

describe("page events", () => {
  it("mounts and unmounts compare events", () => {
    const byId = {
      compareSearchInput: emitter(),
      compareSuggestions: { ...emitter(), classList: classList() },
      compareSelected: emitter(),
      compareBtn: emitter(),
    };
    const documentRef = emitter();
    const state = { compareSearchResults: [{ id: "p1" }] };
    const getById = (id) => byId[id];
    const onSearch = vi.fn();
    const onAddPlayer = vi.fn();
    const onRemovePlayer = vi.fn();
    const onExecute = vi.fn();
    const debounce = (fn) => fn;

    const unmount = mountCompareEvents({
      getById,
      documentRef,
      state,
      debounce,
      delay: 150,
      onSearch,
      onAddPlayer,
      onRemovePlayer,
      onExecute,
    });

    byId.compareSearchInput.emit("input", { target: { value: "kim" } });
    expect(onSearch).toHaveBeenCalledWith("kim");

    // focus event shows suggestions when results exist
    state.compareSearchResults = [{ id: "p1" }];
    byId.compareSearchInput.emit("focus");
    expect(byId.compareSuggestions.classList.contains("active")).toBe(true);

    byId.compareSuggestions.emit("click", {
      target: {
        closest: () => ({ dataset: { id: "p1", name: "김", team: "A" } }),
      },
    });
    expect(onAddPlayer).toHaveBeenCalledWith({
      id: "p1",
      name: "김",
      team: "A",
    });

    byId.compareSelected.emit("click", {
      target: { classList: { contains: () => true }, dataset: { id: "p1" } },
    });
    expect(onRemovePlayer).toHaveBeenCalledWith("p1");

    byId.compareBtn.emit("click");
    expect(onExecute).toHaveBeenCalledTimes(1);

    unmount();
    byId.compareBtn.emit("click");
    expect(onExecute).toHaveBeenCalledTimes(1);
  });

  it("mounts and unmounts predict events", () => {
    const byId = {
      predictSearchInput: emitter(),
      predictSuggestions: {
        ...emitter(),
        classList: classList(),
        innerHTML: "<div>x</div>",
      },
    };
    const documentRef = emitter();
    const getById = (id) => byId[id];
    const onSearch = vi.fn();
    const onSelectPlayer = vi.fn();
    const debounce = (fn) => fn;

    const unmount = mountPredictEvents({
      getById,
      documentRef,
      debounce,
      delay: 150,
      onSearch,
      onSelectPlayer,
    });

    byId.predictSearchInput.emit("input", { target: { value: "lee" } });
    expect(onSearch).toHaveBeenCalledWith("lee");

    byId.predictSuggestions.emit("click", {
      target: { closest: () => ({ dataset: { id: "p2", name: "이" } }) },
    });
    expect(onSelectPlayer).toHaveBeenCalledWith("p2", "이");

    unmount();
    byId.predictSuggestions.emit("click", {
      target: { closest: () => ({ dataset: { id: "p2", name: "이" } }) },
    });
    expect(onSelectPlayer).toHaveBeenCalledTimes(1);
  });

  it("mounts and unmounts global search events", () => {
    const byId = {
      globalSearchBtn: emitter(),
      searchModal: { ...emitter(), querySelector: () => emitter() },
      globalSearchInput: emitter(),
      globalSearchResults: emitter(),
    };
    const documentRef = emitter();
    const getById = (id) => byId[id];
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const onSearch = vi.fn();
    const onNavigate = vi.fn();
    const onSelect = vi.fn();
    const onResultSelect = vi.fn();
    const debounce = (fn) => fn;

    const unmount = mountGlobalSearchEvents({
      getById,
      documentRef,
      debounce,
      delay: 150,
      onOpen,
      onClose,
      onSearch,
      onNavigate,
      onSelect,
      onResultSelect,
    });

    byId.globalSearchBtn.emit("click");
    expect(onOpen).toHaveBeenCalledTimes(1);

    byId.globalSearchInput.emit("input", { target: { value: "park" } });
    expect(onSearch).toHaveBeenCalledWith("park");

    byId.globalSearchInput.emit("keydown", {
      key: "ArrowDown",
      preventDefault: vi.fn(),
    });
    expect(onNavigate).toHaveBeenCalledWith(1);

    byId.globalSearchInput.emit("keydown", {
      key: "Enter",
      preventDefault: vi.fn(),
    });
    expect(onSelect).toHaveBeenCalledTimes(1);

    byId.globalSearchResults.emit("click", {
      target: { closest: () => ({ dataset: { type: "player", id: "p1" } }) },
    });
    expect(onResultSelect).toHaveBeenCalledWith("player", "p1");

    unmount();
    byId.globalSearchBtn.emit("click");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("shows/hides predict suggestions on focus and outside click", () => {
    const suggestionsEl = {
      ...emitter(),
      classList: classList(),
      innerHTML: "<div>suggestion</div>",
    };
    const byId = {
      predictSearchInput: emitter(),
      predictSuggestions: suggestionsEl,
    };
    const documentRef = emitter();

    mountPredictEvents({
      getById: (id) => byId[id],
      documentRef,
      debounce: (fn) => fn,
      delay: 150,
      onSearch: vi.fn(),
      onSelectPlayer: vi.fn(),
    });

    // Focus shows suggestions
    byId.predictSearchInput.emit("focus");
    expect(suggestionsEl.classList.contains("active")).toBe(true);

    // Click outside hides suggestions
    documentRef.emit("click", { target: { closest: () => null } });
    expect(suggestionsEl.classList.contains("active")).toBe(false);
  });

  it("ignores predict suggestion click without closest match", () => {
    const byId = {
      predictSearchInput: emitter(),
      predictSuggestions: {
        ...emitter(),
        classList: classList(),
        innerHTML: "",
      },
    };
    const onSelectPlayer = vi.fn();

    mountPredictEvents({
      getById: (id) => byId[id],
      documentRef: emitter(),
      debounce: (fn) => fn,
      delay: 150,
      onSearch: vi.fn(),
      onSelectPlayer,
    });

    byId.predictSuggestions.emit("click", {
      target: { closest: () => null },
    });
    expect(onSelectPlayer).not.toHaveBeenCalled();
  });

  it("handles compare suggestion closest miss and outside click", () => {
    const suggestionsEl = { ...emitter(), classList: classList() };
    const byId = {
      compareSearchInput: emitter(),
      compareSuggestions: suggestionsEl,
      compareSelected: emitter(),
      compareBtn: emitter(),
    };
    const documentRef = emitter();
    const onAddPlayer = vi.fn();

    mountCompareEvents({
      getById: (id) => byId[id],
      documentRef,
      state: { compareSearchResults: [] },
      debounce: (fn) => fn,
      delay: 150,
      onSearch: vi.fn(),
      onAddPlayer,
      onRemovePlayer: vi.fn(),
      onExecute: vi.fn(),
    });

    // Click with no closest match
    byId.compareSuggestions.emit("click", {
      target: { closest: () => null },
    });
    expect(onAddPlayer).not.toHaveBeenCalled();

    // Outside click hides suggestions
    documentRef.emit("click", { target: { closest: () => null } });
    expect(suggestionsEl.classList.contains("active")).toBe(false);

    // Click on compare-selected with no remove-btn
    byId.compareSelected.emit("click", {
      target: { classList: { contains: () => false }, dataset: {} },
    });
  });

  it("handles ArrowUp and Escape keys in global search", () => {
    const byId = {
      globalSearchBtn: emitter(),
      searchModal: { ...emitter(), querySelector: () => emitter() },
      globalSearchInput: emitter(),
      globalSearchResults: emitter(),
    };
    const onNavigate = vi.fn();
    const onClose = vi.fn();

    mountGlobalSearchEvents({
      getById: (id) => byId[id],
      documentRef: emitter(),
      debounce: (fn) => fn,
      delay: 150,
      onOpen: vi.fn(),
      onClose,
      onSearch: vi.fn(),
      onNavigate,
      onSelect: vi.fn(),
      onResultSelect: vi.fn(),
    });

    byId.globalSearchInput.emit("keydown", {
      key: "ArrowUp",
      preventDefault: vi.fn(),
    });
    expect(onNavigate).toHaveBeenCalledWith(-1);

    byId.globalSearchInput.emit("keydown", { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("handles Ctrl+K shortcut to open search", () => {
    const byId = {
      globalSearchBtn: emitter(),
      searchModal: { ...emitter(), querySelector: () => emitter() },
      globalSearchInput: emitter(),
      globalSearchResults: emitter(),
    };
    const documentRef = emitter();
    const onOpen = vi.fn();

    mountGlobalSearchEvents({
      getById: (id) => byId[id],
      documentRef,
      debounce: (fn) => fn,
      delay: 150,
      onOpen,
      onClose: vi.fn(),
      onSearch: vi.fn(),
      onNavigate: vi.fn(),
      onSelect: vi.fn(),
      onResultSelect: vi.fn(),
    });

    documentRef.emit("keydown", {
      ctrlKey: true,
      key: "k",
      preventDefault: vi.fn(),
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("ignores search result click without closest match", () => {
    const byId = {
      globalSearchBtn: emitter(),
      searchModal: { ...emitter(), querySelector: () => emitter() },
      globalSearchInput: emitter(),
      globalSearchResults: emitter(),
    };
    const onResultSelect = vi.fn();

    mountGlobalSearchEvents({
      getById: (id) => byId[id],
      documentRef: emitter(),
      debounce: (fn) => fn,
      delay: 150,
      onOpen: vi.fn(),
      onClose: vi.fn(),
      onSearch: vi.fn(),
      onNavigate: vi.fn(),
      onSelect: vi.fn(),
      onResultSelect,
    });

    byId.globalSearchResults.emit("click", {
      target: { closest: () => null },
    });
    expect(onResultSelect).not.toHaveBeenCalled();
  });

  it("delegates players table header click for sorting", () => {
    const table = emitter();
    const onSort = vi.fn();

    const unmount = mountPlayersTableSortEvents({
      tableEl: table,
      onSort,
    });

    table.emit("click", {
      target: {
        closest: () => ({ dataset: { key: "per" } }),
      },
    });

    expect(onSort).toHaveBeenCalledWith("per");

    table.emit("click", {
      target: {
        closest: () => null,
      },
    });

    expect(onSort).toHaveBeenCalledTimes(1);

    unmount();
    table.emit("click", {
      target: {
        closest: () => ({ dataset: { key: "pts" } }),
      },
    });
    expect(onSort).toHaveBeenCalledTimes(1);
  });
});
