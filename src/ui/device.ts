// Device class for layout: phone (narrow), tablet (touch or medium width) or desktop.
import { useEffect, useState } from 'react';

export type Device = 'phone' | 'tablet' | 'desktop';

export function currentDevice(): Device {
  if (typeof window === 'undefined' || !window.matchMedia) return 'desktop';
  const w = window.innerWidth;
  if (w <= 640 || window.matchMedia('(max-width: 640px), (max-height: 500px) and (pointer: coarse)').matches) return 'phone';
  if (w <= 1024 || window.matchMedia('(pointer: coarse) and (max-width: 1366px)').matches) return 'tablet';
  return 'desktop';
}

const listeners = new Set<() => void>();
let device: Device = currentDevice();
let width = typeof window !== 'undefined' ? window.innerWidth : 1280;
if (typeof window !== 'undefined') {
  const apply = () => {
    const d = currentDevice();
    width = window.innerWidth;
    if (d !== device) { device = d; document.documentElement.dataset.device = d; }
    for (const l of listeners) l();
  };
  document.documentElement.dataset.device = device;
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
}

export function getDevice(): Device { return device; }

/** Re-renders on resize; returns the device class and the window width. */
export function useDevice(): { device: Device; width: number } {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force((n) => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  return { device, width };
}

/** On-screen keyboard height (visual viewport), as a CSS variable --kb on <html>. */
export function trackKeyboard(): void {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return;
  const set = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', `${Math.round(kb)}px`);
    document.documentElement.classList.toggle('kb-open', kb > 120);
  };
  vv.addEventListener('resize', set);
  vv.addEventListener('scroll', set);
  set();
}
