// Final Draft (.fdx) import/export — real Final Draft structures (DualDialogue, styles, scene numbers, revisions, title page).
import { block, type Block, type ElementType, type Mark, type Project, type TitlePage } from '../core/model';
import { localeTokens } from '../core/format';
import { normalizeMarks } from '../core/marks';
import { esc, first, kids, parseXml, textOf, type XNode } from './xml';

const TO_FDX: Partial<Record<ElementType, string>> = {
  scene: 'Scene Heading', action: 'Action', character: 'Character', dialogue: 'Dialogue', parenthetical: 'Parenthetical',
  transition: 'Transition', shot: 'Shot', general: 'General', lyrics: 'Lyrics', act: 'New Act', endact: 'End of Act', centered: 'Action',
  page: 'Scene Heading', panel: 'Shot', caption: 'Dialogue', sfx: 'Action', sound: 'Action', music: 'Action', video: 'Action', audio: 'Dialogue',
};

const FROM_FDX: Record<string, ElementType> = {
  'scene heading': 'scene', action: 'action', character: 'character', dialogue: 'dialogue', parenthetical: 'parenthetical', transition: 'transition',
  shot: 'shot', general: 'general', lyrics: 'lyrics', 'new act': 'act', 'end of act': 'endact', 'cast list': 'general', teaser: 'act', 'act break': 'act',
  'end of teaser': 'endact', 'new scene': 'scene', 'outline 1': 'note', 'outline 2': 'note', 'outline 3': 'note', 'outline 4': 'note', 'outline body': 'note',
};

const REV_COLORS: Record<string, string> = { white: 'White', blue: 'Blue', pink: 'Pink', yellow: 'Yellow', green: 'Green', goldenrod: 'Goldenrod', buff: 'Buff', salmon: 'Salmon', cherry: 'Cherry', blue2: '2nd Blue', pink2: '2nd Pink', yellow2: '2nd Yellow', green2: '2nd Green', goldenrod2: '2nd Goldenrod' };

function runs(b: Block, revId?: number): string {
  const text = b.text;
  const fmt = (b.marks ?? []).filter((m) => m.k === 'b' || m.k === 'i' || m.k === 'u' || m.k === 'x');
  const cuts = new Set<number>([0, text.length]);
  for (const m of fmt) { cuts.add(m.s); cuts.add(m.e); }
  const pts = [...cuts].sort((a, z) => a - z);
  let out = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i], e = pts[i + 1];
    const on = fmt.filter((m) => m.s <= s && m.e >= e).map((m) => ({ b: 'Bold', i: 'Italic', u: 'Underline', x: 'Strikeout' }[m.k as 'b']));
    const attrs = (on.length ? ` Style="${[...new Set(on)].join('+')}"` : '') + (revId ? ` RevisionID="${revId}"` : '');
    out += `<Text${attrs}>${esc(text.slice(s, e))}</Text>`;
  }
  if (!out) out = `<Text${revId ? ` RevisionID="${revId}"` : ''}></Text>`;
  return out;
}

export function toFdx(p: Project, opts: { includeNotes?: boolean } = {}): string {
  const tokens = localeTokens(p.locale);
  const revIds = new Map(p.revisions.sets.map((s, i) => [s.id, i + 1]));
  const L: string[] = [];
  L.push('<?xml version="1.0" encoding="UTF-8" standalone="no" ?>');
  L.push('<FinalDraft DocumentType="Script" Template="No" Version="5">');
  L.push('  <Content>');
  const para = (b: Block, indent = '    ') => {
    const type = TO_FDX[b.type] ?? 'Action';
    const attrs = [`Type="${type}"`];
    if (b.type === 'scene' && b.num) attrs.push(`Number="${esc(b.num)}"`);
    if (b.type === 'centered') attrs.push('Alignment="Center"');
    const rid = b.rev ? revIds.get(b.rev) : undefined;
    const copy = b.omitted ? { ...b, text: tokens.omitted, marks: undefined } : b;
    let inner = runs(copy, rid);
    if (b.type === 'scene') {
      const meta = p.scenes[b.id];
      const summary = meta?.summary ? `<Summary><Paragraph Type="General"><Text>${esc(meta.summary)}</Text></Paragraph></Summary>` : '';
      inner = `<SceneProperties Title=""${meta?.color && meta.color !== 'none' ? ` Color="${meta.color}"` : ''}>${summary}</SceneProperties>` + inner;
    }
    return `${indent}<Paragraph ${attrs.join(' ')}>${inner}</Paragraph>`;
  };
  const blocks = p.blocks.filter((b) => opts.includeNotes || b.type !== 'note');
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.dual === 'L') {
      const left: Block[] = [];
      let j = i;
      while (j < blocks.length && blocks[j].dual === 'L') left.push(blocks[j++]);
      const right: Block[] = [];
      while (j < blocks.length && blocks[j].dual === 'R') right.push(blocks[j++]);
      if (right.length) {
        L.push('    <Paragraph>');
        L.push('      <DualDialogue>');
        for (const x of [...left, ...right]) L.push(para(x, '        '));
        L.push('      </DualDialogue>');
        L.push('    </Paragraph>');
        i = j - 1;
        continue;
      }
    }
    if (b.type === 'note') { L.push(`    <Paragraph Type="General"><Text Style="Italic">[${esc(b.text)}]</Text></Paragraph>`); continue; }
    L.push(para(b));
  }
  L.push('  </Content>');
  // Title page
  const tp = p.titlePage;
  if (tp.enabled && (tp.title || p.title)) {
    const tl = (text: string, align: 'Center' | 'Left' | 'Right', space = 0, style = '') => text.split('\n').map((ln, k) => `      <Paragraph Alignment="${align}" FirstIndent="0.00" Leading="Regular" LeftIndent="1.00" RightIndent="7.50" SpaceBefore="${k === 0 ? space : 0}" Spacing="1" StartsNewPage="No"><Text${style ? ` Style="${style}"` : ''}>${esc(ln)}</Text></Paragraph>`).join('\n');
    L.push('  <TitlePage>');
    L.push('    <Content>');
    const parts: string[] = [];
    parts.push(tl(tp.title || p.title, 'Center', 216, 'Bold+Underline+AllCaps'));
    if (tp.credit) parts.push(tl(tp.credit, 'Center', 24));
    if (tp.authors || p.author) parts.push(tl(tp.authors || p.author, 'Center', 12));
    if (tp.source) parts.push(tl(tp.source, 'Center', 24));
    if (tp.contact) parts.push(tl(tp.contact, 'Left', 240));
    if (tp.draft || tp.date) parts.push(tl([tp.draft, tp.date].filter(Boolean).join('\n'), 'Right', tp.contact ? 12 : 240));
    if (tp.copyright) parts.push(tl(tp.copyright, 'Left', 12));
    L.push(parts.join('\n'));
    L.push('    </Content>');
    L.push('  </TitlePage>');
  }
  if (p.revisions.sets.length) {
    const active = revIds.get(p.revisions.current) ?? p.revisions.sets.length;
    L.push(`  <Revisions ActiveSet="${active}" Location="7.75" RevisionMode="${p.revisions.active ? 'Yes' : 'No'}" RevisionsShown="Active" ShowAllMarks="No" ShowAllSets="No">`);
    p.revisions.sets.forEach((s, i) => L.push(`    <Revision Color="${REV_COLORS[s.color] ?? 'Blue'}" FullRevision="No" ID="${i + 1}" Mark="${esc(s.mark || '*')}" Name="${esc(s.name)}" PageColor="${REV_COLORS[s.color] ?? 'Blue'}" Style=""/>`));
    L.push('  </Revisions>');
  }
  L.push(`  <PageLayout BackgroundColor="#FFFFFFFFFFFF" BottomMargin="72" BreakDialogueAndActionAtSentences="Yes" DocumentLeading="Normal" FooterMargin="36" ForegroundColor="#000000000000" HeaderMargin="36" InvisiblesColor="#808080808080" TopMargin="72" UsesSmartQuotes="Yes"><AutoCastList AddParentheses="Yes" AutomaticallyGenerate="No" CastListElement="Cast List"/></PageLayout>`);
  L.push(`  <HeaderAndFooter FooterFirstPage="Yes" FooterVisible="No" HeaderFirstPage="${p.page.firstPageHeader ? 'Yes' : 'No'}" HeaderVisible="Yes" StartingPage="1"/>`);
  L.push('</FinalDraft>');
  return L.join('\n') + '\n';
}

function paragraphToBlock(pn: XNode, revMap: Map<string, string>): Block | null {
  const typeName = (pn.attrs.Type ?? 'Action').toLowerCase();
  let type: ElementType = FROM_FDX[typeName] ?? 'action';
  if ((pn.attrs.Alignment ?? '').toLowerCase() === 'center' && type === 'action') type = 'centered';
  let text = '';
  const marks: Mark[] = [];
  let rev: string | undefined;
  for (const t of kids(pn, 'Text')) {
    const s = text.length;
    text += textOf(t).replace(/\r\n?/g, '\n');
    const e = text.length;
    const style = (t.attrs.Style ?? '').toLowerCase();
    if (e > s) {
      if (style.includes('bold')) marks.push({ s, e, k: 'b' });
      if (style.includes('italic')) marks.push({ s, e, k: 'i' });
      if (style.includes('underline')) marks.push({ s, e, k: 'u' });
      if (style.includes('strikeout')) marks.push({ s, e, k: 'x' });
    }
    if (t.attrs.RevisionID && revMap.has(t.attrs.RevisionID)) rev = revMap.get(t.attrs.RevisionID);
  }
  // Fallback: some writers put text directly in the paragraph.
  if (!kids(pn, 'Text').length) text = textOf(pn).trim();
  const b = block(type, text);
  const m = normalizeMarks(marks, text.length);
  if (m) b.marks = m;
  if (type === 'scene' && pn.attrs.Number) b.num = pn.attrs.Number;
  if (rev) b.rev = rev;
  return b;
}

export interface FdxImport { title: Partial<TitlePage>; blocks: Block[]; summaries: Record<string, string>; revisions: { id: string; name: string; color: string }[] }

export function parseFdx(src: string): FdxImport {
  const root = parseXml(src);
  const fd = kids(root).find((n) => n.name === 'FinalDraft') ?? root;
  const content = first(fd, 'Content');
  if (!content) throw new Error('not-fdx');
  const revisions: FdxImport['revisions'] = [];
  const revMap = new Map<string, string>();
  const revs = first(fd, 'Revisions');
  if (revs) for (const r of kids(revs, 'Revision')) {
    const id = 'fdx-rev-' + (r.attrs.ID ?? revisions.length + 1);
    revMap.set(r.attrs.ID ?? '', id);
    revisions.push({ id, name: r.attrs.Name ?? r.attrs.Color ?? 'Rev', color: (r.attrs.Color ?? 'Blue').toLowerCase().replace(/^2nd\s+/, '') });
  }
  const blocks: Block[] = [];
  const summaries: Record<string, string> = {};
  for (const pn of kids(content, 'Paragraph')) {
    const dd = first(pn, 'DualDialogue');
    if (dd) {
      const inner = kids(dd, 'Paragraph').map((x) => paragraphToBlock(x, revMap)).filter(Boolean) as Block[];
      let side: 'L' | 'R' = 'L';
      let seenChar = 0;
      for (const b of inner) {
        if (b.type === 'character') { seenChar++; if (seenChar === 2) side = 'R'; }
        if (b.type === 'character' || b.type === 'dialogue' || b.type === 'parenthetical') b.dual = side;
        blocks.push(b);
      }
      continue;
    }
    const b = paragraphToBlock(pn, revMap);
    if (!b) continue;
    if (b.type === 'scene') {
      const sp = first(pn, 'SceneProperties');
      const sum = sp && first(sp, 'Summary');
      if (sum) summaries[b.id] = kids(sum, 'Paragraph').map((x) => textOf(x).trim()).filter(Boolean).join('\n');
    }
    blocks.push(b);
  }
  // Title page heuristics.
  const title: Partial<TitlePage> = {};
  const tpNode = first(fd, 'TitlePage');
  if (tpNode) {
    const lines = kids(first(tpNode, 'Content') ?? tpNode, 'Paragraph').map((x) => ({ text: textOf(x).trim(), align: (x.attrs.Alignment ?? 'Left').toLowerCase() })).filter((x) => x.text);
    const centered = lines.filter((l) => l.align === 'center');
    if (centered[0]) title.title = centered[0].text;
    const byIdx = centered.findIndex((l) => /^(written by|by|escrit[oa] por|guion de|guión de|roteiro de|de)$/i.test(l.text));
    if (byIdx >= 0) { title.credit = centered[byIdx].text; title.authors = centered.slice(byIdx + 1, byIdx + 3).map((l) => l.text).join('\n'); }
    else if (centered[1]) title.authors = centered.slice(1, 3).map((l) => l.text).join('\n');
    const left = lines.filter((l) => l.align === 'left');
    if (left.length) title.contact = left.map((l) => l.text).join('\n');
    const right = lines.filter((l) => l.align === 'right');
    if (right.length) title.draft = right.map((l) => l.text).join('\n');
  }
  // Final Draft documents usually end with an empty paragraph.
  while (blocks.length > 1 && !blocks[blocks.length - 1].text.trim()) blocks.pop();
  return { title, blocks: blocks.length ? blocks : [block('scene', '')], summaries, revisions };
}
