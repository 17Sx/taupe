// Génère build/icon.png (1024×1024) à partir de build/icon.svg, avec Electron (rendu transparent).
// Usage : npx electron scripts/make-icon.mjs
// electron-builder en dérive ensuite les icônes .icns (macOS) et .ico (Windows).
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(ROOT, 'build', 'icon.svg'), 'utf8');

app.dock?.hide();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true,
    useContentSize: true, webPreferences: { offscreen: true } });
  win.webContents.setZoomFactor(1);
  const html = `<html><body style="margin:0;background:transparent">${svg.replace('<svg', '<svg width="1024" height="1024"')}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise(r => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const out = path.join(ROOT, 'build', 'icon.png');
  fs.writeFileSync(out, img.resize({ width: 1024, height: 1024 }).toPNG());
  console.log('Icône écrite :', out, img.getSize());
  app.quit();
});
