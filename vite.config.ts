import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// One build serves the desktop app (Tauri: WebView2 / WKWebView / WebKitGTK), the web version and the PWA.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: '127.0.0.1' },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: ['chrome105', 'safari15', 'firefox115'],
    chunkSizeWarningLimit: 2500,
    assetsInlineLimit: 0, // keep fonts as files (they are embedded into PDFs at export time)
  },
});
