// Bundles the collaboration server into a single dependency-free file: server/collab-server.mjs
import { build } from 'esbuild';
await build({
  entryPoints: ['src/collab/server.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node18', outfile: 'server/collab-server.mjs', logLevel: 'warning',
  banner: { js: '// ScriptZ collaboration server (generated from src/collab/server.ts). Run: node collab-server.mjs [--port 4735] [--host 0.0.0.0] [--data ./scriptz-rooms] [--cert cert.pem --key key.pem]' },
});
console.log('built server/collab-server.mjs');
