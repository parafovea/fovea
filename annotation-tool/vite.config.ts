import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// Backend URL for API proxy
// - Docker dev mode: Set VITE_BACKEND_URL=http://backend:3001 in docker-compose.dev.yml
// - Host-based dev: Uses localhost:3001 by default
const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:3001'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      }
    }
  }
})