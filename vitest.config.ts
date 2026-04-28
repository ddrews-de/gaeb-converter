import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'app/**/*.{test,spec}.ts',
      'scripts/**/*.{test,spec}.ts',
    ],
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
});
