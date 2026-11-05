import { test, eq } from './harness';
import { classifyParagraphs, parasFromText, splitTitlePage, looksLikeFountain } from '../src/io/detect';

const types = (src: string) => classifyParagraphs(parasFromText(src)).map((b) => b.type + ':' + b.text);

test('flat Google Docs script: headings, cues, parentheticals, dialogue', () => {
  const src = [
    'FADE IN:', 'INT. FARO - NOCHE', 'Mara sube la escalera. Algo parpadea arriba.', 'MARA', '(sin aliento)', 'No puede ser.',
    'TOMÁS (O.S.)', 'Mara, bajá.', 'Ella no contesta.', 'CORTE A:', '2. EXT. MUELLE - DÍA', 'El mar.',
  ].join('\n');
  eq(types(src), [
    'transition:FADE IN:', 'scene:INT. FARO - NOCHE', 'action:Mara sube la escalera. Algo parpadea arriba.', 'character:MARA', 'parenthetical:(sin aliento)', 'dialogue:No puede ser.',
    'character:TOMÁS (O.S.)', 'dialogue:Mara, bajá.', 'action:Ella no contesta.', 'transition:CORTE A:', 'scene:EXT. MUELLE - DÍA', 'action:El mar.',
  ]);
  eq(classifyParagraphs(parasFromText(src))[10].num, '2');
});

test('theatre style "NAME: line" and Spanish scene titles', () => {
  eq(types('ESCENA 1. CASA DE MARA. INTERIOR. NOCHE\nMARA: Ya llego.\nTOMÁS (gritando): ¡Apurate!'), [
    'scene:ESCENA 1. CASA DE MARA. INTERIOR. NOCHE', 'character:MARA', 'dialogue:Ya llego.', 'character:TOMÁS (gritando)', 'dialogue:¡Apurate!',
  ]);
});

test('indented text (Final Draft .txt export) uses indentation', () => {
  const src = 'INT. FARO - NOCHE\n\nMara sube.\n\n                         MARA\n               (bajito)\n          No puede ser.\n          Otra vez no.\n\nSilencio.';
  eq(types(src), ['scene:INT. FARO - NOCHE', 'action:Mara sube.', 'character:MARA', 'parenthetical:(bajito)', 'dialogue:No puede ser.', 'dialogue:Otra vez no.', 'action:Silencio.']);
});

test('title page before the first scene', () => {
  const r = splitTitlePage(parasFromText('LA ÚLTIMA LUZ\nEscrito por\nLau López\nlau@example.com\nINT. FARO - NOCHE\nNada.'));
  eq(r.title.title, 'LA ÚLTIMA LUZ');
  eq(r.title.authors, 'Lau López\nlau@example.com');
  eq(r.body[0].text, 'INT. FARO - NOCHE');
  eq(looksLikeFountain('INT. A - DÍA\n\nAcción.\n\nMARA\nHola.\n'), true);
  eq(looksLikeFountain('INT. A - DÍA\nAcción.\nMARA\nHola.\nOtra.\nY otra.'), false);
});

import { emptyProject } from '../src/core/model';
import { CONTESTS, checkContest, contestProject } from '../src/core/contests';
test('contest checks: page range, anonymity, scene numbers and the submission copy', () => {
  const p = emptyProject({ title: 'Faro' });
  p.titlePage = { ...p.titlePage, enabled: true, authors: 'Lau López', contact: 'lau@example.com' };
  p.blocks = [{ id: 'a', type: 'scene', text: 'INT. FARO - NOCHE' }, { id: 'b', type: 'character', text: 'Mara' }, { id: 'c', type: 'dialogue', text: 'Hola.' }];
  const incaa = CONTESTS.find((c) => c.id === 'incaa-largo')!;
  const r = checkContest(p, incaa, 45, 'Lau López');
  const bad = r.filter((c) => !c.ok).map((c) => c.id).sort();
  eq(bad, ['anon', 'cues', 'nums', 'pages']);
  const sub = contestProject(p, incaa);
  eq([sub.titlePage.authors, sub.titlePage.contact, sub.page.sceneNumbers], ['', '', 'both']);
  eq(checkContest(sub, incaa, 90, 'Lau López').filter((c) => !c.ok).map((c) => c.id), ['cues']);
});
