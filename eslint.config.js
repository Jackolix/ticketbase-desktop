import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'src-tauri/target', 'ticketsystem-backend', 'coverage'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // The effect-dependency bugs in the ticket player came from stale/incorrect
      // deps, so this stays an error rather than the plugin default of warn.
      'react-hooks/exhaustive-deps': 'error',

      // The API layer is still loosely typed; Phase 02 replaces the `any`s with
      // Zod-derived types. Until then this is a warning so it doesn't block work,
      // but it stays visible.
      '@typescript-eslint/no-explicit-any': 'warn',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Node-side config files run outside the browser globals.
    files: ['*.config.{js,ts}', 'scripts/**/*.js'],
    languageOptions: { globals: globals.node },
  },
);
