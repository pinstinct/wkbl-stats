import { describe, expect, it, vi } from "vitest";

import { mountResponsiveNav } from "./responsive-nav.js";

function createEmitter() {
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

describe("responsive nav", () => {
  it("opens/closes from toggle and closes on menu click", () => {
    const classSet = new Set();
    const mainNav = {
      classList: {
        contains: (c) => classSet.has(c),
        add: (c) => classSet.add(c),
        remove: (c) => classSet.delete(c),
        toggle: (c) => {
          if (classSet.has(c)) {
            classSet.delete(c);
            return false;
          }
          classSet.add(c);
          return true;
        },
      },
      contains: () => true,
    };
    const navToggle = createEmitter();
    navToggle.setAttribute = vi.fn();
    const navMenu = createEmitter();
    const documentRef = createEmitter();
    const windowRef = { ...createEmitter(), innerWidth: 375 };

    mountResponsiveNav({ mainNav, navToggle, navMenu, documentRef, windowRef });

    navToggle.emit("click");
    expect(classSet.has("open")).toBe(true);
    expect(navToggle.setAttribute).toHaveBeenCalledWith("aria-expanded", "true");

    navMenu.emit("click", { target: { closest: (sel) => (sel === ".nav-link" ? {} : null) } });
    expect(classSet.has("open")).toBe(false);
    expect(navToggle.setAttribute).toHaveBeenCalledWith("aria-expanded", "false");
  });

  it("closes on outside click and desktop resize and unmount detaches listeners", () => {
    const classSet = new Set(["open"]);
    const mainNav = {
      classList: {
        contains: (c) => classSet.has(c),
        add: (c) => classSet.add(c),
        remove: (c) => classSet.delete(c),
        toggle: (c) => {
          if (classSet.has(c)) {
            classSet.delete(c);
            return false;
          }
          classSet.add(c);
          return true;
        },
      },
      contains: () => false,
    };
    const navToggle = createEmitter();
    navToggle.setAttribute = vi.fn();
    const navMenu = createEmitter();
    const documentRef = createEmitter();
    const windowRef = { ...createEmitter(), innerWidth: 1280 };

    const unmount = mountResponsiveNav({ mainNav, navToggle, navMenu, documentRef, windowRef });

    documentRef.emit("click", { target: {} });
    expect(classSet.has("open")).toBe(false);

    classSet.add("open");
    windowRef.emit("resize");
    expect(classSet.has("open")).toBe(false);

    classSet.add("open");
    unmount();
    documentRef.emit("click", { target: {} });
    expect(classSet.has("open")).toBe(true);
  });
});
