import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e.spec.ts'],
    setupFiles: ['./test/setup-env.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  // SWC emite metadatos de decoradores (necesario para la inyección de dependencias de NestJS)
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
