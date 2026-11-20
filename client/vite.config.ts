// SPDX-License-Identifier: AGPL-3.0-only
/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// `--mode desktop` builds the client for the Tauri app (desktop/): its own output
// folder and port, and the server URL from .env.desktop (no proxy: the app calls
// the API on its origin, as it will in production).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    // Loopback only, like the Docker services in infra/.
    host: '127.0.0.1',
    ...(mode === 'desktop' ? { port: 5174, strictPort: true } : {}),
    // Same-origin API calls during development: no CORS setup needed.
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      // Real-time gateway (WebSocket); the browser's Origin is passed on for the server's check.
      '/socket': { target: 'ws://127.0.0.1:4000', ws: true },
    },
  },
  build: {
    outDir: mode === 'desktop' ? 'dist-desktop' : 'dist',
    // The LiveKit SDK is one ~600 kB chunk; it is loaded lazily when joining a room.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
}))
