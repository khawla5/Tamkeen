import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  /* `generated/**` is the Prisma client: machine-written, not ours to lint. */
  { ignores: ['dist/**', 'coverage/**', 'generated/**', 'src/generated/**', 'eslint.config.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      /* Nest constructor-injected dependencies are "unused" to the linter. */
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
