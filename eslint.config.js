import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// --- Architecture boundaries (AGENTS.md "Rules") encoded as lint errors ---------
// These mirror the import invariants documented in AGENTS.md and
// docs/ARCHITECTURE.md so a violation is a red build, not just tribal knowledge.
// `group` globs use gitignore semantics (the `ignore` package): `*` is one path
// segment, `**` is many, `!` re-allows.

// Rule 1: import a feature through its barrel, never a deep path. `@/features/x`
// (the barrel) is fine; `@/features/x/anything` is not.
const noDeepFeatureImports = {
  group: ['@/features/*/**'],
  message:
    'Import a feature through its barrel (@/features/<name>), not a deep path. See AGENTS.md rule 1.',
}

// Rule 4: nothing imports from src/app. App-internal code uses relative imports.
const noAppImports = {
  group: ['@/app', '@/app/**'],
  message: 'Nothing imports from src/app — move shared logic into a feature. See AGENTS.md rule 4.',
}

const noClientServerImports = {
  group: ['./server', './server/**', '../server', '../server/**', '**/server/**', '@/features/*/server', '@/features/*/server/**'],
  message:
    'Feature server code is server-only. Client-safe feature files must not import server/. See AGENTS.md rule 5.',
}

const noClientPlatformServerImports = {
  group: ['@/platform/server', '@/platform/server/**'],
  message:
    'Platform server modules expose runtime bindings/secrets and must not be imported by client-safe files. See docs/ARCHITECTURE.md.',
}

const noFeatureImports = {
  group: ['@/features/*'],
  message: 'This feature is a leaf in the dependency graph. Add behavior locally or document a new boundary in docs/ARCHITECTURE.md.',
}

const noCorePackageImports = {
  group: ['@skrobot/core', '@skrobot/core/**'],
  message:
    'Do not reintroduce @skrobot/core. Product rules live in src/features, and apps/mobile is a WebView parity shell.',
}

function restrictedImports(...patterns) {
  return ['error', { patterns: [noDeepFeatureImports, noCorePackageImports, ...patterns, noAppImports] }]
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
      'no-restricted-imports': restrictedImports(),
    },
  },

  // Rule 5: non-server feature files must stay client-safe.
  {
    files: ['src/features/**/*.{ts,tsx}'],
    ignores: ['src/features/*/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(noClientServerImports, noClientPlatformServerImports),
    },
  },

  // App UI is client-safe unless it is an API route. Runtime bindings stay out.
  {
    files: ['src/app/**/*.{ts,tsx}'],
    ignores: ['src/app/api/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(noClientPlatformServerImports),
    },
  },

  // Platform is runtime infrastructure; it must not know about product features
  // or routes.
  {
    files: ['src/platform/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports({
        group: ['@/features/*'],
        message: 'Platform modules must not import product features. Move domain behavior back to a feature.',
      }),
    },
  },

  // Shared is only for primitive domain-neutral helpers. Keep it below both
  // platform and features.
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports({
        group: ['@/features/*', '@/platform', '@/platform/**'],
        message: 'Shared code must stay primitive and domain-neutral; it cannot depend on features or platform.',
      }),
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
                'API routes may import @/features/<name>/server/* but no other deep feature path. See AGENTS.md rule 1.',
            },
            noAppImports,
          ],
        },
      ],
    },
  },

  // Rule 4 (dependency direction): feature dependencies are explicit. When a
  // feature needs a new dependency, update docs/ARCHITECTURE.md and this map
  // together so the boundary stays discoverable and enforced.
  {
    files: ['src/features/{auth,billing,records,tricks}/**/*.{ts,tsx}'],
    ignores: ['src/features/*/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(noClientServerImports, noClientPlatformServerImports, noFeatureImports),
    },
  },

  {
    files: ['src/features/gallery/**/*.{ts,tsx}'],
    ignores: ['src/features/*/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(noClientServerImports, noClientPlatformServerImports, {
        group: ['@/features/auth', '@/features/billing', '@/features/dice', '@/features/game', '@/features/home', '@/features/records', '@/features/robots', '@/features/voice'],
        message: 'Gallery may depend on tricks only. It browses the catalog and owns video tip curation. See docs/ARCHITECTURE.md.',
      }),
    },
  },

  {
    files: ['src/features/robots/**/*.{ts,tsx}'],
    ignores: ['src/features/*/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(noClientServerImports, noClientPlatformServerImports, {
        group: ['@/features/auth', '@/features/billing', '@/features/dice', '@/features/game', '@/features/home', '@/features/voice'],
        message:
          'Robots may depend on tricks/records only. Keep screen/game/auth concerns out of the roster model. See docs/ARCHITECTURE.md.',
      }),
    },
  },

  {
    files: ['src/features/home/**/*.{ts,tsx}'],
    ignores: ['src/features/*/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(noClientServerImports, noClientPlatformServerImports, {
        group: ['@/features/auth', '@/features/billing', '@/features/dice', '@/features/game', '@/features/tricks', '@/features/voice'],
        message: 'Home composes records and robots only. Route broader flow changes through AppShell. See docs/ARCHITECTURE.md.',
      }),
    },
  },

  {
    files: ['src/features/dice/**/*.{ts,tsx}'],
    ignores: ['src/features/*/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(noClientServerImports, noClientPlatformServerImports, {
        group: ['@/features/auth', '@/features/billing', '@/features/game', '@/features/home', '@/features/records', '@/features/robots', '@/features/voice'],
        message: 'Dice is a standalone trick roller and may depend on tricks only. See docs/ARCHITECTURE.md.',
      }),
    },
  },

  {
    files: ['src/features/game/**/*.{ts,tsx}'],
    ignores: ['src/features/*/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(noClientServerImports, noClientPlatformServerImports, {
        group: ['@/features/auth', '@/features/billing', '@/features/dice', '@/features/home', '@/features/voice'],
        message: 'Game may depend on tricks/robots/records only. Voice wraps game, not the reverse. See docs/ARCHITECTURE.md.',
      }),
    },
  },

  {
    files: ['src/features/voice/**/*.{ts,tsx}'],
    ignores: ['src/features/*/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(noClientServerImports, noClientPlatformServerImports, {
        group: ['@/features/dice', '@/features/home'],
        message: 'Voice wraps game and auth/billing quota UI; it should not depend on unrelated screens. See docs/ARCHITECTURE.md.',
      }),
    },
  },

  // Server feature modules can import platform/server, but API routes remain the
  // place where cross-feature server orchestration happens.
  {
    files: ['src/features/*/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports({
        group: ['@/features/*'],
        message: 'Feature server modules should not compose other feature barrels. Keep cross-feature server orchestration in API routes.',
      }),
    },
  },
])
