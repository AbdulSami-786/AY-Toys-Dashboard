import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Content Security Policy of the built app (browser and desktop program): only the app's own files run, and the only
// outside address it may talk to is the Google Apps Script web app (which answers from script.googleusercontent.com).
// Added to the build only: the dev server needs inline scripts for hot reload.
// (a test copy pointed at another sheet with VITE_SHEET_URL may talk to that address too)
const testOrigin = (() => {
  try {
    return process.env.VITE_SHEET_URL ? new URL(process.env.VITE_SHEET_URL).origin : '';
  } catch {
    return '';
  }
})();
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' https://script.google.com https://script.googleusercontent.com ${testOrigin}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const csp = () => ({
  name: 'ay-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig({
  plugins: [react(), csp()],
  server: { port: 5173, open: true },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom'], charts: ['recharts'] } } },
  },
});
