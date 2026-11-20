// AI analysis through the local CLIs, which use your subscription:
//   - claude (Claude Code)  → Claude subscription
//   - codex  (Codex CLI)    → ChatGPT subscription
// Only the structure (paths, sizes, dates) is sent, never file contents.
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { tr } from './i18n.mjs';

const HOME = os.homedir();
export const PROVIDERS = { claude: 'Claude', codex: 'ChatGPT' };
// Own keys only: "__proto__", "constructor"… must never pass as a provider
export const isProvider = p => typeof p === 'string' && Object.hasOwn(PROVIDERS, p);

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

const LANG_NAME = { fr: 'French', en: 'English' };
const langName = l => (Object.hasOwn(LANG_NAME, l) ? LANG_NAME[l] : 'English');
const analysisPrompt = lang => `You are a disk-cleanup expert helping a developer free up disk space on their computer.
Below: the analysis of one of their folders (tree of the heaviest items, biggest files, candidates found by built-in rules).

Suggest up to 25 concrete actions, sorted by space recovered (biggest first), to free space WITHOUT losing important data.

Strict rules:
- "path" must be EXACTLY a path present in the data below (no trailing "/"), never invented.
- Never suggest both a folder and one of its sub-paths.
- "action": "trash" = move this path to the Trash; "command" = better cleaned with a command (e.g. docker system prune, xcrun simctl delete unavailable, brew cleanup, git worktree prune), put it in "command"; "review" = to be checked by hand.
- "command": empty string unless action is "command".
- "risk": "safe" = cache / regenerable; "check" = probably useless but worth checking; "careful" = personal data, only delete if the user is sure.
- Never: system folders, the whole ~/Library, whole Documents/Desktop/Photos, .git folders, source code of active projects.
- Also spot what the rules miss: duplicated projects (e.g. "project-dupes", "project copy"), old abandoned projects, forgotten exports/videos, archives already extracted, etc.
- "title": short (≤ 8 words). "reason": 1–2 concrete sentences (why it can be deleted, how to get it back if needed).
- "summary": 2–3 sentences on where the space goes and the total possible gain.
- Write "title", "reason" and "summary" in ${langName(lang)}.

Answer only with the requested JSON.

=== DATA ===
`;

// ---------- Locating the binaries (macOS, Windows, Linux) ----------
const IS_WIN = process.platform === 'win32';
const binCache = new Map();
async function findBin(name, fresh = false) {
  if (!/^[a-z][a-z0-9_-]*$/i.test(name)) return null; // a program name, never a path or a shell fragment
  if (!fresh && binCache.has(name)) return binCache.get(name);
  const env = process.env;
  const dirs = IS_WIN
    ? [path.join(HOME, '.local', 'bin'), env.APPDATA && path.join(env.APPDATA, 'npm'), env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', name),
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin'), // Codex standalone installer
      path.join(HOME, '.bun', 'bin'), ...(env.PATH || '').split(path.delimiter)]
    : [path.join(HOME, '.local/bin'), path.join(HOME, '.claude/local'), '/opt/homebrew/bin', '/usr/local/bin',
      path.join(HOME, '.bun/bin'), path.join(HOME, '.npm-global/bin'), ...(env.PATH || '').split(path.delimiter)];
  const names = IS_WIN ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`] : [name];
  let found = null;
  outer: for (const d of dirs.filter(Boolean)) for (const n of names) {
    const p = path.join(d, n);
    try { fs.accessSync(p, IS_WIN ? fs.constants.F_OK : fs.constants.X_OK); if (fs.statSync(p).isFile()) { found = p; break outer; } } catch {}
  }
  if (!found) { // last resort: ask the user's shell (the name goes in as $1, never pasted into the script)
    found = await new Promise(res => IS_WIN
      ? execFile('where.exe', [name], { timeout: 6000 }, (e, out) => res(!e ? out.trim().split(/\r?\n/)[0] || null : null))
      : execFile(process.env.SHELL || '/bin/zsh', ['-lic', 'command -v -- "$1"', 'taupe', name], { timeout: 6000 },
        (e, out) => res(!e && out.trim().startsWith('/') ? out.trim().split('\n').pop() : null)));
  }
  binCache.set(name, found);
  return found;
}

function childEnv() {
  const env = { ...process.env };
  // We want the subscription, not a pay-per-use API key; and no "nested session" detection.
  // (and if Taupe is launched from a Claude app, don't reuse its proxy/session)
  for (const k of Object.keys(env)) if (/^(CLAUDE|ANTHROPIC_|OPENAI_API_KEY$|AI_AGENT$|BAGGAGE$|ELECTRON_)/.test(k)) delete env[k];
  return env;
}

// On Windows, npm-installed CLIs are .cmd scripts: they must go through cmd.exe
// with strict argument escaping (same logic as the cross-spawn package).
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

function runProc(bin, args, input, cwd, timeoutMs, onProc, lang = 'en') {
  return new Promise((resolve, reject) => {
    const p = spawnCli(bin, args, { cwd, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    onProc?.(p);
    let out = '', err = '';
    const t = setTimeout(() => { p.kill(); reject(new Error(tr(lang, 'Délai dépassé ({p} s)', { p: timeoutMs / 1000 }))); }, timeoutMs);
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
  if (a < 0 || b < a) throw new Error('Unreadable AI response');
  return JSON.parse(text.slice(a, b + 1));
}

// ---------- CLI arguments (pure functions, checked by scripts/ai-args-test.mjs) ----------
// Codex: its built-in command tools are switched off, so the model can neither run a command nor
// read a file; the read-only sandbox is only a second line of defence. `--disable` refuses an
// unknown feature: on a Codex too old to know these flags the call fails instead of running with a shell.
export const CODEX_LOCKDOWN = ['--disable', 'shell_tool', '--disable', 'unified_exec'];
export const TOOL_NAMES = ['search_files', 'list_folder', 'big_files', 'open_folder', 'select_items', 'move_to_trash'];

// One-shot analysis: no tools at all, structured JSON answer
export function analysisArgs(provider, { schema = null, schemaFile = '', outFile = '', fast = false } = {}) {
  if (provider === 'claude') {
    const args = ['-p', '--output-format', 'json', '--tools', '', '--no-session-persistence', '--strict-mcp-config'];
    if (schema) args.push('--json-schema', JSON.stringify(schema));
    return args;
  }
  const args = ['exec', '--skip-git-repo-check', '--ephemeral', ...CODEX_LOCKDOWN, '-s', 'read-only', '-c', 'approval_policy="never"', '-o', outFile];
  if (fast) args.push('-c', 'model_reasoning_effort="low"');
  if (schemaFile) args.push('--output-schema', schemaFile);
  return args;
}

// Agent conversation: Taupe's MCP tools and nothing else
export function chatArgs(provider, { mcpConfigFile = '', mcp = null, outFile = '' } = {}) {
  if (provider === 'claude') {
    return ['-p', '--output-format', 'json', '--no-session-persistence', '--tools', '', '--strict-mcp-config', '--mcp-config', mcpConfigFile,
      '--allowedTools', ...TOOL_NAMES.map(t => `mcp__taupe__${t}`)];
  }
  const tomlEnv = '{' + Object.entries(mcp.env).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(',') + '}';
  return ['exec', '--skip-git-repo-check', '--ephemeral', ...CODEX_LOCKDOWN, '-s', 'read-only', '-o', outFile,
    '-c', 'model_reasoning_effort="low"', '-c', 'approval_policy="never"',
    '-c', `mcp_servers.taupe.command=${JSON.stringify(mcp.command)}`,
    '-c', `mcp_servers.taupe.args=${JSON.stringify(mcp.args)}`,
    '-c', `mcp_servers.taupe.env=${tomlEnv}`];
}

// A Codex too old for CODEX_LOCKDOWN answers "Unknown feature flag": say how to fix it
function codexError(e, lang) {
  if (/unknown feature flag/i.test(e.message)) throw new Error(tr(lang, 'Codex est trop ancien pour qu’on lui retire son shell. Mets-le à jour avec son installeur officiel : {p}', { p: INSTALL.codex[IS_WIN ? 'win' : 'mac'] }));
  throw e;
}

// Single CLI call, with no tools at all (read/write/shell disabled).
// schema → structured JSON response; otherwise free text. fast → reduced reasoning (chat).
async function call(provider, input, { schema = null, fast = false, timeoutMs = 300000, lang = 'en' } = {}) {
  const bin = await findBin(provider);
  if (!bin) throw new Error(tr(lang, 'CLI « {p} » introuvable. Connecte ton compte d’abord.', { p: provider }));
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'taupe-ai-'));
  try {
    if (provider === 'claude') {
      const res = JSON.parse(await runProc(bin, analysisArgs('claude', { schema }), input, tmp, timeoutMs, null, lang));
      if (res.is_error) throw new Error(String(res.result || 'Erreur Claude'));
      return schema ? extractJson(res.structured_output ?? res.result) : String(res.result || '').trim();
    }
    const outFile = path.join(tmp, 'out.txt');
    let schemaFile = '';
    if (schema) { schemaFile = path.join(tmp, 'schema.json'); await fsp.writeFile(schemaFile, JSON.stringify(schema)); }
    await runProc(bin, analysisArgs('codex', { schemaFile, outFile, fast }), input, tmp, timeoutMs, null, lang).catch(e => codexError(e, lang));
    const text = await fsp.readFile(outFile, 'utf8');
    return schema ? extractJson(text) : text.trim();
  } finally {
    fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

export async function analyze(provider, digest, lang = 'en') {
  if (!isProvider(provider)) throw new Error(tr(lang, 'Fournisseur inconnu'));
  return call(provider, analysisPrompt(lang) + digest, { schema: SCHEMA, lang });
}

const chatPrompt = lang => `You are the assistant built into Taupe, a disk-space explorer running on the user's computer (the user is a developer).
- Always answer in ${langName(lang)}, concisely and concretely: short sentences, lists, sizes with numbers.
- You see the STRUCTURE of the disk (names, sizes, dates), never the contents of files: do not make them up.
- You can ACT in Taupe with the "taupe" tools:
  search_files (search by name), list_folder (read a folder), big_files (biggest files),
  open_folder (show a folder to the user), select_items (check items),
  move_to_trash (propose moving items to the Trash).
- Use these tools whenever useful: to search, check a folder missing from the context, show, select or delete.
- move_to_trash shows a confirmation card and waits for the user's answer; the user may untick some items. It is the ONLY way to delete.
  Never use a shell command or any other tool to read, move or delete files.
- Never suggest deleting personal data without clearly flagging it (photos, documents, active projects, uncommitted work).
- When you mention a file or folder, write its ABSOLUTE path between backticks, e.g. \`/Users/x/project/node_modules\`: it becomes clickable.
- After taking actions, sum up what you did in one or two sentences.
`;
// "Agent" conversation: the AI CLI launches our MCP server (src/mcp.mjs) and can only use its tools.
export async function chatAgent(provider, context, messages, mcp, onProc, lang = 'en') {
  if (!isProvider(provider)) throw new Error(tr(lang, 'Fournisseur inconnu'));
  const bin = await findBin(provider);
  if (!bin) throw new Error(tr(lang, 'CLI « {p} » introuvable. Connecte ton compte d’abord.', { p: provider }));
  const convo = messages.slice(-12).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content).slice(0, 4000)}`).join('\n\n');
  const input = `${chatPrompt(lang)}\n=== CONTEXT (folder on screen) ===\n${context}\n\n=== CONVERSATION ===\n${convo}\n\nAnswer the user's last message.`;
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'taupe-chat-'));
  try {
    if (provider === 'claude') {
      const cfg = path.join(tmp, 'mcp.json');
      await fsp.writeFile(cfg, JSON.stringify({ mcpServers: { taupe: { type: 'stdio', command: mcp.command, args: mcp.args, env: mcp.env } } }));
      const res = JSON.parse(await runProc(bin, chatArgs('claude', { mcpConfigFile: cfg }), input, tmp, 600000, onProc, lang));
      if (res.is_error) throw new Error(String(res.result || 'Erreur Claude'));
      return String(res.result || '').trim();
    }
    const out = path.join(tmp, 'out.txt');
    await runProc(bin, chatArgs('codex', { mcp, outFile: out }), input, tmp, 600000, onProc, lang).catch(e => codexError(e, lang));
    return (await fsp.readFile(out, 'utf8')).trim();
  } finally {
    fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------- Accounts: status, login, logout ----------
// Official standalone installers: they download the CLI itself (no npm, no Node.js needed).
// mac = macOS / Linux shell, win = PowerShell.
export const INSTALL = {
  claude: { mac: 'curl -fsSL https://claude.ai/install.sh | bash', win: 'irm https://claude.ai/install.ps1 | iex',
    docs: 'https://docs.claude.com/en/docs/claude-code/setup' },
  codex: { mac: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh', win: 'irm https://chatgpt.com/codex/install.ps1 | iex',
    docs: 'https://github.com/openai/codex' },
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

// One-click login: installs the official tool if missing, then starts the login.
// The state (phase install → login → done/error) is tracked by the UI via loginState().
export function connect(provider, lang = 'en') {
  if (!isProvider(provider)) throw new Error(tr(lang, 'Fournisseur inconnu'));
  loginCancel();
  const job = loginJob = { provider, status: 'running', phase: 'check', started: Date.now(), url: '', needsCode: false, output: '', proc: null };
  (async () => {
    let bin = await findBin(provider, true);
    if (!bin) {
      job.phase = 'install';
      await runInstaller(provider, job, lang);
      if (job.status !== 'running') return;
      bin = await findBin(provider, true);
      if (!bin) throw new Error(tr(lang, 'Installation terminée mais « {p} » reste introuvable. Redémarre Taupe.', { p: provider }));
    }
    if (job.status !== 'running') return;
    job.phase = 'login';
    startLogin(bin, provider, job);
  })().catch(e => { if (job.status === 'running') Object.assign(job, { status: 'error', output: job.output + '\n' + e.message }); statusAt = 0; });
}

// Official standalone installers (Anthropic's and OpenAI's scripts): nothing else to install first
export function installerCommand(provider, win = IS_WIN) {
  const line = INSTALL[provider][win ? 'win' : 'mac'];
  return win
    ? { cmd: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', line] }
    : { cmd: '/bin/sh', args: ['-c', line] };
}
async function runInstaller(provider, job, lang = 'en') {
  const { cmd, args } = installerCommand(provider);
  // The Codex installer asks questions on the terminal ("Start Codex now?"…): always answer no
  const env = { ...childEnv(), CODEX_NON_INTERACTIVE: '1' };
  await /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
    const p = job.proc = spawnCli(cmd, args, { cwd: os.tmpdir(), env, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', d => (job.output += d)); p.stderr.on('data', d => (job.output += d));
    p.on('error', reject);
    p.on('close', code => (code === 0 ? resolve(undefined) : reject(new Error(tr(lang, 'Installation échouée (code {p})', { p: code })))));
  }));
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
  if (!isProvider(provider)) return;
  const bin = await findBin(provider);
  if (!bin) return;
  await runProc(bin, provider === 'claude' ? ['auth', 'logout'] : ['logout'], '', os.tmpdir(), 20000).catch(() => {});
  statusAt = 0;
}
