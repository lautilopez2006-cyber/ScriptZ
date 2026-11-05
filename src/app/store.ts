// Global app state: a tiny external store + React hook (no dependencies).
import { useSyncExternalStore, useRef } from 'react';
import type { Project, ProjectSummary } from '../core/model';
import type { AppSettings } from './settings';
import { loadSettings } from './settings';

export type View = 'home' | 'write' | 'cards' | 'beats' | 'timeline' | 'characters' | 'stats' | 'revisions' | 'production' | 'settings';
export type RightPanel = 'comments' | 'find' | 'notes' | 'collab' | 'ai' | 'read' | 'sprint';

export interface Toast { id: number; kind: 'info' | 'success' | 'error'; text: string; action?: { label: string; run: () => void }; ttl?: number }
export interface ModalState { kind: string; props?: Record<string, unknown> }

export interface CaretInfo { blockId: string; type: string; sceneId: string; page: number; pageCount: number; marks: string[]; collapsed: boolean; index: number }

export interface CollabStatus { state: 'off' | 'connecting' | 'online' | 'offline' | 'error'; room: string; role: 'owner' | 'editor' | 'viewer' | ''; peers: { id: string; name: string; color: string }[]; message: string }

export interface AppState {
  settings: AppSettings;
  library: ProjectSummary[];
  libraryLoaded: boolean;
  project: Project | null;
  saveState: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  saveError: string;
  linkedPath: string | null;
  view: View;
  right: RightPanel | null;
  modal: ModalState | null;
  toasts: Toast[];
  caret: CaretInfo | null;
  pages: number;
  fullscreen: boolean;
  collab: CollabStatus;
  /** Bumped when the editor should re-read config (styles, template...). */
  editorEpoch: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();

let state: AppState = {
  settings: loadSettings(),
  library: [],
  libraryLoaded: false,
  project: null,
  saveState: 'idle',
  saveError: '',
  linkedPath: null,
  view: 'home',
  right: null,
  modal: null,
  toasts: [],
  caret: null,
  pages: 0,
  fullscreen: false,
  collab: { state: 'off', room: '', role: '', peers: [], message: '' },
  editorEpoch: 0,
};

export function getState(): AppState { return state; }

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const p = typeof patch === 'function' ? patch(state) : patch;
  let changed = false;
  for (const k of Object.keys(p) as (keyof AppState)[]) if (state[k] !== p[k]) { changed = true; break; }
  if (!changed) return;
  state = { ...state, ...p };
  for (const l of listeners) l();
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Subscribe to a slice of state. The selector result is compared shallowly. */
export function useApp<T>(selector: (s: AppState) => T): T {
  const last = useRef<{ v: T } | null>(null);
  const get = () => {
    const v = selector(state);
    if (last.current && shallowEqual(last.current.v, v)) return last.current.v;
    last.current = { v };
    return v;
  };
  return useSyncExternalStore(subscribe, get, get);
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object), kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

let toastSeq = 1;
export function toast(text: string, kind: Toast['kind'] = 'info', action?: Toast['action'], ttl = 4200): void {
  const id = toastSeq++;
  setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text, action, ttl }] }));
  if (ttl > 0) setTimeout(() => dismissToast(id), ttl);
}
export function dismissToast(id: number): void {
  setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function openModal(kind: string, props?: Record<string, unknown>): void { setState({ modal: { kind, props } }); }
export function closeModal(): void { setState({ modal: null }); }
