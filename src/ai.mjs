// Analyse IA via les CLI locales, qui utilisent ton abonnement :
//   - claude (Claude Code)  → abonnement Claude
//   - codex  (Codex CLI)    → abonnement ChatGPT
// Seule la structure (chemins, tailles, dates) est envoyée, jamais le contenu des fichiers.
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const HOME = os.homedir();
export const PROVIDERS = { claude: 'Claude', codex: 'ChatGPT' };

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['summary', 'suggestions'],
  properties: {
    summary: { type: 'string' },
    suggestions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['path', 'title', 'reason', 'risk', 'action', 'command'],
        properties: {
          path: { type: 'string' },
          title: { type: 'string' },
          reason: { type: 'string' },
          risk: { type: 'string', enum: ['safe', 'check', 'careful'] },
          action: { type: 'string', enum: ['trash', 'command', 'review'] },
          command: { type: 'string' },
        },
      },
    },
  },
};

const PROMPT = `Tu es un expert macOS qui aide un développeur à libérer de l'espace disque.
Ci-dessous : l'analyse d'un dossier de son Mac (arborescence des éléments lourds, plus gros fichiers, candidats repérés par des règles).

Propose jusqu'à 25 actions concrètes, triées par espace récupéré (le plus gros d'abord), pour libérer de la place SANS perdre de données importantes.

Règles strictes :
- "path" doit être EXACTEMENT un chemin présent dans les données ci-dessous (sans le "/" final), jamais inventé.
- Ne propose jamais à la fois un dossier et un de ses sous-chemins.
- "action" : "trash" = mettre ce chemin à la corbeille ; "command" = mieux vaut nettoyer avec une commande (ex : docker system prune, xcrun simctl delete unavailable, brew cleanup, git worktree prune), mets-la dans "command" ; "review" = à examiner à la main.
- "command" : chaîne vide si action ≠ "command".
- "risk" : "safe" = cache/régénérable ; "check" = probablement inutile mais à vérifier ; "careful" = données personnelles, à ne supprimer que si l'utilisateur est sûr.
- Jamais : dossiers système, ~/Library entier, Documents/Desktop/Photos entiers, dossiers .git, code source de projets actifs.
- Repère aussi ce que les règles ne voient pas : doublons de projets (ex : "projet-dupes", "projet copie"), vieux projets abandonnés, exports/vidéos oubliés, archives déjà décompressées, etc.
- "title" : court (≤ 8 mots). "reason" : 1 à 2 phrases en français, concrètes (pourquoi c'est supprimable, comment le récupérer si besoin).
- "summary" : 2-3 phrases en français sur où part l'espace et le gain total possible.

Réponds uniquement avec le JSON demandé.

=== DONNÉES ===
`;

// ---------- Localisation des binaires (macOS, Windows, Linux) ----------
const IS_WIN = process.platform === 'win32';
const binCache = new Map();
async function findBin(name, fresh = false) {
  if (!fresh && binCache.has(name)) return binCache.get(name);
  const env = process.env;
  const dirs = IS_WIN
    ? [path.join(HOME, '.local', 'bin'), env.APPDATA && path.join(env.APPDATA, 'npm'), env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', name),
      path.join(HOME, '.bun', 'bin'), ...(env.PATH || '').split(path.delimiter)]
    : [path.join(HOME, '.local/bin'), path.join(HOME, '.claude/local'), '/opt/homebrew/bin', '/usr/local/bin',
      path.join(HOME, '.bun/bin'), path.join(HOME, '.npm-global/bin'), ...(env.PATH || '').split(path.delimiter)];
  const names = IS_WIN ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`] : [name];
  let found = null;
  outer: for (const d of dirs.filter(Boolean)) for (const n of names) {
    const p = path.join(d, n);
    try { fs.accessSync(p, IS_WIN ? fs.constants.F_OK : fs.constants.X_OK); if (fs.statSync(p).isFile()) { found = p; break outer; } } catch {}
  }
  if (!found) { // dernier recours : demander au shell de l'utilisateur
    found = await new Promise(res => IS_WIN
      ? execFile('where.exe', [name], { timeout: 6000 }, (e, out) => res(!e ? out.trim().split(/\r?\n/)[0] || null : null))
      : execFile(process.env.SHELL || '/bin/zsh', ['-lic', `command -v ${name}`], { timeout: 6000 },
        (e, out) => res(!e && out.trim().startsWith('/') ? out.trim().split('\n').pop() : null)));
  }
  binCache.set(name, found);
  return found;
}

function childEnv() {
  const env = { ...process.env };
  // On veut l'abonnement, pas une clé API facturée à l'usage ; et pas de détection « session imbriquée ».
  // (et si Taupe est lancé depuis une app Claude, on ne réutilise pas son proxy/sa session)
  for (const k of Object.keys(env)) if (/^(CLAUDE|ANTHROPIC_|OPENAI_API_KEY$|AI_AGENT$|BAGGAGE$|ELECTRON_)/.test(k)) delete env[k];
  return env;
}

// Sous Windows, les CLI installées par npm sont des scripts .cmd : il faut passer par cmd.exe
// avec un échappement strict des arguments (même logique que le paquet cross-spawn).
function winQuote(arg, cmdShim) {
  arg = String(arg).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1');
  arg = `"${arg}"`.replace(/[()%!^"<>&|]/g, '^$&');
  return cmdShim ? arg.replace(/[()%!^"<>&|]/g, '^$&') : arg;
}
function spawnCli(bin, args, opts) {
  if (IS_WIN && /\.(cmd|bat)$/i.test(bin)) {
    const line = [winQuote(bin, false), ...args.map(a => winQuote(a, true))].join(' ');
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], { ...opts, windowsVerbatimArguments: true, windowsHide: true });
  }
  return spawn(bin, args, { ...opts, windowsHide: true });
}

function runProc(bin, args, input, cwd, timeoutMs, onProc) {
  return new Promise((resolve, reject) => {
    const p = spawnCli(bin, args, { cwd, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    onProc?.(p);
    let out = '', err = '';
    const t = setTimeout(() => { p.kill(); reject(new Error(`Délai dépassé (${timeoutMs / 1000} s)`)); }, timeoutMs);
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (err += d));
    p.on('error', e => { clearTimeout(t); reject(e); });
    p.on('close', code => {
      clearTimeout(t);
      if (code === 0) return resolve(out);
      let msg = (err || out).trim().split('\n').slice(-4).join('\n');
      try { const o = JSON.parse(out); if (o.result) msg = String(o.result); } catch {}
      reject(new Error(msg || `code ${code}`));
    });
    p.stdin.end(input ?? '');
  });
}

function extractJson(text) {
  if (text && typeof text === 'object') return text;
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Réponse IA illisible');
  return JSON.parse(text.slice(a, b + 1));
}

// Appel unique à la CLI, sans aucun outil (lecture/écriture/shell désactivés).
// schema → réponse JSON structurée ; sinon texte libre. fast → raisonnement réduit (chat).
async function call(provider, input, { schema = null, fast = false, timeoutMs = 300000 } = {}) {
  const bin = await findBin(provider);
  if (!bin) throw new Error(`CLI « ${provider} » introuvable. Installe-la et connecte-toi d’abord.`);
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'taupe-ai-'));
  try {
    if (provider === 'claude') {
      const args = ['-p', '--output-format', 'json', '--tools', '', '--no-session-persistence', '--strict-mcp-config'];
      if (schema) args.push('--json-schema', JSON.stringify(schema));
      const res = JSON.parse(await runProc(bin, args, input, tmp, timeoutMs));
      if (res.is_error) throw new Error(String(res.result || 'Erreur Claude'));
      return schema ? extractJson(res.structured_output ?? res.result) : String(res.result || '').trim();
    }
    const outFile = path.join(tmp, 'out.txt');
    const args = ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-o', outFile];
    if (fast) args.push('-c', 'model_reasoning_effort="low"');
    if (schema) { const f = path.join(tmp, 'schema.json'); await fsp.writeFile(f, JSON.stringify(schema)); args.push('--output-schema', f); }
    await runProc(bin, args, input, tmp, timeoutMs);
    const text = await fsp.readFile(outFile, 'utf8');
    return schema ? extractJson(text) : text.trim();
  } finally {
    fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

export const analyze = (provider, digest) => call(provider, PROMPT + digest, { schema: SCHEMA });

const CHAT_PROMPT = `Tu es l'assistant intégré à Taupe, un explorateur d'espace disque sur l'ordinateur de l'utilisateur (un développeur).
- Réponds en français, de façon concise et concrète : phrases courtes, listes, tailles chiffrées.
- Tu vois la STRUCTURE du disque (noms, tailles, dates), jamais le contenu des fichiers : ne l'invente pas.
- Tu peux AGIR dans Taupe avec les outils « taupe » :
  search_files (chercher par nom), list_folder (voir un dossier), big_files (plus gros fichiers),
  open_folder (montrer un dossier à l'utilisateur), select_items (cocher des éléments),
  move_to_trash (proposer de mettre à la Corbeille).
- Utilise ces outils dès que c'est utile : pour chercher, vérifier un dossier absent du contexte, montrer, sélectionner ou supprimer.
- move_to_trash affiche une demande de confirmation et attend la réponse de l'utilisateur : c'est la SEULE façon de supprimer.
  N'utilise jamais de commande shell ni aucun autre outil pour lire, déplacer ou supprimer des fichiers.
- Ne propose jamais de supprimer des données personnelles sans le signaler clairement (photos, documents, projets actifs, travail non commité).
- Quand tu cites un fichier ou un dossier, écris son chemin ABSOLU entre backticks, ex. \`/Users/x/projet/node_modules\` : il devient cliquable.
- Après des actions, résume en une ou deux phrases ce que tu as fait.
`;
const TOOL_NAMES = ['search_files', 'list_folder', 'big_files', 'open_folder', 'select_items', 'move_to_trash'];

// Conversation « agent » : la CLI de l'IA lance notre serveur MCP (src/mcp.mjs) et n'a accès qu'à ses outils.
export async function chatAgent(provider, context, messages, mcp, onProc) {
  const bin = await findBin(provider);
  if (!bin) throw new Error(`CLI « ${provider} » introuvable. Connecte ton compte d’abord.`);
  const convo = messages.slice(-12).map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'} : ${String(m.content).slice(0, 4000)}`).join('\n\n');
  const input = `${CHAT_PROMPT}\n=== CONTEXTE (dossier affiché) ===\n${context}\n\n=== CONVERSATION ===\n${convo}\n\nRéponds au dernier message de l'utilisateur.`;
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'taupe-chat-'));
  try {
    if (provider === 'claude') {
      const cfg = path.join(tmp, 'mcp.json');
      await fsp.writeFile(cfg, JSON.stringify({ mcpServers: { taupe: { type: 'stdio', command: mcp.command, args: mcp.args, env: mcp.env } } }));
      const args = ['-p', '--output-format', 'json', '--no-session-persistence', '--tools', '', '--strict-mcp-config', '--mcp-config', cfg,
        '--allowedTools', ...TOOL_NAMES.map(t => `mcp__taupe__${t}`)];
      const res = JSON.parse(await runProc(bin, args, input, tmp, 600000, onProc));
      if (res.is_error) throw new Error(String(res.result || 'Erreur Claude'));
      return String(res.result || '').trim();
    }
    const out = path.join(tmp, 'out.txt');
    const tomlEnv = '{' + Object.entries(mcp.env).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(',') + '}';
    const args = ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-o', out,
      '-c', 'model_reasoning_effort="low"', '-c', 'approval_policy="never"',
      '-c', `mcp_servers.taupe.command=${JSON.stringify(mcp.command)}`,
      '-c', `mcp_servers.taupe.args=${JSON.stringify(mcp.args)}`,
      '-c', `mcp_servers.taupe.env=${tomlEnv}`];
    await runProc(bin, args, input, tmp, 600000, onProc);
    return (await fsp.readFile(out, 'utf8')).trim();
  } finally {
    fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------- Comptes : statut, connexion, déconnexion ----------
export const INSTALL = {
  claude: { mac: 'curl -fsSL https://claude.ai/install.sh | bash', win: 'irm https://claude.ai/install.ps1 | iex',
    docs: 'https://docs.claude.com/en/docs/claude-code/setup' },
  codex: { mac: 'npm install -g @openai/codex', win: 'npm install -g @openai/codex', docs: 'https://github.com/openai/codex' },
};
const stripAnsi = s => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');

async function status(provider) {
  const bin = await findBin(provider, true);
  const install = INSTALL[provider][IS_WIN ? 'win' : 'mac'];
  if (!bin) return { installed: false, loggedIn: false, install, docs: INSTALL[provider].docs };
  const base = { installed: true, install, docs: INSTALL[provider].docs };
  try {
    if (provider === 'claude') {
      const out = await runProc(bin, ['auth', 'status'], '', os.tmpdir(), 20000);
      const j = JSON.parse(out.slice(out.indexOf('{')));
      return { ...base, loggedIn: !!j.loggedIn, detail: j.email || j.account?.email || (j.loggedIn ? j.authMethod : '') || '' };
    }
    const out = stripAnsi(await runProc(bin, ['login', 'status'], '', os.tmpdir(), 20000)).trim();
    return { ...base, loggedIn: true, detail: out.split('\n').pop() };
  } catch (e) {
    return { ...base, loggedIn: false, detail: '' };
  }
}

let statusCache = null, statusAt = 0;
export async function statusAll(refresh = false) {
  if (!refresh && statusCache && Date.now() - statusAt < 60000) return statusCache;
  const [claude, codex] = await Promise.all([status('claude'), status('codex')]);
  statusCache = { claude, codex }; statusAt = Date.now();
  return statusCache;
}

let loginJob = null;
export function loginState() {
  if (!loginJob) return null;
  const { proc, ...j } = loginJob;
  return { ...j, output: stripAnsi(j.output).slice(-600) };
}

// Connexion en un clic : installe l'outil officiel s'il manque, puis lance la connexion.
// L'état (phase install → login → done/error) est suivi par l'interface via loginState().
export function connect(provider) {
  if (!PROVIDERS[provider]) throw new Error('Fournisseur inconnu');
  loginCancel();
  const job = loginJob = { provider, status: 'running', phase: 'check', started: Date.now(), url: '', needsCode: false, output: '', proc: null };
  (async () => {
    let bin = await findBin(provider, true);
    if (!bin) {
      job.phase = 'install';
      await runInstaller(provider, job);
      if (job.status !== 'running') return;
      bin = await findBin(provider, true);
      if (!bin) throw new Error(`Installation terminée mais « ${provider} » reste introuvable. Redémarre Taupe.`);
    }
    if (job.status !== 'running') return;
    job.phase = 'login';
    startLogin(bin, provider, job);
  })().catch(e => { if (job.status === 'running') Object.assign(job, { status: 'error', output: job.output + '\n' + e.message }); statusAt = 0; });
}

// Installeurs officiels (Claude Code : script d'Anthropic ; Codex : npm, ou Homebrew sur Mac)
async function runInstaller(provider, job) {
  let cmd, args;
  if (provider === 'claude') {
    if (IS_WIN) { cmd = 'powershell.exe'; args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://claude.ai/install.ps1 | iex']; }
    else { cmd = '/bin/bash'; args = ['-c', 'curl -fsSL https://claude.ai/install.sh | bash']; }
  } else {
    const npm = await findBin('npm', true);
    const brew = !IS_WIN && await findBin('brew', true);
    if (npm) { cmd = npm; args = ['install', '-g', '@openai/codex']; }
    else if (brew) { cmd = brew; args = ['install', 'codex']; }
    else throw new Error('Installer ChatGPT (Codex) nécessite Node.js : installe-le depuis nodejs.org puis réessaie.');
  }
  await new Promise((resolve, reject) => {
    const p = job.proc = spawnCli(cmd, args, { cwd: os.tmpdir(), env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', d => (job.output += d)); p.stderr.on('data', d => (job.output += d));
    p.on('error', reject);
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`Installation échouée (code ${code})`))));
  });
}

function startLogin(bin, provider, job) {
  const args = provider === 'claude' ? ['auth', 'login', '--claudeai'] : ['login'];
  const proc = job.proc = spawnCli(bin, args, { cwd: os.tmpdir(), env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
  const onData = d => {
    job.output += d.toString();
    const clean = stripAnsi(job.output);
    const m = clean.match(/https:\/\/[^\s"'<>]+/g);
    if (m) job.url = m[m.length - 1];
    if (/paste|code/i.test(clean.split('\n').slice(-3).join(' '))) job.needsCode = true;
  };
  proc.stdout.on('data', onData); proc.stderr.on('data', onData);
  proc.on('error', e => Object.assign(job, { status: 'error', output: job.output + '\n' + e.message }));
  proc.on('close', code => { if (job.status === 'running') { job.status = code === 0 ? 'done' : 'error'; job.phase = job.status; } statusAt = 0; });
  setTimeout(() => { if (job.status === 'running') loginCancel(); }, 10 * 60 * 1000);
}

export function loginCode(code) {
  if (loginJob?.status === 'running' && loginJob.phase === 'login' && code) loginJob.proc?.stdin?.write(code.trim() + '\n');
}

export function loginCancel() {
  if (loginJob?.status === 'running') { loginJob.status = 'cancelled'; try { loginJob.proc?.kill(); } catch {} }
}

export async function logout(provider) {
  const bin = await findBin(provider);
  if (!bin) return;
  await runProc(bin, provider === 'claude' ? ['auth', 'logout'] : ['logout'], '', os.tmpdir(), 20000).catch(() => {});
  statusAt = 0;
}
