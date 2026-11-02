import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@platform-onenext/core': new URL('./packages/core/src/index.ts', import.meta.url).pathname,
      '@platform-onenext/database': new URL('./packages/database/src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['packages/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
})
