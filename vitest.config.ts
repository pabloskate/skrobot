import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Pure-logic unit tests for the rules engine, resolvers, and the animation
// core's symmetry invariants. No DOM needed.
// The `@/` alias mirrors tsconfig so tests can import feature types/data.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'scripts/**/*.test.ts', 'packages/animations/src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@skrobot/animations': fileURLToPath(new URL('./packages/animations/src/index.ts', import.meta.url)),
    },
  },
})
