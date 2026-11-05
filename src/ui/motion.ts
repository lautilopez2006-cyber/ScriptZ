// View transitions: views dissolve, the sidebar tab glides, and a script cover grows into the editor page.
import { flushSync } from 'react-dom';

type VT = { finished: Promise<void> };
type Doc = Document & { startViewTransition?: (cb: () => void) => VT };

export function reducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

let busy = false;

/** Apply a state update inside a view transition (falls back to a plain update). */
export function transition(update: () => void, after?: () => (() => void) | void): Promise<void> {
  const d = document as Doc;
  if (busy || !d.startViewTransition || reducedMotion() || document.visibilityState === 'hidden') { update(); return Promise.resolve(); }
  busy = true;
  let cleanup: (() => void) | void;
  try {
    const t = d.startViewTransition(() => { flushSync(update); cleanup = after?.(); });
    return t.finished.catch(() => undefined).finally(() => { busy = false; cleanup?.(); });
  } catch {
    busy = false;
    update();
    return Promise.resolve();
  }
}

/** Cover → page: the clicked cover (named `script-page`) morphs into a page-sized sheet over the editor's first page. */
export function coverToPage(update: () => void): Promise<void> {
  return transition(update, () => {
    const doc = document.querySelector('.sz-doc');
    if (!doc) return;
    const r = doc.getBoundingClientRect();
    const sheet = document.createElement('div');
    sheet.className = 'vt-page';
    Object.assign(sheet.style, { left: r.left + 'px', top: Math.max(0, r.top) + 'px', width: r.width + 'px', height: Math.max(200, Math.min(r.height, window.innerHeight - Math.max(0, r.top))) + 'px' });
    document.body.appendChild(sheet);
    return () => sheet.remove();
  });
}
