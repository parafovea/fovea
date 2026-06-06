import { defineConfig } from 'vite'

// Fast local iteration loop for demo.fovea.video bugfixes.
// Builds the SPA with VITE_DEMO_PUBLIC=1 and serves dist/ on
// http://localhost:5180, proxying /api/* to the live backend so
// frontend changes can be validated in seconds without a full
// docker stack on the laptop or a production deploy.
export default defineConfig({
  preview: {
    port: 5180,
    proxy: {
      '/api': {
        target: 'https://demo.fovea.video',
        changeOrigin: true,
        secure: true,
        cookieDomainRewrite: 'localhost',
      },
    },
  },
})
