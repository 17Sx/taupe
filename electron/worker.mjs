// The app's "engine" process: scanning + local API.
// Native actions (Trash, Finder, Quick Look…) are relayed to the main process.
import { startServer } from '../src/server.mjs';

const port = process.parentPort;
let seq = 0;
const waiting = new Map();

port.on('message', ({ data: m }) => {
  if (m?.type !== 'result') return;
  const w = waiting.get(m.id);
  if (!w) return;
  waiting.delete(m.id);
  m.error ? w.reject(new Error(m.error)) : w.resolve(m.result);
});

const call = name => (...args) => new Promise((resolve, reject) => {
  const id = ++seq;
  waiting.set(id, { resolve, reject });
  port.postMessage({ type: 'action', id, name, args });
});

/** @type {any} */
const actions = Object.fromEntries(['trash', 'reveal', 'open', 'quicklook', 'openExternal', 'pickFolder', 'openPrivacySettings'].map(n => [n, call(n)]));
// The token never goes into the page: the main process adds it to the window's requests.
// Same port as last time (TAUPE_PORT): the page keeps the same origin, so its localStorage
// (onboarding done, chat history, chosen AI) survives a restart.
const { url, token } = await startServer({ port: Number(process.env.TAUPE_PORT) || 0, actions, app: true, version: process.env.TAUPE_VERSION || '' });
port.postMessage({ type: 'ready', url, token });
