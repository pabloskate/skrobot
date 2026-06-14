import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Pure-logic unit tests for the rules engine and resolvers. No DOM needed.
// The `@/` alias mirrors tsconfig so tests can import feature types/data.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
