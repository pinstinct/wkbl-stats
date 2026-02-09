import { describe, expect, it, vi } from "vitest";

import {
  mountCompareEvents,
  mountGlobalSearchEvents,
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
});
