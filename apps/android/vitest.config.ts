import { defineConfig } from 'vitest/config';

/**
 * The tests cover the pure layer (src/lib) and the API layer (src/api) —
 * the code that must stay in lock-step with the web inbox and nod-core.
 * The UI is not unit tested here (it needs a device/emulator).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
