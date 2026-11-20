// MCP server (stdio, JSON-RPC 2.0) launched by Claude Code or Codex during a conversation.
// It exposes Taupe's tools to the AI and relays each call to the local engine (src/server.mjs),
// which runs the action and shows it live in the assistant. Zero dependencies.
//
// Environment variables: TAUPE_URL (http://127.0.0.1:port/), TAUPE_TOKEN, TAUPE_CHAT (conversation id).
import readline from 'node:readline';

const { TAUPE_URL, TAUPE_TOKEN, TAUPE_CHAT } = process.env;

export const TOOLS = [
  {
    name: 'search_files',
    description: 'Cherche des fichiers et dossiers par nom dans le disque analysé par Taupe. Renvoie chemins, tailles et dates, triés par taille.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Texte à chercher dans les noms (ex : "node_modules", ".dmg", "facture")' },
      folder: { type: 'string', description: 'Dossier où chercher (chemin absolu). Par défaut : le dossier affiché.' },
      limit: { type: 'number', description: 'Nombre maximum de résultats (défaut 30, max 200)' },
    }, required: ['query'] },
  },
  {
    name: 'list_folder',
    description: 'Liste le contenu d’un dossier (éléments directs triés par taille, avec le nombre de fichiers et la date de modification).',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Chemin absolu du dossier' } }, required: ['path'] },
  },
  {
    name: 'big_files',
    description: 'Les plus gros fichiers d’un dossier et de ses sous-dossiers.',
    inputSchema: { type: 'object', properties: {
      folder: { type: 'string', description: 'Dossier (chemin absolu). Par défaut : le dossier affiché.' },
      limit: { type: 'number', description: 'Nombre de fichiers (défaut 20, max 100)' },
    } },
  },
  {
    name: 'open_folder',
    description: 'Ouvre un dossier dans l’interface de Taupe pour le montrer à l’utilisateur.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Chemin absolu du dossier' } }, required: ['path'] },
  },
  {
    name: 'select_items',
    description: 'Coche des fichiers/dossiers dans Taupe pour que l’utilisateur les voie et décide. Ne supprime rien.',
    inputSchema: { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' }, description: 'Chemins absolus' } }, required: ['paths'] },
  },
  {
    name: 'move_to_trash',
    description: 'Propose de mettre des éléments à la Corbeille. L’utilisateur voit la liste et doit confirmer dans Taupe ; l’outil attend sa réponse et indique ce qui a été fait.',
    inputSchema: { type: 'object', properties: {
      paths: { type: 'array', items: { type: 'string' }, description: 'Chemins absolus à mettre à la Corbeille' },
      reason: { type: 'string', description: 'Pourquoi c’est supprimable (une phrase, affichée à l’utilisateur)' },
    }, required: ['paths', 'reason'] },
  },
];

async function callTaupe(name, args) {
  const r = await fetch(new URL('api/tool', TAUPE_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-token': TAUPE_TOKEN },
    body: JSON.stringify({ chat: TAUPE_CHAT, name, args }),
  });
  const j = /** @type {any} */ (await r.json().catch(() => ({ error: `HTTP ${r.status}` })));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');

async function handle(msg) {
  const { id, method, params } = msg;
  const reply = result => id !== undefined && send({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => id !== undefined && send({ jsonrpc: '2.0', id, error: { code, message } });
  switch (method) {
    case 'initialize':
      return reply({ protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} },
        serverInfo: { name: 'taupe', version: '1.0.0' } });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS });
    case 'tools/call': {
      const name = params?.name;
      if (!TOOLS.some(t => t.name === name)) return fail(-32602, `Outil inconnu : ${name}`);
      try {
        const result = await callTaupe(name, params.arguments || {});
        return reply({ content: [{ type: 'text', text: JSON.stringify(result) }] });
      } catch (e) {
        return reply({ content: [{ type: 'text', text: `Erreur : ${e.message}` }], isError: true });
      }
    }
    default:
      if (method?.startsWith('notifications/')) return; // no response to notifications
      return fail(-32601, `Méthode inconnue : ${method}`);
  }
}

if (TAUPE_URL) {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', line => {
    if (!line.trim()) return;
    let msg; try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON invalide' } }); }
    handle(msg);
  });
}
