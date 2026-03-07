import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

// Backend URL for API proxy
// - Docker dev mode: Set VITE_BACKEND_URL=http://backend:3001 in docker-compose.dev.yml
// - Host-based dev: Uses localhost:3001 by default
const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:3001'

// OTEL Collector URL for trace forwarding
const otelCollectorUrl = process.env.OTEL_COLLECTOR_URL || 'http://localhost:4318'

export default defineConfig({
  plugins: [react(), tsconfigPaths(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      // Telemetry traces proxy - forward directly to OTEL Collector
      '/api/telemetry/traces': {
        target: otelCollectorUrl,
        changeOrigin: true,
        rewrite: (path) => '/v1/traces',
      },
      // All other API requests go to backend
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      }
    }
  }
})