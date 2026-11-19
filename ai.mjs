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
export const PROVIDERS = { claude: 'Claude (abonnement Claude)', codex: 'ChatGPT (abonnement via Codex)' };

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

// ---------- Localisation des binaires ----------
const binCache = new Map();
async function findBin(name) {
  if (binCache.has(name)) return binCache.get(name);
  const dirs = [path.join(HOME, '.local/bin'), path.join(HOME, '.claude/local'), '/opt/homebrew/bin', '/usr/local/bin',
    path.join(HOME, '.bun/bin'), path.join(HOME, '.npm-global/bin'), ...(process.env.PATH || '').split(':')];
  let found = null;
  for (const d of dirs) {
    const p = path.join(d, name);
    try { fs.accessSync(p, fs.constants.X_OK); found = p; break; } catch {}
  }
  if (!found) {
    found = await new Promise(res => execFile('/bin/zsh', ['-lic', `command -v ${name}`], { timeout: 6000 },
      (e, out) => res(!e && out.trim().startsWith('/') ? out.trim().split('\n').pop() : null)));
  }
  binCache.set(name, found);
  return found;
}

export async function available() {
  const out = {};
  for (const k of Object.keys(PROVIDERS)) out[k] = !!(await findBin(k));
  return out;
}

function childEnv() {
  const env = { ...process.env };
  // On veut l'abonnement, pas une clé API facturée à l'usage ; et pas de détection « session imbriquée ».
  // (et si Taupe est lancé depuis une app Claude, on ne réutilise pas son proxy/sa session)
  for (const k of Object.keys(env)) if (/^(CLAUDE|ANTHROPIC_|OPENAI_API_KEY$|AI_AGENT$|BAGGAGE$)/.test(k)) delete env[k];
  return env;
}

function runProc(bin, args, input, cwd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const t = setTimeout(() => { p.kill('SIGTERM'); reject(new Error(`Délai dépassé (${timeoutMs / 1000} s)`)); }, timeoutMs);
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
    p.stdin.end(input);
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

const CHAT_PROMPT = `Tu es l'assistant intégré à Taupe, un explorateur d'espace disque sur le Mac de l'utilisateur (un développeur).
- Réponds en français, de façon concise et concrète : phrases courtes, listes, tailles chiffrées.
- Appuie-toi sur le CONTEXTE ci-dessous : la structure du disque (noms, tailles, dates). Tu ne vois PAS le contenu des fichiers ; ne l'invente pas.
- Quand tu cites un fichier ou un dossier, écris son chemin ABSOLU complet entre backticks, ex. \`/Users/x/projet/node_modules\` : il devient cliquable dans Taupe.
- Tu ne peux rien supprimer toi-même : l'utilisateur coche les éléments dans Taupe puis « Mettre à la corbeille ». Dis-le si on te demande de supprimer.
- Si l'info n'est pas dans le contexte (dossier non détaillé), dis-le et propose d'ouvrir ce dossier dans Taupe pour que tu le voies.
- Signale clairement les risques (données perso, projets actifs, travail non commité). Commandes shell dans des blocs de code.
`;

export function chat(provider, context, messages) {
  const convo = messages.slice(-12).map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'} : ${String(m.content).slice(0, 4000)}`).join('\n\n');
  return call(provider, `${CHAT_PROMPT}\n=== CONTEXTE ===\n${context}\n\n=== CONVERSATION ===\n${convo}\n\nRéponds au dernier message de l'utilisateur.`,
    { fast: true, timeoutMs: 180000 });
}
