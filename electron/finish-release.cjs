// After electron-builder: keep only the software in release/ — the installer, the portable exe and one zip of both.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const dir = path.join(__dirname, '..', 'release');
const v = require('../package.json').version;
const keep = [`AY Toys Setup ${v}.exe`, `AY Toys ${v} Portable.exe`];
for (const f of keep) if (!fs.existsSync(path.join(dir, f))) throw new Error('Missing ' + f);
const zip = path.join(dir, `AY Toys ${v}.zip`);
if (fs.existsSync(zip)) fs.rmSync(zip);
execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path ${keep.map((f) => `'${path.join(dir, f)}'`).join(',')} -DestinationPath '${zip}'`], { stdio: 'inherit' });
keep.push(path.basename(zip));
for (const f of fs.readdirSync(dir)) if (!keep.includes(f)) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
console.log('release/:', fs.readdirSync(dir).join(' | '));
