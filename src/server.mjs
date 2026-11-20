// Taupe — local server (127.0.0.1 only) that powers the UI.
// In the app, it runs in a separate process started by Electron (electron/worker.mjs),
// which provides it with native system actions (Trash, Finder/Explorer, Quick Look, folder picker).
// In development, `node src/server.mjs` runs it standalone with fallback actions.
import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Session } from './scanner.mjs';
import * as ai from './ai.mjs';
import { tr, pickLang } from './i18n.mjs';
import { HOME, PLATFORM, IS_MAC, expand, isProtected, isSensitive, places, fallbackActions } from './platform.mjs';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
// MCP script launched by the AI CLI: in production it is unpacked from the asar archive (asarUnpack)
const MCP_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mcp.mjs').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const DEMO = process.env.TAUPE_DEMO_AI === '1';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

// msg is a French key translated at send time (see src/i18n.mjs); vars fill its {placeholders}
// Lookups keyed by client input: own keys only ("__proto__", "constructor"… are not routes/tools)
const has = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);

class HttpError extends Error { constructor(code, msg, vars) { super(msg); this.code = code; this.vars = vars; } }

async function volume(p) {
  try { const v = await fsp.statfs(p); return { total: v.blocks * v.bsize, free: v.bavail * v.bsize }; } catch { return null; }
}

// embedToken: write the anti-CSRF token into the page. Only for the browser development mode: in the
// app, Electron adds it to each request itself (electron/main.mjs), so reading the page gives nothing away.
export function startServer({ port = 0, actions = fallbackActions, app = false, version = '', testing = false, embedToken = !app } = {}) {
  const TOKEN = crypto.randomBytes(18).toString('hex');
  const session = new Session();
  const sep = path.sep;
  let PORT = port;
  let aiJob = null;

  const needId = v => {
    const id = Number(v ?? session.rootId);
    if (!session.valid(id)) throw new HttpError(404, 'Élément introuvable (supprimé ou pas encore scanné)');
    return id;
  };
  const pathFor = id => session.pathOf(needId(id));

  // Latest AI analysis (hides suggestions already deleted or no longer valid)
  function aiView() {
    if (!aiJob || aiJob.store !== session.store) return { status: 'idle' };
    const { store, ...j } = aiJob;
    j.elapsed = (j.ended || Date.now()) - j.started;
    if (j.result) {
      const items = j.result.items.filter(x => session.valid(x.id) && session.pathOf(x.id) === x.path)
        .map(x => ({ ...x, size: session.store.size[x.id] }));
      j.result = { ...j.result, items };
    }
    return j;
  }

  // Moves already-validated items ({id, path, size}) to the Trash; refuses protected paths.
  // App data (~/Library/…, AppData\…) only leaves if its path is in `confirmed` (reinforced confirmation).
  async function trashItems(items, lang = 'en', confirmed = []) {
    // if a folder AND its contents are requested, keep only the folder
    const top = items.filter(it => !items.some(o => o !== it && it.path.startsWith(o.path + sep)));
    const ok = new Set(confirmed), todo = [], failed = [];
    for (const it of top) {
      if (isProtected(it.path)) failed.push({ ...it, error: tr(lang, 'Chemin protégé (système ou dossier principal)') });
      else if (isSensitive(it.path) && !ok.has(it.path)) failed.push({ ...it, needsConfirm: true, error: tr(lang, 'Données d’application : confirmation renforcée requise') });
      else todo.push(it);
    }
    const errors = todo.length ? await actions.trash(todo.map(t => t.path)) : {};
    const done = [];
    for (const it of todo) {
      let gone = false; try { await fsp.lstat(it.path); } catch { gone = true; }
      if (gone) { session.store.unlink(it.id); done.push(it); } else failed.push({ ...it, error: errors[it.path] || tr(lang, 'Non déplacé') });
    }
    return { done, failed, freed: done.reduce((a, t) => a + t.size, 0) };
  }

  // ----- Conversations: the AI acts through MCP tools, each action becomes an animated event -----
  const chats = new Map();
  let selfUrl = '';
  const ev = (chat, e) => { e.i = chat.events.length; e.t = Date.now(); e.status ??= 'running'; chat.events.push(e); return e; };
  const find = p => { const id = session.idOf(expand(String(p || '').replace(/[\\/]+$/, ''))); return id >= 0 && session.valid(id) ? id : -1; };
  const item = id => { const r = session.row(id); return { id, path: session.pathOf(id), name: r.name, size: r.size, dir: r.dir, count: r.count, mtime: r.mtime }; };
  const folderOf = (chat, p) => {
    const id = p ? find(p) : chat.folder;
    if (id < 0 || !session.valid(id)) throw new HttpError(404, 'Dossier introuvable dans le scan : {p}', { p });
    if (!session.row(id).dir) throw new HttpError(400, 'Ce n’est pas un dossier : {p}', { p });
    return id;
  };
  const clamp = (v, d, max) => Math.max(1, Math.min(max, Number(v) || d));
  const pause = ms => new Promise(r => setTimeout(r, ms)); // leaves time to see the animation
  const TOOL_IMPL = {
    async search_files(c, a) {
      const f = folderOf(c, a.folder);
      const e = ev(c, { type: 'search', query: String(a.query || ''), folder: session.pathOf(f) });
      await pause(400);
      const res = session.search(f, a.query, clamp(a.limit, 30, 200)).map(item);
      Object.assign(e, { status: 'done', count: res.length, top: res.slice(0, 3).map(r => r.path) });
      return { folder: e.folder, results: res.map(({ id, ...r }) => r) };
    },
    async list_folder(c, a) {
      const f = folderOf(c, a.path);
      const e = ev(c, { type: 'list', path: session.pathOf(f) });
      await pause(300);
      const l = session.list(f, 80);
      Object.assign(e, { status: 'done', count: l.children.length });
      return { path: l.path, size: l.node.size, files: l.node.count,
        children: l.children.map(r => ({ path: session.pathOf(r.id), size: r.size, dir: r.dir, files: r.count, mtime: r.mtime })) };
    },
    async big_files(c, a) {
      const f = folderOf(c, a.folder);
      const e = ev(c, { type: 'big', folder: session.pathOf(f) });
      await pause(400);
      const res = session.bigFiles(f, clamp(a.limit, 20, 100)).map(r => item(r.id));
      Object.assign(e, { status: 'done', count: res.length, top: res.slice(0, 3).map(r => r.path) });
      return { folder: e.folder, files: res.map(({ id, ...r }) => r) };
    },
    async open_folder(c, a) {
      const f = folderOf(c, a.path);
      ev(c, { type: 'open', id: f, path: session.pathOf(f), status: 'done' });
      return { ok: true, opened: session.pathOf(f) };
    },
    async select_items(c, a) {
      const ids = [], skipped = [];
      for (const p of (a.paths || []).slice(0, 500)) { const id = find(p); id >= 0 ? ids.push(id) : skipped.push(String(p)); }
      const items = ids.map(item);
      ev(c, { type: 'select', items, total: items.reduce((t, x) => t + x.size, 0), skipped, status: 'done' });
      return { selected: items.length, skipped };
    },
    async move_to_trash(c, a) {
      const ids = [], skipped = [];
      for (const p of (a.paths || []).slice(0, 500)) { const id = find(p); id >= 0 ? ids.push(id) : skipped.push(String(p)); }
      const items = ids.map(id => ({ ...item(id), sensitive: isSensitive(session.pathOf(id)) })), prot = items.filter(x => isProtected(x.path)), ok = items.filter(x => !isProtected(x.path));
      if (!ok.length) return { trashed: [], refused: prot.map(x => x.path), skipped, message: 'Rien à mettre à la corbeille (chemins protégés ou introuvables).' };
      const e = ev(c, { type: 'trash', items: ok, protected: prot.map(x => x.path), skipped, reason: String(a.reason || ''),
        total: ok.reduce((t, x) => t + x.size, 0), status: 'pending' });
      let timer;
      const accept = await new Promise(res => {
        c.pending.set(e.i, res);
        timer = setTimeout(() => res(null), 5 * 60e3);
      });
      clearTimeout(timer);
      c.pending.delete(e.i);
      if (!accept) { e.status = accept === null ? 'expired' : 'refused'; return { trashed: [], message: accept === null ? 'Pas de réponse de l’utilisateur.' : 'L’utilisateur a refusé.' }; }
      // the user may have unchecked some items before confirming
      const chosen = accept.paths ? ok.filter(x => accept.paths.includes(x.path)) : ok;
      const kept = ok.filter(x => !chosen.includes(x)).map(x => x.path);
      if (!chosen.length) { e.status = 'refused'; return { trashed: [], kept, message: 'L’utilisateur a tout décoché.' }; }
      Object.assign(e, { status: 'trashing', chosen: chosen.length, kept });
      const confirmed = Array.isArray(accept.confirmSensitive) ? accept.confirmSensitive : [];
      const r = await trashItems(chosen.filter(x => session.valid(x.id) && session.pathOf(x.id) === x.path), 'en', confirmed);
      Object.assign(e, { status: 'done', freed: r.freed, done: r.done.length, failed: r.failed.map(f => ({ path: f.path, error: f.error })) });
      return { trashed: r.done.map(x => x.path), kept_by_user: kept, failed: e.failed, freed_bytes: r.freed, protected: e.protected };
    },
  };

  // Demo agent (TAUPE_DEMO_AI=1, development only): chains real actions without an AI
  async function demoAgent(c, lang = 'en') {
    const fr = lang === 'fr';
    await pause(900);
    const s = await TOOL_IMPL.search_files(c, { query: 'node_modules' });
    await pause(500);
    await TOOL_IMPL.big_files(c, { limit: 5 });
    if (!s.results.length) return fr ? 'Je n’ai trouvé aucun dossier `node_modules` ici.' : 'I found no `node_modules` folder here.';
    await pause(400);
    await TOOL_IMPL.select_items(c, { paths: s.results.slice(0, 3).map(r => r.path) });
    await pause(700);
    const t = await TOOL_IMPL.move_to_trash(c, { paths: s.results.map(r => r.path), reason: fr ? 'Dépendances npm : un « npm install » les recrée.' : 'npm dependencies: “npm install” recreates them.' });
    if (fr) return t.trashed?.length ? `J’ai mis ${t.trashed.length} dossiers \`node_modules\` à la corbeille.` : 'D’accord, je n’ai rien supprimé.';
    return t.trashed?.length ? `I moved ${t.trashed.length} \`node_modules\` folders to the Trash.` : 'OK, I did not delete anything.';
  }

  const api = {
    'GET /api/status': async (_, q, lang) => ({ ...session.status(), home: HOME, platform: PLATFORM, app, version, sep,
      places: places(lang), canPick: app, volume: await volume(session.rootPath || HOME) }),
    'POST /api/pick': async () => ({ path: await actions.pickFolder() }),
    'POST /api/scan': async b => {
      const p = expand(b.path);
      let st; try { st = await fsp.stat(p); } catch { throw new HttpError(400, 'Chemin introuvable : {p}', { p }); }
      if (!st.isDirectory()) throw new HttpError(400, 'Ce chemin n’est pas un dossier');
      return { id: await session.start(p) };
    },
    'POST /api/cancel': () => { session.cancel(); return { ok: true }; },
    'POST /api/rescan': async b => ({ id: await session.rescan(needId(b.id)) }),
    'GET /api/list': (_, q) => session.list(needId(q.get('id'))),
    'GET /api/treemap': (_, q) => session.treemap(needId(q.get('id'))),
    'GET /api/bigfiles': (_, q) => session.bigFiles(needId(q.get('id'))),
    'GET /api/types': (_, q) => session.types(needId(q.get('id'))),
    'GET /api/hogs': (_, q, lang) => session.hogs(needId(q.get('id')), lang),
    'GET /api/suggest': (_, q, lang) => session.suggestions(needId(q.get('id')), lang),

    // ----- AI: accounts -----
    'GET /api/ai': async (_, q) => ({ job: aiView(), labels: ai.PROVIDERS, login: ai.loginState(),
      providers: { ...await ai.statusAll(q.get('refresh') === '1'), ...(DEMO ? { demo: { installed: true, loggedIn: true, detail: 'Agent de démonstration' } } : {}) } }),
    'POST /api/ai/connect': (b, _, lang) => {
      if (!ai.isProvider(b.provider)) throw new HttpError(400, 'Fournisseur inconnu');
      ai.connect(b.provider, lang); return { ok: true };
    },
    'POST /api/ai/login/code': b => { ai.loginCode(String(b.code || '')); return { ok: true }; },
    'POST /api/ai/login/cancel': () => { ai.loginCancel(); return { ok: true }; },
    'POST /api/ai/logout': async b => {
      if (!ai.isProvider(b.provider)) throw new HttpError(400, 'Fournisseur inconnu');
      await ai.logout(b.provider); return { ok: true };
    },
    'POST /api/external': async b => {
      const u = String(b.url || '');
      if (!/^https:\/\//.test(u)) throw new HttpError(400, 'URL refusée');
      await actions.openExternal(u); return { ok: true };
    },

    // ----- AI: chat + analysis -----
    'POST /api/chat/start': async (b, _, hdrLang) => {
      const lang = pickLang(b.lang || hdrLang);
      const id = needId(b.id);
      const provider = ai.isProvider(b.provider) || (DEMO && b.provider === 'demo') ? b.provider : 'claude';
      const msgs = (Array.isArray(b.messages) ? b.messages : []).filter(m => m && typeof m.content === 'string');
      if (!msgs.length) throw new HttpError(400, 'Message vide');
      let ctx = session.chatContext(id);
      const vol = await volume(session.rootPath || HOME);
      if (vol) ctx += `\n\nDisk: ${(vol.free / 1e9).toFixed(1)} GB free of ${(vol.total / 1e9).toFixed(1)} GB`;
      ctx += `\nOS: ${IS_MAC ? 'macOS' : PLATFORM === 'win32' ? 'Windows' : 'Linux'}`;
      const sel = (b.selection || []).filter(p => typeof p === 'string').slice(0, 50);
      if (sel.length) ctx += `\n\n## Items currently checked by the user\n${sel.join('\n')}`;
      if (session.scanning) ctx += '\n\n(The scan is still running: sizes may be incomplete.)';
      const chat = { id: crypto.randomBytes(8).toString('hex'), folder: id, provider, status: 'running', events: [], pending: new Map(),
        answer: '', links: [], error: '', started: Date.now(), ended: 0, proc: null };
      chats.set(chat.id, chat);
      for (const [k, c] of chats) if (Date.now() - c.started > 3600e3) chats.delete(k); // cleanup
      const mcp = { command: process.execPath, args: [MCP_PATH],
        env: { ELECTRON_RUN_AS_NODE: '1', TAUPE_URL: selfUrl, TAUPE_TOKEN: TOKEN, TAUPE_CHAT: chat.id } };
      (provider === 'demo' ? demoAgent(chat, lang) : ai.chatAgent(provider, ctx, msgs, mcp, p => (chat.proc = p), lang))
        .then(answer => Object.assign(chat, { status: 'done', answer, links: session.linksIn(answer) }))
        .catch(e => { if (chat.status === 'running') Object.assign(chat, { status: 'error', error: e.message }); })
        .finally(() => { chat.ended = Date.now(); for (const r of chat.pending.values()) r(false); });
      return { chat: chat.id };
    },
    'GET /api/chat/events': (_, q) => {
      const c = chats.get(q.get('chat'));
      if (!c) throw new HttpError(404, 'Conversation introuvable');
      return { status: c.status, events: c.events, answer: c.answer, links: c.links, error: c.error,
        ms: (c.ended || Date.now()) - c.started, provider: c.provider };
    },
    'POST /api/chat/confirm': b => {
      const c = chats.get(b.chat), r = c?.pending.get(Number(b.event));
      if (!r) throw new HttpError(404, 'Plus rien à confirmer');
      r(b.accept ? { paths: Array.isArray(b.paths) ? b.paths.map(String) : null,
        confirmSensitive: Array.isArray(b.confirmSensitive) ? b.confirmSensitive.map(String) : [] } : false); return { ok: true };
    },
    'POST /api/chat/cancel': b => {
      const c = chats.get(b.chat);
      if (c?.status === 'running') { c.status = 'cancelled'; try { c.proc?.kill(); } catch {} for (const r of c.pending.values()) r(false); }
      return { ok: true };
    },
    // Called by the MCP server (src/mcp.mjs) when the AI uses a tool
    'POST /api/tool': async b => {
      const c = chats.get(b.chat);
      if (!c || c.status !== 'running') throw new HttpError(409, 'Conversation terminée');
      const fn = has(TOOL_IMPL, b.name) ? TOOL_IMPL[b.name] : null;
      if (!fn) throw new HttpError(404, 'Outil inconnu : {p}', { p: b.name });
      return fn(c, b.args || {});
    },
    'POST /api/ai/start': async (b, _, hdrLang) => {
      const lang = pickLang(b.lang || hdrLang);
      if (aiJob?.status === 'running') throw new HttpError(409, 'Une analyse IA est déjà en cours');
      if (session.scanning) throw new HttpError(409, 'Attends la fin du scan avant de lancer l’analyse IA');
      const id = needId(b.id);
      const provider = ai.isProvider(b.provider) ? b.provider : 'claude';
      const job = aiJob = { status: 'running', provider, started: Date.now(), ended: 0, target: session.pathOf(id), store: session.store, result: null, error: null };
      ai.analyze(provider, session.digest(id), lang).then(raw => {
        const items = [];
        for (const x of raw.suggestions || []) {
          const p = expand(String(x.path || '').replace(/[\\/]+$/, ''));
          const sid = session.idOf(p);
          if (sid < 0 || !session.valid(sid)) continue; // made-up or vanished path
          const real = session.pathOf(sid);
          if (items.some(o => o.path === real || real.startsWith(o.path + sep) || o.path.startsWith(real + sep))) continue;
          const prot = isProtected(real);
          items.push({ ...session.row(sid), path: real, title: String(x.title || ''), reason: String(x.reason || ''),
            risk: ['safe', 'check', 'careful'].includes(x.risk) ? x.risk : 'check',
            action: prot ? 'review' : (['trash', 'command', 'review'].includes(x.action) ? x.action : 'review'),
            command: String(x.command || ''), protected: prot });
        }
        items.sort((a, b) => b.size - a.size);
        Object.assign(job, { status: 'done', ended: Date.now(), store: session.store, result: { summary: String(raw.summary || ''), items } });
      }).catch(e => Object.assign(job, { status: 'error', ended: Date.now(), error: e.message }));
      return { ok: true };
    },

    // ----- System actions -----
    'POST /api/reveal': async b => { await actions.reveal(pathFor(b.id)); return { ok: true }; },
    'POST /api/open': async b => { await actions.open(pathFor(b.id)); return { ok: true }; },
    'POST /api/quicklook': async b => { await actions.quicklook(pathFor(b.id)); return { ok: true }; },
    'POST /api/trash': async (b, _, lang) => {
      // The client sends {id, path}: check that the id STILL points to that path
      // (otherwise the tree changed in the meantime → refuse rather than delete something else).
      const items = [], failed = [];
      for (const it of b.items || []) {
        const id = Number(it.id);
        if (session.valid(id) && session.pathOf(id) === it.path) items.push({ id, path: it.path, size: session.store.size[id] });
        else failed.push({ id, path: String(it.path), size: 0, error: tr(lang, 'L’élément a changé depuis l’affichage — recharge') });
      }
      const r = await trashItems(items, lang, Array.isArray(b.confirmSensitive) ? b.confirmSensitive.map(String) : []);
      return { done: r.done, failed: [...failed, ...r.failed], freed: r.freed };
    },
  };

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let d = '';
      req.on('data', c => { d += c; if (d.length > 2e6) { req.destroy(); reject(new HttpError(413, 'Trop gros')); } });
      req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { reject(new HttpError(400, 'JSON invalide')); } });
    });
  }
  function send(res, code, body, type = 'application/json; charset=utf-8') {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'" });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  }

  const server = http.createServer(async (req, res) => {
    let lang = 'en';
    try {
      // Anti DNS-rebinding: only answer requests addressed to ourselves
      const host = req.headers.host || '';
      lang = pickLang(req.headers['x-lang']);
      if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return send(res, 403, { error: tr(lang, 'Host refusé') });
      const url = new URL(req.url, `http://${host}`);

      if (url.pathname.startsWith('/api/')) {
        // Anti-CSRF: secret token injected into the page
        if (req.headers['x-token'] !== TOKEN) return send(res, 403, { error: tr(lang, 'Jeton invalide — recharge la page') });
        const route = `${req.method} ${url.pathname}`;
        const fn = has(api, route) ? api[route] : null;
        if (!fn) return send(res, 404, { error: tr(lang, 'Route inconnue') });
        const body = req.method === 'POST' ? await readBody(req) : {};
        return send(res, 200, await fn(body, url.searchParams, lang));
      }

      if (req.method !== 'GET') return send(res, 405, { error: tr(lang, 'Méthode refusée') });
      const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const file = path.normalize(path.join(PUBLIC, rel));
      if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Interdit', 'text/plain');
      let data; try { data = await fsp.readFile(file); } catch { return send(res, 404, 'Introuvable', 'text/plain'); }
      if (rel === 'index.html') data = data.toString().replace('__TOKEN__', embedToken ? TOKEN : '').replace('__PLATFORM__', PLATFORM).replace('__APP__', app ? '1' : '0');
      const ext = path.extname(file);
      send(res, 200, data, has(MIME, ext) ? MIME[ext] : 'application/octet-stream');
    } catch (e) {
      send(res, e.code >= 400 && e.code < 600 ? e.code : 500, { error: tr(lang, e.message, e.vars) });
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', (/** @type {NodeJS.ErrnoException} */ e) => {
      if (e.code === 'EADDRINUSE' && PORT && PORT < port + 20) { PORT++; server.listen(PORT, '127.0.0.1'); }
      else reject(e);
    });
    server.on('listening', () => {
      PORT = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
      selfUrl = `http://127.0.0.1:${PORT}/`;
      const out = { port: PORT, url: selfUrl, token: TOKEN, close: () => { server.close(); server.closeAllConnections?.(); } };
      // Tests only: opens a conversation without starting an AI, to drive the MCP tools by hand
      if (testing) out.testChat = () => {
        const c = { id: crypto.randomBytes(8).toString('hex'), folder: session.rootId, status: 'running', events: [], pending: new Map(), started: Date.now() };
        chats.set(c.id, c);
        return { chat: c.id, token: TOKEN, mcp: MCP_PATH };
      };
      resolve(out);
    });
    server.listen(PORT, '127.0.0.1');
  });
}

// ---------- Development mode: `node src/server.mjs` ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await startServer({ port: Number(process.env.PORT) || 4747 });
  console.log(`\n  🐾 Taupe (mode dev, navigateur) : ${url}\n  Pour l'application : npm start\n`);
  if (!process.argv.includes('--no-open')) fallbackActions.openExternal(url).catch(() => {});
}
