// Taupe — serveur local (127.0.0.1 uniquement). Zéro dépendance.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Session } from './scanner.mjs';
import * as ai from './ai.mjs';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT_DIR, 'public');
const HOME = os.homedir();
const TOKEN = crypto.randomBytes(18).toString('hex');
const session = new Session();
let PORT = Number(process.env.PORT) || 4747;

// Chemins qu'on refuse de mettre à la corbeille, même si on le demande
const PROTECTED = new Set(['/', HOME, '/System', '/Applications', '/Users', '/Library', '/usr', '/bin', '/sbin', '/private', '/etc', '/var', '/opt', '/cores', '/Volumes',
  path.join(HOME, 'Library'), path.join(HOME, 'Desktop'), path.join(HOME, 'Documents'), path.join(HOME, 'Downloads')]);
const isProtected = p => PROTECTED.has(p) || p.startsWith('/System/') || p.startsWith('/usr/') || p.startsWith('/bin/') || p.startsWith('/sbin/');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, (e, out, err) => e ? rej(new Error(err || e.message)) : res(out)));

function expand(p) {
  p = String(p ?? '').trim();
  if (!p || p === '~') return HOME;
  if (p.startsWith('~/')) p = path.join(HOME, p.slice(2));
  return path.resolve(p);
}
function needId(q) {
  const id = Number(q.get('id') ?? session.rootId);
  if (!session.valid(id)) throw new HttpError(404, 'Élément introuvable (supprimé ou pas encore scanné)');
  return id;
}
async function volume(p) {
  try { const v = await fsp.statfs(p); return { total: v.blocks * v.bsize, free: v.bavail * v.bsize }; } catch { return null; }
}

const api = {
  'GET /api/status': async () => ({ ...session.status(), home: HOME, volume: await volume(session.rootPath || HOME) }),
  'POST /api/scan': async (_, b) => {
    const p = expand(b.path);
    let st; try { st = await fsp.stat(p); } catch { throw new HttpError(400, `Chemin introuvable : ${p}`); }
    if (!st.isDirectory()) throw new HttpError(400, 'Ce chemin n’est pas un dossier');
    return { id: await session.start(p) };
  },
  'POST /api/cancel': () => { session.cancel(); return { ok: true }; },
  'POST /api/rescan': async (q, b) => ({ id: await session.rescan(needId(new URLSearchParams({ id: b.id }))) }),
  'GET /api/list': q => session.list(needId(q)),
  'GET /api/treemap': q => session.treemap(needId(q)),
  'GET /api/bigfiles': q => session.bigFiles(needId(q)),
  'GET /api/types': q => session.types(needId(q)),
  'GET /api/hogs': q => session.hogs(needId(q)),
  'GET /api/suggest': q => session.suggestions(needId(q)),
  'POST /api/chat': async (_, b) => {
    const id = needId(new URLSearchParams({ id: b.id ?? session.rootId }));
    const provider = ai.PROVIDERS[b.provider] ? b.provider : 'claude';
    const msgs = (Array.isArray(b.messages) ? b.messages : []).filter(m => m && typeof m.content === 'string');
    if (!msgs.length) throw new HttpError(400, 'Message vide');
    let ctx = session.chatContext(id);
    const vol = await volume(session.rootPath || HOME);
    if (vol) ctx += `\n\nDisque : ${(vol.free / 1e9).toFixed(1)} Go libres sur ${(vol.total / 1e9).toFixed(1)} Go`;
    const sel = (b.selection || []).filter(p => typeof p === 'string').slice(0, 50);
    if (sel.length) ctx += `\n\n## Éléments actuellement cochés par l'utilisateur\n${sel.join('\n')}`;
    if (session.scanning) ctx += '\n\n(Le scan est encore en cours : les tailles peuvent être incomplètes.)';
    const t = Date.now();
    const answer = await ai.chat(provider, ctx, msgs);
    return { answer, links: session.linksIn(answer), ms: Date.now() - t, provider };
  },
  'GET /api/ai': async () => ({ job: aiView(), providers: await ai.available(), labels: ai.PROVIDERS }),
  'POST /api/ai/start': async (_, b) => {
    if (aiJob?.status === 'running') throw new HttpError(409, 'Une analyse IA est déjà en cours');
    if (session.scanning) throw new HttpError(409, 'Attends la fin du scan avant de lancer l’analyse IA');
    const id = needId(new URLSearchParams({ id: b.id ?? session.rootId }));
    const provider = ai.PROVIDERS[b.provider] ? b.provider : 'claude';
    const job = aiJob = { status: 'running', provider, started: Date.now(), ended: 0, target: session.pathOf(id), store: session.store, result: null, error: null };
    ai.analyze(provider, session.digest(id)).then(raw => {
      const items = [];
      for (const x of raw.suggestions || []) {
        const p = expand(String(x.path || '').replace(/\/+$/, ''));
        const sid = session.idOf(p);
        if (sid < 0 || !session.valid(sid)) continue; // chemin inventé ou disparu
        if (items.some(o => o.path === p || p.startsWith(o.path + '/') || o.path.startsWith(p + '/'))) continue;
        const prot = isProtected(p);
        items.push({ ...session.row(sid), path: p, title: String(x.title || ''), reason: String(x.reason || ''),
          risk: ['safe', 'check', 'careful'].includes(x.risk) ? x.risk : 'check',
          action: prot ? 'review' : (['trash', 'command', 'review'].includes(x.action) ? x.action : 'review'),
          command: String(x.command || ''), protected: prot });
      }
      items.sort((a, b) => b.size - a.size);
      Object.assign(job, { status: 'done', ended: Date.now(), store: session.store, result: { summary: String(raw.summary || ''), items } });
    }).catch(e => Object.assign(job, { status: 'error', ended: Date.now(), error: e.message }));
    return { ok: true };
  },
  'POST /api/reveal': async (_, b) => { await run('open', ['-R', pathFor(b.id)]); return { ok: true }; },
  'POST /api/open': async (_, b) => { await run('open', [pathFor(b.id)]); return { ok: true }; },
  'POST /api/quicklook': (_, b) => {
    spawn('qlmanage', ['-p', pathFor(b.id)], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  },
  'POST /api/trash': async (_, b) => {
    // Le client envoie {id, path} : on vérifie que l'id pointe TOUJOURS vers ce chemin
    // (sinon l'arbre a changé entre-temps → on refuse plutôt que de supprimer autre chose).
    const items = [], failed0 = [];
    for (const it of b.items || []) {
      const id = Number(it.id);
      if (session.valid(id) && session.pathOf(id) === it.path) items.push({ id, path: it.path, size: session.store.size[id] });
      else failed0.push({ id, path: String(it.path), size: 0, error: 'L’élément a changé depuis l’affichage — recharge' });
    }
    // si un dossier ET son contenu sont sélectionnés, on ne garde que le dossier
    const top = items.filter(it => !items.some(o => o !== it && it.path.startsWith(o.path + '/')));
    const refused = top.filter(it => isProtected(it.path));
    const todo = top.filter(it => !isProtected(it.path));
    let error = null;
    if (todo.length) { try { await run('/usr/bin/trash', todo.map(t => t.path)); } catch (e) { error = e.message; } }
    const done = [], failed = [...failed0, ...refused.map(it => ({ ...it, error: 'Chemin protégé (système ou dossier principal)' }))];
    for (const it of todo) {
      let gone = false; try { await fsp.lstat(it.path); } catch { gone = true; }
      if (gone) { session.store.unlink(it.id); done.push(it); } else failed.push({ ...it, error: error || 'Non déplacé' });
    }
    return { done, failed, freed: done.reduce((a, t) => a + t.size, 0) };
  },
};
// Dernière analyse IA (on masque les suggestions déjà supprimées ou devenues invalides)
let aiJob = null;
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

function pathFor(id) {
  id = Number(id);
  if (!session.valid(id)) throw new HttpError(404, 'Élément introuvable');
  return session.pathOf(id);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 2e6) { req.destroy(); reject(new HttpError(413, 'Trop gros')); } });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { reject(new HttpError(400, 'JSON invalide')); } });
  });
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  try {
    // Anti DNS-rebinding : on ne répond qu'à nous-mêmes
    const host = req.headers.host || '';
    if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return send(res, 403, { error: 'Host refusé' });
    const url = new URL(req.url, `http://${host}`);

    if (url.pathname.startsWith('/api/')) {
      // Anti-CSRF : jeton secret injecté dans la page
      if (req.headers['x-token'] !== TOKEN) return send(res, 403, { error: 'Jeton invalide — recharge la page' });
      const fn = api[`${req.method} ${url.pathname}`];
      if (!fn) return send(res, 404, { error: 'Route inconnue' });
      const body = req.method === 'POST' ? await readBody(req) : {};
      return send(res, 200, await fn(url.searchParams, body));
    }

    if (req.method !== 'GET') return send(res, 405, { error: 'Méthode refusée' });
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Interdit', 'text/plain');
    let data; try { data = await fsp.readFile(file); } catch { return send(res, 404, 'Introuvable', 'text/plain'); }
    if (rel === 'index.html') data = data.toString().replace('__TOKEN__', TOKEN);
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    send(res, e.code >= 400 && e.code < 600 ? e.code : 500, { error: e.message });
  }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE' && PORT < 4767) { PORT++; server.listen(PORT, '127.0.0.1'); }
  else { console.error(e); process.exit(1); }
});
server.on('listening', () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`\n  🐾 Taupe tourne sur ${url}\n  (Ctrl+C pour arrêter)\n`);
  if (!process.argv.includes('--no-open')) execFile('open', [url], () => {});
});
server.listen(PORT, '127.0.0.1');
