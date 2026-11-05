// Minimal local typings so `tsc` can check ScriptZ without @types/react (not installable here).
declare module 'react' {
  export type ReactNode = ReactElement | string | number | boolean | null | undefined | Iterable<ReactNode>;
  export interface ReactElement { type: unknown; props: unknown; key: string | null }
  export type CSSProperties = { [k: string]: string | number | undefined };
  export type Key = string | number;
  export interface SyntheticEvent<T = Element, E = Event> { currentTarget: T; target: EventTarget; nativeEvent: E; preventDefault(): void; stopPropagation(): void; defaultPrevented: boolean }
  export interface MouseEvent<T = Element> extends SyntheticEvent<T, globalThis.MouseEvent> { clientX: number; clientY: number; button: number; buttons: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; detail: number }
  export interface PointerEvent<T = Element> extends MouseEvent<T> { pointerId: number; pointerType: string }
  export interface DragEvent<T = Element> extends MouseEvent<T> { dataTransfer: DataTransfer }
  export interface KeyboardEvent<T = Element> extends SyntheticEvent<T, globalThis.KeyboardEvent> { key: string; code: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }
  export interface ChangeEvent<T = Element> extends SyntheticEvent<T> { target: EventTarget & T }
  export interface FocusEvent<T = Element> extends SyntheticEvent<T> { relatedTarget: EventTarget | null }
  export interface WheelEvent<T = Element> extends MouseEvent<T> { deltaY: number; deltaX: number }
  export type SetStateAction<S> = S | ((prev: S) => S);
  export type Dispatch<A> = (a: A) => void;
  export function useState<S>(init: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export interface MutableRefObject<T> { current: T }
  export interface RefObject<T> { current: T | null }
  export function useRef<T>(init: T): MutableRefObject<T>;
  export function useRef<T>(init: T | null): RefObject<T>;
  export function useRef<T = undefined>(): MutableRefObject<T | undefined>;
  export function useMemo<T>(fn: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...a: never[]) => unknown>(fn: T, deps: readonly unknown[]): T;
  export function useDeferredValue<T>(v: T): T;
  export function useId(): string;
  export function useReducer<S, A>(r: (s: S, a: A) => S, init: S): [S, Dispatch<A>];
  export function useSyncExternalStore<T>(sub: (cb: () => void) => () => void, get: () => T, server?: () => T): T;
  export function useTransition(): [boolean, (fn: () => void) => void];
  export interface Context<T> { Provider: (p: { value: T; children?: ReactNode }) => ReactElement | null }
  export function createContext<T>(v: T): Context<T>;
  export function useContext<T>(c: Context<T>): T;
  export function lazy<T extends (p: never) => ReactNode>(f: () => Promise<{ default: T }>): T;
  export function Suspense(p: { fallback?: ReactNode; children?: ReactNode }): ReactElement;
  export function StrictMode(p: { children?: ReactNode }): ReactElement;
  export function Fragment(p: { children?: ReactNode }): ReactElement;
  export function memo<T>(c: T): T;
  export function forwardRef<T, P>(fn: (p: P, ref: RefObject<T>) => ReactNode): (p: P & { ref?: RefObject<T> }) => ReactElement;
  const React: { createElement: unknown };
  export default React;
}
declare module 'react/jsx-runtime' { export const jsx: unknown; export const jsxs: unknown; export const Fragment: unknown; }
declare module 'react-dom' { export function createPortal(children: import('react').ReactNode, el: Element): import('react').ReactElement; export function flushSync(fn: () => void): void; }
declare module 'react-dom/client' { export function createRoot(el: Element): { render(n: import('react').ReactNode): void; unmount(): void } }
declare namespace JSX {
  type Element = import('react').ReactElement;
  interface IntrinsicAttributes { key?: string | number | null }
  type AnyEl = HTMLInputElement;
  interface DomProps {
    children?: import('react').ReactNode; ref?: unknown; key?: string | number | null; className?: string; style?: import('react').CSSProperties;
    onClick?: (e: import('react').MouseEvent<AnyEl>) => void; onDoubleClick?: (e: import('react').MouseEvent<AnyEl>) => void;
    onMouseDown?: (e: import('react').MouseEvent<AnyEl>) => void; onMouseUp?: (e: import('react').MouseEvent<AnyEl>) => void;
    onMouseEnter?: (e: import('react').MouseEvent<AnyEl>) => void; onMouseLeave?: (e: import('react').MouseEvent<AnyEl>) => void; onMouseMove?: (e: import('react').MouseEvent<AnyEl>) => void;
    onContextMenu?: (e: import('react').MouseEvent<AnyEl>) => void;
    onPointerDown?: (e: import('react').PointerEvent<AnyEl>) => void; onPointerMove?: (e: import('react').PointerEvent<AnyEl>) => void; onPointerUp?: (e: import('react').PointerEvent<AnyEl>) => void; onPointerCancel?: (e: import('react').PointerEvent<AnyEl>) => void;
    onChange?: (e: import('react').ChangeEvent<AnyEl>) => void; onInput?: (e: import('react').ChangeEvent<AnyEl>) => void;
    onKeyDown?: (e: import('react').KeyboardEvent<AnyEl>) => void; onKeyUp?: (e: import('react').KeyboardEvent<AnyEl>) => void;
    onFocus?: (e: import('react').FocusEvent<AnyEl>) => void; onBlur?: (e: import('react').FocusEvent<AnyEl>) => void;
    onDragStart?: (e: import('react').DragEvent<AnyEl>) => void; onDragOver?: (e: import('react').DragEvent<AnyEl>) => void; onDragEnter?: (e: import('react').DragEvent<AnyEl>) => void;
    onDragLeave?: (e: import('react').DragEvent<AnyEl>) => void; onDrop?: (e: import('react').DragEvent<AnyEl>) => void; onDragEnd?: (e: import('react').DragEvent<AnyEl>) => void;
    onWheel?: (e: import('react').WheelEvent<AnyEl>) => void; onScroll?: (e: import('react').SyntheticEvent<AnyEl>) => void; onSubmit?: (e: import('react').SyntheticEvent<AnyEl>) => void;
    [attr: string]: unknown;
  }
  interface IntrinsicElements { [tag: string]: DomProps }
  interface ElementChildrenAttribute { children: {} }
}
declare module '@tauri-apps/api/core' { export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> }
declare module '@tauri-apps/plugin-dialog' {
  export function open(o: Record<string, unknown>): Promise<string | string[] | null>;
  export function save(o: Record<string, unknown>): Promise<string | null>;
}
declare module '@tauri-apps/plugin-fs' {
  export function readFile(p: string): Promise<Uint8Array>;
  export function writeFile(p: string, d: Uint8Array): Promise<void>;
  export function readTextFile(p: string): Promise<string>;
  export function writeTextFile(p: string, d: string): Promise<void>;
}
declare module '@tauri-apps/plugin-opener' { export function openUrl(u: string): Promise<void> }
