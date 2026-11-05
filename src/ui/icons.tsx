// Stroke icon set (24×24, currentColor). Hand-drawn for ScriptZ; no external dependency.
import type { CSSProperties } from 'react';

const P: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9v11h13V9M10 20v-6h4v6',
  pen: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3ZM14.5 6.5l3 3',
  cards: 'M3 6h8v6H3zM13 6h8v6h-8zM3 14h8v5H3zM13 14h8v5h-8z',
  structure: 'M4 19h16M6 19V9M11 19V5M16 19v-7M21 19v-3',
  timeline: 'M3 12h18M6 8v8M12 6v12M18 9v6',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c.6-3.6 3.2-6 6.5-6s5.9 2.4 6.5 6M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.4c2 .8 3.2 2.8 3.5 5.6',
  chart: 'M4 20V10M10 20V4M16 20v-7M21 20H3',
  revisions: 'M12 8v4l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4',
  clapper: 'M4 9h16v11H4zM4 9l2.5-5L20 6M8.5 4.6 7 9M13 5.3 11.5 9M17.4 5.9 16 9',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17 19 7',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  replace: 'M4 7h11l-3-3M20 17H9l3 3',
  file: 'M14 3H6v18h12V7l-4-4ZM14 3v4h4',
  fileText: 'M14 3H6v18h12V7l-4-4ZM14 3v4h4M9 12h6M9 16h6',
  folder: 'M3 6h6l2 2h10v11H3z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  printer: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  moreV: 'M12 5h.01M12 12h.01M12 19h.01',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  bold: 'M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z',
  italic: 'M14 4h-4M14 20h-4M14.5 4 9.5 20',
  underline: 'M7 4v7a5 5 0 0 0 10 0V4M5 20h14',
  strike: 'M5 12h14M16 6.5C15 5 13.6 4.5 12 4.5c-2.5 0-4 1.3-4 3 0 1.4 1 2.3 3 2.9M8 17.5c1 1.5 2.4 2 4 2 2.5 0 4-1.3 4-3 0-.7-.2-1.3-.7-1.8',
  highlighter: 'M9 11l-5 5v4h4l5-5M9 11l6-6 4 4-6 6M9 11l4 4M14 20h6',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
  comment: 'M4 5h16v11H9l-5 4z',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  dual: 'M3 5h8v14H3zM13 5h8v14h-8z',
  zoomIn: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4M8 11h6M11 8v6',
  zoomOut: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4M8 11h6',
  focus: 'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M12 12h.01',
  typewriter: 'M4 10h16v10H4zM7 10V4h10v6M7 14h.01M10 14h.01M13 14h.01M16 14h.01M8 17h8',
  fullscreen: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  exitFullscreen: 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5',
  pageView: 'M6 3h12v8H6zM6 13h12v8H6z',
  scroll: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h4',
  speaker: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3ZM6 11a6 6 0 0 0 12 0M12 17v4M8 21h8',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9zM5 15l.6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6z',
  link: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  cloud: 'M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A3.8 3.8 0 0 1 17.5 18z',
  wifi: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01M2 9a14.5 14.5 0 0 1 20 0',
  wifiOff: 'M3 3l18 18M8.5 16a5 5 0 0 1 7 0M12 19.5h.01M5 12.5a10 10 0 0 1 4-2.4M2 9a14.5 14.5 0 0 1 5-3.2M16.5 10.5A10 10 0 0 1 19 12.5M12 5c3.7 0 7.2 1.4 10 4',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  unlock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 6.8-1.2',
  eye: 'M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7S2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff: 'M3 3l18 18M10.6 5.1A9.5 9.5 0 0 1 12 5c6 0 9.5 7 9.5 7a16 16 0 0 1-2.7 3.4M6.3 6.4C3.8 8.1 2.5 12 2.5 12S6 19 12 19c1.8 0 3.3-.5 4.6-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1.5v2M12 20.5v2M3.5 12h-2M22.5 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 9v4l2.5 1.5M9.5 2h5',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 12h.01',
  flame: 'M12 21c-3.9 0-7-2.8-7-6.5 0-3.3 2.4-5.4 3.8-7.6.5 1.7 1.3 2.7 2.4 3.3.2-3.2 1.7-5.8 3.8-7.2-.2 3.4 1.6 5 3 7 1 1.4 1.5 2.9 1.5 4.5C19.5 18.2 16 21 12 21Z',
  calendar: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M7 4h3.5v16H7zM13.5 4H17v16h-3.5z',
  stop: 'M6 6h12v12H6z',
  skipForward: 'M5 5v14l9-7zM18 5v14',
  skipBack: 'M19 5v14l-9-7zM6 5v14',
  grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  layers: 'M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17.5l10 5 10-5',
  sidebar: 'M3 4h18v16H3zM9 4v16',
  panelRight: 'M3 4h18v16H3zM15 4v16',
  type: 'M5 7V5h14v2M12 5v14M9 19h6',
  hash: 'M5 9h14M5 15h14M10 3 8 21M16 3l-2 18',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 7.5h.01',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  pin: 'M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4',
  dollar: 'M12 2v20M17 6.5c-.8-1.5-2.6-2.5-5-2.5-2.8 0-4.5 1.4-4.5 3.3 0 4.7 9.5 2.7 9.5 7.8 0 2-1.9 3.4-5 3.4-2.5 0-4.3-1-5.2-2.6',
  clipboard: 'M9 4H6v17h12V4h-3M9 3h6v3H9z',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z',
  palette: 'M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-1.5 3.3c.6.8.3 2.7-2.5 2.7ZM7.5 11h.01M10 7h.01M15 7.5h.01',
  refresh: 'M20 11a8 8 0 0 0-14.3-4.6L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.6L20 16M20 20v-4h-4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5',
  send: 'M4 12 21 4l-4 17-5-7zM12 14l9-10',
  wand: 'M15 4V2M15 10V8M11 6h2M17 6h2M4 20 14 10M19 2l-1 1M19 10l-1-1',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M19 19v2H6',
  compare: 'M8 3v18M16 3v18M3 8h5M16 16h5M3 16h5M16 8h5',
  flag: 'M5 21V4h11l-1.5 4L16 12H5',
  shuffle: 'M3 6h4l10 12h4M3 18h4l3-3.6M14 9.6 17 6h4M18 3l3 3-3 3M18 15l3 3-3 3',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.1 7.8 20 18M8.1 16.2 20 6',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  command: 'M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z',
  wrap: 'M4 6h16M4 12h13a3 3 0 0 1 0 6h-4M15 16l-2 2 2 2M4 18h5',
};

export type IconName = keyof typeof P | string;

export function Icon({ name, size = 18, stroke = 1.75, className, style, title }: { name: IconName; size?: number; stroke?: number; className?: string; style?: CSSProperties; title?: string }) {
  const d = P[name] ?? P.info;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={'ic' + (className ? ' ' + className : '')} style={style} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      <path d={d} />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="szg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff7a45" />
          <stop offset="1" stopColor="#d4380d" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#szg)" />
      <path d="M41 19.5c-2.1-1.9-5.2-3-8.6-3-6.1 0-10.1 3.2-10.1 7.8 0 10.4 18.9 6.6 18.9 15.6 0 4.6-4.1 7.7-10.3 7.7-3.9 0-7.4-1.3-9.8-3.6" fill="none" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" />
      <path d="M44 33h9l-9 12h9" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" opacity=".92" />
    </svg>
  );
}
