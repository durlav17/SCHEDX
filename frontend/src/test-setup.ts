import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver; charts only need it to exist.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;
