'use strict';
// Browser development mode only: in the app the page has no token, Electron adds the header itself
const TOKEN = /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[name=token]'))?.content || '';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const PLATFORM = document.body.dataset.platform || 'darwin', IS_APP = document.body.dataset.app === '1';
const IS_WIN = PLATFORM === 'win32', IS_MAC = PLATFORM === 'darwin';
const SEP = IS_WIN ? '\\' : '/';
const FM = IS_MAC ? 'Finder' : IS_WIN ? t('Explorateur') : t('Fichiers');
const TRASH_KEY = IS_MAC ? '⌘⌫' : t('Suppr'), MOD = IS_MAC ? '⌘' : 'Ctrl+';
const joinPath = (a, b) => (b ? (a.endsWith(SEP) ? a + b : a + SEP + b) : a);

async function api(method, url, body) {
  const headers = { 'x-lang': LANG, 'content-type': 'application/json', ...(TOKEN ? { 'x-token': TOKEN } : {}) };
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
const get = u => api('GET', u), post = (u, b) => api('POST', u, b || {});

// ---------- Formatting ----------
const nf = new Intl.NumberFormat(LOCALE);
const rtf = new Intl.RelativeTimeFormat(LANG, { numeric: 'auto' });
const dec = s => (LANG === 'fr' ? String(s).replace('.', ',') : String(s));
const UNITS = LANG === 'fr' ? ['o', 'Ko', 'Mo', 'Go', 'To', 'Po'] : ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
function fmtSize(b) {
  if (!b) return '0 ' + UNITS[0];
  if (b < 1000) return Math.round(b) + ' ' + UNITS[0];
  let i = 0;
  do { b /= 1000; i++; } while (b >= 1000 && i < UNITS.length - 1);
  return dec(b >= 100 ? Math.round(b) : b.toFixed(1)) + ' ' + UNITS[i];
}
function relTime(sec) {
  if (!sec) return '';
  const d = sec - Date.now() / 1000, a = Math.abs(d);
  for (const [u, s] of /** @type {[Intl.RelativeTimeFormatUnit, number][]} */ ([['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]))
    if (a >= s) return rtf.format(Math.round(d / s), u);
  return t('à l’instant');
}
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const fmtPct = p => (p >= 10 ? Math.round(p) : p >= 0.1 ? dec(p.toFixed(1)) : p > 0 ? '<' + dec('0.1') : '0') + (LANG === 'fr' ? ' %' : '%');
let HOME = '';
const pretty = p => (HOME && (p === HOME || p.startsWith(HOME + SEP)) ? '~' + p.slice(HOME.length) : p);

const EMOJI = {};
for (const [e, list] of Object.entries({
  '🎬': 'mp4 mov m4v mkv avi webm wmv flv mpg mpeg mts', '🖼️': 'jpg jpeg png gif heic heif webp tiff tif bmp raw cr2 cr3 nef arw dng psd svg ico icns sketch fig',
  '🎵': 'mp3 m4a aac wav aiff aif flac ogg opus caf mid', '🗜️': 'zip rar 7z tar gz tgz bz2 xz zst', '💿': 'dmg iso img pkg sparseimage sparsebundle vmdk qcow2 ipa apk xip',
  '📕': 'pdf epub', '📝': 'doc docx pages txt md rtf odt', '📊': 'xls xlsx numbers csv ods', '📽️': 'ppt pptx key', '🗄️': 'db sqlite sqlite3 realm', '📜': 'log',
  '⚙️': 'js mjs cjs ts tsx jsx json py rb go rs swift java kt c h cpp m cs php html css scss vue svelte sh yml yaml toml lock sql',
})) for (const x of list.split(' ')) EMOJI[x] = e;
// Thin-stroke icons (16×16, stroke 1.15) — all in currentColor
const SVG = {
  dir: '<path d="M1.75 4.5c0-.55.45-1 1-1h3.4l1.35 1.4h5.75c.55 0 1 .45 1 1v6.35c0 .55-.45 1-1 1H2.75c-.55 0-1-.45-1-1z"/>',
  file: '<path d="M4.25 1.75h4.9l2.6 2.6v9.9H4.25z"/><path d="M9.15 1.75v2.6h2.6"/>',
  pkg: '<rect x="2.25" y="2.25" width="11.5" height="11.5" rx="3"/><rect x="5.75" y="5.75" width="4.5" height="4.5" rx="1"/>',
  lock: '<rect x="3.25" y="7" width="9.5" height="6.75" rx="1.5"/><path d="M5.25 7V5.1a2.75 2.75 0 0 1 5.5 0V7"/>',
  link: '<rect x="2.25" y="2.25" width="11.5" height="11.5" rx="3"/><path d="M6.25 9.75l3.5-3.5M7 6.25h2.75V9"/>',
  disk: '<rect x="1.75" y="4.25" width="12.5" height="7.5" rx="2"/><path d="M4.5 8h4.5"/><circle cx="11.5" cy="8" r=".6"/>',
  home: '<path d="M2.5 7.1L8 2.75l5.5 4.35v6.15c0 .3-.2.5-.5.5H9.75V9.9h-3.5v3.85H3c-.3 0-.5-.2-.5-.5z"/>',
  apps: '<rect x="2.25" y="2.25" width="4.75" height="4.75" rx="1.3"/><rect x="9" y="2.25" width="4.75" height="4.75" rx="1.3"/><rect x="2.25" y="9" width="4.75" height="4.75" rx="1.3"/><rect x="9" y="9" width="4.75" height="4.75" rx="1.3" stroke-dasharray="1.6 1.4"/>',
  download: '<path d="M8 2.25v7.5M4.9 6.9L8 10l3.1-3.1M2.75 13.5h10.5"/>',
  pick: '<path d="M1.75 4.5c0-.55.45-1 1-1h3.4l1.35 1.4h5.75c.55 0 1 .45 1 1v6.35c0 .55-.45 1-1 1H2.75c-.55 0-1-.45-1-1z"/><path d="M8 7.25v3.5M6.25 9h3.5"/>',
  up: '<path d="M8 13V3.5M4.25 7.25L8 3.5l3.75 3.75"/>',
  refresh: '<path d="M13.25 8a5.25 5.25 0 1 1-1.55-3.7"/><path d="M11.9 1.9v2.6H9.3"/>',
  reveal: '<path d="M9.5 2.5h4v4M13.5 2.5L8 8"/><path d="M11.5 9.5v3.25c0 .4-.35.75-.75.75h-7.5a.75.75 0 0 1-.75-.75v-7.5c0-.4.35-.75.75-.75H6.5"/>',
  eye: '<path d="M1.75 8S4 3.75 8 3.75 14.25 8 14.25 8 12 12.25 8 12.25 1.75 8 1.75 8z"/><circle cx="8" cy="8" r="1.9"/>',
  chevron: '<path d="M6.25 3.75L10.5 8l-4.25 4.25"/>',
  chat: '<path d="M2.25 3.75c0-.55.45-1 1-1h9.5c.55 0 1 .45 1 1v6.5c0 .55-.45 1-1 1H7l-3 2.25v-2.25h-.75c-.55 0-1-.45-1-1z"/>',
  gear: '<circle cx="8" cy="8" r="2"/><path d="M8 1.75v1.6M8 12.65v1.6M14.25 8h-1.6M3.35 8h-1.6M12.4 3.6l-1.15 1.15M4.75 11.25L3.6 12.4M12.4 12.4l-1.15-1.15M4.75 4.75L3.6 3.6"/>',
  reset: '<path d="M2.75 8a5.25 5.25 0 1 0 1.55-3.7"/><path d="M4.1 1.9v2.6h2.6"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  sparkle: '<path d="M8 1.75l1.4 4.85L14.25 8 9.4 9.4 8 14.25 6.6 9.4 1.75 8 6.6 6.6z"/>',
  trash: '<path d="M2.75 4.25h10.5M6.25 4.25V2.75h3.5v1.5M4 4.25l.65 9.25h6.7L12 4.25"/>',
  search: '<circle cx="7" cy="7" r="4.25"/><path d="M10.25 10.25l3.5 3.5"/>',
};
const svg = k => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG[k] || SVG.file}</svg>`;
function iconKey(r) {
  if (r.dir) return r.err ? 'lock' : r.skip ? 'disk' : r.pkg ? 'pkg' : 'dir';
  return r.link ? 'link' : 'file';
}
const iconCls = r => ({ dir: 'dir', lock: 'lock', disk: 'file', pkg: 'pkg', link: 'file', file: 'file' })[iconKey(r)];
const icon = r => svg(iconKey(r));

// ---------- State ----------
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

// ---------- Views ----------
function show(which) {
  $('#welcome').hidden = which !== 'welcome';
  $('#app').hidden = which !== 'app';
  $('#chat').hidden = which !== 'app' || !chatOpen;
  $('#chatToggle').hidden = which !== 'app';
}

function renderVol(v) {
  if (!v) return ($('#vol').innerHTML = '');
  const used = v.total - v.free;
  $('#vol').innerHTML = `<div>${t('<b>{free}</b> libres <span class="muted">sur {total}</span>', { free: fmtSize(v.free), total: fmtSize(v.total) })}</div><div class="vbar"><i style="width:${pct(used, v.total).toFixed(1)}%"></i></div>`;
}

function renderHeader() {
  const d = S.data, n = d.node;
  $('#crumbs').innerHTML = d.crumbs.map((c, i) =>
    `<a data-id="${c.id}" title="${esc(i ? c.name : c.name)}">${esc(i ? c.name : pretty(c.name))}</a>`).join('<span class="sep">›</span>');
  $('#curName').textContent = d.crumbs.length > 1 ? n.name : d.path === HOME ? t('Dossier perso') : (pretty(n.name).split(SEP).filter(Boolean).pop() || n.name);
  $('#curName').title = d.path;
  let meta = `${fmtSize(n.size)} · ${tn(n.count, '{n} fichier', '{n} fichiers')}`;
  if (S.root && S.cur === S.root.id && S.status?.volume && S.root.path === '/') {
    const used = S.status.volume.total - S.status.volume.free;
    meta += ` · <span title="${esc(t('Différence entre l’espace utilisé et ce qui est visible : système, snapshots APFS (Time Machine), espace purgeable, fichiers d’autres utilisateurs non lisibles.'))}">${t('volume utilisé : {x}', { x: fmtSize(used) })} ⓘ</span>`;
  }
  const errs = S.status?.scan?.errors;
  if (errs) meta += ` · <span class="tag" title="${esc(t('Ces dossiers n’ont pas pu être lus (droits d’accès).') + ' ' + HINT.replace(/<[^>]+>/g, ''))}">${tn(errs, '⚠ {n} dossier inaccessible', '⚠ {n} dossiers inaccessibles')}</span>`;
  $('#curMeta').innerHTML = meta;
  $('#upBtn').disabled = d.crumbs.length < 2;
  $('#chatCtx').textContent = pretty(d.path);
  $('#chatCtx').title = t('L’assistant voit ce dossier : {p}', { p: d.path });
}

const COLS = [['', ''], ['name', 'Nom'], ['size', 'Taille'], ['pct', '%'], ['count', 'Fichiers'], ['mtime', 'Modifié']];
function renderThead() {
  $('#thead').innerHTML = COLS.map(([k, l], i) => {
    if (!k) return '<span></span>';
    const arrow = S.sort.k === k ? (S.sort.d < 0 ? ' ↓' : ' ↑') : '';
    return `<span data-k="${k === 'pct' ? 'size' : k}" class="${i >= 2 ? 'r' : ''} col-${k}">${t(l)}${arrow}</span>`;
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
    v = [...v].sort((a, b) => k === 'name' ? d * a.name.localeCompare(b.name, LANG, { numeric: true, sensitivity: 'base' }) : d * ((a[k] || 0) - (b[k] || 0)));
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
    const tags = (r.err ? `<span class="tag">${t('accès refusé')}</span>` : '') + (r.skip ? `<span class="tag">${t('autre volume')}</span>` : '');
    const barW = S.tab === 'content' ? pct(r.size, parent) : pct(r.size, max);
    html += `<div class="row${r.dir ? ' dir' : ''}${sel ? ' sel' : ''}${tall ? ' tall' : ''}" data-i="${i}"${r.tip ? ` title="${esc(r.tip)}"` : ''}>
      <span><input type="checkbox"${sel ? ' checked' : ''}></span>
      <span class="nm"><span class="ic ${iconCls(r)}">${icon(r)}</span><span class="t">${esc(r.name)}${sub ? `<small>${sub}</small>` : ''}</span>${tags}
        <span class="ra"><button data-a="ql" title="${t('Aperçu (Espace)')}">${svg('eye')}</button><button data-a="reveal" title="${t('Afficher dans le {fm}', { fm: FM })}">${svg('reveal')}</button>${r.dir && !r.skip ? `<button data-a="go" title="${t('Ouvrir (→)')}">${svg('chevron')}</button>` : ''}</span></span>
      <span class="sz"><span class="bar"><i style="width:${Math.max(barW, 0.3).toFixed(2)}%"></i></span><b>${fmtSize(r.size)}</b></span>
      <span class="pc r col-pc">${fmtPct(pct(r.size, parent))}</span>
      <span class="ct r col-ct">${r.dir ? nf.format(r.count) : ''}</span>
      <span class="mt r col-mt" title="${r.mtime ? new Date(r.mtime * 1000).toLocaleString(LOCALE) : ''}">${relTime(r.mtime)}</span>
    </div>`;
  });
  if (!S.view.length) html = `<div class="empty">${S.filter ? t('Aucun résultat pour ce filtre') : S.tab === 'hogs' ? t('Rien de connu à nettoyer ici')
    : S.data.node.err ? `${t('Accès refusé à ce dossier.')}<br><span class="small">${HINT || t('Vérifie les autorisations du système.')}</span>` : t('Dossier vide')}</div>`;
  if (S.rest && !S.filter) html += `<div class="rest">${t('+ {n} autres éléments plus petits · {size}', { n: nf.format(S.rest.n), size: fmtSize(S.rest.size) })}</div>`;
  $('#list').innerHTML = html;
  $('#listInfo').textContent = tn(S.view.length, '{n} élément', '{n} éléments') + (S.tab === 'big' ? t(' — les plus gros fichiers de ce dossier et sous-dossiers') : S.tab === 'hogs' ? t(' — caches & dossiers régénérables connus') : '');
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

// ---------- Loading ----------
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
    if (/introuvable|not found/i.test(e.message) && S.root && id !== S.root.id) { S.cur = S.root.id; S.loading = false; return load(); }
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

// Highlights the button of the current tab
const markTab = tab => { for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', /** @type {HTMLElement} */ (b).dataset.tab === tab); };
function setTab(tab) {
  S.tab = tab;
  markTab(tab);
  S.sort = { k: 'size', d: -1 }; S.focus = -1; $('#list').scrollTop = 0;
  load();
}

// ---------- Treemap ----------
// Palette: alternating oranges and blacks/grays (TM_LIGHT = light background → black text)
const TM_COLORS = ['#FF5F00', '#1A1A1A', '#FF8B3D', '#3D3D3B', '#C24800', '#5C5C59', '#FFB27A', '#262625', '#8F3600', '#7A7A76'];
const TM_LIGHT = [true, false, true, false, false, false, true, false, false, false];
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
  } catch { /* ignored */ }
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
    const base = TM_COLORS[i % TM_COLORS.length], light = TM_LIGHT[i % TM_COLORS.length];
    const bg = r.dir ? base : `color-mix(in srgb, ${base} 55%, #8a8a86)`;
    const lbl = c.w > 46 && c.h > 18;
    html += `<div class="cell" data-id="${r.id}" style="left:${px(c.x)};top:${px(c.y)};width:${px(c.w)};height:${px(c.h)};background:${bg};--ink:${light ? 'rgba(11,11,11,.88)' : 'rgba(255,255,255,.92)'}">`;
    if (lbl) html += `<div class="lbl">${esc(r.name)}<small>${fmtSize(r.size)}</small></div>`;
    if (r.children && c.w > 24 && c.h > 30) {
      const pad = 3, top = lbl ? 18 : pad;
      squarify(r.children, pad, top, c.w - pad * 2 - 2, c.h - top - pad - 2).forEach((s, j) => {
        S.tmIndex.set(s.it.id, { ...s.it, parent: r.id });
        if (s.w < 3 || s.h < 3) return;
        const k = 62 + ((j * 9) % 30);
        html += `<div class="sub" data-id="${s.it.id}" style="left:${px(s.x)};top:${px(s.y)};width:${px(s.w)};height:${px(s.h)};background:color-mix(in srgb, ${base} ${s.it.dir ? k : k - 25}%, ${light ? '#ffffff' : '#000000'})">${s.w > 44 && s.h > 14 ? `<div class="lbl">${esc(s.it.name)}</div>` : ''}</div>`;
      });
    }
    html += '</div>';
  });
  el.innerHTML = html || `<div class="empty">${t('Rien à afficher')}</div>`;
  if (S.focus >= 0) highlightTm(S.view[S.focus]?.id);
}

function highlightTm(id) {
  const tm = $('#tm');
  tm.querySelector('.cell.hl')?.classList.remove('hl');
  if (id != null) tm.querySelector(`.cell[data-id="${id}"]`)?.classList.add('hl');
}

// ---------- Types ----------
const CAT_STYLE = { video: ['', '#FF5F00'], image: ['', '#FF8B3D'], audio: ['', '#C24800'], archive: ['', '#FFB27A'], doc: ['', '#8F3600'],
  code: ['', '#3D3D3B'], data: ['', '#7A7A76'], app: ['', '#1A1A1A'], dev: ['', '#5C5C59'], other: ['', '#B5B5B0'] };
function renderTypes(t) {
  const total = S.data.node.size || 1;
  const maxC = t.categories[0]?.size || 1, maxE = t.extensions[0]?.size || 1;
  const cat = t.categories.map(c => {
    const col = (CAT_STYLE[c.key] || ['📄', '#888'])[1];
    return `<div class="trow"><span class="tdot" style="background:${col}"></span><span>${esc(t(c.label))}</span><span class="bar"><i style="width:${pct(c.size, maxC)}%;background:${col}"></i></span><b>${fmtSize(c.size)}</b><span class="muted small r">${fmtPct(pct(c.size, total))}</span></div>`;
  }).join('');
  const ext = t.extensions.map(x =>
    `<div class="trow" style="cursor:pointer" data-ext="${esc(x.ext)}" title="${esc(t('Voir les plus gros fichiers .{ext}', { ext: x.ext }))}"><span class="ic file">${svg('file')}</span><span>${x.ext.startsWith('(') ? esc(t(x.ext)) : '.' + esc(x.ext)}</span><span class="bar"><i style="width:${pct(x.size, maxE)}%;background:var(--orange)"></i></span><b>${fmtSize(x.size)}</b><span class="muted small">${t('{n} fich.', { n: nf.format(x.count) })}</span></div>`).join('');
  $('#typesView').innerHTML = `<div><h3>${t('Par catégorie')}</h3>${cat || `<p class="muted">${t('Vide')}</p>`}
    <p class="muted small">${esc(t('« Applications » = contenu des .app · « Dépendances & builds dev » = node_modules, .git, .next, venv, DerivedData…'))}</p></div>
    <div><h3>${t('Par extension')} <span class="muted small">${esc(t('(hors apps & dépendances — clique pour voir les fichiers)'))}</span></h3>${ext}</div>`;
}

// ---------- Suggestions (rules + AI) ----------
const RISK = { safe: ['Sans risque', 'ok'], check: ['À vérifier', 'warn'], careful: ['Prudence', 'bad'] };
const SUG = new Map();           // id → displayed element (for selection / actions)
let RULES = [], AI = null, aiTimer = null;
const expanded = new Set();
const riskBadge = r => { const [l, c] = RISK[r] || RISK.check; return `<span class="risk ${c}">${t(l)}</span>`; };
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

function sugItem(it, { extra = '', noSel = false } = {}) {
  SUG.set(it.id, it);
  const sel = S.sel.has(it.id);
  return `<div class="sitem${sel ? ' sel' : ''}" data-id="${it.id}">
    <input type="checkbox"${sel ? ' checked' : ''}${noSel ? ` disabled title="${t('Pas de mise à la corbeille directe pour celui-ci')}"` : ''}>
    <span class="ic ${iconCls(it)}">${icon(it)}</span>
    <div class="sbody">
      <div class="sname">${esc(it.title || it.name)}</div>
      <div class="spath" title="${esc(it.path)}">${esc(pretty(it.path))}${it.note ? ` <span class="muted">· ${esc(it.note)}</span>` : ''}</div>
      ${extra}
    </div>
    <span class="sacts"><button data-a="reveal" title="${t('Afficher dans le {fm}', { fm: FM })}">${svg('reveal')}</button>${it.dir ? `<button data-a="go" title="${t('Ouvrir dans Taupe')}">${svg('chevron')}</button>` : ''}</span>
    <b class="ssize">${fmtSize(it.size)}</b>
  </div>`;
}

function renderRules(groups) {
  RULES = groups;
  const total = groups.reduce((a, g) => a + g.total, 0);
  const html = groups.map(g => {
    const all = expanded.has(g.key), shown = all ? g.items : g.items.slice(0, 5);
    return `<div class="sgroup" data-key="${g.key}">
      <div class="shead">${riskBadge(g.risk)}<h3>${esc(g.title)}</h3><span class="muted small">${tn(g.n, '{n} élément', '{n} éléments')}</span>
        <span class="grow"></span><b>${fmtSize(g.total)}</b><button class="btn ghost sm" data-selall>${t('Tout sélectionner')}</button></div>
      <p class="muted small swhy">${esc(g.why)}</p>
      <div class="sitems">${shown.map(it => sugItem(it)).join('')}</div>
      ${g.items.length > 5 ? `<button class="more" data-more>${all ? t('Réduire') : t('Voir les {n} autres', { n: g.items.length - 5 })}</button>` : ''}
    </div>`;
  }).join('');
  $('#ruleGroups').innerHTML = `<h2 class="stitle">${t('Repéré automatiquement')} <span class="muted">· ≈ ${fmtSize(total)}</span></h2>` +
    (html || `<p class="muted">${t('Rien de suspect selon les règles automatiques. Essaie l’analyse IA.')}</p>`);
}

function renderAI(st) {
  AI = st;
  const j = st.job;
  PROVS = st.providers;
  const running = j.status === 'running';
  const opts = providerOptions();
  let body;
  if (running) {
    body = `<div class="aistate"><span class="spin"></span> ${t('{p} analyse <b>{path}</b>… {s} s <span class="muted">(compte 1 à 2 min)</span>', { p: esc(AI_LABEL[j.provider] || j.provider), path: esc(pretty(j.target)), s: Math.round(j.elapsed / 1000) })}</div>`;
  } else if (j.status === 'error') {
    const auth = /authenticat|login|logged|expired|401|unauthorized/i.test(j.error);
    body = `<div class="aierr"><b>${t('L’analyse a échoué.')}</b> <span class="muted small">${esc(j.error.slice(0, 400))}</span>
      ${auth ? `<p>${t('Ton compte {p} n’est pas connecté.', { p: esc(AI_LABEL[j.provider]) })}</p>${connectBlock(j.provider)}` : ''}</div>`;
  } else if (j.status === 'done') {
    const items = j.result.items;
    const safe = items.filter(x => x.risk === 'safe' && x.action === 'trash');
    body = `<p class="aisum">${esc(j.result.summary)}</p>
      <div class="aibar"><span class="muted small">${esc(AI_LABEL[j.provider] || j.provider)} · ${esc(pretty(j.target))} · ${Math.round(j.elapsed / 1000)} s · ${tn(items.length, '{n} suggestion', '{n} suggestions')}</span>
      <span class="grow"></span>${safe.length ? `<button class="btn ghost sm" data-selsafe>${t('Sélectionner les {n} « sans risque » ({size})', { n: safe.length, size: fmtSize(safe.reduce((a, b) => a + b.size, 0)) })}</button>` : ''}</div>
      <div class="sitems">${items.map(it => sugItem(it, {
        noSel: it.action === 'command' || it.protected,
        extra: `<div class="sreason">${riskBadge(it.risk)} ${esc(it.reason)}</div>` +
          (it.command ? `<div class="scmdwarn">${t('Commande proposée par l’IA : vérifie-la avant de l’exécuter.')}</div><div class="scmd"><code>${esc(it.command)}</code><button class="btn ghost sm" data-copy="${esc(it.command)}">${t('Copier')}</button></div>` : ''),
      })).join('') || `<p class="muted">${t('Aucune suggestion exploitable.')}</p>`}</div>`;
  } else {
    body = !anyReady() ? `<p class="muted small">${t('Connecte ton abonnement Claude ou ChatGPT pour obtenir une liste triée de ce que tu peux supprimer, avec le niveau de risque. L’IA ne voit que les noms, tailles et dates — jamais le contenu de tes fichiers.')}</p>${connectBlock()}` : `<p class="muted small">${t('L’IA voit les noms, tailles et dates des éléments les plus lourds — <b>jamais le contenu de tes fichiers</b> — et propose quoi supprimer, avec le niveau de risque. Rien n’est supprimé sans toi.')}</p>`;
  }
  $('#aiPanel').innerHTML = `<div class="aihead"><h2 class="stitle">${t('Analyse IA')}</h2><span class="grow"></span>
      ${anyReady() ? `<select id="aiProv"${running ? ' disabled' : ''}>${opts}</select>
      <button class="btn ghost sm" data-accounts>${t('Comptes')}</button>
      <button class="btn primary sm" id="aiStart"${running ? ' disabled' : ''}>${j.status === 'done' ? t('Relancer') : t('Analyser ce dossier')}</button>`
      : ''}</div>${body}`;
  clearTimeout(aiTimer);
  if (running && S.tab === 'suggest') aiTimer = setTimeout(refreshAI, 1500);
}

async function refreshAI() {
  try {
    const prev = AI?.job?.status;
    const st = await get('/api/ai');
    if (S.tab !== 'suggest') return;
    renderAI(st);
    if (prev === 'running' && st.job.status === 'done') toast(t('Analyse IA terminée : {n} suggestions', { n: st.job.result.items.length }), 'ok');
  } catch (e) { toast(esc(e.message), 'err'); }
}

function selectItems(items) {
  for (const it of items) S.sel.set(it.id, { id: it.id, path: it.path, size: it.size, name: it.name, dir: it.dir });
  updateSelBar();
  renderRules(RULES); if (AI) renderAI(AI);
}

// ---------- Selection & Trash ----------
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
  return all.filter(a => !all.some(b => b !== a && a.path.startsWith(b.path + SEP)));
}
function updateSelBar() {
  const items = selItems();
  $('#selbar').hidden = !items.length;
  document.body.classList.toggle('has-sel', items.length > 0);
  const total = items.reduce((a, b) => a + b.size, 0);
  $('#selText').innerHTML = tn(items.length, '<b>{n}</b> élément sélectionné · <b>{size}</b>', '<b>{n}</b> éléments sélectionnés · <b>{size}</b>', { size: fmtSize(total) });
}

let pendingTrash = null, strongTrash = false;
function askTrash() {
  let items = selItems();
  if (!items.length && S.focus >= 0) { const r = S.view[S.focus]; items = [{ id: r.id, path: rowPath(r), size: r.size, name: r.name, dir: r.dir, r }]; }
  if (!items.length) return;
  items.sort((a, b) => b.size - a.size);
  openTrashModal(items, false);
}
// strong: app data (~/Library, AppData) refused by the engine without an explicit second confirmation
function openTrashModal(items, strong) {
  pendingTrash = items; strongTrash = strong;
  const total = items.reduce((a, b) => a + b.size, 0);
  $('#mTitle').textContent = items.length > 1 ? t('Mettre {n} éléments à la corbeille ? ({size})', { n: items.length, size: fmtSize(total) }) : t('Mettre « {name} » à la corbeille ? ({size})', { name: items[0].name, size: fmtSize(total) });
  $('#mList').innerHTML = items.map(it => `<div><code title="${esc(it.path)}">&lrm;${esc(pretty(it.path))}&lrm;</code><b>${fmtSize(it.size)}</b></div>`).join('');
  $('#mWarn').hidden = $('#mStrong').hidden = !strong;
  $('#mStrongOk').checked = false;
  $('#mOk').disabled = strong;
  $('#modal').hidden = false;
  (strong ? $('#mStrongOk') : $('#mOk')).focus();
}
function closeModal() { $('#modal').hidden = true; pendingTrash = null; $('#list').focus({ preventScroll: true }); }

async function doTrash() {
  const items = pendingTrash, strong = strongTrash; if (!items || $('#mOk').disabled) return;
  $('#mOk').disabled = true;
  let again = [];
  try {
    const r = await post('/api/trash', { items: items.map(i => ({ id: i.id, path: i.path })), confirmSensitive: strong ? items.map(i => i.path) : [] });
    for (const d of r.done) S.sel.delete(d.id);
    again = r.failed.filter(f => f.needsConfirm);
    r.failed = r.failed.filter(f => !f.needsConfirm);
    if (r.done.length) toast(`${tn(r.done.length, '✓ {n} élément à la corbeille · <b>{size}</b>', '✓ {n} éléments à la corbeille · <b>{size}</b>', { size: fmtSize(r.freed) })}<br><span class="muted small">${t('Vide la Corbeille pour vraiment libérer l’espace.')}</span>`, 'ok', 7000);
    for (const f of r.failed) toast(`✗ ${esc(pretty(f.path))}<br><span class="muted small">${esc(f.error)}</span>`, 'err', 9000);
  } catch (e) { toast(esc(e.message), 'err'); }
  $('#mOk').disabled = false;
  closeModal();
  updateSelBar();
  await load();
  if (again.length) { const byPath = new Map(items.map(i => [i.path, i])); openTrashModal(again.map(f => byPath.get(f.path) || f), true); }
}

async function action(a, r) {
  try {
    if (a === 'go') { if (S.tab !== 'content') { S.tab = 'content'; markTab('content'); } return navigate(r.id); }
    if (a === 'ql') return await post('/api/quicklook', { id: r.id });
    if (a === 'reveal') return await post('/api/reveal', { id: r.id });
    if (a === 'open') return await post('/api/open', { id: r.id });
  } catch (e) { toast(esc(e.message), 'err'); }
}
function openRow(r) { if (r.dir && !r.skip) action('go', r); else action('open', r); }

// ---------- Contextual AI chat ----------
let chatOpen = lsGet('taupe.chatOpen') !== '0';
let CHAT = (() => { try { return JSON.parse(lsGet('taupe.chat') || '[]').map(m => m.pending ? { ...m, pending: false, error: true, content: t('Interrompu.') } : m); } catch { return []; } })();
let chatBusy = false;
const CHAT_IDEAS = ['Qu’est-ce qui prend le plus de place ici ?', 'Trouve tous les node_modules et sélectionne-les',
  'Montre-moi mes plus gros fichiers', 'Supprime les vieux installeurs .dmg', 'C’est quoi ces dossiers ?'];
const saveChat = () => lsSet('taupe.chat', JSON.stringify(CHAT.slice(-40)));

// Mini-markdown: code blocks, `code` (→ clickable links if the path is known), **bold**, lists, headings
function mdLite(text, links = []) {
  const L = new Map(links.map(l => [l.text, l]));
  const link = (raw, l) => `<a class="plink" data-id="${l.id}" data-parent="${l.parent}" data-dir="${l.dir ? 1 : 0}" title="${t('Ouvrir dans Taupe · {size}', { size: fmtSize(l.size) })}">${esc(pretty(raw))}</a>`;
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
    box.innerHTML = PROVS && !Object.values(PROVS).some(ready)
      ? `<div class="onboard"><b>${t('Connecte ton IA')}</b>
          <p>${t('Pose des questions sur tes dossiers avec ton abonnement Claude ou ChatGPT. Pas de clé API, pas de frais en plus.')}</p>
          ${connectBlock()}</div>`
      : `<div class="chatempty"><p>${t('Demande-moi d’explorer, de trouver ou de faire le ménage dans le dossier affiché. Je vois les noms, tailles et dates — pas le contenu de tes fichiers — et je te demande toujours avant de supprimer.')}</p>
          ${CHAT_IDEAS.map(q => t(q)).map(q => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
    return;
  }
  const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  box.innerHTML = CHAT.map((m, mi) => m.role === 'user'
    ? `<div class="msg user">${esc(m.content).replace(/\n/g, '<br>')}</div>`
    : `<div class="msg bot${m.error ? ' err' : ''}">
        ${m.events?.length ? `<div class="acts">${m.events.map(e => renderAct(e, m)).join('')}</div>` : ''}
        ${m.pending && !m.events?.some(e => e.status === 'running' || e.status === 'pending' || e.status === 'trashing')
          ? `<div class="act running think"><i class="dot"></i><span class="lbl">${m.events?.length ? t('Réfléchit…') : t('Lit le dossier et réfléchit…')}</span></div>` : ''}
        ${m.pending ? '' : m.error ? esc(m.content) : mdLite(m.content || '', m.links)}
        ${m.pending ? '' : `<div class="msgmeta">${esc(AI_LABEL[m.provider] || m.provider || '')}${m.ms ? ` · ${Math.round(m.ms / 1000)} s` : ''}${m.ctx ? ` · <span title="${esc(m.ctx)}">${esc(short(m.ctx))}</span>` : ''}</div>`}
      </div>`).join('');
  for (const c of box.querySelectorAll('.tcard[data-card]')) updateTrashCard(c);
  if (stick) box.scrollTop = box.scrollHeight;
}
const AI_LABEL = { claude: 'Claude', codex: 'ChatGPT', demo: t('Démo') };

// An AI action, animated while it is in progress
const q = s => (LANG === 'fr' ? `« ${esc(s)} »` : `“${esc(s)}”`);
// Short readable path (last 2 segments), full path on hover
const short = p => { const parts = String(p).split(SEP).filter(Boolean); return (parts.length > 2 ? '…' + SEP : (p.startsWith(SEP) ? SEP : '')) + parts.slice(-2).join(SEP); };
const where = p => `<span class="ap" title="${esc(p)}">${esc(short(p))}</span>`;
const relTo = (base, p) => (base && p.startsWith(base.endsWith(SEP) ? base : base + SEP) ? p.slice(base.length).replace(/^[\\/]/, '') : short(p));
const TRASH_OFF = new Map(); // items unchecked in a confirmation card (key chat:event)
const TRASH_ACK = new Set(); // cards whose reinforced confirmation (app data) is ticked
function renderAct(e, m) {
  const run = e.status === 'running', k = `act ${e.type} ${run ? 'running' : e.status}`;
  const line = (label, extra = '') => `<div class="${k}"><i class="dot"></i><span class="lbl">${label}</span>${extra}</div>`;
  const rel = p => relTo(m.ctx, p);
  const top = e.top?.length ? `<div class="asub">${e.top.map(p => esc(rel(p))).join(' · ')}</div>` : '';
  switch (e.type) {
    case 'search': return line(run ? t('Recherche {q} dans {where}…', { q: q(e.query), where: where(e.folder) }) : tn(e.count, 'Recherche {q} — {n} résultat', 'Recherche {q} — {n} résultats', { q: q(e.query) }), run ? '<div class="scanbar"></div>' : top);
    case 'big': return line(run ? t('Repère les plus gros fichiers de {where}…', { where: where(e.folder) }) : t('Plus gros fichiers de {where}', { where: where(e.folder) }), run ? '<div class="scanbar"></div>' : top);
    case 'list': return line(run ? t('Ouvre et lit {where}…', { where: where(e.path) }) : t('Lit {where} — {n} éléments', { where: where(e.path), n: e.count }), run ? '<div class="scanbar"></div>' : '');
    case 'open': return line(t('Affiche {where}', { where: where(e.path) }));
    case 'select': return line(tn(e.items.length, 'Sélectionne {n} élément · {size}', 'Sélectionne {n} éléments · {size}', { size: fmtSize(e.total) }),
      `<div class="asub">${e.items.slice(0, 4).map(x => esc(rel(x.path))).join(' · ')}${e.items.length > 4 ? ` · +${e.items.length - 4}` : ''}</div>`);
    case 'trash': {
      if (e.status === 'pending') {
        const key = `${m.chat}:${e.i}`;
        if (!TRASH_OFF.has(key)) TRASH_OFF.set(key, new Set(e.items.filter(x => x.sensitive).map(x => x.path))); // app data: unchecked at first
        const off = TRASH_OFF.get(key);
        const rows = e.items.map(x => `<label class="titem${x.sensitive ? ' tsens' : ''}"><input type="checkbox" data-tpick="${key}" data-path="${esc(x.path)}"${x.sensitive ? ' data-sens="1"' : ''}${off.has(x.path) ? '' : ' checked'}>
          <span title="${esc(x.path)}">${esc(rel(x.path))}</span>${x.sensitive ? `<i class="tsenstag">${t('données d’app')}</i>` : ''}<b>${fmtSize(x.size)}</b></label>`).join('');
        return `<div class="act trash pending"><div class="tcard" data-card="${key}">
          <div class="thead2"><b class="tcount"></b><b class="tsize"></b></div>
          ${e.reason ? `<p class="treason">${esc(e.reason)}</p>` : ''}
          ${e.items.length > 1 ? `<div class="ttools"><button class="linkbtn" data-tall="${key}" data-on="1">${t('Tout cocher')}</button><button class="linkbtn" data-tall="${key}" data-on="0">${t('Tout décocher')}</button></div>` : ''}
          <div class="tlist">${rows}</div>
          ${e.items.some(x => x.sensitive) ? `<label class="tstrong" hidden><input type="checkbox" data-tstrong="${key}"${TRASH_ACK.has(key) ? ' checked' : ''}> ${t('Données d’applications cochées : j’ai vérifié et je veux vraiment les supprimer')}</label>` : ''}
          <div class="tbtns"><button class="btn danger sm tgo" data-confirm="${e.i}" data-chat="${m.chat}" data-accept="1"></button>
          <button class="btn sm" data-confirm="${e.i}" data-chat="${m.chat}" data-accept="0">${t('Non')}</button></div></div></div>`;
      }
      if (e.status === 'trashing') return line(tn(e.chosen ?? e.items.length, 'Met {n} élément à la corbeille…', 'Met {n} éléments à la corbeille…'), '<div class="scanbar"></div>');
      if (e.status === 'done') return line(`${tn(e.done, '{n} élément à la corbeille', '{n} éléments à la corbeille')} · ${t('<b class="freed">{size}</b> libérés', { size: fmtSize(e.freed) })}${e.kept?.length ? ` · ${tn(e.kept.length, '{n} gardé', '{n} gardés')}` : ''}${e.failed?.length ? ` · ${t('{n} échec(s)', { n: e.failed.length })}` : ''}`);
      return line(e.status === 'refused' ? t('Suppression refusée') : t('Suppression non confirmée'));
    }
  }
  return '';
}

// Effects of an action on the UI (only once, when it arrives or finishes)
function applyAct(e, prev) {
  if (e.type === 'open' && !prev) {
    if (S.tab !== 'content') setTabSilently('content');
    navigate(e.id).then(() => flash(document.querySelector('.summary h2')));
  }
  if (e.type === 'select' && !prev) {
    for (const x of e.items) S.sel.set(x.id, { id: x.id, path: x.path, size: x.size, name: x.name, dir: x.dir });
    updateSelBar();
    if (S.tab === 'content' || S.tab === 'big' || S.tab === 'hogs') renderList();
    for (const x of e.items) flash(document.querySelector(`.row[data-i="${S.view.findIndex(r => r.id === x.id)}"]`));
  }
  if (e.type === 'trash' && e.status === 'done' && prev?.status !== 'done') {
    for (const x of e.items) S.sel.delete(x.id);
    updateSelBar(); load();
    toast(`${tn(e.done, '{n} élément à la corbeille', '{n} éléments à la corbeille')} · <b>${t('{size} libérés', { size: fmtSize(e.freed) })}</b>`, 'ok');
  }
}
function updateTrashCard(card) {
  const boxes = [...card.querySelectorAll('input[data-tpick]')], on = boxes.filter(b => b.checked);
  const sizes = new Map(); for (const m of CHAT) for (const e of m.events || []) if (e.type === 'trash') for (const x of e.items) sizes.set(x.path, x.size);
  const total = on.reduce((t, b) => t + (sizes.get(b.dataset.path) || 0), 0);
  card.querySelector('.tcount').textContent = boxes.length > 1 ? t('Mettre à la corbeille {on} sur {n} éléments ?', { on: on.length, n: boxes.length }) : t('Mettre cet élément à la corbeille ?');
  card.querySelector('.tsize').textContent = fmtSize(total);
  const go = card.querySelector('.tgo');
  go.textContent = on.length > 1 ? t('Mettre {n} éléments à la corbeille', { n: on.length }) : t('Mettre à la corbeille');
  const strong = card.querySelector('.tstrong'), sens = on.some(b => b.dataset.sens);
  if (strong) strong.hidden = !sens;
  go.disabled = !on.length || (sens && !strong.querySelector('input').checked);
}
const flash = el => { if (!el) return; el.classList.remove('ai-flash'); void el.offsetWidth; el.classList.add('ai-flash'); };
function setTabSilently(tab) { S.tab = tab; markTab(tab); }

let chatPoll = null;
async function sendChat(text) {
  text = text.trim();
  if (!text || chatBusy || S.cur == null) return;
  const provider = $('#chatProv').value || 'claude';
  lsSet('taupe.ai', provider);
  const history = CHAT.filter(m => !m.error && !m.pending && m.content).map(m => ({ role: m.role, content: m.content }));
  CHAT.push({ role: 'user', content: text });
  const msg = { role: 'assistant', provider, pending: true, events: [], ctx: S.data?.path };
  CHAT.push(msg);
  setBusy(true); $('#chatInput').value = '';
  renderChat();
  try {
    const r = await post('/api/chat/start', { id: S.cur, provider, lang: LANG, selection: selItems().map(i => i.path),
      messages: [...history, { role: 'user', content: text }] });
    msg.chat = r.chat;
    pollChat(msg);
  } catch (e) { endChat(msg, { status: 'error', error: e.message }); }
}
async function pollChat(msg) {
  let r;
  try { r = await get(`/api/chat/events?chat=${msg.chat}`); } catch (e) { return endChat(msg, { status: 'error', error: e.message }); }
  const changed = JSON.stringify(r.events) !== JSON.stringify(msg.events);
  for (const e of r.events) { const prev = msg.events[e.i]; if (!prev || prev.status !== e.status) applyAct(e, prev); }
  msg.events = r.events;
  if (r.status === 'running') { if (changed) renderChat(); chatPoll = setTimeout(() => pollChat(msg), 350); return; }
  endChat(msg, r);
}
function endChat(msg, r) {
  clearTimeout(chatPoll);
  msg.pending = false; msg.ms = r.ms;
  if (r.status === 'done') Object.assign(msg, { content: r.answer, links: r.links });
  else if (r.status === 'cancelled') Object.assign(msg, { content: t('Arrêté.'), cancelled: true });
  else {
    const auth = /authenticat|login|logged|expired|401|unauthorized/i.test(r.error || '');
    Object.assign(msg, { error: true, content: (r.error || t('Erreur inconnue')).slice(0, 400) +
      (auth ? '\n\n' + t('Ton compte n’est pas connecté : clique sur « Comptes » en haut de l’assistant.') : '') });
  }
  setBusy(false); saveChat(); renderChat();
  $('#chatInput').focus();
}
function setBusy(on) {
  chatBusy = on;
  $('#chatSend').textContent = on ? t('Arrêter') : t('Envoyer');
  $('#chatSend').classList.toggle('stop', on);
  $('#chatInput').disabled = on || !anyReady();
}
async function stopChat() {
  const m = CHAT[CHAT.length - 1];
  if (m?.chat) await post('/api/chat/cancel', { chat: m.chat }).catch(() => {});
}

function openLink(a) {
  const id = +a.dataset.id, parent = +a.dataset.parent;
  if (S.tab !== 'content') { S.tab = 'content'; markTab('content'); }
  if (a.dataset.dir === '1') navigate(id); else navigate(parent, id);
}

// ---------- AI accounts (Claude / ChatGPT): one-click login ----------
let PROVS = null, LOGIN = null, loginTimer = null, lastSig = '';
const NAME = { claude: 'Claude', codex: 'ChatGPT', demo: t('Démo') };
const ready = p => !!(p && p.installed && p.loggedIn);
const anyReady = () => !!PROVS && Object.values(PROVS).some(ready);
function providerOptions() {
  if (!PROVS) return '';
  let pick = lsGet('taupe.ai') || 'claude';
  if (!ready(PROVS[pick])) pick = Object.keys(PROVS).find(k => ready(PROVS[k])) || pick;
  return Object.keys(PROVS).filter(k => ready(PROVS[k])).map(k =>
    `<option value="${k}"${k === pick ? ' selected' : ''}>${esc(AI_LABEL[k])}</option>`).join('');
}

// Shared login block (assistant, suggestions, Accounts window)
function connectBlock(only) {
  const L = LOGIN?.status === 'running' ? LOGIN : null;
  if (L && (!only || only === L.provider)) {
    if (L.phase !== 'login') return `<div class="cx"><p class="cx-wait"><span class="spin"></span><span>${t('Installation de l’outil {p} officiel…', { p: NAME[L.provider] })} <span class="muted">${t('environ 1 min')}</span></span></p>
      <button class="linkbtn" data-cancel-login>${t('Annuler')}</button></div>`;
    return `<div class="cx"><p class="cx-wait"><span class="spin"></span><span>${t('Connecte-toi dans la page {p} qui vient de s’ouvrir.', { p: NAME[L.provider] })}</span></p>
      ${L.needsCode ? `<p class="muted small">${t('Copie le code affiché à la fin : il est validé automatiquement dès que tu reviens ici.')}</p>
        <div class="cx-code"><input id="loginCode" placeholder="${t('ou colle le code ici')}" autocomplete="off" spellcheck="false"><button class="btn sm" data-code-submit>${t('Valider')}</button></div>` : ''}
      <p class="small">${L.url ? `<button class="linkbtn" data-ext="${esc(L.url)}">${t('Rouvrir la page')}</button> · ` : ''}<button class="linkbtn" data-cancel-login>${t('Annuler')}</button></p></div>`;
  }
  const failed = LOGIN && ['error'].includes(LOGIN.status) && (!only || only === LOGIN.provider)
    ? `<p class="small cx-err">${t('La connexion à {p} a échoué.', { p: NAME[LOGIN.provider] })} ${esc(stripLast(LOGIN.output))}</p>` : '';
  const ks = (only ? [only] : ['claude', 'codex']).filter(k => !ready(PROVS?.[k]));
  return `<div class="cx">${failed}<div class="cx-btns">${ks.map((k, i) =>
    `<button class="btn ${i === 0 ? 'primary' : ''} sm" data-connect="${k}">${t('Continuer avec {p}', { p: NAME[k] })}</button>`).join('')}</div></div>`;
}
const stripLast = t => (t || '').split('\n').map(x => x.trim()).filter(Boolean).pop() || '';

async function loadProviders(refresh) {
  try {
    const st = await get('/api/ai' + (refresh ? '?refresh=1' : ''));
    const wasRunning = LOGIN?.status === 'running';
    const sig = JSON.stringify([st.providers, st.login && { ...st.login, output: '' }]);
    const changed = sig !== lastSig; lastSig = sig;
    PROVS = st.providers; LOGIN = st.login;
    if (wasRunning && LOGIN?.status === 'done') { toast(t('Compte {p} connecté', { p: esc(NAME[LOGIN.provider]) }), 'ok'); return loadProviders(true); }
    const any = anyReady();
    $('#chatProv').innerHTML = providerOptions();
    // Connect another account without leaving the assistant ("+ ChatGPT" when Claude is already connected, etc.)
    const others = any ? Object.keys(PROVS).filter(k => !ready(PROVS[k]) && NAME[k]) : [];
    const busyLogin = LOGIN?.status === 'running' && others.includes(LOGIN.provider);
    $('#chatAdd').innerHTML = busyLogin ? '' : others.map(k => `<button type="button" class="linkbtn" data-connect="${k}" title="${t('Connecter aussi ton compte {p}', { p: NAME[k] })}">+ ${NAME[k]}</button>`).join('');
    const cx = any && (busyLogin || (LOGIN?.status === 'error' && others.includes(LOGIN.provider)));
    $('#chatConnect').hidden = !cx;
    if (cx && document.activeElement?.id !== 'loginCode') $('#chatConnect').innerHTML = connectBlock(LOGIN.provider);
    $('#chatInput').disabled = !any || chatBusy; $('#chatSend').disabled = !any; $('#chatProv').hidden = !any;
    $('#chatInput').placeholder = any ? t('Pose une question sur ce dossier… (Entrée pour envoyer)') : t('Connecte un compte IA pour discuter');
    const typing = document.activeElement?.id === 'loginCode';
    if (changed && !typing) {
      if (!chatBusy) renderChat();
      if (!$('#aiModal').hidden) renderAccounts();
      if (S.tab === 'suggest' && AI) renderAI({ ...AI, providers: PROVS });
    }
    clearTimeout(loginTimer);
    if (LOGIN?.status === 'running') loginTimer = setTimeout(loadProviders, 1500);
    return st;
  } catch { return null; }
}
async function initChat() { renderChat(); await loadProviders(); }

function renderAccounts() {
  if (document.activeElement?.id === 'loginCode') return;
  $('#aiAccounts').innerHTML = Object.keys(PROVS || {}).map(k => {
    const p = PROVS[k];
    const state = !p.installed ? t('Non installé') : p.loggedIn ? t('Connecté') : t('Non connecté');
    const body = ready(p)
      ? `<p class="small muted">${esc(t(p.detail || 'Prêt'))}</p><button class="linkbtn" data-logout="${k}">${t('Se déconnecter')}</button>`
      : connectBlock(k);
    return `<div class="acct"><div class="accthead"><b>${NAME[k]}</b><span class="muted small">${state}</span></div>${body}</div>`;
  }).join('');
}
async function openAccounts() { $('#aiModal').hidden = false; renderAccounts(); lastSig = ''; await loadProviders(true); }
function closeAccounts() { $('#aiModal').hidden = true; }

async function submitCode(code) {
  code = (code || '').trim();
  if (!code) return;
  try { await post('/api/ai/login/code', { code }); toast(t('Code envoyé, connexion en cours…'), '', 2500); loadProviders(); } catch (e) { toast(esc(e.message), 'err'); }
}
// Claude shows a code to copy: as soon as the user returns to Taupe, read it from the clipboard.
let lastClip = '';
window.addEventListener('focus', async () => {
  if (LOGIN?.status !== 'running' || LOGIN.phase !== 'login' || !LOGIN.needsCode) return;
  try {
    const t = (await navigator.clipboard.readText()).trim();
    if (t && t !== lastClip && /^[\w\-.~]{20,}(#[\w\-.~]+)?$/.test(t) && t.length < 500) { lastClip = t; submitCode(t); }
  } catch {}
});

document.addEventListener('click', async e => {
  const target = /** @type {HTMLElement} */ (e.target);
  const t = /** @type {HTMLElement | null} */ (target.closest('[data-connect],[data-cancel-login],[data-code-submit],[data-logout],[data-ext],[data-accounts],#aiModalClose'));
  if (!t && target.id === 'aiModal') return closeAccounts();
  if (!t) return;
  e.preventDefault();
  try {
    if (t.id === 'aiModalClose') return closeAccounts();
    if (t.dataset.accounts !== undefined) return openAccounts();
    if (t.dataset.connect) { lastClip = ''; await post('/api/ai/connect', { provider: t.dataset.connect }); return loadProviders(); }
    if (t.dataset.cancelLogin !== undefined) { await post('/api/ai/login/cancel'); return loadProviders(true); }
    if (t.dataset.codeSubmit !== undefined) return submitCode($('#loginCode')?.value);
    if (t.dataset.logout) { await post('/api/ai/logout', { provider: t.dataset.logout }); return loadProviders(true); }
    if (t.dataset.ext) return post('/api/external', { url: t.dataset.ext });
  } catch (err) { toast(esc(err.message), 'err'); }
});
document.addEventListener('keydown', e => { const el = /** @type {HTMLInputElement} */ (e.target); if (e.key === 'Enter' && el.id === 'loginCode') submitCode(el.value); });

$('#chatForm').addEventListener('submit', e => { e.preventDefault(); chatBusy ? stopChat() : sendChat($('#chatInput').value); });
$('#chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat(e.target.value); }
});
$('#chatMsgs').addEventListener('change', e => {
  const ack = e.target.closest('input[data-tstrong]');
  if (ack) { ack.checked ? TRASH_ACK.add(ack.dataset.tstrong) : TRASH_ACK.delete(ack.dataset.tstrong); return updateTrashCard(ack.closest('.tcard')); }
  const b = e.target.closest('input[data-tpick]'); if (!b) return;
  const off = TRASH_OFF.get(b.dataset.tpick) || new Set();
  b.checked ? off.delete(b.dataset.path) : off.add(b.dataset.path);
  TRASH_OFF.set(b.dataset.tpick, off); updateTrashCard(b.closest('.tcard'));
});
$('#chatMsgs').addEventListener('click', async e => {
  const all = e.target.closest('[data-tall]');
  if (all) {
    const card = all.closest('.tcard'), on = all.dataset.on === '1', off = new Set();
    for (const b of card.querySelectorAll('input[data-tpick]')) { b.checked = on; if (!on) off.add(b.dataset.path); }
    TRASH_OFF.set(all.dataset.tall, off); updateTrashCard(card); return;
  }
  const c = e.target.closest('[data-confirm]');
  if (c) {
    const card = c.closest('.tcard');
    const on = [...card.querySelectorAll('input[data-tpick]')].filter(b => b.checked), paths = on.map(b => b.dataset.path);
    const confirmSensitive = card.querySelector('input[data-tstrong]')?.checked ? on.filter(b => b.dataset.sens).map(b => b.dataset.path) : [];
    for (const b of card.querySelectorAll('button, input')) b.disabled = true;
    try { await post('/api/chat/confirm', { chat: c.dataset.chat, event: +c.dataset.confirm, accept: c.dataset.accept === '1', paths, confirmSensitive }); } catch (err) { toast(esc(err.message), 'err'); }
    return;
  }
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
    S.tab = 'content'; markTab('content');
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
    if (serverDown) { serverDown = false; toast(t('Reconnecté'), 'ok'); }
    S.status = st; HOME = st.home; renderVol(st.volume);
    const sc = st.scan; scanning = !!sc?.scanning;
    if (st.root) S.root = st.root;
    $('#progress').hidden = !scanning;
    if (scanning) {
      $('#progText').innerHTML = t('Analyse de <b>{path}</b> — <b>{n}</b> fichiers · <b>{size}</b> · {s} s · <span>{cur}</span>', { path: esc(pretty(sc.target)), n: nf.format(sc.files), size: fmtSize(st.root?.size || 0), s: (sc.elapsed / 1000).toFixed(0), cur: esc(pretty(sc.current)) });
      if (++tick % 3 === 0 && !S.loading && S.cur != null && S.tab === 'content') load();
    }
    if (S.wasScanning && !scanning && sc) {
      if (!sc.cancelled) toast(t('✓ Analyse terminée : <b>{n}</b> fichiers en {s} s', { n: nf.format(sc.files), s: dec((sc.elapsed / 1000).toFixed(1)) }), 'ok');
      load();
    }
    S.wasScanning = scanning;
  } catch (e) {
    if (!serverDown) { serverDown = true; toast(t('Le moteur ne répond plus — relance Taupe'), 'err', 8000); }
  }
  if (!once || scanning) pollTimer = setTimeout(poll, scanning ? 700 : 3000);
}

// ---------- Events ----------
$('#scanForm').addEventListener('submit', e => { e.preventDefault(); startScan($('#pathInput').value || '~'); });
$('#cards').addEventListener('click', e => { const c = e.target.closest('.card'); if (!c) return; c.dataset.pick ? pickFolder() : startScan(c.dataset.path); });
$('#pickBtn').addEventListener('click', () => pickFolder());
async function pickFolder() {
  if (!IS_APP) return $('#pathInput').focus();
  try { const r = await post('/api/pick'); if (r.path) { $('#pathInput').value = pretty(r.path); startScan(r.path); } } catch (e) { toast(esc(e.message), 'err'); }
}
const HINT = IS_MAC ? t('Pour tout voir (Mail, Messages, Photos…), donne l’<b>Accès complet au disque</b> à {app} : Réglages Système → Confidentialité et sécurité → Accès complet au disque.', { app: IS_APP ? 'Taupe' : t('ton Terminal') })
  : IS_WIN ? t('Certains dossiers système demandent les droits administrateur : clic droit sur Taupe → <b>Exécuter en tant qu’administrateur</b> pour tout voir.') : '';
function renderWelcome(st) {
  const cards = (st.places || []).map(p => `<button class="card" data-path="${esc(p.path)}"><b>${esc(p.label)}</b><small>${esc(p.hint)}</small></button>`);
  if (IS_APP) cards.push(`<button class="card" data-pick="1"><b>${t('Choisir un dossier…')}</b><small>${MOD}O</small></button>`);
  $('#cards').innerHTML = cards.join('');
  $('#hint').innerHTML = HINT;
}
function applyPlatformLabels() {
  for (const el of document.querySelectorAll('[data-icon]')) el.insertAdjacentHTML('afterbegin', svg(/** @type {HTMLElement} */ (el).dataset.icon));
  applyI18n();
  $('#finderBtn').textContent = FM; $('#finderBtn').title = t('Ouvrir dans le {fm}', { fm: FM });
  $('#trashBtn').innerHTML = `${t('Mettre à la corbeille')} <kbd>${TRASH_KEY}</kbd>`;
  $('.keyhint').textContent = t('↑↓ naviguer · → ouvrir · ← remonter · Espace aperçu · {mod}/⇧clic sélection · {del} corbeille', { mod: IS_MAC ? '⌘' : 'Ctrl', del: TRASH_KEY });
  $('#pickBtn').hidden = !IS_APP;
}
/** @type {any} */ (window).taupe = { pick: pickFolder, rescan: () => !$('#app').hidden && $('#rescanBtn').click(), toggleChat: () => $('#chatToggle').click() };
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

// Treemap: click, hover
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
  tip.innerHTML = `<b>${esc(it.name)}</b> — ${fmtSize(it.size)} <span class="muted">(${fmtPct(pct(it.size, S.data.node.size))})</span><small>${it.dir ? t('Clic pour ouvrir') : t('Fichier')}</small>`;
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
    try { await post('/api/ai/start', { id: S.cur, provider, lang: LANG }); } catch (err) { return toast(esc(err.message), 'err'); }
    return refreshAI();
  }
  if (t.dataset.copy != null) { navigator.clipboard.writeText(t.dataset.copy).then(() => toast(`${t('Commande copiée')}<br><span class="muted small">${t('Relis-la avant de la coller dans un terminal.')}</span>`, 'ok', 4000)); return; }
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
$('#mStrongOk').addEventListener('change', e => { $('#mOk').disabled = !e.target.checked; });
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

document.addEventListener('keydown', e => {
  const target = /** @type {HTMLElement} */ (e.target);
  if (!$('#aiModal').hidden) { if (e.key === 'Escape') closeAccounts(); return; }
  if (!$('#modal').hidden) {
    if (e.key === 'Escape') closeModal();
    else if (e.key === 'Enter' && target.id !== 'mStrongOk') { e.preventDefault(); doTrash(); }
    return;
  }
  if ($('#app').hidden || target.matches('input:not([type=checkbox]), textarea, select')) return;
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

// ---------- Startup ----------
(async () => {
  applyPlatformLabels();
  initChat();
  await poll(true);
  if (S.status) renderWelcome(S.status);
  if (S.root) { show('app'); $('#pathInput').value = pretty(S.root.path); await navigate(S.root.id); }
  else show('welcome');
  if (!S.wasScanning) poll();
})();
