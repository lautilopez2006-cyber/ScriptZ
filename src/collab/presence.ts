// Remote presence (cursors) shared between the collaboration client and the editor overlay.
import type { Pos } from '../editor/engine';

export interface RemoteCursor { id: string; name: string; color: string; anchor: Pos | null; focus: Pos | null; at: number }

const cursors = new Map<string, RemoteCursor>();
const listeners = new Set<() => void>();

export function remoteCursors(): RemoteCursor[] {
  const now = Date.now();
  return [...cursors.values()].filter((c) => now - c.at < 60000);
}

export function setRemoteCursor(c: RemoteCursor): void { cursors.set(c.id, c); emit(); }
export function removeRemoteCursor(id: string): void { cursors.delete(id); emit(); }
export function clearRemoteCursors(): void { cursors.clear(); emit(); }
export function onRemoteCursors(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const l of listeners) l(); }
