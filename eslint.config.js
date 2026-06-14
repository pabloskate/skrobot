import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// --- Architecture boundaries (CLAUDE.md "Rules") encoded as lint errors ---------
// These mirror the import invariants documented in CLAUDE.md so a violation is a
// red build, not just tribal knowledge. `group` globs use gitignore semantics
// (the `ignore` package): `*` is one path segment, `**` is many, `!` re-allows.

// Rule 1: import a feature through its barrel, never a deep path. `@/features/x`
// (the barrel) is fine; `@/features/x/anything` is not.
const noDeepFeatureImports = {
  group: ['@/features/*/**'],
  message:
    'Import a feature through its barrel (@/features/<name>), not a deep path. See CLAUDE.md rule 1.',
}

// Rule 4: nothing imports from src/app. App-internal code uses relative imports.
const noAppImports = {
  group: ['@/app', '@/app/**'],
  message: 'Nothing imports from src/app — move shared logic into a feature. See CLAUDE.md rule 4.',
}

export default defineConfig([
  globalIgnores(['.next', '.open-next', '.wrangler', 'next-env.d.ts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-restricted-imports': ['error', { patterns: [noDeepFeatureImports, noAppImports] }],
    },
  },

  // Sanctioned exception (rule 1): API routes are the one place allowed to reach
  // into a feature's server-only code, which is deliberately kept out of barrels.
  {
    files: ['src/app/api/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*/**', '!@/features/*/server', '!@/features/*/server/**'],
              message:
                'API routes may import @/features/<name>/server/* but no other deep feature path. See CLAUDE.md rule 1.',
            },
            noAppImports,
          ],
        },
      ],
    },
  },

  // Rule 4 (dependency direction): domain features must not import screen features.
  // The arrow is screens → domain, never the reverse.
  {
    files: ['src/features/{tricks,robots,records}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            noDeepFeatureImports,
            {
              group: ['@/features/home', '@/features/dice', '@/features/game', '@/features/voice'],
              message:
                'Domain features (tricks/robots/records) must not import screen features. Dependency direction is screens → domain. See CLAUDE.md rule 4.',
            },
            noAppImports,
          ],
        },
      ],
    },
  },
])
