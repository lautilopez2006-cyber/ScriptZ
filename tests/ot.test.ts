import { test, ok, eq, rng } from './harness';
import { applyChange, applyText, hashDoc, textDiff, transformChange, transformText, type Change, type SyncDoc, type TextOp } from '../src/collab/ot';
import { diffDocs } from '../src/collab/sync';
import { block, type Block } from '../src/core/model';

const ALPHA = 'abcdeáñ ';
function randText(r: () => number, n: number) { let s = ''; for (let i = 0; i < n; i++) s += ALPHA[Math.floor(r() * ALPHA.length)]; return s; }
function randEdit(r: () => number, s: string): string {
  const i = Math.floor(r() * (s.length + 1));
  const del = r() < 0.5 ? Math.floor(r() * Math.min(5, s.length - i + 1)) : 0;
  return s.slice(0, i) + (r() < 0.7 ? randText(r, 1 + Math.floor(r() * 4)) : '') + s.slice(i + del);
}

test('text OT: transform satisfies TP1 (randomized, 3000 cases)', () => {
  const r = rng(1);
  for (let k = 0; k < 3000; k++) {
    const s = randText(r, Math.floor(r() * 20));
    const a: TextOp = textDiff(s, randEdit(r, s));
    const b: TextOp = textDiff(s, randEdit(r, s));
    const [a2, b2] = transformText(a, b);
    eq(applyText(applyText(s, b), a2), applyText(applyText(s, a), b2), `case ${k} on "${s}"`);
  }
});

function randomDoc(r: () => number): SyncDoc {
  const blocks: Block[] = Array.from({ length: 3 + Math.floor(r() * 6) }, (_, i) => ({ ...block(i % 3 === 0 ? 'scene' : 'action', randText(r, 4 + Math.floor(r() * 12))), id: 'b' + i }));
  return { blocks, meta: { title: 'T', scenes: {}, characters: {} } };
}

let n = 0;
function randomChange(r: () => number, d: SyncDoc, who: string): Change {
  const next: SyncDoc = { blocks: d.blocks.map((b) => ({ ...b })), meta: { ...d.meta } };
  const edits = 1 + Math.floor(r() * 3);
  for (let e = 0; e < edits; e++) {
    const roll = r();
    const i = Math.floor(r() * next.blocks.length);
    if (roll < 0.5 && next.blocks.length) next.blocks[i] = { ...next.blocks[i], text: randEdit(r, next.blocks[i].text) };
    else if (roll < 0.65) next.blocks.splice(i, 0, { ...block('action', randText(r, 5)), id: who + ++n });
    else if (roll < 0.75 && next.blocks.length > 1) next.blocks.splice(i, 1);
    else if (roll < 0.85 && next.blocks.length) next.blocks[i] = { ...next.blocks[i], type: next.blocks[i].type === 'action' ? 'dialogue' : 'action' };
    else if (roll < 0.93 && next.blocks.length) next.blocks[i] = { ...next.blocks[i], marks: [{ s: 0, e: Math.min(2, next.blocks[i].text.length) || 0, k: 'b' }].filter((m) => m.e > m.s) };
    else next.meta = { ...next.meta, title: 'T' + who + n++ };
  }
  return diffDocs(d, next);
}

test('document OT converges for concurrent edits (randomized, 1500 cases)', () => {
  const r = rng(99);
  for (let k = 0; k < 1500; k++) {
    const s = randomDoc(r);
    const a = randomChange(r, s, 'A');
    const b = randomChange(r, s, 'B');
    const [a2, b2] = transformChange(a, b);
    const gA = new Map<string, string | null>(), gB = new Map<string, string | null>();
    const left = applyChange(applyChange(s, b, gA), a2, gA);
    const right = applyChange(applyChange(s, a, gB), b2, gB);
    if (hashDoc(left) !== hashDoc(right)) {
      eq(left.blocks.map((x) => [x.id, x.text, x.type]), right.blocks.map((x) => [x.id, x.text, x.type]), `diverged at case ${k}`);
      eq(left.meta, right.meta, `meta diverged at case ${k}`);
    }
  }
});

test('server simulation: 3 clients, random interleaving, all converge', () => {
  const r = rng(2026);
  for (let round = 0; round < 120; round++) {
    // Server holds the authoritative doc + history; clients keep pending/buffer like the real client.
    let server = randomDoc(r);
    const history: Change[] = [];
    const sg = new Map<string, string | null>();
    type C = { name: string; doc: SyncDoc; rev: number; pending: Change | null; buffer: Change | null; g: Map<string, string | null>; inbox: { rev: number; change: Change; from: string }[]; acks: number };
    const clients: C[] = ['A', 'B', 'C'].map((name) => ({ name, doc: server, rev: 0, pending: null, buffer: null, g: new Map(), inbox: [], acks: 0 }));
    const outbox: { from: C; rev: number; change: Change }[] = [];
    const send = (c: C, ch: Change) => { c.pending = ch; outbox.push({ from: c, rev: c.rev, change: ch }); };
    for (let step = 0; step < 40; step++) {
      const roll = r();
      const c = clients[Math.floor(r() * clients.length)];
      if (roll < 0.45) {
        // Local edit.
        const ch = randomChange(r, c.doc, c.name);
        if (!ch.length) continue;
        c.doc = applyChange(c.doc, ch, c.g);
        if (c.pending) c.buffer = c.buffer ? [...c.buffer, ...ch] : ch; else send(c, ch);
      } else if (roll < 0.75 && outbox.length) {
        // Server receives the oldest message.
        const m = outbox.shift()!;
        let ch = m.change;
        for (const h of history.slice(m.rev)) ch = transformChange(ch, h)[0];
        server = applyChange(server, ch, sg);
        history.push(ch);
        const rev = history.length;
        for (const o of clients) if (o !== m.from) o.inbox.push({ rev, change: ch, from: m.from.name });
        m.from.inbox.push({ rev, change: [], from: '__ack' });
      } else {
        // Client processes one incoming message.
        const msg = c.inbox.shift();
        if (!msg) continue;
        if (msg.from === '__ack') {
          c.rev = msg.rev; c.pending = null;
          if (c.buffer) { const b = c.buffer; c.buffer = null; send(c, b); }
          continue;
        }
        let ch = msg.change;
        if (c.pending) { const [p2, ch2] = transformChange(c.pending, ch); c.pending = p2; ch = ch2; }
        if (c.buffer) { const [b2, ch3] = transformChange(c.buffer, ch); c.buffer = b2; ch = ch3; }
        c.doc = applyChange(c.doc, ch, c.g);
        c.rev = msg.rev;
      }
    }
    // Drain everything.
    for (let guard = 0; guard < 10000 && (outbox.length || clients.some((c) => c.inbox.length || c.buffer)); guard++) {
      if (outbox.length) {
        const m = outbox.shift()!;
        let ch = m.change;
        for (const h of history.slice(m.rev)) ch = transformChange(ch, h)[0];
        server = applyChange(server, ch, sg);
        history.push(ch);
        for (const o of clients) if (o !== m.from) o.inbox.push({ rev: history.length, change: ch, from: m.from.name });
        m.from.inbox.push({ rev: history.length, change: [], from: '__ack' });
      }
      for (const c of clients) {
        const msg = c.inbox.shift();
        if (!msg) continue;
        if (msg.from === '__ack') { c.rev = msg.rev; c.pending = null; if (c.buffer) { const b = c.buffer; c.buffer = null; send(c, b); } continue; }
        let ch = msg.change;
        if (c.pending) { const [p2, ch2] = transformChange(c.pending, ch); c.pending = p2; ch = ch2; }
        if (c.buffer) { const [b2, ch3] = transformChange(c.buffer, ch); c.buffer = b2; ch = ch3; }
        c.doc = applyChange(c.doc, ch, c.g);
        c.rev = msg.rev;
      }
    }
    const h = hashDoc(server);
    for (const c of clients) {
      if (hashDoc(c.doc) !== h) eq(c.doc.blocks.map((x) => [x.id, x.text, x.type]), server.blocks.map((x) => [x.id, x.text, x.type]), `round ${round}: client ${c.name} diverged`);
    }
  }
  ok(true);
});
