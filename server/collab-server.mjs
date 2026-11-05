// ScriptZ collaboration server (generated from src/collab/server.ts). Run: node collab-server.mjs [--port 4735] [--host 0.0.0.0] [--data ./scriptz-rooms] [--cert cert.pem --key key.pem]

// src/collab/server.ts
import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// src/core/marks.ts
var sameKind = (a, b) => a.k === b.k && (a.v ?? "") === (b.v ?? "");
function normalizeMarks(marks, len) {
  if (!marks || !marks.length) return void 0;
  const list = marks.map((m) => ({ ...m, s: Math.max(0, Math.min(len, m.s)), e: Math.max(0, Math.min(len, m.e)) })).filter((m) => m.e > m.s).sort((a, b) => (a.k + (a.v ?? "")).localeCompare(b.k + (b.v ?? "")) || a.s - b.s);
  const out = [];
  for (const m of list) {
    const last = out[out.length - 1];
    if (last && sameKind(last, m) && m.s <= last.e) last.e = Math.max(last.e, m.e);
    else out.push({ ...m });
  }
  out.sort((a, b) => a.s - b.s || a.k.localeCompare(b.k));
  return out.length ? out : void 0;
}

// src/collab/ot.ts
var isRetain = (c) => typeof c === "number" && c > 0;
var isInsert = (c) => typeof c === "string";
var isDelete = (c) => typeof c === "number" && c < 0;
function push(op, c) {
  if (c === 0 || c === "") return;
  const last = op[op.length - 1];
  if (op.length && typeof c === typeof last && (typeof c === "string" || c > 0 === last > 0)) {
    op[op.length - 1] = typeof c === "string" ? last + c : last + c;
    return;
  }
  if (isInsert(c) && isDelete(last)) {
    const prev = op[op.length - 2];
    if (isInsert(prev)) {
      op[op.length - 2] = prev + c;
      return;
    }
    op.splice(op.length - 1, 0, c);
    return;
  }
  op.push(c);
}
function baseLength(op) {
  return op.reduce((a, c) => a + (isRetain(c) ? c : isDelete(c) ? -c : 0), 0);
}
function applyText(text, op) {
  if (baseLength(op) !== text.length) throw new Error("ot: base length mismatch");
  let out = "";
  let i = 0;
  for (const c of op) {
    if (isRetain(c)) {
      out += text.slice(i, i + c);
      i += c;
    } else if (isInsert(c)) out += c;
    else i -= c;
  }
  return out;
}
function transformText(a, b) {
  const A = [], B = [];
  let i = 0, j = 0;
  let x = a[i++], y = b[j++];
  while (x !== void 0 || y !== void 0) {
    if (isInsert(y)) {
      push(A, y.length);
      push(B, y);
      y = b[j++];
      continue;
    }
    if (isInsert(x)) {
      push(A, x);
      push(B, x.length);
      x = a[i++];
      continue;
    }
    if (x === void 0 || y === void 0) throw new Error("ot: length mismatch");
    const lx = Math.abs(x), ly = Math.abs(y);
    const m = Math.min(lx, ly);
    if (isRetain(x) && isRetain(y)) {
      push(A, m);
      push(B, m);
    } else if (isDelete(x) && isDelete(y)) {
    } else if (isDelete(x) && isRetain(y)) push(A, -m);
    else if (isRetain(x) && isDelete(y)) push(B, -m);
    const rest = (v, len) => v > 0 ? len - m : -(len - m);
    x = lx > m ? rest(x, lx) : a[i++];
    y = ly > m ? rest(y, ly) : b[j++];
  }
  return [A, B];
}
function mapPosition(pos, op, after = false) {
  let src = 0, dst = 0;
  for (const c of op) {
    if (isRetain(c)) {
      if (pos < src + c) return dst + (pos - src);
      src += c;
      dst += c;
    } else if (isInsert(c)) {
      if (src === pos && !after) return dst;
      dst += c.length;
      if (src === pos && after) continue;
    } else {
      const len = -c;
      if (pos < src + len) return dst;
      src += len;
    }
  }
  return dst + Math.max(0, pos - src);
}
function mapMarks(marks, op, len) {
  if (!marks) return void 0;
  return normalizeMarks(marks.map((m) => ({ ...m, s: mapPosition(m.s, op, true), e: mapPosition(m.e, op, m.k !== "cmt" && m.k !== "tag") })), len);
}
var samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
var overlaps = (a, b) => a[0] === b[0] && (a.length === 1 || b.length === 1 || a[1] === b[1]);
function transformPair(a, b) {
  if (a.t === "meta" && b.t === "meta") {
    if (samePath(a.path, b.path)) return [[a], []];
    if (overlaps(a.path, b.path)) {
      if (a.path.length === 1) return [[a], []];
      return [[a], [b]];
    }
    return [[a], [b]];
  }
  if (a.t === "meta" || b.t === "meta") return [[a], [b]];
  if (a.t === "ins" && b.t === "ins") {
    if (a.block.id === b.block.id) return [[], []];
    if (a.after === b.after) return [[a], [{ ...b, after: a.block.id }]];
    return [[a], [b]];
  }
  const ida = a.t === "ins" ? a.block.id : a.id;
  const idb = b.t === "ins" ? b.block.id : b.id;
  if (a.t === "ins" || b.t === "ins") return [[a], [b]];
  if (ida !== idb) return [[a], [b]];
  if (a.t === "del" && b.t === "del") return [[], []];
  if (a.t === "del") return [[a], []];
  if (b.t === "del") return [[], [b]];
  if (a.t === "text" && b.t === "text") {
    const [x, y] = transformText(a.op, b.op);
    return [[{ ...a, op: x }], [{ ...b, op: y }]];
  }
  if (a.t === "marks" && b.t === "marks") return [[a], []];
  if (a.t === "marks" && b.t === "text") return [[{ ...a, marks: a.marks ? mapMarks(a.marks, b.op, Number.MAX_SAFE_INTEGER) ?? [] : null }], [b]];
  if (a.t === "text" && b.t === "marks") return [[a], [{ ...b, marks: b.marks ? mapMarks(b.marks, a.op, Number.MAX_SAFE_INTEGER) ?? [] : null }]];
  if (a.t === "attr" && b.t === "attr") {
    const rest = { ...b.attrs };
    for (const k of Object.keys(a.attrs)) delete rest[k];
    return [[a], Object.keys(rest).length ? [{ ...b, attrs: rest }] : []];
  }
  return [[a], [b]];
}
function transformChange(a, b) {
  if (!a.length || !b.length) return [a, b];
  if (a.length === 1 && b.length === 1) return transformPair(a[0], b[0]);
  if (a.length > 1) {
    const [a12, b12] = transformChange([a[0]], b);
    const [a22, b22] = transformChange(a.slice(1), b12);
    return [[...a12, ...a22], b22];
  }
  const [a1, b1] = transformChange(a, [b[0]]);
  const [a2, b2] = transformChange(a1, b.slice(1));
  return [a2, [...b1, ...b2]];
}
function applyChange(doc, change, graveyard) {
  let blocks = doc.blocks;
  let meta = doc.meta;
  let index = null;
  const idx = () => index ??= new Map(blocks.map((b, i) => [b.id, i]));
  const mutable = () => {
    if (blocks === doc.blocks) blocks = blocks.slice();
  };
  for (const op of change) {
    if (op.t === "meta") {
      if (meta === doc.meta) meta = { ...meta };
      if (op.path.length === 1) meta[op.path[0]] = op.value;
      else {
        const coll = { ...meta[op.path[0]] ?? {} };
        if (op.value === null || op.value === void 0) delete coll[op.path[1]];
        else coll[op.path[1]] = op.value;
        meta[op.path[0]] = coll;
      }
      continue;
    }
    if (op.t === "ins") {
      if (idx().has(op.block.id)) continue;
      const x = op.block.id;
      if (graveyard.has(x)) {
        const px = graveyard.get(x);
        const nx = deadAfter(graveyard, x);
        if (nx !== void 0) graveyard.set(nx, px);
        graveyard.delete(x);
      }
      const y = op.after;
      let at;
      if (y === null) at = 0;
      else if (idx().has(y)) at = idx().get(y) + 1;
      else if (graveyard.has(y)) {
        let p = graveyard.get(y);
        let guard = 0;
        while (p !== null && !idx().has(p) && guard++ < 1e6) p = graveyard.has(p) ? graveyard.get(p) : null;
        at = p === null ? 0 : idx().get(p) + 1;
      } else at = blocks.length;
      if (y === null || idx().has(y) || graveyard.has(y)) {
        const t = deadAfter(graveyard, y);
        if (t !== void 0) graveyard.set(t, x);
      }
      mutable();
      blocks.splice(at, 0, op.block);
      index = null;
      continue;
    }
    const i = idx().get(op.id);
    if (i === void 0) continue;
    if (op.t === "del") {
      let pred = i > 0 ? blocks[i - 1].id : null;
      for (let t = deadAfter(graveyard, pred), guard = 0; t !== void 0 && guard < 1e6; t = deadAfter(graveyard, pred), guard++) pred = t;
      graveyard.set(op.id, pred);
      mutable();
      blocks.splice(i, 1);
      index = null;
      continue;
    }
    const b = blocks[i];
    let nb = b;
    if (op.t === "text") {
      if (baseLength(op.op) !== b.text.length) throw new Error("ot: stale text op");
      const text = applyText(b.text, op.op);
      nb = { ...b, text };
      const m = mapMarks(b.marks, op.op, text.length);
      if (m) nb.marks = m;
      else delete nb.marks;
    } else if (op.t === "marks") {
      nb = { ...b };
      const m = op.marks ? normalizeMarks(op.marks, b.text.length) : void 0;
      if (m) nb.marks = m;
      else delete nb.marks;
    } else if (op.t === "attr") {
      nb = { ...b };
      for (const [k, v] of Object.entries(op.attrs)) {
        if (v === null || v === void 0 || v === false || v === "") delete nb[k];
        else nb[k] = v;
      }
    }
    mutable();
    blocks[i] = nb;
  }
  return { blocks, meta };
}
function deadAfter(graveyard, id) {
  for (const [k, v] of graveyard) if (v === id) return k;
  return void 0;
}
function hashDoc(doc) {
  let h = 2166136261;
  const feed = (s) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  };
  for (const b of doc.blocks) {
    feed(b.id);
    feed(b.type);
    feed(b.text);
    feed(b.dual ?? "");
    feed(JSON.stringify(b.marks ?? []));
  }
  feed(stableStringify(doc.meta));
  return (h >>> 0).toString(16);
}
function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const o = v;
  return "{" + Object.keys(o).filter((k) => o[k] !== void 0).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",") + "}";
}

// src/collab/sync.ts
function projectToDoc(p) {
  return {
    blocks: p.blocks,
    meta: {
      title: p.title,
      author: p.author,
      template: p.template,
      styleOverrides: p.styleOverrides,
      locale: p.locale,
      page: p.page,
      titlePage: p.titlePage,
      logline: p.logline,
      synopsis: p.synopsis,
      theme: p.theme,
      notes: p.notes,
      series: p.series ?? null,
      beats: p.beats,
      revisions: p.revisions,
      scheduleOrder: p.schedule.order,
      budgetSettings: { currency: p.budget.currency, fringePct: p.budget.fringePct, contingencyPct: p.budget.contingencyPct },
      scenes: p.scenes,
      characters: p.characters,
      locations: p.locations,
      cards: p.cards,
      comments: p.comments,
      drafts: p.drafts,
      breakdownElements: p.breakdown.elements,
      scheduleDays: p.schedule.days,
      budgetLines: p.budget.lines,
      callSheets: p.callSheets
    }
  };
}
function docToProject(base, d) {
  const m = d.meta;
  const bs = m.budgetSettings ?? {};
  return {
    ...base,
    blocks: d.blocks,
    title: m.title ?? base.title,
    author: m.author ?? base.author,
    template: m.template ?? base.template,
    styleOverrides: m.styleOverrides ?? base.styleOverrides,
    locale: m.locale ?? base.locale,
    page: m.page ?? base.page,
    titlePage: m.titlePage ?? base.titlePage,
    logline: m.logline ?? "",
    synopsis: m.synopsis ?? "",
    theme: m.theme ?? "",
    notes: m.notes ?? "",
    series: m.series ?? void 0,
    beats: m.beats ?? base.beats,
    revisions: m.revisions ?? base.revisions,
    scenes: m.scenes ?? {},
    characters: m.characters ?? {},
    locations: m.locations ?? {},
    cards: m.cards ?? {},
    comments: m.comments ?? {},
    drafts: m.drafts ?? {},
    breakdown: { elements: m.breakdownElements ?? {} },
    schedule: { order: m.scheduleOrder ?? [], days: m.scheduleDays ?? {} },
    budget: { currency: bs.currency ?? "USD", fringePct: bs.fringePct ?? 0, contingencyPct: bs.contingencyPct ?? 10, lines: m.budgetLines ?? {} },
    callSheets: m.callSheets ?? {}
  };
}

// src/core/model.ts
var ALL_ELEMENT_TYPES = [
  "scene",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "shot",
  "general",
  "lyrics",
  "centered",
  "act",
  "endact",
  "note",
  "page",
  "panel",
  "caption",
  "sfx",
  "sound",
  "music",
  "video",
  "audio"
];
var CARD_COLORS = ["none", "red", "orange", "yellow", "green", "teal", "blue", "violet", "pink", "gray"];
var BREAKDOWN_CATEGORIES = ["cast", "extras", "stunts", "props", "wardrobe", "makeup", "vehicles", "animals", "sfx", "vfx", "sound", "music", "set", "weapons", "equipment", "notes"];
function uid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  let s = "";
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function block(type, text = "", extra = {}) {
  return { id: uid(), type, text, ...extra };
}
function defaultPage(paper = "letter") {
  return {
    paper,
    sceneNumbers: "none",
    moreContd: true,
    autoContd: true,
    header: { left: "", center: "", right: "{page}." },
    footer: { left: "", center: "", right: "" },
    firstPageHeader: false,
    watermark: { enabled: false, text: "", opacity: 0.12 },
    revisionColorPages: false,
    minutesPerPage: 1
  };
}
function defaultTitlePage(title = "", author = "") {
  return { enabled: true, title, credit: "", authors: author, source: "", draft: "", date: "", contact: "", copyright: "", notes: "" };
}
function emptyProject(opts = {}) {
  const now = nowIso();
  return {
    schemaVersion: 2,
    id: uid(),
    title: opts.title ?? "",
    author: opts.author ?? "",
    createdAt: now,
    updatedAt: now,
    revision: 1,
    template: opts.template ?? "feature",
    styleOverrides: {},
    locale: opts.locale ?? "es-LA",
    page: defaultPage(opts.paper ?? "letter"),
    titlePage: defaultTitlePage(opts.title ?? "", opts.author ?? ""),
    blocks: [block("scene", "")],
    logline: "",
    synopsis: "",
    theme: "",
    notes: "",
    scenes: {},
    characters: {},
    locations: {},
    cards: {},
    beats: { sheet: "", beats: [] },
    comments: {},
    revisions: { active: false, current: "", sets: [], pageLocks: null, scenesLocked: false },
    drafts: {},
    breakdown: { elements: {} },
    schedule: { order: [], days: {} },
    budget: { currency: "USD", fringePct: 0, contingencyPct: 10, lines: {} },
    callSheets: {},
    writingLog: {}
  };
}

// src/core/format.ts
var S = (o) => ({
  align: "left",
  upper: false,
  bold: false,
  italic: false,
  underline: false,
  spaceBefore: 1,
  lineSpacing: 1,
  keepWithNext: false,
  splittable: false,
  newPage: false,
  prefix: "",
  suffix: "",
  printable: true,
  shiftTab: o.shiftTab ?? o.tab,
  ...o
});
var feature = {
  id: "feature",
  name: "tpl.feature",
  description: "tpl.feature.d",
  first: "scene",
  sceneNumberStyle: "number",
  order: ["scene", "action", "character", "parenthetical", "dialogue", "transition", "shot", "general", "lyrics", "centered", "note"],
  styles: {
    scene: S({ indent: 0, width: 60, upper: true, spaceBefore: 2, keepWithNext: true, enter: "action", tab: "action", shiftTab: "transition" }),
    action: S({ indent: 0, width: 60, splittable: true, enter: "action", tab: "character", shiftTab: "scene" }),
    character: S({ indent: 22, width: 38, upper: true, keepWithNext: true, enter: "dialogue", tab: "transition", shiftTab: "action" }),
    parenthetical: S({ indent: 15, width: 25, spaceBefore: 0, keepWithNext: true, enter: "dialogue", tab: "dialogue", shiftTab: "dialogue" }),
    dialogue: S({ indent: 10, width: 35, spaceBefore: 0, splittable: true, enter: "character", tab: "parenthetical", shiftTab: "character" }),
    transition: S({ indent: 40, width: 20, align: "right", upper: true, enter: "scene", tab: "scene", shiftTab: "character" }),
    shot: S({ indent: 0, width: 60, upper: true, keepWithNext: true, enter: "action", tab: "action", shiftTab: "scene" }),
    general: S({ indent: 0, width: 60, spaceBefore: 0, splittable: true, enter: "general", tab: "action" }),
    lyrics: S({ indent: 10, width: 35, spaceBefore: 0, italic: true, splittable: true, enter: "lyrics", tab: "dialogue" }),
    centered: S({ indent: 0, width: 60, align: "center", upper: true, enter: "action", tab: "action" }),
    act: S({ indent: 0, width: 60, align: "center", upper: true, underline: true, spaceBefore: 2, keepWithNext: true, newPage: true, enter: "scene", tab: "scene" }),
    endact: S({ indent: 0, width: 60, align: "center", upper: true, underline: true, spaceBefore: 2, enter: "act", tab: "act" }),
    note: S({ indent: 0, width: 60, italic: true, printable: false, enter: "action", tab: "action" })
  }
};
var clone = (t, patch) => {
  const styles = {};
  for (const [k, v] of Object.entries(t.styles)) styles[k] = { ...v };
  for (const [k, v] of Object.entries(patch.styles ?? {})) {
    styles[k] = { ...styles[k] ?? styles.action, ...v };
  }
  return { ...t, ...patch, styles };
};
var tv = clone(feature, {
  id: "tv",
  name: "tpl.tv",
  description: "tpl.tv.d",
  order: ["scene", "action", "character", "parenthetical", "dialogue", "transition", "act", "endact", "shot", "general", "lyrics", "centered", "note"],
  styles: {}
});
var multicam = clone(feature, {
  id: "multicam",
  name: "tpl.multicam",
  description: "tpl.multicam.d",
  sceneNumberStyle: "letter",
  order: ["scene", "action", "character", "parenthetical", "dialogue", "transition", "act", "endact", "shot", "general", "centered", "note"],
  styles: {
    scene: { underline: true, spaceBefore: 2 },
    action: { upper: true },
    character: { indent: 25, width: 35 },
    parenthetical: { indent: 20, width: 20 },
    dialogue: { indent: 15, width: 35, lineSpacing: 2 },
    act: { bold: true }
  }
});
var stage = {
  id: "stage",
  name: "tpl.stage",
  description: "tpl.stage.d",
  first: "act",
  sceneNumberStyle: "number",
  order: ["act", "scene", "action", "character", "parenthetical", "dialogue", "transition", "centered", "note"],
  styles: {
    act: S({ indent: 0, width: 60, align: "center", upper: true, bold: true, spaceBefore: 2, newPage: true, keepWithNext: true, enter: "scene", tab: "scene" }),
    scene: S({ indent: 0, width: 60, align: "center", upper: true, underline: true, spaceBefore: 2, keepWithNext: true, enter: "action", tab: "action" }),
    action: S({ indent: 25, width: 35, italic: true, splittable: true, enter: "character", tab: "character", shiftTab: "scene" }),
    character: S({ indent: 0, width: 60, align: "center", upper: true, keepWithNext: true, enter: "dialogue", tab: "action", shiftTab: "action" }),
    parenthetical: S({ indent: 15, width: 30, italic: true, spaceBefore: 0, keepWithNext: true, enter: "dialogue", tab: "dialogue" }),
    dialogue: S({ indent: 0, width: 60, spaceBefore: 0, splittable: true, enter: "character", tab: "parenthetical", shiftTab: "character" }),
    transition: S({ indent: 40, width: 20, align: "right", upper: true, enter: "scene", tab: "scene" }),
    centered: S({ indent: 0, width: 60, align: "center", upper: true, enter: "action", tab: "action" }),
    note: S({ indent: 0, width: 60, italic: true, printable: false, enter: "action", tab: "action" })
  }
};
var audio = {
  id: "audio",
  name: "tpl.audio",
  description: "tpl.audio.d",
  first: "scene",
  sceneNumberStyle: "number",
  order: ["scene", "action", "character", "parenthetical", "dialogue", "sound", "music", "transition", "note"],
  styles: {
    scene: S({ indent: 0, width: 60, upper: true, bold: true, spaceBefore: 2, keepWithNext: true, enter: "sound", tab: "action" }),
    action: S({ indent: 10, width: 50, italic: true, splittable: true, enter: "character", tab: "character" }),
    character: S({ indent: 0, width: 60, upper: true, keepWithNext: true, suffix: ":", enter: "dialogue", tab: "sound" }),
    parenthetical: S({ indent: 10, width: 40, spaceBefore: 0, keepWithNext: true, enter: "dialogue", tab: "dialogue" }),
    dialogue: S({ indent: 10, width: 50, spaceBefore: 0, splittable: true, enter: "character", tab: "parenthetical" }),
    sound: S({ indent: 10, width: 50, upper: true, underline: true, prefix: "SFX: ", enter: "character", tab: "music" }),
    music: S({ indent: 10, width: 50, upper: true, underline: true, prefix: "MUSIC: ", enter: "character", tab: "sound" }),
    transition: S({ indent: 40, width: 20, align: "right", upper: true, enter: "scene", tab: "scene" }),
    note: S({ indent: 0, width: 60, italic: true, printable: false, enter: "action", tab: "action" })
  }
};
var comic = {
  id: "comic",
  name: "tpl.comic",
  description: "tpl.comic.d",
  first: "page",
  sceneNumberStyle: "number",
  order: ["page", "panel", "action", "character", "dialogue", "caption", "sfx", "note"],
  styles: {
    page: S({ indent: 0, width: 60, upper: true, bold: true, underline: true, spaceBefore: 2, keepWithNext: true, enter: "panel", tab: "panel" }),
    panel: S({ indent: 0, width: 60, bold: true, spaceBefore: 1, keepWithNext: true, enter: "action", tab: "action" }),
    action: S({ indent: 0, width: 60, splittable: true, enter: "character", tab: "character" }),
    character: S({ indent: 20, width: 40, upper: true, keepWithNext: true, enter: "dialogue", tab: "caption" }),
    dialogue: S({ indent: 10, width: 40, spaceBefore: 0, splittable: true, enter: "character", tab: "caption" }),
    caption: S({ indent: 10, width: 40, prefix: "CAPTION: ", enter: "character", tab: "sfx" }),
    sfx: S({ indent: 10, width: 40, upper: true, bold: true, prefix: "SFX: ", enter: "panel", tab: "character" }),
    note: S({ indent: 0, width: 60, italic: true, printable: false, enter: "action", tab: "action" })
  }
};
var av = {
  id: "av",
  name: "tpl.av",
  description: "tpl.av.d",
  first: "scene",
  sceneNumberStyle: "number",
  twoColumn: { leftWidth: 28, gap: 3 },
  order: ["scene", "video", "audio", "general", "note"],
  styles: {
    scene: S({ indent: 0, width: 60, upper: true, bold: true, spaceBefore: 2, keepWithNext: true, enter: "video", tab: "video" }),
    video: S({ indent: 0, width: 28, upper: false, enter: "audio", tab: "audio", shiftTab: "scene" }),
    audio: S({ indent: 31, width: 29, enter: "video", tab: "video", shiftTab: "video" }),
    general: S({ indent: 0, width: 60, splittable: true, enter: "video", tab: "video" }),
    note: S({ indent: 0, width: 60, italic: true, printable: false, enter: "video", tab: "video" })
  }
};
var TEMPLATES = [feature, tv, multicam, stage, audio, comic, av];
function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) ?? feature;
}
function resolveStyles(project) {
  const t = getTemplate(project.template);
  const fallback = t.styles.action ?? t.styles.general ?? feature.styles.action;
  const tokens = localeTokens(project.locale);
  const out = {};
  const all = ["scene", "action", "character", "dialogue", "parenthetical", "transition", "shot", "general", "lyrics", "centered", "act", "endact", "note", "page", "panel", "caption", "sfx", "sound", "music", "video", "audio"];
  for (const type of all) {
    const base = t.styles[type] ?? feature.styles[type] ?? fallback;
    const style = { ...base, ...project.styleOverrides?.[type] ?? {} };
    if (base.prefix === "SFX: ") style.prefix = project.styleOverrides?.[type]?.prefix ?? tokens.sfx;
    if (base.prefix === "MUSIC: ") style.prefix = project.styleOverrides?.[type]?.prefix ?? tokens.music;
    if (base.prefix === "CAPTION: ") style.prefix = project.styleOverrides?.[type]?.prefix ?? tokens.caption;
    out[type] = style;
  }
  return out;
}
function pageGeometry(paper) {
  if (paper === "a4") {
    return { paper, widthIn: 8.27, heightIn: 11.69, marginTop: 1, marginBottom: 0.69, marginLeft: 1.5, headerAt: 0.5, footerAt: 0.5, cols: 60, lines: 60 };
  }
  return { paper, widthIn: 8.5, heightIn: 11, marginTop: 1, marginBottom: 1 - 1 / 6, marginLeft: 1.5, headerAt: 0.5, footerAt: 0.5, cols: 60, lines: 55 };
}
var EN = {
  more: "(MORE)",
  contd: "(CONT'D)",
  continued: "CONTINUED:",
  omitted: "OMITTED",
  theEnd: "THE END",
  sfx: "SFX: ",
  music: "MUSIC: ",
  caption: "CAPTION: ",
  scenePrefixes: ["INT.", "EXT.", "INT./EXT.", "EXT./INT.", "I/E."],
  times: ["DAY", "NIGHT", "MORNING", "AFTERNOON", "EVENING", "DAWN", "DUSK", "CONTINUOUS", "LATER", "MOMENTS LATER", "SAME TIME"],
  transitions: ["CUT TO:", "FADE IN:", "FADE OUT.", "FADE TO BLACK.", "DISSOLVE TO:", "SMASH CUT TO:", "MATCH CUT TO:", "JUMP CUT TO:", "BACK TO:", "INTERCUT WITH:"],
  extensions: ["V.O.", "O.S.", "O.C.", "CONT'D", "PRE-LAP", "FILTERED", "INTO PHONE"],
  acts: ["TEASER", "ACT ONE", "ACT TWO", "ACT THREE", "ACT FOUR", "ACT FIVE", "TAG"],
  lang: "en-US",
  defaultPaper: "letter"
};
var ES_LA = {
  more: "(SIGUE)",
  contd: "(CONT.)",
  continued: "CONTIN\xDAA:",
  omitted: "OMITIDA",
  theEnd: "FIN",
  sfx: "EFECTO: ",
  music: "M\xDASICA: ",
  caption: "CARTUCHO: ",
  scenePrefixes: ["INT.", "EXT.", "INT./EXT.", "EXT./INT."],
  times: ["D\xCDA", "NOCHE", "AMANECER", "ATARDECER", "MA\xD1ANA", "TARDE", "CONTINUO", "M\xC1S TARDE", "MOMENTOS DESPU\xC9S", "MISMO MOMENTO"],
  transitions: ["CORTE A:", "FADE IN:", "FADE OUT.", "FUNDIDO A NEGRO.", "DISOLVENCIA A:", "CORTE DIRECTO A:", "CORTE POR CORRESPONDENCIA A:", "REGRESO A:", "INTERCALAR CON:"],
  extensions: ["V.O.", "O.S.", "OFF", "CONT.", "AL TEL\xC9FONO"],
  acts: ["TEASER", "ACTO UNO", "ACTO DOS", "ACTO TRES", "ACTO CUATRO", "ACTO CINCO", "TAG"],
  lang: "es",
  defaultPaper: "letter"
};
var ES_ES = {
  ...ES_LA,
  sfx: "EFECTO: ",
  caption: "CARTUCHO: ",
  transitions: ["CORTE A:", "FUNDIDO DE ENTRADA:", "FUNDIDO A NEGRO.", "ENCADENADO A:", "CORTE BRUSCO A:", "CORTE EN CONTINUIDAD A:", "VUELTA A:", "MONTAJE PARALELO CON:"],
  extensions: ["OFF", "V.O.", "CONT.", "AL TEL\xC9FONO", "EN PANTALLA"],
  lang: "es-ES",
  defaultPaper: "a4"
};
var PT_BR = {
  more: "(CONTINUA)",
  contd: "(CONT.)",
  continued: "CONTINUA:",
  omitted: "OMITIDA",
  theEnd: "FIM",
  sfx: "SOM: ",
  music: "M\xDASICA: ",
  caption: "LEGENDA: ",
  scenePrefixes: ["INT.", "EXT.", "INT./EXT."],
  times: ["DIA", "NOITE", "AMANHECER", "ENTARDECER", "MANH\xC3", "TARDE", "CONT\xCDNUO", "MAIS TARDE", "MOMENTOS DEPOIS"],
  transitions: ["CORTA PARA:", "FADE IN:", "FADE OUT.", "FUS\xC3O:", "CORTE SECO PARA:", "VOLTA PARA:"],
  extensions: ["V.O.", "O.S.", "OFF", "CONT.", "AO TELEFONE"],
  acts: ["TEASER", "ATO UM", "ATO DOIS", "ATO TR\xCAS", "ATO QUATRO", "ATO CINCO", "TAG"],
  lang: "pt-BR",
  defaultPaper: "a4"
};
function localeTokens(locale) {
  switch (locale) {
    case "en":
      return EN;
    case "es-ES":
      return ES_ES;
    case "pt-BR":
      return PT_BR;
    default:
      return ES_LA;
  }
}
var SCRIPT_LOCALES = ["es-LA", "es-ES", "en", "pt-BR"];

// src/core/migrate.ts
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var str = (v, d = "") => typeof v === "string" ? v : d;
var num = (v, d = 0) => typeof v === "number" && Number.isFinite(v) ? v : d;
var arr = (v) => Array.isArray(v) ? v : [];
var rec = (v) => isObj(v) ? v : {};
var ID_RE = /^[A-Za-z0-9-]{1,80}$/;
function safeId(v, seen) {
  let id = typeof v === "string" && ID_RE.test(v) ? v : uid();
  while (seen.has(id)) id = uid();
  seen.add(id);
  return id;
}
var MARK_KINDS = /* @__PURE__ */ new Set(["b", "i", "u", "x", "hl", "tag", "cmt"]);
function cleanMarks(v, len) {
  const out = [];
  for (const m of arr(v)) {
    if (!isObj(m) || !MARK_KINDS.has(str(m.k))) continue;
    const s = Math.max(0, Math.min(len, Math.floor(num(m.s))));
    const e = Math.max(s, Math.min(len, Math.floor(num(m.e))));
    if (e <= s) continue;
    const mark = { s, e, k: m.k };
    if (typeof m.v === "string") mark.v = m.v;
    out.push(mark);
  }
  return out.length ? out : void 0;
}
function normalizeBlocks(list) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const raw of arr(list)) {
    if (!isObj(raw)) continue;
    const typeRaw = str(raw.type) || str(raw.kind);
    const type = ALL_ELEMENT_TYPES.includes(typeRaw) ? typeRaw : "action";
    const text = str(raw.text).replace(/\r\n?/g, "\n").replace(/\u0000/g, "");
    const b = { id: safeId(raw.id, seen), type, text };
    const marks = cleanMarks(raw.marks, text.length);
    if (marks) b.marks = marks;
    if (raw.dual === "L" || raw.dual === "R") b.dual = raw.dual;
    if (typeof raw.num === "string" && raw.num) b.num = raw.num.slice(0, 12);
    if (raw.omitted === true) b.omitted = true;
    if (typeof raw.rev === "string" && raw.rev) b.rev = raw.rev;
    if (typeof raw.bookmark === "string" && raw.bookmark) b.bookmark = raw.bookmark.slice(0, 120);
    out.push(b);
  }
  if (!out.length) out.push({ id: uid(), type: "scene", text: "" });
  return out;
}
var OLD_COLORS = { amber: "orange", teal: "teal", blue: "blue", violet: "violet", rose: "pink" };
function color(v) {
  const s = str(v);
  if (CARD_COLORS.includes(s)) return s;
  return OLD_COLORS[s] ?? "none";
}
function fromV1(raw) {
  const p = emptyProject();
  p.id = typeof raw.id === "string" && ID_RE.test(raw.id) ? raw.id : p.id;
  p.title = str(raw.title);
  p.author = str(raw.author);
  p.createdAt = str(raw.createdAt, p.createdAt);
  p.updatedAt = str(raw.updatedAt, p.updatedAt);
  p.revision = Math.max(1, Math.floor(num(raw.revision, 1)));
  p.notes = str(raw.description);
  const tpl = str(raw.template);
  p.template = tpl === "pilot" || tpl === "series" ? "tv" : "feature";
  const doc = rec(raw.documentSettings);
  p.page = defaultPage(doc.paperSize === "a4" ? "a4" : "letter");
  const cover = rec(raw.cover);
  p.titlePage = { ...defaultTitlePage(p.title, p.author), enabled: doc.includeCover !== false, contact: str(cover.contact), copyright: str(cover.copyright), draft: str(cover.draftLabel) };
  const blocks = normalizeBlocks(raw.blocks);
  const prof = rec(raw.professional);
  if (prof.language === "en") p.locale = "en";
  const duals = arr(prof.dualDialogues).filter(isObj);
  for (const d of duals) {
    const pair = [
      { id: uid(), type: "character", text: str(d.leftName), dual: "L" },
      { id: uid(), type: "dialogue", text: str(d.leftText), dual: "L" },
      { id: uid(), type: "character", text: str(d.rightName), dual: "R" },
      { id: uid(), type: "dialogue", text: str(d.rightText), dual: "R" }
    ];
    let at = blocks.findIndex((b) => b.id === str(d.anchorBlockId));
    if (at < 0) {
      const s = blocks.findIndex((b) => b.id === str(d.sceneId));
      if (s >= 0) {
        at = s;
        while (at + 1 < blocks.length && blocks[at + 1].type !== "scene") at++;
      }
    }
    if (at < 0) at = blocks.length - 1;
    blocks.splice(at + 1, 0, ...pair);
  }
  p.blocks = blocks;
  const story = rec(raw.story);
  p.logline = str(story.logline);
  p.synopsis = str(story.synopsis);
  p.theme = str(story.theme);
  for (const e of arr(story.entries).filter(isObj)) {
    const id = typeof e.id === "string" && ID_RE.test(e.id) ? e.id : uid();
    if (e.kind === "character") {
      p.characters[id] = { id, name: str(e.name).toUpperCase(), color: "none", role: str(e.subtitle), bio: str(e.description), goal: str(e.objective), need: str(e.contradictions), arc: str(e.arc), actor: "" };
    } else if (e.kind === "location") {
      p.locations[id] = { id, name: str(e.name).toUpperCase(), description: str(e.description), address: "", notes: str(e.subtitle) };
    } else {
      p.cards[id] = { id, title: str(e.name), text: str(e.description), color: "yellow", x: 40 + Object.keys(p.cards).length * 30, y: 40 };
    }
  }
  const STATUS = { idea: "idea", draft: "draft", revised: "revised", ready: "final" };
  for (const [sid, sc] of Object.entries(rec(story.scenes))) {
    if (!isObj(sc)) continue;
    p.scenes[sid] = { summary: str(sc.synopsis) || str(sc.beat), color: color(sc.color), status: STATUS[str(sc.status)] ?? void 0 };
  }
  const editorial = rec(raw.editorial);
  for (const c of arr(editorial.comments).filter(isObj)) {
    const id = typeof c.id === "string" && ID_RE.test(c.id) ? c.id : uid();
    p.comments[id] = {
      id,
      author: str(c.author, ""),
      body: str(c.body),
      createdAt: str(c.createdAt),
      resolved: c.status === "resolved",
      replies: arr(c.replies).filter(isObj).map((r) => ({ id: str(r.id) || uid(), author: str(r.author), body: str(r.body), createdAt: str(r.createdAt) })),
      blockId: str(c.blockId),
      excerpt: str(c.excerpt)
    };
  }
  for (const d of arr(editorial.drafts).filter(isObj)) {
    const id = typeof d.id === "string" && ID_RE.test(d.id) ? d.id : uid();
    p.drafts[id] = { id, name: str(d.name, "Versi\xF3n"), createdAt: str(d.createdAt), blocks: normalizeBlocks(d.blocks) };
  }
  const production = rec(prof.production);
  const FIELD = { props: "props", wardrobe: "wardrobe", extras: "extras", cast: "cast", sound: "sound", effects: "sfx", notes: "notes", locations: "set" };
  for (const [sid, bd] of Object.entries(rec(production.breakdown))) {
    if (!isObj(bd)) continue;
    const ids = [];
    for (const [field, cat] of Object.entries(FIELD)) {
      for (const name of str(bd[field]).split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)) {
        const existing = Object.values(p.breakdown.elements).find((e) => e.category === cat && e.name.toLowerCase() === name.toLowerCase());
        const id = existing?.id ?? uid();
        if (!existing) p.breakdown.elements[id] = { id, category: cat, name, notes: "" };
        ids.push(id);
      }
    }
    if (ids.length) p.scenes[sid] = { ...p.scenes[sid] ?? {}, elements: ids };
  }
  const nums = rec(production.sceneNumbers);
  if (Object.keys(nums).length) {
    for (const b of p.blocks) if (b.type === "scene" && typeof nums[b.id] === "string") b.num = nums[b.id];
  }
  return p;
}
function fromV2(raw) {
  const base = emptyProject();
  const p = { ...base };
  p.id = typeof raw.id === "string" && ID_RE.test(raw.id) ? raw.id : base.id;
  p.title = str(raw.title);
  p.author = str(raw.author);
  p.createdAt = str(raw.createdAt, base.createdAt);
  p.updatedAt = str(raw.updatedAt, base.updatedAt);
  p.revision = Math.max(1, Math.floor(num(raw.revision, 1)));
  p.template = str(raw.template, "feature");
  p.styleOverrides = isObj(raw.styleOverrides) ? raw.styleOverrides : {};
  p.locale = SCRIPT_LOCALES.includes(str(raw.locale)) ? raw.locale : "es-LA";
  const page = rec(raw.page);
  const dp = defaultPage(page.paper === "a4" ? "a4" : "letter");
  p.page = {
    ...dp,
    ...page,
    paper: page.paper === "a4" ? "a4" : "letter",
    header: { ...dp.header, ...rec(page.header) },
    footer: { ...dp.footer, ...rec(page.footer) },
    watermark: { ...dp.watermark, ...rec(page.watermark) }
  };
  p.titlePage = { ...defaultTitlePage(p.title, p.author), ...rec(raw.titlePage) };
  p.blocks = normalizeBlocks(raw.blocks);
  p.logline = str(raw.logline);
  p.synopsis = str(raw.synopsis);
  p.theme = str(raw.theme);
  p.notes = str(raw.notes);
  if (isObj(raw.series)) p.series = { show: str(raw.series.show), season: num(raw.series.season, 1), episode: num(raw.series.episode, 1), episodeTitle: str(raw.series.episodeTitle) };
  p.scenes = rec(raw.scenes);
  p.characters = rec(raw.characters);
  p.locations = rec(raw.locations);
  p.cards = rec(raw.cards);
  const beats = rec(raw.beats);
  p.beats = { sheet: str(beats.sheet), beats: arr(beats.beats).filter(isObj) };
  p.comments = rec(raw.comments);
  for (const c of Object.values(p.comments)) if (!Array.isArray(c.replies)) c.replies = [];
  const rv = rec(raw.revisions);
  p.revisions = { active: rv.active === true, current: str(rv.current), sets: arr(rv.sets).filter(isObj), pageLocks: Array.isArray(rv.pageLocks) ? rv.pageLocks : null, scenesLocked: rv.scenesLocked === true };
  p.drafts = {};
  for (const [k, d] of Object.entries(rec(raw.drafts))) if (isObj(d)) p.drafts[k] = { id: str(d.id, k), name: str(d.name), createdAt: str(d.createdAt), blocks: normalizeBlocks(d.blocks) };
  const bd = rec(raw.breakdown);
  p.breakdown = { elements: {} };
  for (const [k, e] of Object.entries(rec(bd.elements))) {
    if (!isObj(e)) continue;
    const cat = BREAKDOWN_CATEGORIES.includes(str(e.category)) ? e.category : "notes";
    p.breakdown.elements[k] = { id: k, category: cat, name: str(e.name), notes: str(e.notes) };
  }
  const sc = rec(raw.schedule);
  p.schedule = { order: arr(sc.order).filter((x) => typeof x === "string"), days: rec(sc.days) };
  const bu = rec(raw.budget);
  p.budget = { currency: str(bu.currency, "USD"), fringePct: num(bu.fringePct), contingencyPct: num(bu.contingencyPct, 10), lines: rec(bu.lines) };
  p.callSheets = rec(raw.callSheets);
  p.writingLog = rec(raw.writingLog);
  return p;
}
var ProjectFormatError = class extends Error {
};
function loadProject(input) {
  let raw = input;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new ProjectFormatError("invalid-json");
    }
  }
  if (!isObj(raw)) throw new ProjectFormatError("not-a-project");
  if (!Array.isArray(raw.blocks)) throw new ProjectFormatError("no-blocks");
  const v = num(raw.schemaVersion, 1);
  if (v > 2) throw new ProjectFormatError("newer-version");
  return v === 2 ? fromV2(raw) : fromV1(raw);
}

// src/core/text.ts
var segmenter;
function getSegmenter() {
  if (segmenter !== void 0) return segmenter;
  const I = globalThis.Intl;
  segmenter = I && I.Segmenter ? new I.Segmenter(void 0, { granularity: "grapheme" }) : null;
  return segmenter;
}
var ASCII = /^[\x20-\x7e]*$/;
function isWideCodePoint(cp) {
  return cp >= 4352 && cp <= 4447 || cp >= 11904 && cp <= 12350 || cp >= 12353 && cp <= 13311 || cp >= 13312 && cp <= 19903 || cp >= 19968 && cp <= 40959 || cp >= 40960 && cp <= 42191 || cp >= 44032 && cp <= 55203 || cp >= 63744 && cp <= 64255 || cp >= 65072 && cp <= 65103 || cp >= 65280 && cp <= 65376 || cp >= 65504 && cp <= 65510 || cp >= 126976 && cp <= 129791 || cp >= 131072 && cp <= 262141;
}
var ZERO = /^[\p{M}​-‏⁠︀-️]+$/u;
function graphemeWidth(g) {
  if (g.length === 1) {
    const c = g.charCodeAt(0);
    if (c < 768) return c === 9 ? 4 : 1;
  }
  if (ZERO.test(g)) return 0;
  const cp = g.codePointAt(0) ?? 0;
  if (isWideCodePoint(cp)) return 2;
  if (g.includes("\uFE0F") && new RegExp("\\p{Extended_Pictographic}", "u").test(g)) return 2;
  return 1;
}
function graphemes(text) {
  const out = [];
  if (ASCII.test(text)) {
    for (let i2 = 0; i2 < text.length; i2++) out.push({ s: i2, e: i2 + 1, w: 1, t: text[i2] });
    return out;
  }
  const seg = getSegmenter();
  if (seg) {
    for (const part of seg.segment(text)) {
      const t = part.segment;
      out.push({ s: part.index, e: part.index + t.length, w: t === "\n" ? 0 : graphemeWidth(t), t });
    }
    return out;
  }
  let i = 0;
  for (const ch of Array.from(text)) {
    out.push({ s: i, e: i + ch.length, w: ch === "\n" ? 0 : graphemeWidth(ch), t: ch });
    i += ch.length;
  }
  return out;
}
function textWidth(text) {
  if (ASCII.test(text)) return text.length;
  let w = 0;
  for (const g of graphemes(text)) w += g.w;
  return w;
}
var BREAK_AFTER = /* @__PURE__ */ new Set(["-", "\u2010", "\u2013", "\u2014", "/", "\u2026"]);
function wrap(text, cols) {
  const max = Math.max(1, Math.floor(cols));
  const lines = [];
  if (!text) return [{ start: 0, end: 0, width: 0 }];
  const gs = graphemes(text);
  let lineStart = 0;
  let width = 0;
  let pendingSpaces = 0;
  let breakAt = -1;
  let widthAtBreak = 0;
  const push2 = (startIdx, endIdx, w) => {
    const s = startIdx < gs.length ? gs[startIdx].s : text.length;
    const e = endIdx > 0 ? endIdx <= gs.length ? gs[endIdx - 1].e : text.length : s;
    lines.push({ start: s, end: Math.max(s, e), width: w });
  };
  for (let i = 0; i < gs.length; i++) {
    const g = gs[i];
    if (g.t === "\n") {
      push2(lineStart, i, width);
      lineStart = i + 1;
      width = 0;
      pendingSpaces = 0;
      breakAt = -1;
      continue;
    }
    if (g.t === " " || g.t === "	") {
      pendingSpaces += g.w;
      breakAt = i + 1;
      widthAtBreak = width;
      continue;
    }
    const next = width + pendingSpaces + g.w;
    if (next > max && width + pendingSpaces > 0) {
      if (breakAt > lineStart && breakAt <= i) {
        push2(lineStart, breakAt, widthAtBreak);
        lineStart = breakAt;
        let w = 0;
        for (let j = breakAt; j < i; j++) w += gs[j].w;
        width = w;
        pendingSpaces = 0;
        breakAt = -1;
      } else {
        push2(lineStart, i, width + pendingSpaces);
        lineStart = i;
        width = 0;
        pendingSpaces = 0;
        breakAt = -1;
      }
    }
    width += pendingSpaces + g.w;
    pendingSpaces = 0;
    if (BREAK_AFTER.has(g.t)) {
      const n = gs[i + 1];
      if (n && /[\p{L}]/u.test(n.t) && i > lineStart) {
        breakAt = i + 1;
        widthAtBreak = width;
      }
    }
  }
  push2(lineStart, gs.length, width);
  return lines;
}
function upperSameLength(text) {
  const u = text.toUpperCase();
  if (u.length === text.length) return u;
  let out = "";
  for (const ch of text) {
    const c = ch.toUpperCase();
    out += c.length === ch.length ? c : ch;
  }
  return out;
}
function endsSentence(text, end) {
  const before = text.slice(Math.max(0, end - 4), end).trimEnd();
  return /[.!?…:;]["'”’)\]]*$/.test(before);
}

// src/core/scenes.ts
var PREFIX_RE = /^\s*((?:INT|EXT|I)\.?\s*\/\s*(?:EXT|INT|E)\.?|INT\.?|EXT\.?|INTERIOR|EXTERIOR|I\/E\.?|EST\.?)(?=[\s.\-–—]|$)[\s.\-–—]*/i;
var NIGHT = /\b(NIGHT|NOCHE|NOITE|ANOCHECER|DUSK|EVENING)\b/i;
var DAY = /\b(DAY|D[IÍ]A|MORNING|MAÑANA|MANHÃ|AFTERNOON|TARDE|DAWN|AMANECER|AMANHECER|ATARDECER|ENTARDECER|NOON|MEDIOD[IÍ]A)\b/i;
function parseHeading(text) {
  const raw = text.trim();
  const m = PREFIX_RE.exec(raw);
  let prefix = "";
  let rest = raw;
  let intExt = "";
  if (m) {
    prefix = m[1].toUpperCase().replace(/\s+/g, "");
    rest = raw.slice(m[0].length);
    const p = prefix.replace(/\./g, "");
    if (/^(INT\/EXT|EXT\/INT|I\/E)$/.test(p)) intExt = "both";
    else if (/^(INT|INTERIOR)$/.test(p)) intExt = "int";
    else if (/^(EXT|EXTERIOR|EST)$/.test(p)) intExt = "ext";
  }
  let location = rest.trim();
  let time = "";
  const sep = /\s+[-–—]\s+/g;
  let last = -1;
  let lastLen = 0;
  let mm;
  while (mm = sep.exec(rest)) {
    last = mm.index;
    lastLen = mm[0].length;
  }
  if (last >= 0) {
    location = rest.slice(0, last).trim();
    time = rest.slice(last + lastLen).trim();
  }
  let dayNight = "";
  if (time) dayNight = NIGHT.test(time) ? "night" : DAY.test(time) ? "day" : "other";
  return { prefix, intExt, location: location.replace(/\s+/g, " ").toUpperCase(), time: time.toUpperCase(), dayNight };
}
function characterName(text) {
  return text.replace(/\^\s*$/, "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}
function letterLabel(n) {
  const L = String.fromCharCode(65 + n % 26);
  return L.repeat(Math.floor(n / 26) + 1);
}
function nextSuffix(label, used) {
  const m = /^(.*?)([A-Z]*)$/.exec(label);
  const base = m[1] || label;
  const suffix = m[2];
  const seq = (s2) => {
    if (!s2) return "A";
    const last = s2[s2.length - 1];
    if (last === "Z") return seq(s2.slice(0, -1)) + "A";
    return s2.slice(0, -1) + String.fromCharCode(last.charCodeAt(0) + 1);
  };
  let s = seq(suffix);
  let guard = 0;
  while (used.has(base + s) && guard++ < 200) s = seq(s);
  return base + s;
}
function buildScenes(blocks, opts = {}) {
  const scenes = [];
  const used = /* @__PURE__ */ new Set();
  if (opts.locked) {
    for (const b of blocks) if (b.type === "scene" && b.num) used.add(b.num);
  }
  let counter = 0;
  let prevLabel = "";
  let current = null;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "scene") {
      if (current) current.end = i;
      let label;
      if (opts.locked) {
        if (b.num) label = b.num;
        else if (!prevLabel) {
          const firstLocked = blocks.find((x) => x.type === "scene" && x.num)?.num ?? "1";
          let c = 0;
          label = String.fromCharCode(65 + c) + firstLocked;
          while (used.has(label) && c < 25) label = String.fromCharCode(65 + ++c) + firstLocked;
        } else label = nextSuffix(prevLabel, used);
        used.add(label);
      } else {
        label = opts.letters ? letterLabel(counter) : String(counter + 1);
      }
      counter++;
      prevLabel = label;
      current = { id: b.id, index: scenes.length, label, heading: b.text, start: i, end: blocks.length, omitted: !!b.omitted, parsed: parseHeading(b.text), speakers: [], words: 0 };
      scenes.push(current);
    } else if (current) {
      if (b.type === "character") {
        const n = characterName(b.text);
        if (n && !current.speakers.includes(n)) current.speakers.push(n);
      }
      if (b.type !== "note") current.words += (b.text.match(/\S+/g) || []).length;
    }
  }
  if (current) current.end = blocks.length;
  return scenes;
}
function sceneOptions(project) {
  return { letters: project.template === "multicam", locked: !!project.revisions?.scenesLocked };
}
function autoContdIds(blocks, locale) {
  const tokens = localeTokens(locale);
  const contdWord = tokens.contd.replace(/[()]/g, "").toUpperCase();
  const out = /* @__PURE__ */ new Set();
  let lastSpeaker = "";
  let interrupted = false;
  for (const b of blocks) {
    if (b.type === "scene" || b.type === "act" || b.type === "page") {
      lastSpeaker = "";
      interrupted = false;
      continue;
    }
    if (b.type === "character") {
      const name = characterName(b.text);
      const already = /\(CONT|\(CONT'D|\(CONTD|CONT\.\)/i.test(b.text) || b.text.toUpperCase().includes(contdWord);
      if (name && name === lastSpeaker && interrupted && !already && !b.dual) out.add(b.id);
      lastSpeaker = name;
      interrupted = false;
      continue;
    }
    if (b.type === "action" || b.type === "shot" || b.type === "general") interrupted = true;
    if (b.type === "transition") {
      lastSpeaker = "";
    }
  }
  return out;
}

// src/core/layout.ts
var DUAL = {
  rightOrigin: 31,
  colWidth: 29,
  character: { indent: 8, width: 21 },
  parenthetical: { indent: 3, width: 22 },
  dialogue: { indent: 0, width: 28 }
};
function dualStyle(type) {
  if (type === "character") return DUAL.character;
  if (type === "parenthetical") return DUAL.parenthetical;
  return DUAL.dialogue;
}
var cache = /* @__PURE__ */ new Map();
function cachedWrap(text, cols) {
  const key = cols + "" + text;
  let v = cache.get(key);
  if (!v) {
    if (cache.size > 3e4) cache.clear();
    v = wrap(text, cols);
    cache.set(key, v);
  }
  return v;
}
function displayText(b, style, tokens, contd) {
  let base = b.omitted ? tokens.omitted : b.text;
  if (style.upper) base = upperSameLength(base);
  const text = style.prefix + base + style.suffix + (contd ? " " + tokens.contd : "");
  return { text, textStart: style.prefix.length };
}
function lineCol(style, align, text) {
  if (align === "left") return style.indent;
  const w = textWidth(text.trimEnd());
  if (align === "center") return style.indent + Math.max(0, Math.floor((style.width - w) / 2));
  return style.indent + Math.max(0, style.width - w);
}
function layoutProject(project, opts = {}) {
  const styles = resolveStyles(project);
  const template = getTemplate(project.template);
  const tokens = localeTokens(project.locale);
  const geometry = pageGeometry(project.page.paper);
  const scenes = buildScenes(project.blocks, sceneOptions(project));
  const sceneLabels = /* @__PURE__ */ new Map();
  for (const s of scenes) sceneLabels.set(s.id, s.label);
  const contd = project.page.autoContd ? autoContdIds(project.blocks, project.locale) : /* @__PURE__ */ new Set();
  const locks = opts.ignoreLocks ? null : project.revisions?.pageLocks ?? null;
  return paginate(project.blocks, { styles, template, tokens, geometry, page: project.page, contd, locks, includeNotes: !!opts.includeNotes, sceneLabels });
}
function paginate(allBlocks, input) {
  const { styles, tokens, geometry, page, template } = input;
  const cap = geometry.lines;
  const blocks = input.includeNotes ? allBlocks : allBlocks.filter((b) => styles[b.type]?.printable !== false);
  const display = /* @__PURE__ */ new Map();
  const twoCol = !!template.twoColumn;
  const geom = (b, inDual) => {
    const st = styles[b.type];
    if (inDual) return dualStyle(b.type);
    return { indent: st.indent, width: st.width };
  };
  const measure = (b, inDual) => {
    const st = styles[b.type];
    const isContd = input.contd.has(b.id);
    const { text, textStart } = displayText(b, st, tokens, isContd);
    const g = geom(b, inDual);
    const lines = cachedWrap(text, g.width);
    const d = { text, textStart, style: st, indent: g.indent, width: g.width, lines, contd: isContd };
    display.set(b.id, d);
    return d;
  };
  const blockHeight = (b, inDual) => measure(b, inDual).lines.length * styles[b.type].lineSpacing;
  const units = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const st = styles[b.type];
    if (b.dual === "L" && (b.type === "character" || b.type === "dialogue" || b.type === "parenthetical")) {
      let j = i;
      const left = [];
      while (j < blocks.length && blocks[j].dual === "L") left.push(blocks[j++]);
      const right = [];
      while (j < blocks.length && blocks[j].dual === "R") right.push(blocks[j++]);
      if (right.length) {
        const colH = (list) => list.reduce((h, x, k) => h + (k ? styles[x.type].spaceBefore : 0) + blockHeight(x, true), 0);
        const height = Math.max(colH(left), colH(right));
        units.push({ kind: "dual", blocks: [...left, ...right], split: left.length, style: st, spaceBefore: st.spaceBefore, height, splittable: false, keepWithNext: false, newPage: false });
        i = j - 1;
        continue;
      }
    }
    if (twoCol && (b.type === "video" || b.type === "audio")) {
      const pair = [b];
      let split = b.type === "video" ? 1 : 0;
      if (b.type === "video" && blocks[i + 1]?.type === "audio") {
        pair.push(blocks[i + 1]);
        i++;
      }
      const left = pair.filter((x) => x.type === "video");
      const right = pair.filter((x) => x.type === "audio");
      split = left.length;
      const hL = left.reduce((h, x) => h + blockHeight(x, false), 0);
      const hR = right.reduce((h, x) => h + blockHeight(x, false), 0);
      units.push({ kind: "av", blocks: [...left, ...right], split, style: st, spaceBefore: st.spaceBefore, height: Math.max(hL, hR), splittable: false, keepWithNext: false, newPage: false });
      continue;
    }
    units.push({ kind: "single", blocks: [b], split: 1, style: st, spaceBefore: st.spaceBefore, height: blockHeight(b, false), splittable: st.splittable, keepWithNext: st.keepWithNext, newPage: st.newPage });
  }
  const lockQueue = (input.locks ?? []).filter((l) => l && l.blockId);
  const lockByBlock = /* @__PURE__ */ new Map();
  for (const l of lockQueue) {
    const arr2 = lockByBlock.get(l.blockId) ?? [];
    arr2.push(l);
    lockByBlock.set(l.blockId, arr2.sort((a, b) => a.offset - b.offset));
  }
  const presentIds = new Set(blocks.map((b) => b.id));
  const locked = !!input.locks;
  let lockBase = "1";
  let overflow = 0;
  const nextLabel = () => {
    if (!locked) return String(pages.length + 1);
    overflow++;
    let s = "";
    let n = overflow;
    while (n > 0) {
      n--;
      s = String.fromCharCode(65 + n % 26) + s;
      n = Math.floor(n / 26);
    }
    return lockBase + s;
  };
  const pages = [];
  const breaks = [];
  const blockPage = /* @__PURE__ */ new Map();
  let cur = { index: 0, label: "1", lines: [], used: 0 };
  pages.push(cur);
  let placed = [];
  const startPage = (label, at) => {
    const prevUsed = cur.used;
    cur = { index: pages.length, label, lines: [], used: 0 };
    pages.push(cur);
    placed = [];
    breaks.push({ pageIndex: cur.index, label, blockId: at.blockId, offset: at.offset, prevUsed, more: !!at.more, contd: at.contd ?? "" });
  };
  const pushLine = (line, rowOffset) => {
    cur.lines.push({ ...line, row: rowOffset });
  };
  const placeSingle = (b, from, to, sb) => {
    const d = display.get(b.id);
    const ls = d.style.lineSpacing;
    let row = cur.used + sb;
    if (from === 0 && !blockPage.has(b.id)) blockPage.set(b.id, cur.index);
    for (let k = from; k < to; k++) {
      const l = d.lines[k];
      const text = d.text.slice(l.start, l.end);
      pushLine({ kind: "text", blockId: b.id, type: b.type, text, dStart: l.start, dEnd: l.end, textStart: d.textStart, col: lineCol(d, d.style.align, text), first: k === 0 }, row);
      row += ls;
    }
    cur.used = row;
  };
  const placeColumns = (u, sb) => {
    const top = cur.used + sb;
    let maxRow = top;
    const left = u.blocks.slice(0, u.split);
    const right = u.blocks.slice(u.split);
    const place = (list, column) => {
      let row = top;
      list.forEach((b, k) => {
        const d = display.get(b.id);
        if (k) row += styles[b.type].spaceBefore;
        if (!blockPage.has(b.id)) blockPage.set(b.id, cur.index);
        const origin = u.kind === "dual" && column === "R" ? DUAL.rightOrigin : 0;
        d.lines.forEach((l, li) => {
          const text = d.text.slice(l.start, l.end);
          pushLine({ kind: "text", blockId: b.id, type: b.type, text, dStart: l.start, dEnd: l.end, textStart: d.textStart, col: origin + lineCol(d, d.style.align, text), column, first: li === 0 }, row);
          row += d.style.lineSpacing;
        });
      });
      maxRow = Math.max(maxRow, row);
    };
    place(left, "L");
    place(right, "R");
    cur.used = maxRow;
  };
  const speakerBefore = (unitIndex) => {
    for (let k = unitIndex - 1; k >= 0 && k >= unitIndex - 6; k--) {
      const b = units[k].blocks[0];
      if (units[k].kind !== "single") return "";
      if (b.type === "character") return characterName(b.text);
      if (b.type !== "parenthetical" && b.type !== "dialogue") return "";
    }
    return "";
  };
  const minFollow = (i, depth = 0) => {
    const n = units[i + 1];
    if (!n || depth > 3) return 0;
    const sb = n.spaceBefore;
    if (n.splittable) {
      const d = display.get(n.blocks[0].id);
      return sb + Math.min(2, d.lines.length) * d.style.lineSpacing;
    }
    return sb + n.height + (n.keepWithNext ? minFollow(i + 1, depth + 1) : 0);
  };
  const lockFor = (b, offset) => lockByBlock.get(b.id)?.find((l) => l.offset === offset);
  for (let ui = 0; ui < units.length; ui++) {
    const u = units[ui];
    const first = u.blocks[0];
    const lk = lockFor(first, 0);
    if (lk) {
      lockBase = lk.label;
      overflow = 0;
      if (cur.lines.length) startPage(lk.label, { blockId: first.id, offset: 0 });
      else {
        cur.label = lk.label;
        if (breaks.length && breaks[breaks.length - 1].pageIndex === cur.index) breaks[breaks.length - 1].label = lk.label;
      }
    } else if (u.newPage && cur.lines.length) {
      startPage(nextLabel(), { blockId: first.id, offset: 0 });
    }
    let sb = cur.used === 0 ? 0 : u.spaceBefore;
    const need = sb + u.height + (u.keepWithNext ? minFollow(ui) : 0);
    const innerLocks = u.kind === "single" ? (lockByBlock.get(first.id) ?? []).filter((l) => l.offset > 0) : [];
    if (u.kind === "single" && (innerLocks.length || cur.used + need > cap)) {
      const d = display.get(first.id);
      const ls = d.style.lineSpacing;
      const total = d.lines.length;
      const lineOfOffset = (offset) => d.lines.findIndex((x) => x.start >= offset + d.textStart);
      const isDialogue = first.type === "dialogue" && page.moreContd;
      const contdName = isDialogue ? speakerBefore(ui) : "";
      const reserve = isDialogue && contdName ? 1 : 0;
      let from = 0;
      let guard = 0;
      while (from < total && guard++ < 1e5) {
        sb = cur.used === 0 ? 0 : from === 0 ? u.spaceBefore : 0;
        const avail = cap - cur.used - sb;
        const remaining = total - from;
        const chainOk = from > 0 || !u.keepWithNext || cur.used === 0 || cur.used + sb + remaining * ls + minFollow(ui) <= cap;
        const nextLock = innerLocks.find((l) => lineOfOffset(l.offset) > from);
        const lockLine = nextLock ? lineOfOffset(nextLock.offset) : -1;
        if (lockLine < 0 && remaining * ls <= avail && chainOk) {
          placeSingle(first, from, total, sb);
          placed.push({ unit: ui, from, lines: remaining, used: cur.used });
          from = total;
          break;
        }
        if (nextLock && lockLine > from && (lockLine - from) * ls <= avail) {
          placeSingle(first, from, lockLine, sb);
          placed.push({ unit: ui, from, lines: lockLine - from, used: cur.used });
          lockBase = nextLock.label;
          overflow = 0;
          startPage(nextLock.label, { blockId: first.id, offset: nextLock.offset });
          from = lockLine;
          continue;
        }
        let k = 0;
        if (u.splittable) {
          k = chooseSplitFrom(d, from, avail - reserve, cur.used === 0 || remaining * ls > cap);
          if (lockLine > from) k = Math.min(k, lockLine - from);
        }
        if (k > 0) {
          placeSingle(first, from, from + k, sb);
          placed.push({ unit: ui, from, lines: k, used: cur.used });
          const at = from + k;
          const more = reserve > 0;
          if (more) {
            pushLine({ kind: "more", blockId: first.id, type: "character", text: tokens.more, dStart: 0, dEnd: 0, textStart: 0, col: styles.character.indent, first: false }, cur.used);
            cur.used += 1;
          }
          const offset = Math.max(0, d.lines[at].start - d.textStart);
          startPage(nextLabel(), { blockId: first.id, offset, more, contd: more ? contdName : "" });
          if (more) {
            pushLine({ kind: "contd", blockId: first.id, type: "character", text: `${contdName} ${tokens.contd}`, dStart: 0, dEnd: 0, textStart: 0, col: styles.character.indent, first: false }, 0);
            cur.used = 1;
          }
          from = at;
          continue;
        }
        if (cur.used > 0) {
          const pulled = from === 0 ? pullKeepers() : [];
          startPage(nextLabel(), { blockId: pulled.length ? units[pulled[0]].blocks[0].id : first.id, offset: from === 0 ? 0 : Math.max(0, d.lines[from].start - d.textStart) });
          for (const pi of pulled) replayUnit(pi);
          continue;
        }
        const n = Math.max(1, Math.min(remaining, Math.floor(avail / ls)));
        placeSingle(first, from, from + n, 0);
        placed.push({ unit: ui, from, lines: n, used: cur.used });
        from += n;
        if (from < total) startPage(nextLabel(), { blockId: first.id, offset: Math.max(0, d.lines[from].start - d.textStart) });
      }
      continue;
    }
    if (cur.used + need > cap && cur.used > 0) {
      const pulled = pullKeepers();
      startPage(nextLabel(), { blockId: pulled.length ? units[pulled[0]].blocks[0].id : first.id, offset: 0 });
      for (const pi of pulled) replayUnit(pi);
      sb = cur.used === 0 ? 0 : u.spaceBefore;
    }
    if (u.kind === "single") placeSingle(first, 0, display.get(first.id).lines.length, sb);
    else placeColumns(u, sb);
    placed.push({ unit: ui, from: 0, lines: 0, used: cur.used });
  }
  function chooseSplitFrom(d, from, avail, force) {
    const ls = d.style.lineSpacing;
    const total = d.lines.length - from;
    const maxK = Math.min(total - 1, Math.floor(avail / ls));
    if (maxK <= 0) return 0;
    for (let k = maxK; k >= 2; k--) {
      if (total - k < 2) continue;
      if (endsSentence(d.text, d.lines[from + k - 1].end)) return k;
    }
    if (force) return Math.max(1, maxK);
    return 0;
  }
  function pullKeepers() {
    const pulled = [];
    while (placed.length > 1) {
      const last = placed[placed.length - 1];
      const lu = units[last.unit];
      if (!lu.keepWithNext || last.from !== 0 || lu.kind !== "single") break;
      placed.pop();
      const id = lu.blocks[0].id;
      cur.lines = cur.lines.filter((l) => l.blockId !== id);
      blockPage.delete(id);
      pulled.unshift(last.unit);
    }
    cur.used = placed.length ? placed[placed.length - 1].used : 0;
    return pulled;
  }
  function replayUnit(pi) {
    const pu = units[pi];
    const sb = cur.used === 0 ? 0 : pu.spaceBefore;
    if (pu.kind === "single") placeSingle(pu.blocks[0], 0, display.get(pu.blocks[0].id).lines.length, sb);
    else placeColumns(pu, sb);
    placed.push({ unit: pi, from: 0, lines: 0, used: cur.used });
  }
  if (locked && input.locks) {
    for (const l of input.locks) {
      if (!presentIds.has(l.blockId)) {
        const target = [...pages].reverse().find((p) => compareLabels(p.label.split("-")[0], l.label) < 0) ?? pages[0];
        if (!target.label.split("-").includes(l.label)) target.label = `${target.label}-${l.label}`;
      }
    }
  }
  return { pages, breaks, blockPage, display, geometry, linesPerPage: cap, sceneLabels: input.sceneLabels };
}
function compareLabels(a, b) {
  const pa = /^(\d+)([A-Z]*)$/.exec(a);
  const pb = /^(\d+)([A-Z]*)$/.exec(b);
  if (!pa || !pb) return a.localeCompare(b);
  const d = Number(pa[1]) - Number(pb[1]);
  if (d) return d;
  if (pa[2].length !== pb[2].length) return pa[2].length - pb[2].length;
  return pa[2].localeCompare(pb[2]);
}

// src/io/xml.ts
function esc(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

// src/io/zip.ts
var CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

// src/io/text.ts
function spanMarks(b, dStart, dEnd, textStart, text) {
  if (!b?.marks?.length) return esc(text);
  const s0 = dStart - textStart;
  const cuts = /* @__PURE__ */ new Set([0, text.length]);
  const fmt = b.marks.filter((m) => m.k === "b" || m.k === "i" || m.k === "u" || m.k === "x");
  for (const m of fmt) {
    const a = m.s - s0, z = m.e - s0;
    if (a > 0 && a < text.length) cuts.add(a);
    if (z > 0 && z < text.length) cuts.add(z);
  }
  const pts = [...cuts].sort((a, z) => a - z);
  let out = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i], e = pts[i + 1];
    const on = fmt.filter((m) => m.s - s0 <= s && m.e - s0 >= e).map((m) => m.k);
    let seg = esc(text.slice(s, e));
    if (on.includes("b")) seg = `<b>${seg}</b>`;
    if (on.includes("i")) seg = `<i>${seg}</i>`;
    if (on.includes("u")) seg = `<u>${seg}</u>`;
    if (on.includes("x")) seg = `<s>${seg}</s>`;
    out += seg;
  }
  void dEnd;
  return out;
}
function toHtml(p, opts = {}) {
  const layout = layoutProject(p);
  const styles = resolveStyles(p);
  const g = pageGeometry(p.page.paper);
  const byId = new Map(p.blocks.map((b) => [b.id, b]));
  const tp = p.titlePage;
  const pages = [];
  const pageHtml = (inner, head = "") => `<section class="pg">${head}<div class="txt">${inner}</div></section>`;
  if (tp.enabled && (tp.title || p.title)) {
    const lines = [];
    const center = (s, row, bold = false) => s.split("\n").forEach((ln, k) => lines.push(`<div class="ln c" style="top:${(row + k) * 12}pt">${bold ? `<b>${esc(upperSameLength(ln))}</b>` : esc(ln)}</div>`));
    center(tp.title || p.title, 19, true);
    let r = 22;
    if (tp.credit) {
      center(tp.credit, r);
      r += 2;
    }
    if (tp.authors || p.author) center(tp.authors || p.author, r);
    if (tp.contact) tp.contact.split("\n").forEach((ln, k, all) => lines.push(`<div class="ln" style="top:${(g.lines - all.length + k) * 12}pt">${esc(ln)}</div>`));
    const right = [tp.draft, tp.date].filter(Boolean).join("\n");
    if (right) right.split("\n").forEach((ln, k, all) => lines.push(`<div class="ln r" style="top:${(g.lines - all.length + k) * 12}pt">${esc(ln)}</div>`));
    pages.push(pageHtml(lines.join("")));
  }
  layout.pages.forEach((lp, pi) => {
    const hf = opts.header?.(pi, lp.label) ?? (pi === 0 && !p.page.firstPageHeader ? { left: "", center: "", right: "" } : { left: "", center: "", right: lp.label + "." });
    const head = `<div class="hd"><span>${esc(hf.left)}</span><span class="c">${esc(hf.center)}</span><span class="r">${esc(hf.right)}</span></div>`;
    const lines = lp.lines.map((l) => {
      const st = styles[l.type];
      const b = byId.get(l.blockId);
      const cls = [st?.bold && "b", st?.italic && "i", st?.underline && "u"].filter(Boolean).join(" ");
      const body = l.kind === "text" ? spanMarks(b, l.dStart, l.dEnd, l.textStart, l.text) : esc(l.text);
      const num2 = l.first && l.type === "scene" && p.page.sceneNumbers !== "none" ? `<span class="sn l">${esc(layout.sceneLabels.get(l.blockId) ?? "")}</span>${p.page.sceneNumbers === "both" ? `<span class="sn r">${esc(layout.sceneLabels.get(l.blockId) ?? "")}</span>` : ""}` : "";
      const rev = b?.rev ? '<span class="rv">*</span>' : "";
      const id = l.first && l.type === "scene" ? ` id="s-${l.blockId}"` : "";
      return `<div${id} class="ln ${cls}" style="top:${l.row * 12}pt;left:${l.col}ch">${num2}${body}${rev}</div>`;
    }).join("");
    pages.push(pageHtml(lines, head));
  });
  const W = g.widthIn, H = g.heightIn;
  const css = `
@page{size:${W}in ${H}in;margin:0}
*{box-sizing:border-box}
body{margin:0;background:#e9e7e2;font:12pt/12pt 'Courier Prime','Courier New',Courier,monospace;color:#111}
.pg{width:${W}in;height:${H}in;background:#fff;margin:24px auto;position:relative;box-shadow:0 2px 12px rgba(0,0,0,.15);overflow:hidden;page-break-after:always;break-after:page}
.txt{position:absolute;left:${g.marginLeft}in;top:${g.marginTop}in;width:60ch;height:${g.lines * 12}pt}
.ln{position:absolute;white-space:pre;left:0}
.ln.c{width:60ch;text-align:center}.ln.r{width:60ch;text-align:right}
.ln.b{font-weight:bold}.ln.i{font-style:italic}.ln.u{text-decoration:underline}
.hd{position:absolute;left:${g.marginLeft}in;top:${g.headerAt}in;width:60ch;display:flex}.hd span{flex:1;white-space:pre}.hd .c{text-align:center}.hd .r{text-align:right}
.sn{position:absolute;white-space:pre}.sn.l{right:calc(100% + 3ch)}.sn.r{left:63ch}
.rv{position:absolute;left:64ch;font-weight:bold}
@media print{body{background:none}.pg{margin:0;box-shadow:none}}
${opts.forPrint ? "" : "nav{position:fixed;left:0;top:0;bottom:0;width:260px;overflow:auto;background:#fff;border-right:1px solid #ddd;font:13px/1.4 system-ui,sans-serif;padding:12px}nav a{display:block;color:#333;text-decoration:none;padding:3px 6px;border-radius:5px}nav a:hover{background:#f1efe9}main{margin-left:260px}@media(max-width:900px){nav{display:none}main{margin:0}.pg{transform-origin:top left}}@media print{nav{display:none}main{margin:0}}"}`;
  const scenes = buildScenes(p.blocks);
  const nav = opts.forPrint ? "" : `<nav><b>${esc(p.title || "ScriptZ")}</b><br><br>${scenes.map((s) => `<a href="#s-${s.id}">${esc(s.label)}. ${esc(upperSameLength(s.heading))}</a>`).join("")}</nav>`;
  return `<!doctype html><html lang="${localeTokens(p.locale).lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.title || "ScriptZ")}</title><meta name="generator" content="ScriptZ"><style>${css}</style></head><body>${nav}<main>${pages.join("")}</main></body></html>`;
}

// src/collab/server.ts
var args = process.argv.slice(2);
var arg = (name, def) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : process.env["SCRIPTZ_" + name.toUpperCase()] ?? def;
};
var PORT = Number(arg("port", "4735"));
var HOST = arg("host", "0.0.0.0");
var DATA = path.resolve(arg("data", "./scriptz-rooms"));
var CERT = arg("cert", "");
var KEY = arg("key", "");
var MAX_MSG = 48 * 1024 * 1024;
var HISTORY = 5e3;
fs.mkdirSync(DATA, { recursive: true });
var rooms = /* @__PURE__ */ new Map();
var token = () => crypto.randomBytes(18).toString("base64url");
var roomFile = (id) => path.join(DATA, `${id.replace(/[^\w-]/g, "")}.json`);
function loadRoom(id) {
  if (rooms.has(id)) return rooms.get(id);
  const f = roomFile(id);
  if (!fs.existsSync(f)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    const r = { id, base: loadProject(j.base), doc: j.doc, rev: j.rev, history: [], historyStart: j.rev, tokens: j.tokens, conns: /* @__PURE__ */ new Set(), graveyard: new Map(Array.isArray(j.graveyard) ? j.graveyard : []), dirty: false, updatedAt: j.updatedAt ?? Date.now() };
    rooms.set(id, r);
    return r;
  } catch (e) {
    console.error("room load failed", id, e);
    return null;
  }
}
function persist(r) {
  if (!r.dirty) return;
  r.dirty = false;
  const tmp = roomFile(r.id) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ base: r.base, doc: r.doc, rev: r.rev, tokens: r.tokens, updatedAt: r.updatedAt, graveyard: [...r.graveyard] }));
  fs.renameSync(tmp, roomFile(r.id));
}
setInterval(() => {
  for (const r of rooms.values()) {
    try {
      persist(r);
    } catch (e) {
      console.error(e);
    }
  }
}, 3e3).unref();
function roleOf(r, tk) {
  const given = Buffer.from(tk.slice(0, 64).padEnd(64), "latin1");
  for (const role of ["owner", "editor", "viewer"]) {
    const want = Buffer.from((r.tokens[role] ?? "").padEnd(64), "latin1");
    if (r.tokens[role] && want.length === given.length && crypto.timingSafeEqual(want, given)) return role;
  }
  return null;
}
function sendFrame(sock, data, opcode = 1) {
  const payload = Buffer.from(data, "utf8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 128 | opcode;
  try {
    sock.write(Buffer.concat([header, payload]));
  } catch {
  }
}
function send(c, msg) {
  sendFrame(c.sock, JSON.stringify(msg));
}
function attachParser(sock, onText, onClose) {
  let buf = Buffer.alloc(0);
  let fragments = [];
  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (; ; ) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 128) !== 0;
      const op = buf[0] & 15;
      const masked = (buf[1] & 128) !== 0;
      let len = buf[1] & 127;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        const big = buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_MSG)) {
          sock.destroy();
          return;
        }
        len = Number(big);
        off = 10;
      }
      if (len > MAX_MSG) {
        sock.destroy();
        return;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < off + maskLen + len) return;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      const payload = Buffer.from(buf.subarray(off + maskLen, off + maskLen + len));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(off + maskLen + len);
      if (op === 8) {
        try {
          sendFrame(sock, "", 8);
        } catch {
        }
        sock.end();
        onClose();
        return;
      }
      if (op === 9) {
        const pong = Buffer.concat([Buffer.from([138, payload.length]), payload]);
        try {
          sock.write(pong);
        } catch {
        }
        continue;
      }
      if (op === 10) continue;
      if (op === 1 || op === 0) {
        fragments.push(payload);
        if (fin) {
          const text = Buffer.concat(fragments).toString("utf8");
          fragments = [];
          onText(text);
        }
      }
    }
  });
  sock.on("close", onClose);
  sock.on("error", onClose);
}
function peersOf(r, except) {
  return [...r.conns].filter((c) => c !== except).map((c) => ({ id: c.id, name: c.name, color: c.color }));
}
function hello(r, c) {
  send(c, { type: "hello", rev: r.rev, project: r.base, doc: r.doc, role: c.role, peers: peersOf(r, c), you: c.id, tokens: c.role === "owner" ? r.tokens : void 0 });
}
function onMessage(r, c, raw) {
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  if (m.type === "resync") {
    hello(r, c);
    return;
  }
  if (m.type === "cursor") {
    for (const o of r.conns) if (o !== c) send(o, { type: "cursor", from: c.id, anchor: m.anchor ?? null, focus: m.focus ?? null });
    return;
  }
  if (m.type !== "op" || !Array.isArray(m.change)) return;
  if (c.role === "viewer") {
    send(c, { type: "error", message: "read-only" });
    hello(r, c);
    return;
  }
  const base = Number(m.rev);
  if (!Number.isFinite(base) || base < r.historyStart || base > r.rev) {
    hello(r, c);
    return;
  }
  let change = m.change;
  try {
    for (let k = base; k < r.rev; k++) change = transformChange(change, r.history[k - r.historyStart])[0];
    r.doc = applyChange(r.doc, change, r.graveyard);
  } catch (e) {
    console.warn("rejected op from", c.name, e.message);
    hello(r, c);
    return;
  }
  r.history.push(change);
  r.rev++;
  if (r.history.length > HISTORY) {
    const drop = r.history.length - HISTORY;
    r.history.splice(0, drop);
    r.historyStart += drop;
  }
  r.dirty = true;
  r.updatedAt = Date.now();
  send(c, { type: "ack", seq: m.seq, rev: r.rev, hash: hashDoc(r.doc) });
  for (const o of r.conns) if (o !== c) send(o, { type: "op", rev: r.rev, change, from: c.id });
}
function json(res, code, body) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_MSG) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
async function handle(req, res) {
  const url = new URL(req.url ?? "/", "http://x");
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-max-age": "86400" });
    res.end();
    return;
  }
  if (url.pathname === "/health") return json(res, 200, { ok: true, rooms: rooms.size });
  if (url.pathname === "/api/rooms" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const project = loadProject(body.project);
      const id = crypto.randomBytes(8).toString("base64url");
      const r = { id, base: { ...project, blocks: [] }, doc: projectToDoc(project), rev: 0, history: [], historyStart: 0, tokens: { owner: token(), editor: token(), viewer: token() }, conns: /* @__PURE__ */ new Set(), graveyard: /* @__PURE__ */ new Map(), dirty: true, updatedAt: Date.now() };
      rooms.set(id, r);
      persist(r);
      return json(res, 201, { room: id, tokens: r.tokens });
    } catch (e) {
      return json(res, 400, { error: String(e.message) });
    }
  }
  const view = /^\/view\/([\w-]+)$/.exec(url.pathname);
  if (view && req.method === "GET") {
    const r = loadRoom(view[1]);
    if (!r || !roleOf(r, url.searchParams.get("token") ?? "")) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    const html = toHtml(docToProject(r.base, r.doc)).replace("</body>", `<script>setTimeout(()=>location.reload(),60000)</script></body>`);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(html);
    return;
  }
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("ScriptZ collaboration server is running.\n");
}
var server = CERT && KEY ? https.createServer({ cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY) }, handle) : http.createServer(handle);
server.on("upgrade", (req, sock) => {
  const url = new URL(req.url ?? "/", "http://x");
  const key = req.headers["sec-websocket-key"];
  if (url.pathname !== "/ws" || typeof key !== "string") {
    sock.destroy();
    return;
  }
  const r = loadRoom(url.searchParams.get("room") ?? "");
  const role = r ? roleOf(r, url.searchParams.get("token") ?? "") : null;
  if (!r || !role) {
    sock.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    sock.destroy();
    return;
  }
  const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  sock.write(`HTTP/1.1 101 Switching Protocols\r
Upgrade: websocket\r
Connection: Upgrade\r
Sec-WebSocket-Accept: ${accept}\r
\r
`);
  const c = { id: crypto.randomBytes(6).toString("base64url"), sock, name: (url.searchParams.get("name") ?? "Anon").slice(0, 40), color: (url.searchParams.get("color") ?? "#e8590c").slice(0, 16), role, alive: true };
  r.conns.add(c);
  let closed = false;
  attachParser(sock, (text) => onMessage(r, c, text), () => {
    if (closed) return;
    closed = true;
    r.conns.delete(c);
    for (const o of r.conns) send(o, { type: "leave", id: c.id });
    try {
      persist(r);
    } catch {
    }
  });
  hello(r, c);
  for (const o of r.conns) if (o !== c) send(o, { type: "join", peer: { id: c.id, name: c.name, color: c.color } });
});
setInterval(() => {
  for (const r of rooms.values()) for (const c of r.conns) {
    try {
      c.sock.write(Buffer.from([137, 0]));
    } catch {
    }
  }
}, 25e3).unref();
server.listen(PORT, HOST, () => {
  console.log(`ScriptZ collaboration server on ${CERT ? "https/wss" : "http/ws"}://${HOST}:${PORT}  \xB7  data: ${DATA}`);
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => {
  for (const r of rooms.values()) {
    r.dirty = true;
    try {
      persist(r);
    } catch {
    }
  }
  process.exit(0);
});
