// SPDX-License-Identifier: AGPL-3.0-only
/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // Loopback only, like the Docker services in infra/.
    host: '127.0.0.1',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
