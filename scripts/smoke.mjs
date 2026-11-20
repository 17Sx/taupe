// End-to-end test of the engine (without Electron), run in CI on macOS, Windows and Linux:
// creates a temporary tree, scans it through the API, checks sizes/paths/suggestions/safety,
// then moves a file to the Trash with the fallback system actions.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startServer } from '../src/server.mjs';
import { isProtected, isSensitive, HOME, IS_WIN, IS_MAC, fallbackActions } from '../src/platform.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'taupe-smoke-'));
const mk = (rel, bytes) => { const p = path.join(tmp, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.alloc(bytes, 1)); return p; };
mk('videos/film.mp4', 3_000_000);
mk('videos/clip.mov', 1_000_000);
mk('projet/node_modules/lib/index.js', 2_000_000);
mk('projet/src/app.ts', 10_000);
mk('projet/.next/cache/a.bin', 25_000_000);
const victim = mk('a supprimer (test).zip', 500_000);

const { url, close } = await startServer({ port: 0 });
const html = await (await fetch(url)).text();
const token = html.match(/name="token" content="([^"]+)"/)[1];
const call = async (method, p, body) => {
  const r = await fetch(url + p.replace(/^\//, ''), { method, headers: { 'x-token': token, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const j = /** @type {any} */ (await r.json());
  if (!r.ok) throw new Error(`${p} → ${r.status} ${j.error}`);
  return j;
};
let ok = 0;
const step = (name, fn) => fn().then(() => { ok++; console.log('✓', name); });

try {
  await step('sécurité : refuse sans jeton', async () => {
    const r = await fetch(url + 'api/status');
    assert.equal(r.status, 403);
  });

  await step('mode application : le jeton n’est pas dans la page', async () => {
    const appSrv = await startServer({ port: 0, app: true });
    try {
      const page = await (await fetch(appSrv.url)).text();
      assert.ok(!page.includes(appSrv.token), 'jeton présent dans le HTML');
      assert.match(page, /name="token" content=""/);
      const r = await fetch(appSrv.url + 'api/status', { headers: { 'x-token': appSrv.token } });
      assert.equal(r.status, 200);
    } finally { appSrv.close(); }
  });

  await step('validation : clés héritées refusées (__proto__, constructor…)', async () => {
    const raw = (p, body) => fetch(url + p, { method: 'POST', headers: { 'x-token': token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    for (const provider of ['__proto__', 'constructor', 'toString', 'claude; touch /tmp/x']) {
      assert.equal((await raw('api/ai/logout', { provider })).status, 400, provider);
      assert.equal((await raw('api/ai/connect', { provider })).status, 400, provider);
    }
  });

  await step('scan de l’arborescence', async () => {
    const { id } = await call('POST', '/api/scan', { path: tmp });
    for (let i = 0; i < 100; i++) { const s = await call('GET', '/api/status'); if (!s.scan.scanning) break; await new Promise(r => setTimeout(r, 50)); }
    const l = await call('GET', `/api/list?id=${id}`);
    assert.equal(l.path, fs.realpathSync.native ? path.resolve(tmp) : tmp);
    const names = l.children.map(c => c.name);
    for (const n of ['videos', 'projet', 'a supprimer (test).zip']) assert.ok(names.includes(n), `manque ${n}`);
    assert.ok(l.node.size >= 31_000_000, `taille racine trop petite : ${l.node.size}`);
    assert.equal(l.node.count, 6);
    assert.equal(l.children[0].name, 'projet', 'tri par taille');
  });

  await step('gros fichiers, types, suggestions', async () => {
    const big = await call('GET', '/api/bigfiles');
    assert.equal(big[0].name, 'a.bin');
    const t = await call('GET', '/api/types');
    assert.ok(t.categories.some(c => c.key === 'video'));
    const sug = await call('GET', '/api/suggest');
    assert.ok(sug.some(g => g.key === 'build' && g.items[0].name === '.next'), 'cache .next non détecté');
  });

  await step('chemins protégés', async () => {
    assert.ok(isProtected(HOME));
    assert.ok(isProtected(IS_WIN ? 'C:\\' : '/'));
    assert.ok(isProtected(IS_WIN ? 'C:\\Windows\\System32' : '/usr/bin'));
    assert.ok(!isProtected(victim));
    // secrets, whatever the depth
    for (const p of ['.ssh', '.ssh/id_ed25519', '.aws/credentials', '.gnupg', '.kube/config']) assert.ok(isProtected(path.join(HOME, ...p.split('/'))), p);
    // case-insensitive disks (macOS, Windows)
    if (IS_MAC || IS_WIN) {
      assert.ok(isProtected(path.join(HOME, 'DOCUMENTS')));
      assert.ok(isProtected(path.join(HOME.toUpperCase(), 'Downloads')));
      assert.ok(isProtected(path.join(HOME, '.SSH', 'config')));
    }
    // a symlink in a parent folder does not hide a protected folder…
    if (!IS_WIN) {
      const link = path.join(tmp, 'lien-maison');
      fs.symlinkSync(HOME, link);
      try {
        assert.ok(isProtected(path.join(link, 'Documents')), 'contourné par un lien symbolique');
        assert.ok(isProtected(path.join(link, '.ssh', 'x')));
        assert.ok(isProtected(path.join(link, '.kube', 'nope', 'x')), 'parent folder missing: resolve the deepest existing one');
        assert.ok(!isProtected(link), 'le lien lui-même part seul à la corbeille');
      } finally { fs.unlinkSync(link); }
    }
    // app data: allowed only after a reinforced confirmation
    if (IS_MAC) {
      assert.ok(isSensitive(path.join(HOME, 'Library', 'Caches', 'x')));
      assert.ok(isSensitive(path.join(HOME, 'library', 'Application Support', 'x')));
      assert.ok(isProtected(path.join(HOME, 'Library', 'Keychains', 'login.keychain-db')));
    }
    assert.ok(!isSensitive(victim)); // the temporary folder is never app data (on Windows it lives in AppData)
    assert.ok(!isSensitive(os.tmpdir()));
    if (IS_WIN) assert.ok(isSensitive(path.join(HOME, 'AppData', 'Roaming', 'SomeApp')));
  });

  await step('refus si le chemin ne correspond pas', async () => {
    const l = await call('GET', '/api/list');
    const r = await call('POST', '/api/trash', { items: [{ id: l.children[0].id, path: path.join(tmp, 'autre') }] });
    assert.equal(r.done.length, 0);
    assert.equal(fs.existsSync(path.join(tmp, 'projet')), true);
  });

  const canTrash = IS_WIN || (IS_MAC && fs.existsSync('/usr/bin/trash')) || process.env.TAUPE_SMOKE_TRASH === '1';
  if (canTrash) {
    await step('mise à la corbeille (actions système)', async () => {
      const l = await call('GET', '/api/list');
      const item = l.children.find(c => c.name === 'a supprimer (test).zip');
      const r = await call('POST', '/api/trash', { items: [{ id: item.id, path: path.join(l.path, item.name) }] });
      assert.equal(r.done.length, 1, JSON.stringify(r.failed));
      assert.equal(fs.existsSync(victim), false);
      const after = await call('GET', '/api/list');
      assert.ok(!after.children.some(c => c.name === item.name), 'toujours dans l’arbre');
    });
  } else console.log('… corbeille non testée sur cette machine');

  console.log(`\n${ok} tests OK (${process.platform}, ${process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.version}`})`);
  void fallbackActions;
} finally {
  close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
