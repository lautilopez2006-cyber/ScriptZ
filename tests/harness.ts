// Minimal test harness (no dependencies): `test(name, fn)` + assertions.
type Fn = () => void | Promise<void>;
const tests: { name: string; fn: Fn }[] = [];
export function test(name: string, fn: Fn): void { tests.push({ name, fn }); }
export class AssertionError extends Error {}
export function ok(v: unknown, msg = 'expected truthy'): asserts v { if (!v) throw new AssertionError(msg); }
export function eq<T>(a: T, b: T, msg = ''): void {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new AssertionError(`${msg}\n  got:      ${sa?.slice(0, 400)}\n  expected: ${sb?.slice(0, 400)}`);
}
export async function run(): Promise<void> {
  let fail = 0;
  const t0 = Date.now();
  for (const t of tests) {
    const s = Date.now();
    try { await t.fn(); console.log(`  ✓ ${t.name} \x1b[2m(${Date.now() - s} ms)\x1b[0m`); }
    catch (e) { fail++; console.log(`  ✗ ${t.name}\n    ${String((e as Error).stack ?? e).split('\n').slice(0, 6).join('\n    ')}`); }
  }
  console.log(`\n${tests.length - fail}/${tests.length} passed in ${Date.now() - t0} ms`);
  if (fail) process.exit(1);
}
/** Deterministic PRNG for randomized tests. */
export function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
