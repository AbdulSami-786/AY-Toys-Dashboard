// Writes apps-script/Code.deploy.gs: apps-script/Code.gs with the OWNER_KEY of src/config.js filled in.
// Paste Code.deploy.gs (not Code.gs) into the Google Sheet's Apps Script editor. It is not kept in git.
import fs from 'node:fs';

const config = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const key = /export const OWNER_KEY = '([A-Za-z0-9]{24,64})';/.exec(config)?.[1];
if (!key) {
  console.error('src/config.js has no valid OWNER_KEY (24–64 letters and digits). Make one with: node scripts/new-owner-key.mjs');
  process.exit(1);
}
const code = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
if (!code.includes("var APP_OWNER_KEY = '';")) {
  console.error("apps-script/Code.gs must have: var APP_OWNER_KEY = '';");
  process.exit(1);
}
fs.writeFileSync(new URL('../apps-script/Code.deploy.gs', import.meta.url), code.replace("var APP_OWNER_KEY = '';", `var APP_OWNER_KEY = '${key}';`));
console.log('apps-script/Code.deploy.gs written — paste it into the Apps Script editor (Extensions › Apps Script).');
