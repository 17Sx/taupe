// ESLint (flat config). Run through `npm run check`.
import js from '@eslint/js';
import globals from 'globals';

// The UI declares its own `AI` variable (AI suggestions), not the browser's built-in one
const { AI: _builtinAI, ...browser } = globals.browser;

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-control-regex': 'off', // ANSI escape sequences in the AI CLIs' output
    },
  },
  {
    files: ['src/**/*.mjs', 'electron/**/*.mjs', 'scripts/**/*.mjs', '*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
  },
  {
    // UI: classic browser scripts sharing one global scope (i18n.js is loaded before app.js)
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest', sourceType: 'script',
      globals: { ...browser, LANG: 'readonly', LOCALE: 'readonly', t: 'readonly', tn: 'readonly', applyI18n: 'readonly' },
    },
    // top-level functions of i18n.js are used by app.js
    rules: { 'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }], 'no-redeclare': ['error', { builtinGlobals: false }] },
  },
];
