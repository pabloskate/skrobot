import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Pure-logic unit tests for the rules engine, resolvers, and the animation
// core's symmetry invariants. No DOM needed.
// The `@/` alias mirrors tsconfig so tests can import feature types/data.
export default defineConfig({
  test: {
    environment: 'node',
    // The animation sweeps pose every trick in every stance, and a busy
    // machine can push one past vitest's 5 s default.
    testTimeout: 15_000,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'scripts/**/*.test.ts', 'packages/animations/src/**/*.test.ts', 'skrobot-animations/src/blender-prototype/**/*.test.ts'],
  },
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${fileURLToPath(new URL('./src', import.meta.url))}/` },
      // The three.js stage entry before the package root.
      { find: /^@skrobot\/animations\/three$/, replacement: fileURLToPath(new URL('./packages/animations/src/three/index.ts', import.meta.url)) },
      { find: /^@skrobot\/animations$/, replacement: fileURLToPath(new URL('./packages/animations/src/index.ts', import.meta.url)) },
    ],
  },
})
