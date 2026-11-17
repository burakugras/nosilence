// SPDX-License-Identifier: AGPL-3.0-only
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// spikes/e2ee, with an upper-case Windows drive letter (see client/scripts/vitest.mjs)
const spikeRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/^[a-z]:/, (d) =>
  d.toUpperCase(),
)

export default defineConfig({
  server: {
    host: '127.0.0.1',
    proxy: { '/api': 'http://127.0.0.1:4000' },
    // Serve the wasm-pack output in ../mls-wasm/pkg, which lives outside this folder.
    fs: { allow: [spikeRoot] },
  },
  // The wasm-pack output is loaded at runtime, not pre-bundled.
  optimizeDeps: { exclude: ['mls-wasm'] },
})
