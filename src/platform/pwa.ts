import { isTauri } from './index';
export function registerServiceWorker(): void {
  if (isTauri() || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}
