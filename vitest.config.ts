import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    clearMocks: true,
    projects: [
      {
        test: {
          name: 'contracts',
          environment: 'node',
          include: ['packages/contracts/src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'api',
          environment: 'node',
          include: ['apps/api/src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'controller',
          environment: 'node',
          include: ['apps/web/src/controller/**/*.test.ts'],
          passWithNoTests: true,
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'components',
          environment: 'jsdom',
          environmentOptions: {
            jsdom: {
              url: 'http://localhost/',
            },
          },
          include: ['apps/web/src/**/*.test.tsx'],
          setupFiles: ['apps/web/src/test/setup.ts'],
        },
      },
    ],
    restoreMocks: true,
  },
})

