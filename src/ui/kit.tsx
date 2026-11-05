// Small UI kit shared by every view.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type MouseEvent as RMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './icons';
import { t } from '../i18n';
import type { CardColor } from '../core/model';
import { CARD_COLORS } from '../core/model';

export function cx(...c: (string | false | null | undefined)[]): string { return c.filter(Boolean).join(' '); }

export function Button({ children, onClick, kind = 'default', icon, disabled, title, type = 'button', small, className, style }: {
  children?: ReactNode; onClick?: (e: RMouseEvent) => void; kind?: 'default' | 'primary' | 'ghost' | 'danger' | 'subtle'; icon?: IconName; disabled?: boolean; title?: string; type?: 'button' | 'submit'; small?: boolean; className?: string; style?: CSSProperties;
}) {
  return (
    <button type={type} className={cx('btn', `btn-${kind}`, small && 'btn-sm', !children && 'btn-icon', className)} onClick={onClick} disabled={disabled} title={title} aria-label={!children ? title : undefined} style={style}>
      {icon ? <Icon name={icon} size={small ? 15 : 17} /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function IconBtn({ icon, title, onClick, active, disabled, small, className, badge }: { icon: IconName; title: string; onClick?: (e: RMouseEvent) => void; active?: boolean; disabled?: boolean; small?: boolean; className?: string; badge?: string | number }) {
  return (
    <button type="button" className={cx('ibtn', active && 'on', small && 'sm', className)} title={title} aria-label={title} aria-pressed={active === undefined ? undefined : active} onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={small ? 15 : 18} />
      {badge !== undefined && badge !== 0 && badge !== '' ? <span className="badge">{badge}</span> : null}
    </button>
  );
}

export function Kbd({ combo }: { combo: string }) {
  const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  const label = combo.replace('Mod', mac ? '⌘' : 'Ctrl').replace('Alt', mac ? '⌥' : 'Alt').replace('Shift', mac ? '⇧' : 'Shift').replace('ArrowDown', '↓').replace('ArrowUp', '↑').replace(/\+/g, mac ? '' : '+');
  return <kbd className="kbd">{label}</kbd>;
}

export function Modal({ title, onClose, children, footer, wide, size }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => {
      const f = ref.current?.querySelector<HTMLElement>('[autofocus], input, textarea, select, button.btn-primary');
      f?.focus();
    }, 20);
    return () => { window.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
  }, [onClose]);
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cx('modal', wide && 'wide', size && 'm-' + size)} role="dialog" aria-modal="true" ref={ref}>
        <header className="modal-h">
          <h2>{title}</h2>
          <IconBtn icon="x" title={t('act.close')} onClick={onClose} />
        </header>
        <div className="modal-b">{children}</div>
        {footer ? <footer className="modal-f">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

export interface MenuItem { id?: string; label?: string; icon?: IconName; shortcut?: string; onClick?: () => void; disabled?: boolean; checked?: boolean; danger?: boolean; separator?: boolean; hint?: string }

export function Menu({ anchor, items, onClose, align = 'left', minWidth = 220 }: { anchor: DOMRect | { x: number; y: number }; items: MenuItem[]; onClose: () => void; align?: 'left' | 'right'; minWidth?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });
  const [active, setActive] = useState(-1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const a = 'width' in anchor ? anchor : new DOMRect(anchor.x, anchor.y, 0, 0);
    let left = align === 'right' ? a.right - r.width : a.left;
    let top = a.bottom + 4;
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, a.top - r.height - 4);
    left = Math.max(8, Math.min(left, window.innerWidth - r.width - 8));
    setPos({ left, top });
  }, [anchor, align]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
      const usable = items.map((it, i) => (!it.separator && !it.disabled ? i : -1)).filter((i) => i >= 0);
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => usable[(usable.indexOf(a) + 1) % usable.length] ?? -1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => usable[(usable.indexOf(a) - 1 + usable.length) % usable.length] ?? -1); }
      if (e.key === 'Enter' && active >= 0) { e.preventDefault(); e.stopPropagation(); const it = items[active]; onClose(); it.onClick?.(); }
    };
    setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true); };
  }, [items, onClose, active]);
  return createPortal(
    <div className="menu" ref={ref} style={{ left: pos.left, top: pos.top, minWidth }} role="menu">
      {items.map((it, i) => it.separator ? <div key={i} className="menu-sep" /> : (
        <button key={i} type="button" role="menuitem" className={cx('menu-it', it.danger && 'danger', i === active && 'act')} disabled={it.disabled} onMouseEnter={() => setActive(i)} onClick={() => { onClose(); it.onClick?.(); }}>
          <span className="menu-ic">{it.checked !== undefined ? (it.checked ? <Icon name="check" size={15} /> : null) : it.icon ? <Icon name={it.icon} size={15} /> : null}</span>
          <span className="menu-l">{it.label}{it.hint ? <small>{it.hint}</small> : null}</span>
          {it.shortcut ? <Kbd combo={it.shortcut} /> : null}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/** Button that opens a menu. */
export function MenuButton({ items, children, icon, title, kind = 'ghost', align, className }: { items: MenuItem[] | (() => MenuItem[]); children?: ReactNode; icon?: IconName; title?: string; kind?: 'ghost' | 'default' | 'subtle'; align?: 'left' | 'right'; className?: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  return (
    <>
      <button type="button" className={cx('btn', `btn-${kind}`, !children && 'btn-icon', 'menu-btn', className)} title={title} aria-label={title} aria-haspopup="menu" onClick={(e) => setRect((e.currentTarget as HTMLElement).getBoundingClientRect())}>
        {icon ? <Icon name={icon} size={17} /> : null}
        {children ? <span>{children}</span> : null}
        {children ? <Icon name="chevronDown" size={14} className="caret" /> : null}
      </button>
      {rect ? <Menu anchor={rect} items={typeof items === 'function' ? items() : items} onClose={() => setRect(null)} align={align} /> : null}
    </>
  );
}

export function Field({ label, children, hint, inline }: { label: ReactNode; children: ReactNode; hint?: ReactNode; inline?: boolean }) {
  return (
    <label className={cx('field', inline && 'inline')}>
      <span className="field-l">{label}</span>
      {children}
      {hint ? <span className="field-h">{hint}</span> : null}
    </label>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('toggle', disabled && 'disabled')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track"><span className="toggle-dot" /></span>
      {label ? <span className="toggle-l">{label}{hint ? <small>{hint}</small> : null}</span> : null}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, small }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div className={cx('seg', small && 'sm')} role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={cx(o.value === value && 'on')} title={o.title} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { value: T; label: ReactNode; icon?: IconName }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tb) => (
        <button key={tb.value} type="button" role="tab" aria-selected={tb.value === value} className={cx('tab', tb.value === value && 'on')} onClick={() => onChange(tb.value)}>
          {tb.icon ? <Icon name={tb.icon} size={15} /> : null}<span>{tb.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({ value, options, onChange, title, className }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; title?: string; className?: string }) {
  return (
    <select className={cx('select', className)} value={value} title={title} aria-label={title} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export const COLOR_HEX: Record<CardColor, string> = {
  none: 'transparent', red: '#e5484d', orange: '#f76b15', yellow: '#f5d90a', green: '#30a46c', teal: '#12a594', blue: '#3e63dd', violet: '#8e4ec6', pink: '#d6409f', gray: '#8b8d98',
};

export function ColorPicker({ value, onChange }: { value: CardColor; onChange: (c: CardColor) => void }) {
  return (
    <div className="colors" role="radiogroup" aria-label={t('w.color')}>
      {CARD_COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={c === value} className={cx('color', c === value && 'on', c === 'none' && 'none')} style={{ background: COLOR_HEX[c] }} title={t('clr.' + c)} aria-label={t('clr.' + c)} onClick={() => onChange(c)} />
      ))}
    </div>
  );
}

export function Empty({ icon = 'info', title, children, action }: { icon?: IconName; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-ic"><Icon name={icon} size={28} /></div>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

/** Text input that commits on blur/Enter (avoids re-render storms on every keystroke). */
export function LazyInput({ value, onCommit, placeholder, className, multiline, rows = 3, autoFocus, ariaLabel, upper }: { value: string; onCommit: (v: string) => void; placeholder?: string; className?: string; multiline?: boolean; rows?: number; autoFocus?: boolean; ariaLabel?: string; upper?: boolean }) {
  const [v, setV] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setV(value); }, [value]);
  const commit = () => { const val = upper ? v.toUpperCase() : v; if (val !== value) onCommit(val); };
  const onKey = (e: RKeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) { (e.target as HTMLElement).blur(); }
    if (e.key === 'Escape') { setV(value); setTimeout(() => (e.target as HTMLElement).blur()); }
  };
  if (multiline) return <textarea className={cx('input', className)} value={v} rows={rows} placeholder={placeholder} aria-label={ariaLabel ?? placeholder} autoFocus={autoFocus} onFocus={() => (focused.current = true)} onBlur={() => { focused.current = false; commit(); }} onChange={(e) => setV(e.target.value)} onKeyDown={onKey} />;
  return <input className={cx('input', className)} value={v} placeholder={placeholder} aria-label={ariaLabel ?? placeholder} autoFocus={autoFocus} onFocus={() => (focused.current = true)} onBlur={() => { focused.current = false; commit(); }} onChange={(e) => setV(e.target.value)} onKeyDown={onKey} />;
}

export function NumberInput({ value, onChange, min, max, step = 1, className, ariaLabel }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; className?: string; ariaLabel?: string }) {
  return <input type="number" className={cx('input num', className)} value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step} aria-label={ariaLabel} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n); }} />;
}

export function Spinner() { return <span className="spinner" aria-label={t('w.loading')} />; }

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}
