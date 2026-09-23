import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default [
  includeIgnoreFile(gitignorePath),
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  prettier,
  ...svelte.configs['flat/prettier'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
  },
  {
    files: ['**/*.svelte.ts'],
    languageOptions: {
      parser: ts.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    // Disable specific rules
    rules: {
      'svelte/no-navigation-without-resolve': 'off',
    },
  },
  {
    // Test suites and e2e specs predate the eslint 9→10 bump, which promoted
    // `no-explicit-any` to error and added the new `preserve-caught-error`
    // core rule — surfacing hundreds of pre-existing violations here that
    // aren't worth a mechanical sweep. Real app code (src/, cdk/lib/ minus
    // scripts) stays fully enforced.
    files: [
      'tests/e2e/**',
      '**/__tests__/**',
      '**/*.test.ts',
      '**/*.svelte.test.ts',
      'src/lib/tests/**',
      'cdk/scripts/**',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'preserve-caught-error': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-case-declarations': 'off',
      'no-empty-pattern': 'off',
      'no-constant-condition': 'off',
      'no-useless-assignment': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-constant-binary-expression': 'off',
    },
  },
];
