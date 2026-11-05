import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, ok, eq } from './harness';
import { loadProject, serializeProject } from '../src/core/migrate';
import { layoutProject } from '../src/core/layout';
import { emptyProject, block, type Block } from '../src/core/model';
import { wrap } from '../src/core/text';
import { shiftMarks, toggleMark, replaceText } from '../src/core/marks';
import { diffBlocks, applyOps, invertOps } from '../src/core/diff';
import { buildScenes } from '../src/core/scenes';
import { compareBlocks } from '../src/core/compare';
import { findAll, type FindOptions } from '../src/core/smart';
import { rng } from './harness';

const fx = (n: string) => readFileSync(join(process.cwd(), 'tests/fixtures', n), 'utf8');
const big = loadProject(JSON.parse(fx('Prueba_Rendimiento_217_paginas.scriptz')));

test('migrates a v1 project to schema v2', () => {
  const p = loadProject(JSON.parse(fx('La_ultima_luz.scriptz')));
  eq(p.schemaVersion, 2);
  ok(p.blocks.length >= 10, 'blocks: ' + p.blocks.length);
  ok(p.blocks.every((b) => typeof b.id === 'string' && typeof b.type === 'string'), 'block shape');
  const again = loadProject(JSON.parse(serializeProject(p)));
  eq(again.blocks, p.blocks, 'serialize → load is stable');
});

test('rejects garbage', () => {
  let threw = false;
  try { loadProject({ hello: 1 }); } catch { threw = true; }
  ok(threw, 'should throw on invalid input');
});

test('paginates the 217-page script within page limits', () => {
  const t0 = performance.now();
  const L = layoutProject(big);
  const ms = performance.now() - t0;
  ok(L.pages.length >= 200 && L.pages.length <= 235, 'pages: ' + L.pages.length);
  for (const pg of L.pages) ok(pg.used <= L.linesPerPage, `page ${pg.label} overflows (${pg.used}/${L.linesPerPage})`);
  ok(ms < 1500, 'layout too slow: ' + ms.toFixed(0) + ' ms');
});

test('every line fits in its column width', () => {
  const L = layoutProject(big);
  for (const pg of L.pages) for (const ln of pg.lines) ok([...ln.text].length <= 62, `line too long on p.${pg.label}: "${ln.text}"`);
});

test('layout is deterministic', () => {
  const a = layoutProject(big), b = layoutProject(big);
  eq(a.pages.map((p) => p.used), b.pages.map((p) => p.used));
});

test('A4 holds more lines per page than Letter', () => {
  const letter = layoutProject({ ...big, page: { ...big.page, paper: 'letter' } });
  const a4 = layoutProject({ ...big, page: { ...big.page, paper: 'a4' } });
  ok(a4.linesPerPage > letter.linesPerPage, `${a4.linesPerPage} vs ${letter.linesPerPage}`);
});

test('wrap breaks at spaces and never exceeds width', () => {
  const r = rng(7);
  const words = ['la', 'luz', 'del', 'faro', 'parpadea', 'otra', 'vez', 'sobre', 'el', 'mar', 'extraordinariamente', 'MARA', '—', 'sí'];
  for (let k = 0; k < 300; k++) {
    const text = Array.from({ length: 5 + Math.floor(r() * 40) }, () => words[Math.floor(r() * words.length)]).join(' ');
    const width = 10 + Math.floor(r() * 50);
    const lines = wrap(text, width);
    for (const l of lines) ok(l.width <= width, `"${text.slice(l.start, l.end)}" width ${l.width} > ${width}`);
    eq(lines.map((l) => text.slice(l.start, l.end)).join('').replace(/\s+/g, ''), text.replace(/\s+/g, ''), 'no text lost');
  }
});

test('marks follow edits', () => {
  // "hola mundo" with bold on "mundo" (5..10)
  let m = shiftMarks([{ s: 5, e: 10, k: 'b' }], 0, 0, 3); // insert 3 chars at start
  eq(m, [{ s: 8, e: 13, k: 'b' }]);
  m = shiftMarks([{ s: 5, e: 10, k: 'b' }], 6, 2, 0); // delete inside
  eq(m, [{ s: 5, e: 8, k: 'b' }]);
  m = toggleMark(undefined, 0, 4, 'i', 10);
  eq(m, [{ s: 0, e: 4, k: 'i' }]);
  eq(toggleMark(m, 0, 4, 'i', 10) ?? [], []);
  const b = replaceText({ ...block('action', 'hola mundo'), marks: [{ s: 5, e: 10, k: 'b' }] }, 0, 4, 'chau');
  eq(b.text, 'chau mundo');
  eq(b.marks, [{ s: 5, e: 10, k: 'b' }]);
});

test('block diff → apply → invert roundtrips (randomized)', () => {
  const r = rng(42);
  const base: Block[] = big.blocks.slice(0, 120);
  for (let k = 0; k < 60; k++) {
    let next = base.map((b) => ({ ...b }));
    for (let j = 0; j < 8; j++) {
      const i = Math.floor(r() * next.length);
      const roll = r();
      if (roll < 0.3) next.splice(i, 1);
      else if (roll < 0.6) next.splice(i, 0, block('action', 'nuevo ' + j));
      else if (roll < 0.8) next[i] = { ...next[i], text: next[i].text + ' editado' };
      else { const [x] = next.splice(i, 1); next.splice(Math.floor(r() * next.length), 0, x); }
    }
    const ops = diffBlocks(base, next);
    const applied = applyOps(base, ops);
    eq(applied.map((b) => [b.id, b.text]), next.map((b) => [b.id, b.text]), 'apply');
    const back = applyOps(applied, invertOps(ops));
    eq(back.map((b) => [b.id, b.text]), base.map((b) => [b.id, b.text]), 'invert');
  }
});

test('scene numbering, locked scenes and compare', () => {
  const p = emptyProject({ title: 'x', author: '', template: 'feature', locale: 'es-LA', paper: 'letter' });
  const blocks = [block('scene', 'INT. CASA - DÍA'), block('action', 'Uno.'), block('scene', 'EXT. CALLE - NOCHE'), block('action', 'Dos.')];
  const s = buildScenes(blocks);
  eq(s.map((x) => x.label), ['1', '2']);
  eq(s[1].parsed.intExt.toUpperCase(), 'EXT');
  const changed = blocks.map((b, i) => (i === 3 ? { ...b, text: 'Dos y tres.' } : b));
  const cmp = compareBlocks(blocks, changed);
  ok(cmp.modified === 1 && cmp.added === 0 && cmp.removed === 0, JSON.stringify({ a: cmp.added, r: cmp.removed, m: cmp.modified }));
  void p;
});

const F: FindOptions = { query: '', caseSensitive: false, wholeWord: false, regex: false, types: [], character: '' };
test('find respects case, whole word and element filters', () => {
  const blocks = [block('action', 'Mara mira el mar.'), block('character', 'MARA'), block('dialogue', 'Mar adentro.')];
  eq(findAll(blocks, { ...F, query: 'mar' }).length, 4);
  eq(findAll(blocks, { ...F, query: 'mar', wholeWord: true }).length, 2);
  eq(findAll(blocks, { ...F, query: 'Mar', caseSensitive: true }).length, 2);
  eq(findAll(blocks, { ...F, query: 'mar', types: ['dialogue'] }).length, 1);
});
