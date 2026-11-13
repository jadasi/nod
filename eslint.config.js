import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'packages/contract/src/generated/**',
      'openspec/**',
      '.agents/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain browser JS, no build step.
    files: ['apps/web/public/**/*.js'],
    languageOptions: {
      globals: Object.fromEntries(
        [
          'document',
          'window',
          'fetch',
          'localStorage',
          'navigator',
          'setInterval',
          'setTimeout',
          'clearTimeout',
          'Date',
          'URL',
          'AbortController',
          'TextDecoderStream',
          'Node',
          'self',
          'caches',
          'location',
        ].map((g) => [g, 'readonly']),
      ),
    },
  },
);
