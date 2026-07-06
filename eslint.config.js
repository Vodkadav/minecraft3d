// M0.4 lint gate — recommended rule sets only, in-build and blocking (the
// portfolio static-analysis rule). No style rules: formatting churn on the
// engine tree isn't worth it; consistency is enforced by review. no-console
// is off — [laas] boot marks and tools/ CLI output are intentional, and the
// strict compiler is the real gate.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'dev-dist/', 'node_modules/', '*.config.js', '*.cjs', 'eslint.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // TSL/three node-material graphs legitimately thread `any`-ish node
      // types; the compiler (strict) is the real type gate
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['tools/**', '*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
      },
    },
  },
);
