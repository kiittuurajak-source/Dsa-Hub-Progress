// Copies Monaco's prebuilt editor files into public/monaco so the code editor is served
// from this app (not a CDN) and can be cached by the service worker for offline use.
// Runs automatically on npm install / dev / build. Safe to run repeatedly.
import fs from 'node:fs';
import path from 'node:path';

try {
  const root = process.cwd();
  const pkgDir = path.join(root, 'node_modules', 'monaco-editor');
  const src = path.join(pkgDir, 'min', 'vs');
  const outDir = path.join(root, 'public', 'monaco');
  const dest = path.join(outDir, 'vs');
  const stamp = path.join(outDir, '.version');
  if (!fs.existsSync(src)) {
    console.warn('[monaco] node_modules/monaco-editor not found - the editor will fall back to the CDN.');
    process.exit(0);
  }
  const ver = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version;
  if (fs.existsSync(dest) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === ver) process.exit(0);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  fs.writeFileSync(stamp, ver);
  console.log('[monaco] copied editor files (' + ver + ') to public/monaco');
} catch (e) {
  console.warn('[monaco] copy skipped:', e && e.message);
}
