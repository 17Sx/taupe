// Scanner disque rapide + arbre en mémoire compact (typed arrays).
// Chaque fichier/dossier = un "nœud" identifié par un entier.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { diskSize, isSkipped, IS_WIN, HOME } from './platform.mjs';

export const F_DIR = 1, F_ERR = 2, F_LINK = 4, F_REMOVED = 8, F_SKIP = 16, F_PKG = 32;

const PKG_EXT = /\.(app|bundle|framework|photoslibrary|musiclibrary|fcpbundle|imovielibrary|xcarchive|plugin|kext|appex|tvlibrary|logicx|band)$/i;
const CONCURRENCY = 64;

class Store {
  constructor(cap = 1 << 16) { this.n = 0; this.cap = 0; this.names = []; this._grow(cap); }
  _grow(cap) {
    const g = (old, T) => { const a = new T(cap); if (old) a.set(old); return a; };
    this.parent = g(this.parent, Int32Array);
    this.first = g(this.first, Int32Array);
    this.next = g(this.next, Int32Array);
    this.size = g(this.size, Float64Array);   // octets réellement occupés sur disque
    this.count = g(this.count, Uint32Array);  // nb de fichiers dans le sous-arbre
    this.mtime = g(this.mtime, Uint32Array);  // secondes epoch
    this.flags = g(this.flags, Uint8Array);
    this.cap = cap;
  }
  add(parentId, name, flags, size, mtime) {
    if (this.n >= this.cap) this._grow(this.cap * 2);
    const id = this.n++;
    this.parent[id] = parentId; this.first[id] = -1; this.flags[id] = flags;
    this.size[id] = size; this.count[id] = (flags & F_DIR) ? 0 : 1; this.mtime[id] = mtime;
    this.names[id] = name;
    if (parentId >= 0) { this.next[id] = this.first[parentId]; this.first[parentId] = id; }
    else this.next[id] = -1;
    return id;
  }
  // Ajoute size/count à id et à tous ses ancêtres (s'arrête sur un sous-arbre supprimé)
  bump(id, s, c) {
    const { parent, flags, size, count } = this;
    for (let a = id; a >= 0; a = parent[a]) {
      if (flags[a] & F_REMOVED) break;
      size[a] += s; count[a] += c;
    }
  }
  unlink(id) {
    const p = this.parent[id];
    if (p < 0) return;
    if (this.first[p] === id) this.first[p] = this.next[id];
    else for (let c = this.first[p]; c >= 0; c = this.next[c]) {
      if (this.next[c] === id) { this.next[c] = this.next[id]; break; }
    }
    this.bump(p, -this.size[id], -this.count[id]);
    this.flags[id] |= F_REMOVED;
  }
  kids(id) { const out = []; for (let c = this.first[id]; c >= 0; c = this.next[c]) out.push(c); return out; }
  sortedKids(id) { const s = this.size; return this.kids(id).sort((a, b) => s[b] - s[a]); }
}

const mt = st => Math.max(0, Math.floor(st.mtimeMs / 1000)) >>> 0;

function pool(start, worker, conc) {
  return new Promise(resolve => {
    const q = [...start]; let running = 0;
    const push = j => q.push(j);
    const pump = () => {
      while (running < conc && q.length) {
        running++;
        worker(q.pop(), push).then(() => { running--; if (!q.length && !running) resolve(); else pump(); });
      }
      if (!q.length && !running) resolve();
    };
    pump();
  });
}

// ---------- Catégories de fichiers ----------
const CAT = {
  video: ['Vidéos', 'mp4 mov m4v mkv avi webm wmv flv mpg mpeg 3gp mts m2ts prores braw r3d'],
  image: ['Images', 'jpg jpeg png gif heic heif webp tiff tif bmp raw cr2 cr3 nef arw dng psd ai svg ico icns xcf sketch fig'],
  audio: ['Audio', 'mp3 m4a aac wav aiff aif flac ogg opus alac caf mid midi'],
  archive: ['Archives & images disque', 'zip rar 7z tar gz tgz bz2 xz zst dmg iso img pkg sparseimage sparsebundle vmdk vdi qcow2 ipa apk xip'],
  doc: ['Documents', 'pdf doc docx xls xlsx ppt pptx key pages numbers txt md rtf csv epub odt ods'],
  code: ['Code', 'js mjs cjs ts tsx jsx json py rb go rs swift java kt c h cpp hpp m mm cs php html css scss vue svelte sh yml yaml toml lock sql'],
  data: ['Bases de données & logs', 'db sqlite sqlite3 realm log ldb sst wal'],
};
const EXT2CAT = new Map();
for (const [k, [, exts]] of Object.entries(CAT)) for (const e of exts.split(' ')) EXT2CAT.set(e, k);
const CAT_LABEL = { ...Object.fromEntries(Object.entries(CAT).map(([k, [l]]) => [k, l])), app: 'Applications', dev: 'Dépendances & builds dev', other: 'Autres' };
const DEV_DIRS = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', 'Pods', 'DerivedData', '.gradle', '.next', '.nuxt', '.turbo', '.parcel-cache', '.svelte-kit', '.pnpm-store', '.cargo', '.rustup']);

// ---------- Dossiers "nettoyables" connus ----------
function hogOf(name, parentName) {
  switch (name) {
    case 'node_modules': return ['Dépendances npm', 'Régénérable avec npm install / bun install'];
    case '.next': case '.nuxt': case '.turbo': case '.parcel-cache': case '.svelte-kit': case '.angular':
      return ['Cache de build front', 'Recréé au prochain build'];
    case '.venv': case 'venv': return ['Environnement Python', 'Recréable avec pip install -r requirements.txt'];
    case 'Pods': return ['CocoaPods', 'Régénérable avec pod install'];
    case 'DerivedData': return ['Builds Xcode', 'Sûr à vider, Xcode recompile'];
    case 'iOS DeviceSupport': case 'watchOS DeviceSupport': return ['Symboles d’appareils Xcode', 'Re-téléchargés si besoin'];
    case 'CoreSimulator': return parentName === 'Developer' ? ['Simulateurs iOS', 'Supprime les vieux via xcrun simctl delete unavailable'] : null;
    case 'Caches': return parentName === 'Library' ? ['Caches d’apps', 'En général sûr à vider (apps fermées)'] : null;
    case 'Temp': return parentName === 'Local' ? ['Fichiers temporaires', 'Sûr à vider (%TEMP%)'] : null;
    case '.Trash': return ['Corbeille', 'Vide-la depuis le Finder pour récupérer l’espace'];
    case '.npm': case '.pnpm-store': case '.yarn': return ['Cache gestionnaire de paquets', 'Re-téléchargé à la demande'];
    case '.gradle': case '.m2': return ['Cache Java/Gradle', 'Re-téléchargé à la demande'];
    case '.cache': return ['Cache divers (~/.cache)', 'Généralement sûr à vider'];
    case 'Backup': return parentName === 'MobileSync' ? ['Sauvegardes iPhone/iPad', 'Gérables depuis le Finder > iPhone'] : null;
    case 'com.docker.docker': return ['Docker Desktop', 'Nettoyer avec docker system prune'];
    case 'Downloads': case 'Téléchargements': return ['Téléchargements', 'Souvent plein de vieux installeurs'];
  }
  if (name.endsWith('.xcarchive')) return ['Archive Xcode', 'Vieilles archives souvent inutiles'];
  return null;
}

// ---------- Suggestions ----------
const BUILD_CACHES = new Set(['.next', '.nuxt', '.turbo', '.parcel-cache', '.svelte-kit', '.angular', '.expo', '.vercel']);
const INSTALLERS = new Set(['dmg', 'pkg', 'zip', 'iso', 'xip', 'mpkg', 'exe', 'msi', 'msix', '7z', 'rar']);
const APP_CACHE_DIRS = new Set(['Cache', 'Code Cache', 'GPUCache', 'CachedData', 'ShaderCache', 'DawnCache', 'GrShaderCache', 'CrashDumps']);
// [titre, explication, risque : safe | check]
const SUGGEST_META = {
  build: ['Caches de build (.next, .turbo…)', 'Recréés automatiquement au prochain build ou « npm run dev ».', 'safe'],
  nodeOld: ['node_modules de projets dormants', 'Pas touchés depuis plus de 45 jours. Un « npm install » / « bun install » les recrée.', 'safe'],
  venv: ['Environnements Python dormants', 'Recréables avec « pip install -r requirements.txt ».', 'safe'],
  xcode: ['Données Xcode', 'DerivedData et symboles d’appareils : Xcode les régénère au besoin.', 'safe'],
  cache: ['Caches d’applications', 'Les apps les reconstruisent. Ferme l’app concernée avant.', 'safe'],
  temp: ['Fichiers temporaires Windows', 'Dossier %TEMP% : sûr à vider, sauf fichiers verrouillés par une app ouverte.', 'safe'],
  logs: ['Gros fichiers de log', 'Journaux techniques, rarement utiles une fois le problème passé.', 'safe'],
  worktree: ['Worktrees git / Claude Code', 'Copies de travail de branches. Vérifie qu’il n’y a rien de non commité, puis « git worktree prune » dans le projet.', 'check'],
  installers: ['Vieux installeurs dans Téléchargements', '.dmg, .pkg, .exe, .msi, .zip de plus d’une semaine : l’app est sûrement déjà installée.', 'check'],
  dupes: ['Doublons probables', 'Même nom et même taille à plusieurs endroits. On garde la copie la plus récente.', 'check'],
  oldBig: ['Gros fichiers pas modifiés depuis plus d’un an', 'À trier à la main : archive-les sur un disque externe ou supprime-les.', 'check'],
  iosBackup: ['Sauvegardes iPhone/iPad', 'Les anciennes sauvegardes d’appareils que tu n’as plus sont inutiles.', 'check'],
};
function fmtAge(days) {
  if (days < 1) return 'moins d’un jour';
  if (days < 60) return Math.round(days) + ' jours';
  if (days < 730) return Math.round(days / 30) + ' mois';
  return Math.round(days / 365) + ' ans';
}
const joinP = (...p) => path.join(...p.filter(Boolean));

export class Session {
  constructor() { this.store = null; this.rootId = -1; this.rootPath = null; this.ctx = null; this.lastCtx = null; }

  get scanning() { return !!this.ctx && !this.ctx.done; }

  cancel() { if (this.ctx) this.ctx.cancelled = true; }

  _newCtx(root) {
    this.cancel();
    return (this.ctx = { root, cancelled: false, done: false, files: 0, dirs: 0, errors: 0, current: root, started: Date.now(), ended: 0, seen: new Set(), crossDev: root === '/' });
  }

  // Lance un scan complet (remplace l'arbre)
  async start(rootPath) {
    const ctx = this._newCtx(rootPath);
    const store = this.store = new Store();
    this.rootPath = rootPath;
    const st = await fsp.lstat(rootPath);
    ctx.dev = st.dev;
    this.rootId = store.add(-1, rootPath, F_DIR, diskSize(st), mt(st));
    this._finish(ctx, this._walk(ctx, store, this.rootId, rootPath));
    return this.rootId;
  }

  // Re-scanne un sous-dossier et le remplace dans l'arbre. Renvoie le nouvel id.
  async rescan(id) {
    if (id === this.rootId) return this.start(this.rootPath);
    const p = this.pathOf(id);
    const parent = this.store.parent[id];
    const ctx = this._newCtx(p);
    const store = this.store;
    let st;
    try { st = await fsp.lstat(p); } catch { store.unlink(id); ctx.done = true; return parent; }
    ctx.dev = st.dev; ctx.crossDev = this.rootPath === '/';
    store.unlink(id);
    const nid = store.add(parent, path.basename(p), F_DIR | (PKG_EXT.test(p) ? F_PKG : 0), diskSize(st), mt(st));
    store.bump(parent, diskSize(st), 0);
    this._finish(ctx, this._walk(ctx, store, nid, p));
    return nid;
  }

  _finish(ctx, promise) {
    promise.finally(() => { ctx.done = true; ctx.ended = Date.now(); ctx.seen = null; this.lastCtx = ctx; });
  }

  _walk(ctx, store, id, absPath) {
    return pool([{ id, path: absPath }], (job, push) => this._dir(ctx, store, job, push), CONCURRENCY);
  }

  _dir(ctx, store, job, push) {
    return new Promise(resolve => {
      if (ctx.cancelled) return resolve();
      fs.readdir(job.path, (err, names) => {
        if (err) { store.flags[job.id] |= F_ERR; ctx.errors++; return resolve(); }
        if (ctx.cancelled || !names.length) return resolve();
        ctx.current = job.path;
        const base = job.path.endsWith(path.sep) ? job.path : job.path + path.sep;
        let left = names.length, sumS = 0, sumC = 0;
        for (const nm of names) {
          const full = base + nm;
          fs.lstat(full, (e, st) => {
            if (!e && !ctx.cancelled) {
              const own = diskSize(st);
              if (st.isDirectory()) {
                const skip = (isSkipped(full) && full !== ctx.root) || (!ctx.crossDev && st.dev !== ctx.dev);
                const cid = store.add(job.id, nm, F_DIR | (skip ? F_SKIP : 0) | (PKG_EXT.test(nm) ? F_PKG : 0), skip ? 0 : own, mt(st));
                ctx.dirs++;
                if (!skip) { sumS += own; push({ id: cid, path: full }); }
              } else {
                let size = own;
                if (st.nlink > 1) { // hard link : ne compter qu'une fois
                  const key = st.dev + ':' + st.ino;
                  if (ctx.seen.has(key)) size = 0; else ctx.seen.add(key);
                }
                store.add(job.id, nm, st.isSymbolicLink() ? F_LINK : 0, size, mt(st));
                sumS += size; sumC++; ctx.files++;
              }
            }
            if (--left === 0) { store.bump(job.id, sumS, sumC); resolve(); }
          });
        }
      });
    });
  }

  // ---------- Requêtes ----------
  valid(id) {
    const s = this.store;
    if (!s || !Number.isInteger(id) || id < 0 || id >= s.n) return false;
    for (let a = id; a >= 0; a = s.parent[a]) if (s.flags[a] & F_REMOVED) return false;
    return true;
  }

  pathOf(id) {
    const s = this.store, parts = [];
    for (let a = id; a >= 0; a = s.parent[a]) parts.push(s.names[a]);
    return path.join(...parts.reverse());
  }

  row(id) {
    const s = this.store, f = s.flags[id];
    return { id, name: s.names[id], size: s.size[id], count: s.count[id], mtime: s.mtime[id],
      dir: !!(f & F_DIR), err: !!(f & F_ERR), link: !!(f & F_LINK), skip: !!(f & F_SKIP), pkg: !!(f & F_PKG) };
  }

  crumbs(id) {
    const s = this.store, out = [];
    for (let a = id; a >= 0; a = s.parent[a]) out.push({ id: a, name: s.names[a] });
    return out.reverse();
  }

  list(id, limit = 2500) {
    const s = this.store;
    const kids = s.sortedKids(id);
    const rows = kids.slice(0, limit).map(c => this.row(c));
    let rest = null;
    if (kids.length > limit) {
      rest = { n: kids.length - limit, size: 0 };
      for (let i = limit; i < kids.length; i++) rest.size += s.size[kids[i]];
    }
    return { node: this.row(id), path: this.pathOf(id), crumbs: this.crumbs(id), children: rows, rest };
  }

  treemap(id) {
    const s = this.store, total = s.size[id] || 1;
    const lite = c => ({ id: c, name: s.names[c], size: s.size[c], dir: !!(s.flags[c] & F_DIR) });
    return s.sortedKids(id).slice(0, 250).filter(c => s.size[c] > 0).map(c => {
      const r = lite(c);
      if (r.dir && s.size[c] >= total * 0.01) r.children = s.sortedKids(c).slice(0, 80).filter(k => s.size[k] > 0).map(lite);
      return r;
    });
  }

  // DFS itératif sur le sous-arbre
  _each(id, fn) {
    const s = this.store, stack = [id];
    while (stack.length) {
      const n = stack.pop();
      for (let c = s.first[n]; c >= 0; c = s.next[c]) if (fn(c) !== false && (s.flags[c] & F_DIR)) stack.push(c);
    }
  }

  bigFiles(id, limit = 300) {
    const s = this.store; let cand = [], thr = 0;
    this._each(id, c => {
      if (!(s.flags[c] & F_DIR) && s.size[c] > thr) {
        cand.push(c);
        if (cand.length > limit * 4) { cand.sort((a, b) => s.size[b] - s.size[a]); cand.length = limit; thr = s.size[cand[limit - 1]]; }
      }
    });
    cand.sort((a, b) => s.size[b] - s.size[a]);
    const base = this.pathOf(id);
    return cand.slice(0, limit).map(c => ({ ...this.row(c), rel: path.relative(base, this.pathOf(s.parent[c])) }));
  }

  types(id) {
    const s = this.store, cats = {}, exts = new Map();
    const stack = [[id, 'none']];
    while (stack.length) {
      const [n, ctx] = stack.pop();
      for (let c = s.first[n]; c >= 0; c = s.next[c]) {
        const nm = s.names[c], sz = s.size[c];
        if (s.flags[c] & F_DIR) {
          let cx = ctx;
          if (cx === 'none') { if (/\.app$/i.test(nm)) cx = 'app'; else if (DEV_DIRS.has(nm)) cx = 'dev'; }
          stack.push([c, cx]);
          continue;
        }
        const dot = nm.lastIndexOf('.');
        const ext = dot > 0 && nm.length - dot <= 12 ? nm.slice(dot + 1).toLowerCase() : '';
        const cat = ctx !== 'none' ? ctx : (EXT2CAT.get(ext) || 'other');
        const k = cats[cat] || (cats[cat] = { key: cat, label: CAT_LABEL[cat], size: 0, count: 0 });
        k.size += sz; k.count++;
        if (ctx === 'none') {
          const e = ext || '(sans extension)';
          const x = exts.get(e) || { ext: e, size: 0, count: 0 };
          x.size += sz; x.count++; exts.set(e, x);
        }
      }
    }
    return {
      categories: Object.values(cats).sort((a, b) => b.size - a.size),
      extensions: [...exts.values()].sort((a, b) => b.size - a.size).slice(0, 40),
    };
  }

  hogs(id) {
    const s = this.store, out = [];
    this._each(id, c => {
      if (!(s.flags[c] & F_DIR)) return false;
      const h = hogOf(s.names[c], s.names[s.parent[c]]);
      if (h && s.size[c] > 1e6) { out.push({ ...this.row(c), label: h[0], tip: h[1], c }); return false; }
    });
    out.sort((a, b) => b.size - a.size);
    const base = this.pathOf(id);
    return out.slice(0, 400).map(r => { r.rel = path.relative(base, this.pathOf(s.parent[r.c])); delete r.c; return r; });
  }

  // Retrouve l'id d'un chemin absolu (ou -1)
  idOf(p) {
    const s = this.store;
    if (!s) return -1;
    p = path.resolve(p);
    if (p === this.rootPath) return this.rootId;
    const rel = path.relative(this.rootPath, p);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return -1;
    let n = this.rootId;
    for (const seg of rel.split(path.sep)) {
      let f = -1, ci = -1;
      const low = seg.toLowerCase();
      for (let c = s.first[n]; c >= 0; c = s.next[c]) {
        if (s.names[c] === seg) { f = c; break; }
        if (ci < 0 && s.names[c].toLowerCase() === low) ci = c;
      }
      if (f < 0) f = ci;
      if (f < 0) return -1;
      n = f;
    }
    return n;
  }

  // ---------- Suggestions automatiques (règles) ----------
  suggestions(id) {
    const s = this.store, now = Date.now() / 1000, DAY = 86400, G = {}, dupes = new Map();
    const add = (key, c, note) => (G[key] ||= []).push({ c, note });
    const ageOf = c => (now - s.mtime[c]) / DAY;
    const stack = [[id, 0]]; // ctx : 1 = dans Téléchargements, 2 = dans un paquet (.app…)
    while (stack.length) {
      const [n, ctx] = stack.pop();
      const pname = s.names[n], gname = s.parent[n] >= 0 ? s.names[s.parent[n]] : '';
      for (let c = s.first[n]; c >= 0; c = s.next[c]) {
        const nm = s.names[c], f = s.flags[c], sz = s.size[c], age = ageOf(c);
        if (f & F_DIR) {
          if (f & (F_SKIP | F_ERR) || nm === '.git' || nm === '.Trash') continue;
          if (BUILD_CACHES.has(nm)) { if (sz > 20e6) add('build', c); continue; }
          if (nm === 'node_modules') { if (sz > 50e6 && age > 45) add('nodeOld', c, `projet inactif depuis ${fmtAge(age)}`); continue; }
          if (nm === '.venv' || nm === 'venv') { if (sz > 50e6 && age > 60) add('venv', c, `inactif depuis ${fmtAge(age)}`); continue; }
          if (nm === 'DerivedData' || nm === 'iOS DeviceSupport' || nm === 'watchOS DeviceSupport') { if (sz > 50e6) add('xcode', c); continue; }
          if (pname === 'Caches' && gname === 'Library') { if (sz > 100e6) add('cache', c); continue; }
          if (nm === 'Temp' && pname === 'Local') { if (sz > 100e6) add('temp', c); continue; }
          if ((ctx & 4) && APP_CACHE_DIRS.has(nm)) { if (sz > 100e6) add('cache', c); continue; }
          if (pname === 'worktrees' && (gname === '.claude' || gname === '.git')) { if (sz > 50e6) add('worktree', c, `modifié il y a ${fmtAge(age)}`); continue; }
          if (pname === 'Backup' && gname === 'MobileSync') { add('iosBackup', c, `du ${new Date(s.mtime[c] * 1000).toLocaleDateString('fr-FR')}`); continue; }
          let cx = ctx;
          if (nm === 'Downloads' || nm === 'Téléchargements') cx |= 1;
          if (nm === 'AppData') cx |= 4;
          if (f & F_PKG) cx |= 2;
          stack.push([c, cx]);
        } else {
          if (ctx & 2) continue;
          const dot = nm.lastIndexOf('.'), ext = dot > 0 ? nm.slice(dot + 1).toLowerCase() : '';
          if ((ctx & 1) && INSTALLERS.has(ext) && age > 7 && sz > 5e6) add('installers', c, `téléchargé il y a ${fmtAge(age)}`);
          else if (sz > 500e6 && age > 365) add('oldBig', c, `pas modifié depuis ${fmtAge(age)}`);
          if (ext === 'log' && sz > 100e6) add('logs', c);
          if (sz >= 50e6) { const k = sz + '|' + nm; const a = dupes.get(k); if (a) a.push(c); else dupes.set(k, [c]); }
        }
      }
    }
    // Doublons : même nom + même taille → on propose tout sauf le plus récent
    for (const ids of dupes.values()) {
      if (ids.length < 2) continue;
      ids.sort((a, b) => s.mtime[b] - s.mtime[a]);
      for (const c of ids.slice(1)) add('dupes', c, `copie de ${this.pathOf(ids[0])}`);
    }
    return Object.entries(G).map(([key, list]) => {
      list.sort((a, b) => s.size[b.c] - s.size[a.c]);
      const [title, why, risk] = SUGGEST_META[key];
      return { key, title, why, risk, total: list.reduce((t, x) => t + s.size[x.c], 0), n: list.length,
        items: list.slice(0, 200).map(x => ({ ...this.row(x.c), path: this.pathOf(x.c), note: x.note || '' })) };
    }).sort((a, b) => b.total - a.total);
  }

  // ---------- Résumé texte du scan, pour l'IA ----------
  digest(id) {
    const s = this.store, total = s.size[id], now = Date.now() / 1000;
    const age = c => fmtAge((now - s.mtime[c]) / 86400);
    const gb = b => (b / 1e9).toFixed(2) + ' Go';
    const thr = Math.max(total * 0.003, 100e6), tree = [];
    const walk = (n, depth) => {
      for (const c of s.sortedKids(n)) {
        if (s.size[c] < thr || tree.length >= 260) break;
        const dir = s.flags[c] & F_DIR;
        tree.push(`${'  '.repeat(depth)}${this.pathOf(c)}${dir ? '/' : ''} — ${gb(s.size[c])}${dir ? `, ${s.count[c]} fichiers` : ''}, modifié il y a ${age(c)}`);
        if (dir && depth < 6 && !(s.flags[c] & F_PKG)) walk(c, depth + 1);
      }
    };
    walk(id, 0);
    const big = this.bigFiles(id, 50).map(r => `${joinP(this.pathOf(id), r.rel, r.name)} — ${gb(r.size)}, modifié il y a ${age(r.id)}`);
    const rules = this.suggestions(id).map(g => `• ${g.title} (${gb(g.total)}, ${g.n} éléments) :\n` +
      g.items.slice(0, 8).map(i => `    ${i.path} — ${gb(i.size)}${i.note ? ' — ' + i.note : ''}`).join('\n')).join('\n');
    return `Dossier analysé : ${this.pathOf(id)} — ${gb(total)}, ${s.count[id]} fichiers\n\n` +
      `## Arborescence des éléments les plus lourds (≥ ${gb(thr)})\n${tree.join('\n')}\n\n` +
      `## 50 plus gros fichiers\n${big.join('\n')}\n\n` +
      `## Candidats détectés par règles automatiques\n${rules || '(aucun)'}\n`;
  }

  // ---------- Contexte du dossier affiché, pour le chat ----------
  chatContext(id) {
    const s = this.store, now = Date.now() / 1000, total = s.size[id] || 1;
    const age = c => fmtAge((now - s.mtime[c]) / 86400);
    const sz = b => b >= 1e9 ? (b / 1e9).toFixed(2) + ' Go' : (b / 1e6).toFixed(1) + ' Mo';
    const line = (c, ind = '') => {
      const dir = s.flags[c] & F_DIR;
      const extra = (s.flags[c] & F_ERR) ? ' [accès refusé]' : (s.flags[c] & F_SKIP) ? ' [autre volume, non analysé]' : '';
      return `${ind}${this.pathOf(c)}${dir ? '/' : ''} — ${sz(s.size[c])} (${(s.size[c] / total * 100).toFixed(1)} %)${dir ? `, ${s.count[c]} fichiers` : ''}, modifié il y a ${age(c)}${extra}`;
    };
    const kids = s.sortedKids(id);
    const out = [`Dossier affiché à l'écran : ${this.pathOf(id)} — ${sz(s.size[id])}, ${s.count[id]} fichiers, ${kids.length} éléments directs`,
      `Racine du scan : ${this.rootPath} — ${sz(s.size[this.rootId])}`, '', '## Contenu direct (trié par taille)'];
    kids.slice(0, 70).forEach((c, i) => {
      out.push(line(c));
      if (i < 10 && (s.flags[c] & F_DIR)) for (const g of s.sortedKids(c).slice(0, 6)) out.push(line(g, '    '));
    });
    if (kids.length > 70) out.push(`… et ${kids.length - 70} éléments plus petits`);
    out.push('', '## Plus gros fichiers (sous-dossiers inclus)');
    for (const r of this.bigFiles(id, 25)) out.push(line(r.id));
    const rules = this.suggestions(id);
    if (rules.length) {
      out.push('', '## Nettoyage repéré par règles automatiques');
      for (const g of rules) out.push(`• ${g.title} — ${sz(g.total)} (${g.n}) : ${g.items.slice(0, 4).map(i => i.path).join(', ')}`);
    }
    return out.join('\n');
  }

  // Repère les chemins cités dans un texte (entre backticks ou absolus) qui existent dans le scan
  linksIn(text) {
    const found = new Map(), s = this.store;
    const cands = [...text.matchAll(/`([^`\n]+)`/g)].map(m => m[1])
      .concat(text.match(/(?:~|\/Users|\/Applications|\/Library|\/home)\/[^\s`'"()<>,;]*/g) || [])
      .concat(text.match(/[A-Za-z]:\\[^\s`'"()<>,;*?|]*/g) || []);
    for (const raw of cands) {
      let p = raw.trim().replace(/[.,:;!?)]+$/, '').replace(/[\\/]+$/, '');
      if (p.startsWith('~/') || p.startsWith('~\\')) p = path.join(HOME, p.slice(2));
      if (!path.isAbsolute(p) || found.has(raw)) continue;
      const id = this.idOf(p);
      if (id >= 0 && this.valid(id)) found.set(raw, { text: raw, id, parent: s.parent[id], dir: !!(s.flags[id] & F_DIR), size: s.size[id] });
    }
    return [...found.values()];
  }

  status() {
    const c = this.ctx;
    return {
      root: this.store ? { id: this.rootId, path: this.rootPath, size: this.store.size[this.rootId], count: this.store.count[this.rootId] } : null,
      scan: c ? { scanning: !c.done, cancelled: c.cancelled, files: c.files, dirs: c.dirs, errors: c.errors, current: c.current,
        elapsed: (c.ended || Date.now()) - c.started, target: c.root } : null,
    };
  }
}
