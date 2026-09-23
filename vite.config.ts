/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Polling makes hot reload work through Docker bind mounts on macOS.
    watch: process.env.CHOKIDAR_USEPOLLING ? { usePolling: true } : undefined,
  },
  test: {
    environment: 'happy-dom',
    globals: true,
  },
})
