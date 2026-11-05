// Test runner: bundles tests/run.ts with esbuild and runs it with Node (no other dependencies).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('tests/.out', { recursive: true });
await build({ entryPoints: ['tests/run.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'tests/.out/run.mjs', logLevel: 'error', target: 'node20' });
execFileSync(process.execPath, ['tests/.out/run.mjs'], { stdio: 'inherit' });
