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
  build: {
    // Split the monolithic 2.4 MB bundle into a handful of coherent
    // chunks so the demo catalogue's first paint downloads only
    // what it actually needs (React + the catalogue page + UI
    // primitives) instead of the full annotation + ontology +
    // world workspace code base. The catalogue is the first
    // impression — keep it under ~300 kB gzipped so first paint
    // lands quickly even on a slow conference Wi-Fi link.
    // No manualChunks — the previous split caused
    // "Cannot read properties of undefined (reading 'forwardRef')"
    // at runtime because Radix and other React-consuming packages
    // ended up in a chunk that loaded BEFORE the vendor-react
    // chunk that holds React's forwardRef export. Vite's default
    // automatic chunking + the React.lazy splits on the route
    // boundary already shrink the catalogue's first-paint payload
    // dramatically without breaking the React module graph.
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 3000,
    proxy: {
      // Telemetry traces proxy - forward directly to OTEL Collector
      '/api/telemetry/traces': {
        target: otelCollectorUrl,
        changeOrigin: true,
        rewrite: (_path) => '/v1/traces',
      },
      // All other API requests go to backend
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      }
    }
  }
})