import { defineConfig } from 'tsup'
import { builtinModules } from 'node:module'

export default defineConfig({
  entry: ['src/cli/main.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist/server',
  clean: false,  // vite builds client first
  splitting: false,
  sourcemap: true,
  shims: true,  // Provides `require` polyfill for CJS deps in ESM bundles
  dts: false,
  banner: {
    js: [
      '#!/usr/bin/env node',
      'import { createRequire as __bundleRequire } from "node:module";',
      'const require = __bundleRequire(import.meta.url);',
    ].join('\n'),
  },
  external: [
    ...builtinModules,
    ...builtinModules.map(m => `node:${m}`),
  ],
  noExternal: [/.*/],  // Bundle all npm packages (but not node built-ins)
})
