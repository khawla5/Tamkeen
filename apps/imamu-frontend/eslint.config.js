import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // This app intentionally co-locates contexts, hooks, and small constants
      // with their components. The rule is dev-HMR guidance, not a correctness
      // check, and it creates noise for shadcn/base-ui style modules.
      'react-refresh/only-export-components': 'off',
      // The current data-loading pattern sets loading/error state inside
      // effects. Keep this as normal React app code until data fetching moves
      // behind a shared query/cache layer.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
