// Comment helpers shared by the toolbar, the editor and the comments panel.
import { getState, setState, toast } from '../../app/store';
import { getEditor, updateProject } from '../../app/actions';
import { uid, nowIso, type Comment } from '../../core/model';
import { t } from '../../i18n';

export const focusComment: { id: string } = { id: '' };

export function openCommentFor(id: string): void {
  focusComment.id = id;
  setState({ right: 'comments' });
  setTimeout(() => document.getElementById('cm-' + id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
}

/** Create a comment on the current selection (or a general note when nothing is selected). */
export function addCommentAtSelection(body = ''): string | null {
  const ed = getEditor();
  const s = getState();
  if (!ed || !s.project) return null;
  const sel = ed.getSelection();
  const text = ed.selectedText();
  const id = uid();
  const author = s.settings.collab.name || s.settings.author || t('w.you');
  const blockId = sel ? sel.focus.id : '';
  const c: Comment = { id, author, body, createdAt: nowIso(), resolved: false, replies: [], blockId: text ? (sel!.anchor.id) : blockId, excerpt: text.slice(0, 160) };
  if (text) ed.setValuedMark('cmt', id);
  else if (!body) { toast(t('ed.comment.needSel'), 'info'); }
  updateProject((p) => ({ ...p, comments: { ...p.comments, [id]: c } }));
  openCommentFor(id);
  return id;
}

export function deleteComment(id: string): void {
  getEditor()?.stripMark('cmt', id);
  updateProject((p) => { const comments = { ...p.comments }; delete comments[id]; return { ...p, comments }; });
}

export function jumpToComment(c: Comment): void {
  const ed = getEditor();
  if (!ed) return;
  const b = ed.getBlocks().find((x) => x.marks?.some((m) => m.k === 'cmt' && m.v === c.id));
  if (b) {
    const m = b.marks!.find((x) => x.k === 'cmt' && x.v === c.id)!;
    ed.scrollToBlock(b.id);
    ed.selectRange({ id: b.id, off: m.s }, { id: b.id, off: m.e }, false);
  } else if (c.blockId) ed.scrollToBlock(c.blockId, { select: true });
}
