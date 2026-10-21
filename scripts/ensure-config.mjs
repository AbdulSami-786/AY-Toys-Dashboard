// Runs before `npm run build`. src/config.js is private (gitignored), so a fresh clone — e.g. Vercel — doesn't have it.
// Without it, make a blank one from config.example.js: the build then works and the app runs offline-only (no sheet, no key).
// A VITE_SHEET_URL environment variable can still point such a build at a sheet.
import { copyFileSync, existsSync } from 'node:fs';

const dir = new URL('../src/', import.meta.url);
const config = new URL('config.js', dir);
if (!existsSync(config)) {
  copyFileSync(new URL('config.example.js', dir), config);
  console.log('src/config.js not found — created a blank one from config.example.js (offline-only build).');
}
