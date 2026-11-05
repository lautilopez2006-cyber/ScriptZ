import { StrictMode } from 'react';
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
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
registerServiceWorker();
trackKeyboard();

// Diagnostics for support and automated tests: open the app with ?debug to inspect state from the console.
if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __scriptz: unknown }).__scriptz = { getState };
