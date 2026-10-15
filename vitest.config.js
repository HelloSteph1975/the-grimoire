import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'server', include: ['tests/server/**/*.test.js'], environment: 'node' } },
      {
        plugins: [react()],
        test: { name: 'client', include: ['tests/client/**/*.test.{js,jsx}'], environment: 'jsdom', testTimeout: 15000, hookTimeout: 15000, setupFiles: ['tests/client/setup.js'] },
      },
    ],
  },
});
