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

  // Shared animation package is reusable UI/animation source. It must stay free
  // of app/feature/platform imports so both the game and playground can consume it.
  {
    files: ['packages/animations/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports({
        group: ['@/*', 'src', 'src/**', '../src/**', '../../src/**', 'skrobot-animations', 'skrobot-animations/**', '../skrobot-animations/**'],
        message: 'Shared animations must not import app, feature, platform, or playground code. Pass structural data in instead.',
      }),
    },
  },

  // The playground is a preview shell. Reusable behavior belongs in the shared
  // package, and production feature code stays out of the playground.
  {
    files: ['skrobot-animations/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports({
        group: ['@/*', 'src', 'src/**', '../src/**', '../../src/**'],
        message: 'The animation playground must not import the web app src tree. Use @skrobot/animations for shared animation behavior.',
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
    files: ['src/features/{analytics,auth,billing,install,tricks}/**/*.{ts,tsx}'],
    ignores: ['src/features/*/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(noClientServerImports, noClientPlatformServerImports, noFeatureImports),
    },
  },

  {
    files: ['src/features/records/**/*.{ts,tsx}'],
    ignores: ['src/features/*/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(noClientServerImports, noClientPlatformServerImports, {
        group: ['@/features/analytics', '@/features/auth', '@/features/billing', '@/features/gallery', '@/features/game', '@/features/home', '@/features/install', '@/features/robots', '@/features/skater', '@/features/voice'],
        message: 'Records may depend on tricks only, for stable trick identity and legacy log migration. See docs/ARCHITECTURE.md.',
      }),
    },
  },

  {
    files: ['src/features/gallery/**/*.{ts,tsx}'],
    ignores: ['src/features/*/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(noClientServerImports, noClientPlatformServerImports, {
        group: ['@/features/auth', '@/features/billing', '@/features/game', '@/features/home', '@/features/install', '@/features/voice'],
        message: 'Gallery may depend on tricks, records, robots, and skater (the player model, for the stats tab). It browses the catalog, owns video tip curation, and overlays the player trick book. See docs/ARCHITECTURE.md.',
      }),
    },
  },

  {
    files: ['src/features/robots/**/*.{ts,tsx}'],
    ignores: ['src/features/*/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(noClientServerImports, noClientPlatformServerImports, {
        group: ['@/features/auth', '@/features/billing', '@/features/game', '@/features/home', '@/features/install', '@/features/voice', '@/features/skater'],
        message:
          'Robots may depend on tricks/records only. Keep screen/game/auth concerns out of the roster model. See docs/ARCHITECTURE.md.',
      }),
    },
  },

  {
    files: ['src/features/skater/**/*.{ts,tsx}'],
    ignores: ['src/features/*/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(noClientServerImports, noClientPlatformServerImports, {
        group: ['@/features/auth', '@/features/billing', '@/features/gallery', '@/features/game', '@/features/home', '@/features/install', '@/features/voice'],
        message:
          'Skater is the player model (skate score, adaptive rival) and may depend on tricks/records/robots only. See docs/ARCHITECTURE.md.',
      }),
    },
  },

  {
    files: ['src/features/home/**/*.{ts,tsx}'],
    ignores: ['src/features/*/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(noClientServerImports, noClientPlatformServerImports, {
        group: ['@/features/auth', '@/features/billing', '@/features/game', '@/features/install', '@/features/tricks', '@/features/voice'],
        message: 'Home composes records, robots, and skater only. Route broader flow changes through AppShell. See docs/ARCHITECTURE.md.',
      }),
    },
  },

  {
    files: ['src/features/game/**/*.{ts,tsx}'],
    ignores: ['src/features/*/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(noClientServerImports, noClientPlatformServerImports, {
        group: ['@/features/auth', '@/features/billing', '@/features/home', '@/features/install', '@/features/voice'],
        message: 'Game may depend on tricks/robots/records only. Voice wraps game, not the reverse. See docs/ARCHITECTURE.md.',
      }),
    },
  },

  {
    files: ['src/features/voice/**/*.{ts,tsx}'],
    ignores: ['src/features/*/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(noClientServerImports, noClientPlatformServerImports, {
        group: ['@/features/home', '@/features/install'],
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
