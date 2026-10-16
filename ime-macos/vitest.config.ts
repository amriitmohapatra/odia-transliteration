// Unit tests for the macOS input method's TypeScript side: `npx vitest run --root ime-macos` (part of `npm test`).
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const core = resolve(__dirname, '../core/src');

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@odia\/core\/(.*)$/, replacement: `${core}/$1.ts` },
      { find: /^@odia\/core$/, replacement: `${core}/index.ts` },
    ],
  },
  test: { include: ['test/**/*.test.ts'] },
});
