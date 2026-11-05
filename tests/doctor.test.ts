import { test, eq, ok } from './harness';
import { reviewScript } from '../src/core/doctor';
import type { Block } from '../src/core/model';

let n = 0;
const B = (type: Block['type'], text: string): Block => ({ id: 'b' + n++, type, text });
const base = { template: 'feature', comments: {}, suggestions: {} };

test('finds a character spelled two ways and unifies it', () => {
  const blocks = [B('scene', 'INT. FARO - NOCHE'), B('action', 'MARÍA entra.'), B('character', 'MARÍA'), B('dialogue', 'Hola.'), B('character', 'MARIA (V.O.)'), B('dialogue', 'Chau.'), B('character', 'MARÍA'), B('dialogue', 'Otra.')];
  const issues = reviewScript({ ...base, blocks });
  const v = issues.find((i) => i.kind === 'char-variant');
  ok(v, 'variant found');
  eq(v!.vars, { a: 'MARIA', b: 'MARÍA', n: 1 });
  const fixed = v!.fix!.apply(blocks);
  eq(fixed[4].text, 'MARÍA (V.O.)');
  ok(!reviewScript({ ...base, blocks: fixed }).some((i) => i.kind === 'char-variant'), 'fixed');
});

test('finds location variants, silent cues, orphan lines and missing introductions', () => {
  const blocks = [B('scene', 'INT. CASA DE MARA - DÍA'), B('character', 'TOMÁS'), B('action', 'Nada.'), B('scene', 'EXT. CASA MARA - NOCHE'), B('dialogue', 'Sin dueño.'), B('scene', 'INT. CASA DE MARA - NOCHE'), B('scene', 'FARO')];
  const kinds = reviewScript({ ...base, blocks }).map((i) => i.kind);
  for (const k of ['loc-variant', 'silent-cue', 'orphan-line', 'intro', 'empty-scene', 'heading-prefix']) ok(kinds.includes(k), 'missing ' + k + ' in ' + kinds.join(','));
  eq(reviewScript({ ...base, blocks }).find((i) => i.kind === 'loc-variant')!.vars!.b, 'CASA DE MARA');
});

test('a clean scene has no errors or warnings', () => {
  const blocks = [B('scene', 'INT. FARO - NOCHE'), B('action', 'MARA sube la escalera.'), B('character', 'MARA'), B('parenthetical', '(sin aliento)'), B('dialogue', 'No puede ser.'), B('transition', 'CORTE A:')];
  eq(reviewScript({ ...base, blocks }).filter((i) => i.severity !== 'info').map((i) => i.kind), []);
  eq(reviewScript({ ...base, blocks }).map((i) => i.kind), []);
});
