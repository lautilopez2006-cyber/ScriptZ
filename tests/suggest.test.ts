import { test, eq, ok } from './harness';
import { suggestCommit, resolveSuggestion, officialBlocks, listSuggestions } from '../src/core/suggest';
import type { Block } from '../src/core/model';

const ctx = { author: 'Ana', idFor: () => 's1' };
const B = (id: string, text: string, extra: Partial<Block> = {}): Block => ({ id, type: 'action', text, ...extra });
const caret = (id: string, off: number) => ({ anchor: { id, off }, focus: { id, off } });
/** Simulate the editor: apply a plain edit to the current (merged) blocks, then run suggestion mode. */
function edit(blocks: Block[], id: string, from: number, to: number, ins: string, caretBefore: number) {
  const b = blocks.find((x) => x.id === id)!;
  const text = b.text.slice(0, from) + ins + b.text.slice(to);
  const delta = ins.length - (to - from);
  const marks = (b.marks ?? []).map((m) => ({ ...m, s: m.s >= to ? m.s + delta : m.s > from ? from + ins.length : m.s, e: m.e >= to ? m.e + delta : m.e > from ? from + ins.length : m.e })).filter((m) => m.e > m.s);
  const next = blocks.map((x) => (x.id === id ? { ...x, text, marks: marks.length ? marks : undefined } : x));
  return suggestCommit(blocks, next, caret(id, from + ins.length), caret(id, caretBefore), ctx);
}
const show = (b: Block) => { let o = ''; for (let i = 0; i < b.text.length; i++) { const si = b.marks?.some((m) => m.k === 'si' && m.s <= i && i < m.e); const sd = b.marks?.some((m) => m.k === 'sd' && m.s <= i && i < m.e); o += si ? '+' + b.text[i] : sd ? '-' + b.text[i] : b.text[i]; } return o; };

test('typing in suggestion mode marks the new text', () => {
  const r = edit([B('a', 'Hola mundo')], 'a', 4, 4, ' lindo', 4);
  eq(r.blocks[0].text, 'Hola lindo mundo');
  eq(show(r.blocks[0]), 'Hola+ +l+i+n+d+o mundo');
  eq(r.sel!.focus.off, 10);
});

test('backspace keeps the text struck through and walks left', () => {
  let bs = [B('a', 'Hola mundo')];
  let off = 10;
  for (let i = 0; i < 3; i++) { const r = edit(bs, 'a', off - 1, off, '', off); bs = r.blocks; off = r.sel!.focus.off; }
  eq(bs[0].text, 'Hola mundo');
  eq(show(bs[0]), 'Hola mu-n-d-o');
  eq(off, 7);
});

test('forward delete jumps over struck text', () => {
  let bs = [B('a', 'abcdef')];
  let off = 2;
  for (let i = 0; i < 2; i++) { const r = edit(bs, 'a', off, off + 1, '', off); bs = r.blocks; off = r.sel!.focus.off; }
  eq(show(bs[0]), 'ab-c-def');
  eq(off, 4);
});

test('replacing a word: new text first, old text struck', () => {
  const r = edit([B('a', 'el perro duerme')], 'a', 3, 8, 'gato', 3);
  eq(show(r.blocks[0]), 'el +g+a+t+o-p-e-r-r-o duerme');
  eq(officialBlocks(r.blocks)[0].text, 'el perro duerme');
  eq(resolveSuggestion(r.blocks, 's1', true)[0].text, 'el gato duerme');
  eq(resolveSuggestion(r.blocks, 's1', true)[0].marks, undefined);
});

test('deleting own suggested text removes it for real', () => {
  let r = edit([B('a', 'ab')], 'a', 1, 1, 'XY', 1);
  r = edit(r.blocks, 'a', 2, 3, '', 3);
  eq(show(r.blocks[0]), 'a+Xb');
});

test('new and removed paragraphs become paragraph suggestions', () => {
  const prev = [B('a', 'Uno.'), B('b', 'Dos.'), B('c', 'Tres.')];
  const next = [B('a', 'Uno.'), B('n', 'Nuevo.'), B('c', 'Tres.')];
  const r = suggestCommit(prev, next, null, null, ctx);
  eq(r.blocks.map((b) => [b.id, b.sug?.k ?? '']), [['a', ''], ['b', 'del'], ['n', 'ins'], ['c', '']]);
  eq(officialBlocks(r.blocks).map((b) => b.id), ['a', 'b', 'c']);
  eq(resolveSuggestion(r.blocks, 's1', true).map((b) => b.id), ['a', 'n', 'c']);
  const list = listSuggestions(r.blocks, {});
  eq(list.length, 1);
  ok(list[0].inserted.includes('Nuevo.') && list[0].deleted.includes('Dos.'));
});

test('existing formatting survives suggestion edits', () => {
  const r = edit([B('a', 'Mara mira', { marks: [{ s: 5, e: 9, k: 'b' }] })], 'a', 0, 0, '¡', 0);
  eq(r.blocks[0].marks?.find((m) => m.k === 'b'), { s: 6, e: 10, k: 'b' });
});
