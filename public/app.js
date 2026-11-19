'use strict';
const TOKEN = document.querySelector('meta[name=token]').content;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const joinPath = (a, b) => (b ? (a.endsWith('/') ? a + b : a + '/' + b) : a);

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'x-token': TOKEN, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
const get = u => api('GET', u), post = (u, b) => api('POST', u, b || {});

// ---------- Formatage ----------
const nf = new Intl.NumberFormat('fr-FR');
const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
function fmtSize(b) {
  if (!b) return '0 o';
  if (b < 1000) return Math.round(b) + ' o';
  const u = ['Ko', 'Mo', 'Go', 'To', 'Po']; let i = -1;
  do { b /= 1000; i++; } while (b >= 1000 && i < u.length - 1);
  return (b >= 100 ? Math.round(b) : b.toFixed(1)).toString().replace('.', ',') + ' ' + u[i];
}
function relTime(sec) {
  if (!sec) return '';
  const d = sec - Date.now() / 1000, a = Math.abs(d);
  for (const [u, s] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]])
    if (a >= s) return rtf.format(Math.round(d / s), u);
  return 'à l’instant';
}
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const fmtPct = p => (p >= 10 ? Math.round(p) : p >= 0.1 ? p.toFixed(1).replace('.', ',') : p > 0 ? '<0,1' : '0') + ' %';
let HOME = '';
const pretty = p => (HOME && (p === HOME || p.startsWith(HOME + '/')) ? '~' + p.slice(HOME.length) : p);

const EMOJI = {};
for (const [e, list] of Object.entries({
  '🎬': 'mp4 mov m4v mkv avi webm wmv flv mpg mpeg mts', '🖼️': 'jpg jpeg png gif heic heif webp tiff tif bmp raw cr2 cr3 nef arw dng psd svg ico icns sketch fig',
  '🎵': 'mp3 m4a aac wav aiff aif flac ogg opus caf mid', '🗜️': 'zip rar 7z tar gz tgz bz2 xz zst', '💿': 'dmg iso img pkg sparseimage sparsebundle vmdk qcow2 ipa apk xip',
  '📕': 'pdf epub', '📝': 'doc docx pages txt md rtf odt', '📊': 'xls xlsx numbers csv ods', '📽️': 'ppt pptx key', '🗄️': 'db sqlite sqlite3 realm', '📜': 'log',
  '⚙️': 'js mjs cjs ts tsx jsx json py rb go rs swift java kt c h cpp m cs php html css scss vue svelte sh yml yaml toml lock sql',
})) for (const x of list.split(' ')) EMOJI[x] = e;
function icon(r) {
  if (r.dir) { if (r.err) return '🔒'; if (r.skip) return '💽'; if (r.pkg) return /\.app$/i.test(r.name) ? '🧩' : '📦'; return '📁'; }
  if (r.link) return '🔗';
  const i = r.name.lastIndexOf('.');
  return (i > 0 && EMOJI[r.name.slice(i + 1).toLowerCase()]) || '📄';
}

// ---------- État ----------
const S = {
  root: null, cur: null, data: null, rows: [], rest: null, view: [], tab: 'content',
  sort: { k: 'size', d: -1 }, filter: '', sel: new Map(), focus: -1, anchor: -1,
  wasScanning: false, loading: false, tm: [], tmIndex: new Map(),
};

// ---------- Toasts ----------
function toast(msg, kind = '', ms = 5000) {
  const t = document.createElement('div');
  t.className = 'toast ' + kind; t.innerHTML = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- Vues ----------
function show(which) {
  $('#welcome').hidden = which !== 'welcome';
  $('#app').hidden = which !== 'app';
  $('#chat').hidden = which !== 'app' || !chatOpen;
  $('#chatToggle').hidden = which !== 'app';
}

function renderVol(v) {
  if (!v) return ($('#vol').innerHTML = '');
  const used = v.total - v.free;
  $('#vol').innerHTML = `<div><b>${fmtSize(v.free)}</b> libres <span class="muted">sur ${fmtSize(v.total)}</span></div><div class="vbar"><i style="width:${pct(used, v.total).toFixed(1)}%"></i></div>`;
}

function renderHeader() {
  const d = S.data, n = d.node;
  $('#crumbs').innerHTML = d.crumbs.map((c, i) =>
    `<a data-id="${c.id}" title="${esc(i ? c.name : c.name)}">${esc(i ? c.name : pretty(c.name))}</a>`).join('<span class="sep">›</span>');
  $('#curName').textContent = d.crumbs.length > 1 ? n.name : (pretty(n.name).split('/').filter(Boolean).pop() || '/');
  $('#curName').title = d.path;
  let meta = `${fmtSize(n.size)} · ${nf.format(n.count)} fichiers`;
  if (S.root && S.cur === S.root.id && S.status?.volume && S.root.path === '/') {
    const used = S.status.volume.total - S.status.volume.free;
    meta += ` · <span title="Différence entre l’espace utilisé et ce qui est visible : système, snapshots APFS (Time Machine), espace purgeable, fichiers d’autres utilisateurs non lisibles.">volume utilisé : ${fmtSize(used)} ⓘ</span>`;
  }
  const errs = S.status?.scan?.errors;
  if (errs) meta += ` · <span class="tag" title="Ces dossiers n’ont pas pu être lus. Donne l’Accès complet au disque à ton Terminal (Réglages Système → Confidentialité et sécurité → Accès complet au disque), puis relance.">⚠ ${nf.format(errs)} dossiers inaccessibles</span>`;
  $('#curMeta').innerHTML = meta;
  $('#upBtn').disabled = d.crumbs.length < 2;
  $('#chatCtx').textContent = '📁 ' + pretty(d.path);
  $('#chatCtx').title = 'L’assistant voit ce dossier : ' + d.path;
}

const COLS = [['', ''], ['name', 'Nom'], ['size', 'Taille'], ['pct', '%'], ['count', 'Fichiers'], ['mtime', 'Modifié']];
function renderThead() {
  $('#thead').innerHTML = COLS.map(([k, l], i) => {
    if (!k) return '<span></span>';
    const arrow = S.sort.k === k || (k === 'pct' && S.sort.k === 'size') ? (S.sort.d < 0 ? ' ↓' : ' ↑') : '';
    return `<span data-k="${k === 'pct' ? 'size' : k}" class="${i >= 2 ? 'r' : ''} col-${k}">${l}${arrow}</span>`;
  }).join('');
}

function computeView() {
  let v = S.rows;
  if (S.filter) {
    const f = norm(S.filter);
    v = v.filter(r => norm(r.name).includes(f) || (r.rel && norm(r.rel).includes(f)) || (r.label && norm(r.label).includes(f)));
  }
  const { k, d } = S.sort;
  if (!(k === 'size' && d < 0)) {
    v = [...v].sort((a, b) => k === 'name' ? d * a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' }) : d * ((a[k] || 0) - (b[k] || 0)));
  }
  S.view = v;
}

function rowPath(r) {
  const base = S.data.path;
  return r.rel !== undefined ? joinPath(joinPath(base, r.rel), r.name) : joinPath(base, r.name);
}

function renderList(opts = {}) {
  const prevId = opts.focusId ?? S.view[S.focus]?.id;
  computeView();
  renderThead();
  const parent = S.data.node.size || 1;
  const max = S.view.reduce((m, r) => Math.max(m, r.size), 0) || 1;
  const tall = S.tab !== 'content';
  let html = '';
  S.view.forEach((r, i) => {
    const sel = S.sel.has(r.id);
    const sub = S.tab === 'hogs' ? `${esc(r.label)} · ${esc(r.rel || '.')}` : S.tab === 'big' ? esc(r.rel || '.') : '';
    const tags = (r.err ? '<span class="tag">accès refusé</span>' : '') + (r.skip ? '<span class="tag">autre volume</span>' : '');
    const barW = S.tab === 'content' ? pct(r.size, parent) : pct(r.size, max);
    html += `<div class="row${r.dir ? ' dir' : ''}${sel ? ' sel' : ''}${tall ? ' tall' : ''}" data-i="${i}"${r.tip ? ` title="${esc(r.tip)}"` : ''}>
      <span><input type="checkbox"${sel ? ' checked' : ''}></span>
      <span class="nm"><span class="ic">${icon(r)}</span><span class="t">${esc(r.name)}${sub ? `<small>${sub}</small>` : ''}</span>${tags}
        <span class="ra"><button data-a="ql" title="Aperçu (Espace)">👁</button><button data-a="reveal" title="Afficher dans le Finder">Finder</button>${r.dir && !r.skip ? '<button data-a="go" title="Ouvrir (→)">Ouvrir</button>' : ''}</span></span>
      <span class="sz"><span class="bar"><i style="width:${Math.max(barW, 0.3).toFixed(2)}%"></i></span><b>${fmtSize(r.size)}</b></span>
      <span class="pc r col-pc">${fmtPct(pct(r.size, parent))}</span>
      <span class="ct r col-ct">${r.dir ? nf.format(r.count) : ''}</span>
      <span class="mt r col-mt" title="${r.mtime ? new Date(r.mtime * 1000).toLocaleString('fr-FR') : ''}">${relTime(r.mtime)}</span>
    </div>`;
  });
  if (!S.view.length) html = `<div class="empty">${S.filter ? 'Aucun résultat pour ce filtre' : S.tab === 'hogs' ? 'Rien de connu à nettoyer ici 🎉' : 'Dossier vide'}</div>`;
  if (S.rest && !S.filter) html += `<div class="rest">+ ${nf.format(S.rest.n)} autres éléments plus petits · ${fmtSize(S.rest.size)}</div>`;
  $('#list').innerHTML = html;
  $('#listInfo').textContent = `${nf.format(S.view.length)} élément${S.view.length > 1 ? 's' : ''}` + (S.tab === 'big' ? ' — les plus gros fichiers de ce dossier et sous-dossiers' : S.tab === 'hogs' ? ' — caches & dossiers régénérables connus' : '');
  const fi = prevId != null ? S.view.findIndex(r => r.id === prevId) : -1;
  S.focus = -1;
  if (fi >= 0) setFocus(fi, !!opts.focusId);
}

function setFocus(i, scroll = true) {
  const list = $('#list');
  list.querySelector('.row.focus')?.classList.remove('focus');
  if (i < 0 || i >= S.view.length) { S.focus = -1; return highlightTm(null); }
  S.focus = i;
  const el = list.querySelector(`.row[data-i="${i}"]`);
  if (el) { el.classList.add('focus'); if (scroll) el.scrollIntoView({ block: 'nearest' }); }
  highlightTm(S.view[i].id);
}

// ---------- Chargement ----------
async function load(opts = {}) {
  const id = S.cur;
  if (id == null) return;
  S.loading = true;
  try {
    const list = await get(`/api/list?id=${id}`);
    if (id !== S.cur) return;
    S.data = list; renderHeader();
    const isTypes = S.tab === 'types', isSug = S.tab === 'suggest';
    $('#split').hidden = isTypes || isSug; $('#typesView').hidden = !isTypes; $('#suggestView').hidden = !isSug;
    $('#split').classList.toggle('full', S.tab !== 'content');
    if (isSug) { S.rows = []; S.view = []; S.focus = -1; renderRules(await get(`/api/suggest?id=${id}`)); refreshAI(); }
    else if (S.tab === 'content') { S.rows = list.children; S.rest = list.rest; renderList(opts); loadTreemap(); }
    else if (S.tab === 'big') { S.rows = await get(`/api/bigfiles?id=${id}`); S.rest = null; renderList(opts); }
    else if (S.tab === 'hogs') { S.rows = await get(`/api/hogs?id=${id}`); S.rest = null; renderList(opts); }
    else renderTypes(await get(`/api/types?id=${id}`));
  } catch (e) {
    if (/introuvable/i.test(e.message) && S.root && id !== S.root.id) { S.cur = S.root.id; S.loading = false; return load(); }
    toast(esc(e.message), 'err');
  } finally { S.loading = false; }
}

async function navigate(id, focusId) {
  S.cur = id; S.focus = -1; S.filter = ''; $('#filter').value = '';
  $('#list').scrollTop = 0;
  await load({ focusId });
  if (focusId == null && S.view.length) setFocus(0, false);
  $('#list').focus({ preventScroll: true });
}

function goUp() {
  const c = S.data?.crumbs;
  if (c && c.length > 1) navigate(c[c.length - 2].id, S.cur);
}

function setTab(tab) {
  S.tab = tab;
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
  S.sort = { k: 'size', d: -1 }; S.focus = -1; $('#list').scrollTop = 0;
  load();
}

// ---------- Treemap ----------
function squarify(items, x, y, w, h) {
  const out = [];
  const total = items.reduce((a, b) => a + b.size, 0);
  if (!total || w <= 1 || h <= 1) return out;
  const scale = (w * h) / total, vals = items.map(it => it.size * scale);
  let i = 0;
  while (i < items.length) {
    const short = Math.min(w, h);
    let j = i, sum = 0, best = Infinity;
    while (j < items.length) {
      const s2 = sum + vals[j];
      const worst = Math.max((short * short * vals[i]) / (s2 * s2), (s2 * s2) / (short * short * vals[j]));
      if (worst > best) break;
      best = worst; sum = s2; j++;
    }
    if (w >= h) {
      const cw = sum / h; let cy = y;
      for (let k = i; k < j; k++) { const ch = vals[k] / cw; out.push({ it: items[k], x, y: cy, w: cw, h: ch }); cy += ch; }
      x += cw; w -= cw;
    } else {
      const rh = sum / w; let cx = x;
      for (let k = i; k < j; k++) { const cw = vals[k] / rh; out.push({ it: items[k], x: cx, y, w: cw, h: rh }); cx += cw; }
      y += rh; h -= rh;
    }
    i = j;
  }
  return out;
}

async function loadTreemap() {
  const id = S.cur;
  try {
    const data = await get(`/api/treemap?id=${id}`);
    if (id !== S.cur) return;
    S.tm = data; drawTreemap();
  } catch { /* ignoré */ }
}

function drawTreemap() {
  const el = $('#tm');
  const W = el.clientWidth, H = el.clientHeight;
  if (!W || !H || S.tab !== 'content') return;
  S.tmIndex.clear();
  const px = v => v.toFixed(1) + 'px';
  let html = '';
  squarify(S.tm, 0, 0, W, H).forEach((c, i) => {
    const r = c.it;
    S.tmIndex.set(r.id, { ...r, parent: S.cur });
    if (c.w < 2 || c.h < 2) return;
    const hue = (i * 47 + 220) % 360;
    const lbl = c.w > 46 && c.h > 18;
    html += `<div class="cell" data-id="${r.id}" style="left:${px(c.x)};top:${px(c.y)};width:${px(c.w)};height:${px(c.h)};background:hsl(${hue} ${r.dir ? 45 : 15}% ${r.dir ? 30 : 32}%)">`;
    if (lbl) html += `<div class="lbl">${esc(r.name)}<small>${fmtSize(r.size)}</small></div>`;
    if (r.children && c.w > 24 && c.h > 30) {
      const pad = 3, top = lbl ? 18 : pad;
      squarify(r.children, pad, top, c.w - pad * 2 - 2, c.h - top - pad - 2).forEach((s, j) => {
        S.tmIndex.set(s.it.id, { ...s.it, parent: r.id });
        if (s.w < 3 || s.h < 3) return;
        const l = 38 + ((j * 7) % 20);
        html += `<div class="sub" data-id="${s.it.id}" style="left:${px(s.x)};top:${px(s.y)};width:${px(s.w)};height:${px(s.h)};background:hsl(${hue} ${s.it.dir ? 50 : 28}% ${l}%)">${s.w > 44 && s.h > 14 ? `<div class="lbl">${esc(s.it.name)}</div>` : ''}</div>`;
      });
    }
    html += '</div>';
  });
  el.innerHTML = html || '<div class="empty">Rien à afficher</div>';
  if (S.focus >= 0) highlightTm(S.view[S.focus]?.id);
}

function highlightTm(id) {
  const tm = $('#tm');
  tm.querySelector('.cell.hl')?.classList.remove('hl');
  if (id != null) tm.querySelector(`.cell[data-id="${id}"]`)?.classList.add('hl');
}

// ---------- Types ----------
const CAT_STYLE = { video: ['🎬', '#ff6b8b'], image: ['🖼️', '#ffb547'], audio: ['🎵', '#b07cff'], archive: ['💿', '#5bc0ff'], doc: ['📕', '#46d39a'],
  code: ['⚙️', '#7c9cff'], data: ['🗄️', '#ff8f5b'], app: ['🧩', '#e86bff'], dev: ['🛠️', '#9aa3b5'], other: ['📄', '#5d6475'] };
function renderTypes(t) {
  const total = S.data.node.size || 1;
  const maxC = t.categories[0]?.size || 1, maxE = t.extensions[0]?.size || 1;
  const cat = t.categories.map(c => {
    const [e, col] = CAT_STYLE[c.key] || ['📄', '#888'];
    return `<div class="trow"><span>${e}</span><span>${esc(c.label)}</span><span class="bar"><i style="width:${pct(c.size, maxC)}%;background:${col}"></i></span><b>${fmtSize(c.size)}</b><span class="muted small r">${fmtPct(pct(c.size, total))}</span></div>`;
  }).join('');
  const ext = t.extensions.map(x =>
    `<div class="trow" style="cursor:pointer" data-ext="${esc(x.ext)}" title="Voir les plus gros fichiers .${esc(x.ext)}"><span>${EMOJI[x.ext] || '📄'}</span><span>${x.ext.startsWith('(') ? esc(x.ext) : '.' + esc(x.ext)}</span><span class="bar"><i style="width:${pct(x.size, maxE)}%;background:var(--accent)"></i></span><b>${fmtSize(x.size)}</b><span class="muted small">${nf.format(x.count)} fich.</span></div>`).join('');
  $('#typesView').innerHTML = `<div><h3>Par catégorie</h3>${cat || '<p class="muted">Vide</p>'}
    <p class="muted small">« Applications » = contenu des .app · « Dépendances & builds dev » = node_modules, .git, .next, venv, DerivedData…</p></div>
    <div><h3>Par extension <span class="muted small">(hors apps & dépendances — clique pour voir les fichiers)</span></h3>${ext}</div>`;
}

// ---------- Suggestions (règles + IA) ----------
const RISK = { safe: ['Sans risque', 'ok'], check: ['À vérifier', 'warn'], careful: ['Prudence', 'bad'] };
const SUG = new Map();           // id → élément affiché (pour sélection / actions)
let RULES = [], AI = null, aiTimer = null;
const expanded = new Set();
const riskBadge = r => { const [l, c] = RISK[r] || RISK.check; return `<span class="risk ${c}">${l}</span>`; };
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

function sugItem(it, { extra = '', noSel = false } = {}) {
  SUG.set(it.id, it);
  const sel = S.sel.has(it.id);
  return `<div class="sitem${sel ? ' sel' : ''}" data-id="${it.id}">
    <input type="checkbox"${sel ? ' checked' : ''}${noSel ? ' disabled title="Pas de mise à la corbeille directe pour celui-ci"' : ''}>
    <span class="ic">${icon(it)}</span>
    <div class="sbody">
      <div class="sname">${esc(it.title || it.name)}</div>
      <div class="spath" title="${esc(it.path)}">${esc(pretty(it.path))}${it.note ? ` <span class="muted">· ${esc(it.note)}</span>` : ''}</div>
      ${extra}
    </div>
    <span class="sacts"><button data-a="reveal" title="Afficher dans le Finder">Finder</button>${it.dir ? '<button data-a="go" title="Ouvrir dans Taupe">Voir</button>' : ''}</span>
    <b class="ssize">${fmtSize(it.size)}</b>
  </div>`;
}

function renderRules(groups) {
  RULES = groups;
  const total = groups.reduce((a, g) => a + g.total, 0);
  const html = groups.map(g => {
    const all = expanded.has(g.key), shown = all ? g.items : g.items.slice(0, 5);
    return `<div class="sgroup" data-key="${g.key}">
      <div class="shead">${riskBadge(g.risk)}<h3>${esc(g.title)}</h3><span class="muted small">${nf.format(g.n)} élément${g.n > 1 ? 's' : ''}</span>
        <span class="grow"></span><b>${fmtSize(g.total)}</b><button class="btn ghost sm" data-selall>Tout sélectionner</button></div>
      <p class="muted small swhy">${esc(g.why)}</p>
      <div class="sitems">${shown.map(it => sugItem(it)).join('')}</div>
      ${g.items.length > 5 ? `<button class="more" data-more>${all ? 'Réduire' : `Voir les ${g.items.length - 5} autres`}</button>` : ''}
    </div>`;
  }).join('');
  $('#ruleGroups').innerHTML = `<h2 class="stitle">Repéré automatiquement <span class="muted">· ≈ ${fmtSize(total)}</span></h2>` +
    (html || '<p class="muted">Rien de suspect selon les règles automatiques 🎉 Essaie l’analyse IA.</p>');
}

function renderAI(st) {
  AI = st;
  const j = st.job, prov = st.providers, labels = st.labels;
  let pick = lsGet('taupe.ai') || 'claude';
  if (!prov[pick]) pick = Object.keys(prov).find(k => prov[k]) || pick;
  const running = j.status === 'running';
  const opts = Object.entries(labels).map(([k, l]) => `<option value="${k}"${k === pick ? ' selected' : ''}${prov[k] ? '' : ' disabled'}>${esc(l)}${prov[k] ? '' : ' — non installé'}</option>`).join('');
  let body = '';
  if (running) {
    body = `<div class="aistate"><span class="spin"></span> ${esc(labels[j.provider] || j.provider)} analyse <b>${esc(pretty(j.target))}</b>… ${Math.round(j.elapsed / 1000)} s <span class="muted">(compte 1 à 2 min)</span></div>`;
  } else if (j.status === 'error') {
    const auth = /authenticat|login|logged|expired|401|unauthorized/i.test(j.error);
    const fix = j.provider === 'codex' ? 'codex login' : 'claude';
    body = `<div class="aierr"><b>L’analyse a échoué.</b> <span class="muted small">${esc(j.error.slice(0, 400))}</span>
      ${auth ? `<p>👉 Ta CLI n’est pas connectée à ton compte. Ouvre un Terminal, tape <code>${fix}</code>${j.provider === 'claude' ? ' puis <code>/login</code>' : ''}, connecte-toi, puis relance.</p>` : ''}</div>`;
  } else if (j.status === 'done') {
    const items = j.result.items;
    const safe = items.filter(x => x.risk === 'safe' && x.action === 'trash');
    body = `<p class="aisum">${esc(j.result.summary)}</p>
      <div class="aibar"><span class="muted small">${esc(labels[j.provider])} · ${esc(pretty(j.target))} · ${Math.round(j.elapsed / 1000)} s · ${items.length} suggestion${items.length > 1 ? 's' : ''}</span>
      <span class="grow"></span>${safe.length ? `<button class="btn ghost sm" data-selsafe>Sélectionner les ${safe.length} « sans risque » (${fmtSize(safe.reduce((a, b) => a + b.size, 0))})</button>` : ''}</div>
      <div class="sitems">${items.map(it => sugItem(it, {
        noSel: it.action === 'command' || it.protected,
        extra: `<div class="sreason">${riskBadge(it.risk)} ${esc(it.reason)}</div>` +
          (it.command ? `<div class="scmd"><code>${esc(it.command)}</code><button class="btn ghost sm" data-copy="${esc(it.command)}">Copier</button></div>` : ''),
      })).join('') || '<p class="muted">Aucune suggestion exploitable.</p>'}</div>`;
  } else {
    body = `<p class="muted small">L’IA voit les noms, tailles et dates des éléments les plus lourds — <b>jamais le contenu de tes fichiers</b> — et propose quoi supprimer, avec le niveau de risque. Rien n’est supprimé sans toi.</p>`;
  }
  $('#aiPanel').innerHTML = `<div class="aihead"><h2 class="stitle">✨ Analyse IA</h2><span class="grow"></span>
      <select id="aiProv"${running ? ' disabled' : ''}>${opts}</select>
      <button class="btn primary sm" id="aiStart"${running || !Object.values(prov).some(Boolean) ? ' disabled' : ''}>${j.status === 'done' ? 'Relancer' : 'Analyser ce dossier'}</button></div>${body}`;
  clearTimeout(aiTimer);
  if (running && S.tab === 'suggest') aiTimer = setTimeout(refreshAI, 1500);
}

async function refreshAI() {
  try {
    const prev = AI?.job?.status;
    const st = await get('/api/ai');
    if (S.tab !== 'suggest') return;
    renderAI(st);
    if (prev === 'running' && st.job.status === 'done') toast(`✨ Analyse IA terminée : ${st.job.result.items.length} suggestions`, 'ok');
  } catch (e) { toast(esc(e.message), 'err'); }
}

function selectItems(items) {
  for (const it of items) S.sel.set(it.id, { id: it.id, path: it.path, size: it.size, name: it.name, dir: it.dir });
  updateSelBar();
  renderRules(RULES); if (AI) renderAI(AI);
}

// ---------- Sélection & corbeille ----------
function toggleSel(i, force) {
  const r = S.view[i]; if (!r) return;
  const on = force ?? !S.sel.has(r.id);
  if (on) S.sel.set(r.id, { id: r.id, path: rowPath(r), size: r.size, name: r.name, dir: r.dir, r });
  else S.sel.delete(r.id);
  const el = $('#list').querySelector(`.row[data-i="${i}"]`);
  if (el) { el.classList.toggle('sel', on); el.querySelector('input').checked = on; }
}
function selItems() {
  const all = [...S.sel.values()];
  return all.filter(a => !all.some(b => b !== a && a.path.startsWith(b.path + '/')));
}
function updateSelBar() {
  const items = selItems();
  $('#selbar').hidden = !items.length;
  const total = items.reduce((a, b) => a + b.size, 0);
  $('#selText').innerHTML = `<b>${items.length}</b> élément${items.length > 1 ? 's' : ''} sélectionné${items.length > 1 ? 's' : ''} · <b>${fmtSize(total)}</b>`;
}

let pendingTrash = null;
function askTrash() {
  let items = selItems();
  if (!items.length && S.focus >= 0) { const r = S.view[S.focus]; items = [{ id: r.id, path: rowPath(r), size: r.size, name: r.name, dir: r.dir, r }]; }
  if (!items.length) return;
  items.sort((a, b) => b.size - a.size);
  pendingTrash = items;
  const total = items.reduce((a, b) => a + b.size, 0);
  $('#mTitle').textContent = `Mettre ${items.length > 1 ? items.length + ' éléments' : '« ' + items[0].name + ' »'} à la corbeille ? (${fmtSize(total)})`;
  $('#mList').innerHTML = items.map(it => `<div><code title="${esc(it.path)}">&lrm;${esc(pretty(it.path))}&lrm;</code><b>${fmtSize(it.size)}</b></div>`).join('');
  $('#modal').hidden = false;
  $('#mOk').focus();
}
function closeModal() { $('#modal').hidden = true; pendingTrash = null; $('#list').focus({ preventScroll: true }); }

async function doTrash() {
  const items = pendingTrash; if (!items) return;
  $('#mOk').disabled = true;
  try {
    const r = await post('/api/trash', { items: items.map(i => ({ id: i.id, path: i.path })) });
    for (const d of r.done) S.sel.delete(d.id);
    if (r.done.length) toast(`✓ ${r.done.length} élément${r.done.length > 1 ? 's' : ''} à la corbeille · <b>${fmtSize(r.freed)}</b><br><span class="muted small">Vide la Corbeille pour vraiment libérer l’espace.</span>`, 'ok', 7000);
    for (const f of r.failed) toast(`✗ ${esc(pretty(f.path))}<br><span class="muted small">${esc(f.error)}</span>`, 'err', 9000);
  } catch (e) { toast(esc(e.message), 'err'); }
  $('#mOk').disabled = false;
  closeModal();
  updateSelBar();
  await load();
}

async function action(a, r) {
  try {
    if (a === 'go') { if (S.tab !== 'content') { S.tab = 'content'; for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === 'content'); } return navigate(r.id); }
    if (a === 'ql') return await post('/api/quicklook', { id: r.id });
    if (a === 'reveal') return await post('/api/reveal', { id: r.id });
    if (a === 'open') return await post('/api/open', { id: r.id });
  } catch (e) { toast(esc(e.message), 'err'); }
}
function openRow(r) { if (r.dir && !r.skip) action('go', r); else action('open', r); }

// ---------- Chat IA contextuel ----------
let chatOpen = lsGet('taupe.chatOpen') !== '0';
let CHAT = (() => { try { return JSON.parse(lsGet('taupe.chat') || '[]'); } catch { return []; } })();
let chatBusy = false, chatTimer = null;
const CHAT_IDEAS = ['Qu’est-ce qui prend le plus de place ici ?', 'Qu’est-ce que je peux supprimer sans risque ?',
  'C’est quoi ces dossiers ? À quoi ils servent ?', 'Est-ce que je peux supprimer ma sélection ?'];
const saveChat = () => lsSet('taupe.chat', JSON.stringify(CHAT.slice(-40)));

// Mini-markdown : blocs de code, `code` (→ liens cliquables si chemin connu), **gras**, listes, titres
function mdLite(text, links = []) {
  const L = new Map(links.map(l => [l.text, l]));
  const link = (raw, l) => `<a class="plink" data-id="${l.id}" data-parent="${l.parent}" data-dir="${l.dir ? 1 : 0}" title="Ouvrir dans Taupe · ${fmtSize(l.size)}">${l.dir ? '📁' : '📄'} ${esc(pretty(raw))}</a>`;
  const inline = s => s.split(/`([^`\n]+)`/).map((p, i) => {
    if (i % 2) return L.has(p) ? link(p, L.get(p)) : `<code>${esc(p)}</code>`;
    let h = esc(p);
    for (const [raw, l] of L) if (raw.startsWith('/') || raw.startsWith('~')) h = h.split(esc(raw)).join(link(raw, l));
    return h.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/^#{1,4} (.+)$/gm, '<b>$1</b>')
      .replace(/^\s*[-*] /gm, '• ')
      .replace(/\n/g, '<br>');
  }).join('');
  return text.split(/```[\w-]*\n?([\s\S]*?)```/).map((p, i) => i % 2 ? `<pre><code>${esc(p.trim())}</code></pre>` : inline(p)).join('');
}

function renderChat() {
  const box = $('#chatMsgs');
  if (!CHAT.length && !chatBusy) {
    box.innerHTML = `<div class="chatempty"><p>Pose-moi des questions sur le dossier affiché : je vois les noms, tailles et dates (pas le contenu de tes fichiers).</p>
      ${CHAT_IDEAS.map(q => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
    return;
  }
  box.innerHTML = CHAT.map(m => m.role === 'user'
    ? `<div class="msg user">${esc(m.content).replace(/\n/g, '<br>')}</div>`
    : `<div class="msg bot${m.error ? ' err' : ''}">${m.error ? esc(m.content) : mdLite(m.content, m.links)}
        <div class="msgmeta">${esc(AI_LABEL[m.provider] || m.provider || '')}${m.ms ? ` · ${Math.round(m.ms / 1000)} s` : ''}${m.ctx ? ` · 📁 ${esc(pretty(m.ctx))}` : ''}</div></div>`).join('') +
    (chatBusy ? `<div class="msg bot pending"><span class="spin"></span> <span id="chatWait">Réflexion…</span></div>` : '');
  box.scrollTop = box.scrollHeight;
}
const AI_LABEL = { claude: 'Claude', codex: 'ChatGPT' };

async function sendChat(text) {
  text = text.trim();
  if (!text || chatBusy || S.cur == null) return;
  const provider = $('#chatProv').value || 'claude';
  lsSet('taupe.ai', provider);
  CHAT.push({ role: 'user', content: text });
  chatBusy = true; $('#chatSend').disabled = true; $('#chatInput').value = '';
  renderChat();
  const t0 = Date.now();
  chatTimer = setInterval(() => { const w = $('#chatWait'); if (w) w.textContent = `Réflexion… ${Math.round((Date.now() - t0) / 1000)} s`; }, 1000);
  const ctx = S.data?.path;
  try {
    const r = await post('/api/chat', { id: S.cur, provider, selection: selItems().map(i => i.path),
      messages: CHAT.filter(m => !m.error).map(m => ({ role: m.role, content: m.content })) });
    CHAT.push({ role: 'assistant', content: r.answer, links: r.links, provider, ms: r.ms, ctx });
  } catch (e) {
    const auth = /authenticat|login|logged|expired|401|unauthorized/i.test(e.message);
    CHAT.push({ role: 'assistant', error: true, provider, content: e.message.slice(0, 400) +
      (auth ? `\n\n👉 Ta CLI n’est pas connectée : dans un Terminal, tape « ${provider === 'codex' ? 'codex login' : 'claude » puis « /login'} ». Ou choisis l’autre modèle en bas.` : '') });
  }
  clearInterval(chatTimer);
  chatBusy = false; $('#chatSend').disabled = false;
  saveChat(); renderChat();
  $('#chatInput').focus();
}

function openLink(a) {
  const id = +a.dataset.id, parent = +a.dataset.parent;
  if (S.tab !== 'content') { S.tab = 'content'; for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === 'content'); }
  if (a.dataset.dir === '1') navigate(id); else navigate(parent, id);
}

async function initChat() {
  renderChat();
  try {
    const st = await get('/api/ai');
    let pick = lsGet('taupe.ai') || 'claude';
    if (!st.providers[pick]) pick = Object.keys(st.providers).find(k => st.providers[k]) || pick;
    $('#chatProv').innerHTML = Object.entries(st.labels).map(([k, l]) =>
      `<option value="${k}"${k === pick ? ' selected' : ''}${st.providers[k] ? '' : ' disabled'}>${esc(AI_LABEL[k])}${st.providers[k] ? '' : ' (non installé)'}</option>`).join('');
  } catch {}
}

$('#chatForm').addEventListener('submit', e => { e.preventDefault(); sendChat($('#chatInput').value); });
$('#chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat(e.target.value); }
});
$('#chatMsgs').addEventListener('click', e => {
  const q = e.target.closest('[data-q]'); if (q) return sendChat(q.dataset.q);
  const a = e.target.closest('a.plink'); if (a) { e.preventDefault(); openLink(a); }
});
$('#chatProv').addEventListener('change', e => lsSet('taupe.ai', e.target.value));
$('#chatClear').addEventListener('click', () => { if (chatBusy) return; CHAT = []; saveChat(); renderChat(); });
const setChatOpen = v => { chatOpen = v; lsSet('taupe.chatOpen', v ? '1' : '0'); $('#chat').hidden = !v || $('#app').hidden; if (v) $('#chatInput').focus(); };
$('#chatClose').addEventListener('click', () => setChatOpen(false));
$('#chatToggle').addEventListener('click', () => setChatOpen($('#chat').hidden));

// ---------- Scan ----------
async function startScan(p) {
  try {
    const r = await post('/api/scan', { path: p });
    S.sel.clear(); updateSelBar();
    S.root = { id: r.id, path: p };
    show('app');
    S.tab = 'content'; for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === 'content');
    S.wasScanning = true;
    await navigate(r.id);
    poll(true);
  } catch (e) { toast(esc(e.message), 'err'); }
}

let pollTimer = null, tick = 0, serverDown = false;
async function poll(once) {
  clearTimeout(pollTimer);
  let scanning = false;
  try {
    const st = await get('/api/status');
    if (serverDown) { serverDown = false; toast('Reconnecté', 'ok'); }
    S.status = st; HOME = st.home; renderVol(st.volume);
    const sc = st.scan; scanning = !!sc?.scanning;
    if (st.root) S.root = st.root;
    $('#progress').hidden = !scanning;
    if (scanning) {
      $('#progText').innerHTML = `Analyse de <b>${esc(pretty(sc.target))}</b> — <b>${nf.format(sc.files)}</b> fichiers · <b>${fmtSize(st.root?.size || 0)}</b> · ${(sc.elapsed / 1000).toFixed(0)} s · <span>${esc(pretty(sc.current))}</span>`;
      if (++tick % 3 === 0 && !S.loading && S.cur != null && S.tab === 'content') load();
    }
    if (S.wasScanning && !scanning && sc) {
      if (!sc.cancelled) toast(`✓ Analyse terminée : <b>${nf.format(sc.files)}</b> fichiers en ${(sc.elapsed / 1000).toFixed(1)} s`, 'ok');
      load();
    }
    S.wasScanning = scanning;
  } catch (e) {
    if (!serverDown) { serverDown = true; toast('Serveur injoignable — relance <code>start.command</code>', 'err', 8000); }
  }
  if (!once || scanning) pollTimer = setTimeout(poll, scanning ? 700 : 3000);
}

// ---------- Événements ----------
$('#scanForm').addEventListener('submit', e => { e.preventDefault(); startScan($('#pathInput').value || '~'); });
for (const c of document.querySelectorAll('.card')) c.addEventListener('click', () => startScan(c.dataset.path));
$('#logo').addEventListener('click', e => { e.preventDefault(); if (S.root) { show('app'); navigate(S.root.id); } else show('welcome'); });
$('#cancelBtn').addEventListener('click', () => post('/api/cancel'));
$('#upBtn').addEventListener('click', goUp);
$('#finderBtn').addEventListener('click', () => action('open', { id: S.cur }));
$('#rescanBtn').addEventListener('click', async () => {
  try {
    const r = await post('/api/rescan', { id: S.cur });
    S.sel.clear(); updateSelBar(); S.wasScanning = true;
    await navigate(r.id); poll(true);
  } catch (e) { toast(esc(e.message), 'err'); }
});
$('#crumbs').addEventListener('click', e => { const a = e.target.closest('a[data-id]'); if (a) navigate(+a.dataset.id); });
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b && b.dataset.tab !== S.tab) setTab(b.dataset.tab); });
$('#thead').addEventListener('click', e => {
  const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
  S.sort = S.sort.k === k ? { k, d: -S.sort.d } : { k, d: k === 'name' ? 1 : -1 };
  renderList();
});
$('#filter').addEventListener('input', e => { S.filter = e.target.value; renderList(); });
$('#filter').addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'Enter') { if (e.key === 'Escape') { e.target.value = ''; S.filter = ''; renderList(); } $('#list').focus(); if (S.focus < 0 && S.view.length) setFocus(0); } });

$('#list').addEventListener('click', e => {
  const row = e.target.closest('.row'); if (!row) return;
  const i = +row.dataset.i, r = S.view[i];
  const btn = e.target.closest('button[data-a]');
  if (btn) return action(btn.dataset.a, r);
  if (e.target.matches('input[type=checkbox]')) { toggleSel(i); S.anchor = i; setFocus(i, false); return updateSelBar(); }
  if (e.metaKey || e.ctrlKey) { toggleSel(i); S.anchor = i; }
  else if (e.shiftKey && S.anchor >= 0) { const [a, b] = [Math.min(S.anchor, i), Math.max(S.anchor, i)]; for (let k = a; k <= b; k++) toggleSel(k, true); }
  else S.anchor = i;
  setFocus(i, false); updateSelBar();
});
$('#list').addEventListener('dblclick', e => { const row = e.target.closest('.row'); if (row && !e.target.closest('button,input')) openRow(S.view[+row.dataset.i]); });

// Treemap : clic, survol
const tip = $('#tip');
$('#tm').addEventListener('click', e => {
  const c = e.target.closest('[data-id]'); if (!c) return;
  const it = S.tmIndex.get(+c.dataset.id); if (!it) return;
  if (it.dir) navigate(it.id);
  else if (it.parent === S.cur) { const i = S.view.findIndex(r => r.id === it.id); if (i >= 0) setFocus(i); }
  else navigate(it.parent, it.id);
});
$('#tm').addEventListener('mousemove', e => {
  const c = e.target.closest('[data-id]'); const it = c && S.tmIndex.get(+c.dataset.id);
  if (!it) { tip.hidden = true; return; }
  tip.innerHTML = `<b>${esc(it.name)}</b> — ${fmtSize(it.size)} <span class="muted">(${fmtPct(pct(it.size, S.data.node.size))})</span><small>${it.dir ? 'Clic pour ouvrir' : 'Fichier'}</small>`;
  tip.hidden = false;
  const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8), y = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8);
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
});
$('#tm').addEventListener('mouseleave', () => (tip.hidden = true));
let rz = 0; new ResizeObserver(() => { cancelAnimationFrame(rz); rz = requestAnimationFrame(drawTreemap); }).observe($('#tm'));

$('#suggestView').addEventListener('click', async e => {
  const t = e.target;
  if (t.id === 'aiStart') {
    const provider = $('#aiProv').value; lsSet('taupe.ai', provider);
    try { await post('/api/ai/start', { id: S.cur, provider }); } catch (err) { return toast(esc(err.message), 'err'); }
    return refreshAI();
  }
  if (t.dataset.copy != null) { navigator.clipboard.writeText(t.dataset.copy).then(() => toast('Commande copiée', 'ok', 2000)); return; }
  if (t.hasAttribute('data-selsafe')) return selectItems(AI.job.result.items.filter(x => x.risk === 'safe' && x.action === 'trash'));
  const grp = t.closest('.sgroup');
  if (t.hasAttribute('data-more') && grp) { const k = grp.dataset.key; expanded.has(k) ? expanded.delete(k) : expanded.add(k); return renderRules(RULES); }
  if (t.hasAttribute('data-selall') && grp) return selectItems(RULES.find(g => g.key === grp.dataset.key).items);
  const row = t.closest('.sitem'); if (!row) return;
  const it = SUG.get(+row.dataset.id); if (!it) return;
  const btn = t.closest('button[data-a]');
  if (btn) return action(btn.dataset.a, it);
  const cb = row.querySelector('input');
  if (cb.disabled) return;
  if (t !== cb) cb.checked = !cb.checked;
  if (cb.checked) S.sel.set(it.id, { id: it.id, path: it.path, size: it.size, name: it.name, dir: it.dir });
  else S.sel.delete(it.id);
  for (const r of document.querySelectorAll(`#suggestView .sitem[data-id="${it.id}"]`)) { r.classList.toggle('sel', cb.checked); r.querySelector('input').checked = cb.checked; }
  updateSelBar();
});
$('#suggestView').addEventListener('change', e => { if (e.target.id === 'aiProv') lsSet('taupe.ai', e.target.value); });

$('#typesView').addEventListener('click', e => {
  const x = e.target.closest('[data-ext]'); if (!x || x.dataset.ext.startsWith('(')) return;
  setTab('big'); S.filter = '.' + x.dataset.ext; $('#filter').value = S.filter;
});

$('#selClear').addEventListener('click', () => {
  S.sel.clear(); updateSelBar();
  if (S.tab === 'suggest') { renderRules(RULES); if (AI) renderAI(AI); } else renderList();
});
$('#trashBtn').addEventListener('click', askTrash);
$('#mCancel').addEventListener('click', closeModal);
$('#mOk').addEventListener('click', doTrash);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

document.addEventListener('keydown', e => {
  if (!$('#modal').hidden) {
    if (e.key === 'Escape') closeModal();
    else if (e.key === 'Enter') { e.preventDefault(); doTrash(); }
    return;
  }
  if ($('#app').hidden || e.target.matches('input:not([type=checkbox]), textarea, select')) return;
  const r = S.view[S.focus], meta = e.metaKey || e.ctrlKey;
  const k = e.key;
  if (k === 'ArrowDown' && !meta) { e.preventDefault(); setFocus(Math.min(S.focus + 1, S.view.length - 1)); }
  else if (k === 'ArrowUp' && !meta) { e.preventDefault(); setFocus(Math.max(S.focus - 1, 0)); }
  else if ((k === 'ArrowRight' || k === 'Enter' || (meta && k === 'ArrowDown')) && r) { e.preventDefault(); openRow(r); }
  else if (k === 'ArrowLeft' || (meta && k === 'ArrowUp') || (k === 'Backspace' && !meta)) { e.preventDefault(); goUp(); }
  else if (k === ' ' && r) { e.preventDefault(); action('ql', r); }
  else if ((meta && k === 'Backspace') || k === 'Delete') { e.preventDefault(); askTrash(); }
  else if (meta && k === 'a') { e.preventDefault(); S.view.forEach((_, i) => toggleSel(i, true)); updateSelBar(); }
  else if (k === 'Escape') { S.sel.clear(); renderList(); updateSelBar(); }
  else if (k === '/') { e.preventDefault(); $('#filter').focus(); }
  else if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); setFocus(Math.max(0, Math.min(S.view.length - 1, S.focus + (k === 'PageDown' ? 20 : -20)))); }
  else if (k === 'Home' || k === 'End') { e.preventDefault(); setFocus(k === 'Home' ? 0 : S.view.length - 1); }
});

// ---------- Démarrage ----------
(async () => {
  initChat();
  await poll(true);
  if (S.root) { show('app'); $('#pathInput').value = pretty(S.root.path); await navigate(S.root.id); }
  else show('welcome');
  if (!S.wasScanning) poll();
})();
