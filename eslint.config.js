import js from '@eslint/js';
import globals from 'globals';
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^[A-Z]',
          argsIgnorePattern: '^_',
        },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
