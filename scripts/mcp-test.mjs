// Test du serveur MCP : on joue le rôle de Claude Code / Codex et on pilote les outils de Taupe.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { startServer } from '../src/server.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'taupe-mcp-'));
const mk = (rel, bytes) => { const p = path.join(tmp, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.alloc(bytes, 1)); return p; };
mk('projet-a/node_modules/x.js', 3_000_000);
mk('projet-b/node_modules/y.js', 1_000_000);
mk('Vidéos/Été 2026.mov', 2_000_000);
const victim = mk('vieux-installeur.dmg', 400_000);

const trashed = [];
const actions = { trash: async ps => { for (const p of ps) { fs.rmSync(p, { recursive: true, force: true }); trashed.push(p); } return {}; },
  reveal: async () => {}, open: async () => {}, quicklook: async () => {}, openExternal: async () => {}, pickFolder: async () => null };
const srv = await startServer({ port: 0, actions, testing: true });
console.log('serveur', srv.url);
const html = await (await fetch(srv.url)).text();
const token = html.match(/name="token" content="([^"]+)"/)[1];
const api = async (method, p, body) => {
  const r = await fetch(srv.url + p, { method, headers: { 'x-token': token, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return r.json();
};
await api('POST', 'api/scan', { path: tmp });
for (let i = 0; i < 100; i++) { const s = await api('GET', 'api/status'); if (!s.scan.scanning) break; await new Promise(r => setTimeout(r, 30)); }
const { chat, mcp } = srv.testChat();

const child = spawn(process.execPath, [mcp], { env: { ...process.env, TAUPE_URL: srv.url, TAUPE_TOKEN: token, TAUPE_CHAT: chat }, stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '', seq = 0; const waiting = new Map();
child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); waiting.get(m.id)?.(m); } });
const rpc = (method, params) => new Promise(res => { const id = ++seq; waiting.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const tool = async (name, args) => { const r = await rpc('tools/call', { name, arguments: args }); assert.ok(!r.result.isError, r.result.content[0].text); return JSON.parse(r.result.content[0].text); };
let ok = 0, current = 'démarrage';
const step = async (n, fn) => { current = n; await fn(); ok++; console.log('✓', n); };
setTimeout(() => { console.error(`✗ délai dépassé pendant : ${current}`); process.exit(1); }, 30000).unref();

try {
  await step('handshake MCP + liste des outils', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    assert.equal(init.result.serverInfo.name, 'taupe');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const l = await rpc('tools/list', {});
    assert.deepEqual(l.result.tools.map(t => t.name), ['search_files', 'list_folder', 'big_files', 'open_folder', 'select_items', 'move_to_trash']);
  });
  await step('search_files (accents, tri par taille)', async () => {
    const r = await tool('search_files', { query: 'NODE_modules' });
    assert.equal(r.results.length, 2);
    assert.ok(r.results[0].path.includes('projet-a'));
    const v = await tool('search_files', { query: 'ete 2026' });
    assert.equal(v.results[0].name, 'Été 2026.mov');
  });
  await step('list_folder + big_files + open_folder', async () => {
    const l = await tool('list_folder', { path: tmp });
    assert.equal(l.children.length, 4);
    const b = await tool('big_files', {});
    assert.equal(b.files[0].name, 'x.js');
    await tool('open_folder', { path: path.join(tmp, 'Vidéos') });
  });
  await step('select_items', async () => {
    const r = await tool('select_items', { paths: [victim, '/nexiste/pas'] });
    assert.equal(r.selected, 1); assert.equal(r.skipped.length, 1);
  });
  await step('move_to_trash attend la confirmation, puis supprime', async () => {
    const pending = tool('move_to_trash', { paths: [victim], reason: 'Installeur déjà installé' });
    let e;
    for (let i = 0; i < 50 && !e; i++) { await new Promise(r => setTimeout(r, 30)); e = (await api('GET', `api/chat/events?chat=${chat}`)).events.find(x => x.type === 'trash'); }
    assert.equal(e.status, 'pending'); assert.ok(fs.existsSync(victim), 'supprimé sans confirmation !');
    await api('POST', 'api/chat/confirm', { chat, event: e.i, accept: true });
    const r = await pending;
    assert.equal(r.trashed.length, 1); assert.ok(!fs.existsSync(victim));
  });
  await step('move_to_trash refusé → rien n’est supprimé', async () => {
    const target = path.join(tmp, 'projet-b');
    const pending = tool('move_to_trash', { paths: [target], reason: 'test' });
    let e;
    for (let i = 0; i < 50 && !e; i++) { await new Promise(r => setTimeout(r, 30)); e = (await api('GET', `api/chat/events?chat=${chat}`)).events.filter(x => x.type === 'trash')[1]; }
    await api('POST', 'api/chat/confirm', { chat, event: e.i, accept: false });
    const r = await pending;
    assert.equal(r.trashed.length, 0); assert.ok(fs.existsSync(target));
  });
  await step('chemin protégé refusé', async () => {
    const r = await tool('move_to_trash', { paths: [os.homedir()], reason: 'test' });
    assert.equal(r.trashed.length, 0);
  });
  await step('journal d’événements pour l’interface', async () => {
    const { events } = await api('GET', `api/chat/events?chat=${chat}`);
    assert.deepEqual([...new Set(events.map(e => e.type))], ['search', 'list', 'big', 'open', 'select', 'trash']);
  });
  console.log(`\n${ok} tests MCP OK`);
} finally {
  child.kill(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
}
