import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist', 'dist-*', 'node_modules', 'coverage'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Capitalised identifiers are JSX component references; the base rule cannot
      // see them used inside JSX without the React plugin.
      'no-unused-vars': [
        'warn',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]', ignoreRestSiblings: true },
      ],
      'react-refresh/only-export-components': 'off',
    },
  },
];
