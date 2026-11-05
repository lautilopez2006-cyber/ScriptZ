// Local build without npm: esbuild + shims for Tauri packages. Output: /home/claude/build/app
import * as esbuild from '/opt/npm-tools/node_modules/esbuild/lib/main.js';
import fs from 'node:fs';
const out = process.argv[2] || '/home/claude/build/app';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const shim = new URL('./shims/tauri.ts', import.meta.url).pathname;
const r = await esbuild.build({
  entryPoints: ['src/main.tsx'], bundle: true, format: 'esm', splitting: true, outdir: out + '/assets', minify: process.env.MIN === '1', sourcemap: false,
  loader: { '.ttf': 'file', '.png': 'file', '.svg': 'file' }, publicPath: '/assets', jsx: 'automatic', target: 'es2022', logLevel: 'warning', metafile: true,
  alias: { '@tauri-apps/api/core': shim, '@tauri-apps/plugin-dialog': shim, '@tauri-apps/plugin-fs': shim, '@tauri-apps/plugin-opener': shim },
  nodePaths: ['/opt/npm-tools/node_modules'], define: { 'import.meta.env.DEV': 'false', 'process.env.NODE_ENV': '"production"' },
});
let html = fs.readFileSync('index.html', 'utf8').replace('<script type="module" src="/src/main.tsx"></script>', '<link rel="stylesheet" href="/assets/main.css"><script type="module" src="/assets/main.js"></script>');
fs.writeFileSync(out + '/index.html', html);
if (fs.existsSync('public')) fs.cpSync('public', out, { recursive: true });
const size = Object.values(r.metafile.outputs).reduce((a, o) => a + o.bytes, 0);
console.log('built', out, (size / 1024).toFixed(0) + ' KB');
