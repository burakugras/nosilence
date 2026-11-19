// SPDX-License-Identifier: AGPL-3.0-only
/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // Loopback only, like the Docker services in infra/.
    host: '127.0.0.1',
    // Same-origin API calls during development: no CORS setup needed.
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      // Real-time gateway (WebSocket); the browser's Origin is passed on for the server's check.
      '/socket': { target: 'ws://127.0.0.1:4000', ws: true },
    },
  },
  build: {
    // The LiveKit SDK is one ~600 kB chunk; it is loaded lazily when joining a room.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
