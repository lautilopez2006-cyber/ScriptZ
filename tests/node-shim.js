// Minimal browser globals so app modules can be imported by the Node test runner.
globalThis.window ??= globalThis;
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document ??= { documentElement: {}, addEventListener() {}, removeEventListener() {} };
