// Draws collaborators' carets and selections over the editor.
import { useEffect, useState } from 'react';
import { getEditor } from '../../app/actions';
import { remoteCursors, onRemoteCursors } from '../../collab/presence';

interface Drawn { id: string; name: string; color: string; caret: { left: number; top: number; height: number } | null; sel: { left: number; top: number; width: number; height: number }[] }

export function RemoteCursors() {
  const [drawn, setDrawn] = useState<Drawn[]>([]);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const ed = getEditor();
        if (!ed) { setDrawn([]); return; }
        const base = ed.paper.getBoundingClientRect();
        const out: Drawn[] = [];
        for (const c of remoteCursors()) {
          if (!c.focus) continue;
          const r = ed.rectAt(c.focus);
          const caret = r ? { left: r.left - base.left, top: r.top - base.top, height: r.height || 16 } : null;
          const sel = c.anchor && (c.anchor.id !== c.focus.id || c.anchor.off !== c.focus.off)
            ? ed.rangeRects(c.anchor, c.focus).map((x) => ({ left: x.left - base.left, top: x.top - base.top, width: x.width, height: x.height }))
            : [];
          out.push({ id: c.id, name: c.name, color: c.color, caret, sel });
        }
        setDrawn(out);
      });
    };
    const off = onRemoteCursors(draw);
    const t = setInterval(draw, 1500);
    window.addEventListener('resize', draw);
    return () => { off(); clearInterval(t); window.removeEventListener('resize', draw); cancelAnimationFrame(raf); };
  }, []);
  const ed = getEditor();
  if (!ed || !drawn.length) return null;
  return (
    <RemoteLayer paper={ed.paper} drawn={drawn} />
  );
}

function RemoteLayer({ paper, drawn }: { paper: HTMLElement; drawn: Drawn[] }) {
  const [host] = useState(() => {
    const d = document.createElement('div');
    d.className = 'rc-layer';
    return d;
  });
  useEffect(() => { paper.appendChild(host); return () => host.remove(); }, [paper, host]);
  useEffect(() => {
    host.innerHTML = '';
    for (const d of drawn) {
      for (const s of d.sel) {
        const e = document.createElement('div');
        e.className = 'rs';
        e.style.cssText = `left:${s.left}px;top:${s.top}px;width:${s.width}px;height:${s.height}px;--c:${d.color}`;
        host.appendChild(e);
      }
      if (d.caret) {
        const e = document.createElement('div');
        e.className = 'rc';
        e.dataset.name = d.name;
        e.style.cssText = `left:${d.caret.left}px;top:${d.caret.top}px;height:${d.caret.height}px;--c:${d.color}`;
        host.appendChild(e);
      }
    }
  }, [drawn, host]);
  return null;
}
