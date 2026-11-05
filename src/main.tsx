import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/editor.css';
import './styles/app.css';
import './styles/views.css';
import './styles/features.css';
import './styles/mobile.css';
import { App } from './app/App';
import { setLang } from './i18n';
import { getState } from './app/store';
import { registerServiceWorker } from './platform/pwa';
import { trackKeyboard } from './ui/device';

setLang(getState().settings.uiLang);
const SharePage = lazy(() => import('./share/SharePage'));
// Share links (#leer=…) open a read-only presentation page instead of the app.
const isShare = location.hash.startsWith('#leer=');
createRoot(document.getElementById('root')!).render(<StrictMode>{isShare ? <Suspense fallback={null}><SharePage /></Suspense> : <App />}</StrictMode>);
registerServiceWorker();
trackKeyboard();
if (!isShare) void import('./cloud/cloud').then((m) => m.startCloudSync());

// Diagnostics for support and automated tests: open the app with ?debug to inspect state from the console.
if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __scriptz: unknown }).__scriptz = { getState };
