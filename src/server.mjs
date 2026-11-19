// Taupe — serveur local (127.0.0.1 uniquement) qui alimente l'interface.
// Dans l'application, il tourne dans un processus séparé lancé par Electron (electron/worker.mjs),
// qui lui fournit les actions système natives (corbeille, Finder/Explorateur, Quick Look, sélecteur de dossier).
// En développement, `node src/server.mjs` le lance seul avec des actions de secours.
import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Session } from './scanner.mjs';
import * as ai from './ai.mjs';
import { HOME, PLATFORM, IS_MAC, expand, isProtected, places, fallbackActions } from './platform.mjs';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

async function volume(p) {
  try { const v = await fsp.statfs(p); return { total: v.blocks * v.bsize, free: v.bavail * v.bsize }; } catch { return null; }
}

export function startServer({ port = 0, actions = fallbackActions, app = false, version = '' } = {}) {
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

  // Dernière analyse IA (on masque les suggestions déjà supprimées ou devenues invalides)
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

  const api = {
    'GET /api/status': async () => ({ ...session.status(), home: HOME, platform: PLATFORM, app, version, sep,
      places: places(), canPick: app, volume: await volume(session.rootPath || HOME) }),
    'POST /api/pick': async () => ({ path: await actions.pickFolder() }),
    'POST /api/scan': async b => {
      const p = expand(b.path);
      let st; try { st = await fsp.stat(p); } catch { throw new HttpError(400, `Chemin introuvable : ${p}`); }
      if (!st.isDirectory()) throw new HttpError(400, 'Ce chemin n’est pas un dossier');
      return { id: await session.start(p) };
    },
    'POST /api/cancel': () => { session.cancel(); return { ok: true }; },
    'POST /api/rescan': async b => ({ id: await session.rescan(needId(b.id)) }),
    'GET /api/list': (_, q) => session.list(needId(q.get('id'))),
    'GET /api/treemap': (_, q) => session.treemap(needId(q.get('id'))),
    'GET /api/bigfiles': (_, q) => session.bigFiles(needId(q.get('id'))),
    'GET /api/types': (_, q) => session.types(needId(q.get('id'))),
    'GET /api/hogs': (_, q) => session.hogs(needId(q.get('id'))),
    'GET /api/suggest': (_, q) => session.suggestions(needId(q.get('id'))),

    // ----- IA : comptes -----
    'GET /api/ai': async (_, q) => ({ job: aiView(), providers: await ai.statusAll(q.get('refresh') === '1'), labels: ai.PROVIDERS, login: ai.loginState() }),
    'POST /api/ai/login': async b => { await ai.login(b.provider, actions.openExternal); return { ok: true }; },
    'POST /api/ai/login/code': b => { ai.loginCode(String(b.code || '')); return { ok: true }; },
    'POST /api/ai/login/cancel': () => { ai.loginCancel(); return { ok: true }; },
    'POST /api/ai/logout': async b => { await ai.logout(b.provider); return { ok: true }; },
    'POST /api/external': async b => {
      const u = String(b.url || '');
      if (!/^https:\/\//.test(u)) throw new HttpError(400, 'URL refusée');
      await actions.openExternal(u); return { ok: true };
    },

    // ----- IA : chat + analyse -----
    'POST /api/chat': async b => {
      const id = needId(b.id);
      const provider = ai.PROVIDERS[b.provider] ? b.provider : 'claude';
      const msgs = (Array.isArray(b.messages) ? b.messages : []).filter(m => m && typeof m.content === 'string');
      if (!msgs.length) throw new HttpError(400, 'Message vide');
      let ctx = session.chatContext(id);
      const vol = await volume(session.rootPath || HOME);
      if (vol) ctx += `\n\nDisque : ${(vol.free / 1e9).toFixed(1)} Go libres sur ${(vol.total / 1e9).toFixed(1)} Go`;
      ctx += `\nSystème : ${IS_MAC ? 'macOS' : PLATFORM === 'win32' ? 'Windows' : 'Linux'}`;
      const sel = (b.selection || []).filter(p => typeof p === 'string').slice(0, 50);
      if (sel.length) ctx += `\n\n## Éléments actuellement cochés par l'utilisateur\n${sel.join('\n')}`;
      if (session.scanning) ctx += '\n\n(Le scan est encore en cours : les tailles peuvent être incomplètes.)';
      const t = Date.now();
      const answer = await ai.chat(provider, ctx, msgs);
      return { answer, links: session.linksIn(answer), ms: Date.now() - t, provider };
    },
    'POST /api/ai/start': async b => {
      if (aiJob?.status === 'running') throw new HttpError(409, 'Une analyse IA est déjà en cours');
      if (session.scanning) throw new HttpError(409, 'Attends la fin du scan avant de lancer l’analyse IA');
      const id = needId(b.id);
      const provider = ai.PROVIDERS[b.provider] ? b.provider : 'claude';
      const job = aiJob = { status: 'running', provider, started: Date.now(), ended: 0, target: session.pathOf(id), store: session.store, result: null, error: null };
      ai.analyze(provider, session.digest(id)).then(raw => {
        const items = [];
        for (const x of raw.suggestions || []) {
          const p = expand(String(x.path || '').replace(/[\\/]+$/, ''));
          const sid = session.idOf(p);
          if (sid < 0 || !session.valid(sid)) continue; // chemin inventé ou disparu
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

    // ----- Actions système -----
    'POST /api/reveal': async b => { await actions.reveal(pathFor(b.id)); return { ok: true }; },
    'POST /api/open': async b => { await actions.open(pathFor(b.id)); return { ok: true }; },
    'POST /api/quicklook': async b => { await actions.quicklook(pathFor(b.id)); return { ok: true }; },
    'POST /api/trash': async b => {
      // Le client envoie {id, path} : on vérifie que l'id pointe TOUJOURS vers ce chemin
      // (sinon l'arbre a changé entre-temps → on refuse plutôt que de supprimer autre chose).
      const items = [], failed = [];
      for (const it of b.items || []) {
        const id = Number(it.id);
        if (session.valid(id) && session.pathOf(id) === it.path) items.push({ id, path: it.path, size: session.store.size[id] });
        else failed.push({ id, path: String(it.path), size: 0, error: 'L’élément a changé depuis l’affichage — recharge' });
      }
      // si un dossier ET son contenu sont sélectionnés, on ne garde que le dossier
      const top = items.filter(it => !items.some(o => o !== it && it.path.startsWith(o.path + sep)));
      const todo = [];
      for (const it of top) (isProtected(it.path) ? failed.push({ ...it, error: 'Chemin protégé (système ou dossier principal)' }) : todo.push(it));
      const errors = todo.length ? await actions.trash(todo.map(t => t.path)) : {};
      const done = [];
      for (const it of todo) {
        let gone = false; try { await fsp.lstat(it.path); } catch { gone = true; }
        if (gone) { session.store.unlink(it.id); done.push(it); } else failed.push({ ...it, error: errors[it.path] || 'Non déplacé' });
      }
      return { done, failed, freed: done.reduce((a, t) => a + t.size, 0) };
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
        return send(res, 200, await fn(body, url.searchParams));
      }

      if (req.method !== 'GET') return send(res, 405, { error: 'Méthode refusée' });
      const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const file = path.normalize(path.join(PUBLIC, rel));
      if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Interdit', 'text/plain');
      let data; try { data = await fsp.readFile(file); } catch { return send(res, 404, 'Introuvable', 'text/plain'); }
      if (rel === 'index.html') data = data.toString().replace('__TOKEN__', TOKEN).replace('__PLATFORM__', PLATFORM).replace('__APP__', app ? '1' : '0');
      send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
    } catch (e) {
      send(res, e.code >= 400 && e.code < 600 ? e.code : 500, { error: e.message });
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', e => {
      if (e.code === 'EADDRINUSE' && PORT && PORT < port + 20) { PORT++; server.listen(PORT, '127.0.0.1'); }
      else reject(e);
    });
    server.on('listening', () => {
      PORT = server.address().port;
      resolve({ port: PORT, url: `http://127.0.0.1:${PORT}/`, close: () => server.close() });
    });
    server.listen(PORT, '127.0.0.1');
  });
}

// ---------- Mode développement : `node src/server.mjs` ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await startServer({ port: Number(process.env.PORT) || 4747 });
  console.log(`\n  🐾 Taupe (mode dev, navigateur) : ${url}\n  Pour l'application : npm start\n`);
  if (!process.argv.includes('--no-open')) fallbackActions.openExternal(url).catch(() => {});
}
