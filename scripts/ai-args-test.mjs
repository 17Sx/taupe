// Checks the arguments Taupe passes to the AI CLIs (Claude Code, Codex): the AI must only ever get
// Taupe's own MCP tools — no shell, no file reading or writing, no approval bypass.
import assert from 'node:assert/strict';
import { analysisArgs, chatArgs, CODEX_LOCKDOWN, TOOL_NAMES, isProvider } from '../src/ai.mjs';

let ok = 0;
const step = (name, fn) => { fn(); ok++; console.log('✓', name); };
const valueOf = (args, flag) => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
const allValues = (args, flag) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));
const FORBIDDEN = ['--dangerously-skip-permissions', '--dangerously-bypass-approvals-and-sandbox', '--full-auto', '--yolo',
  '--permission-mode', '--add-dir', 'workspace-write', 'danger-full-access', '--enable'];
const noForbidden = args => { for (const f of FORBIDDEN) assert.ok(!args.includes(f), `forbidden argument: ${f}`); };

const mcp = { command: '/path/to/node', args: ['/path/to/mcp.mjs'], env: { TAUPE_URL: 'http://127.0.0.1:1/', TAUPE_TOKEN: 't"o\\k', TAUPE_CHAT: 'c' } };
const claudeAnalysis = analysisArgs('claude', { schema: { type: 'object' } });
const claudeChat = chatArgs('claude', { mcpConfigFile: '/tmp/mcp.json' });
const codexAnalysis = analysisArgs('codex', { schemaFile: '/tmp/schema.json', outFile: '/tmp/out.txt' });
const codexChat = chatArgs('codex', { mcp, outFile: '/tmp/out.txt' });

step('Claude (analysis): no tools, no MCP server', () => {
  assert.equal(valueOf(claudeAnalysis, '--tools'), '');
  assert.ok(claudeAnalysis.includes('--strict-mcp-config'));
  assert.ok(!claudeAnalysis.includes('--mcp-config'));
  assert.ok(!claudeAnalysis.includes('--allowedTools'));
  noForbidden(claudeAnalysis);
});

step('Claude (chat): built-in tools off, only the Taupe MCP tools allowed', () => {
  assert.equal(valueOf(claudeChat, '--tools'), '');
  assert.ok(claudeChat.includes('--strict-mcp-config'));
  assert.equal(valueOf(claudeChat, '--mcp-config'), '/tmp/mcp.json');
  const allowed = claudeChat.slice(claudeChat.indexOf('--allowedTools') + 1);
  assert.deepEqual(allowed, TOOL_NAMES.map(t => `mcp__taupe__${t}`));
  noForbidden(claudeChat);
});

for (const [name, args] of [['analysis', codexAnalysis], ['chat', codexChat]]) {
  step(`Codex (${name}): shell tools disabled, read-only sandbox, no approvals`, () => {
    assert.deepEqual(CODEX_LOCKDOWN, ['--disable', 'shell_tool', '--disable', 'unified_exec']);
    for (const f of ['shell_tool', 'unified_exec']) assert.ok(allValues(args, '--disable').includes(f), `--disable ${f} missing`);
    assert.equal(valueOf(args, '-s'), 'read-only');
    assert.ok(allValues(args, '-c').includes('approval_policy="never"'));
    assert.equal(args[0], 'exec');
    assert.ok(args.includes('--ephemeral'));
    // no other way back to a shell: neither a re-enabled feature nor a config override for it
    assert.ok(!allValues(args, '-c').some(c => /^features\.|^sandbox_mode|^sandbox_permissions/.test(c)), 'feature/sandbox override found');
    noForbidden(args);
  });
}

step('Codex (chat): only the Taupe MCP server, env passed as valid TOML', () => {
  const cfg = allValues(codexChat, '-c').filter(c => c.startsWith('mcp_servers.'));
  assert.deepEqual(cfg.map(c => c.split('=')[0]), ['mcp_servers.taupe.command', 'mcp_servers.taupe.args', 'mcp_servers.taupe.env']);
  assert.ok(cfg[2].includes('TAUPE_TOKEN="t\\"o\\\\k"'), 'token must be escaped');
});

step('only real providers are accepted', () => {
  assert.ok(isProvider('claude') && isProvider('codex'));
  for (const p of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '', 'claude; rm -rf ~', null, undefined, 42]) assert.ok(!isProvider(p), String(p));
});

console.log(`\n${ok} tests CLI OK`);
