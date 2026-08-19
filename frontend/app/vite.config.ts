import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Explicit, not relying on the default: a production source map publishes
    // the readable source of the admin panel — every API path, every field
    // name — to anyone who opens devtools.
    sourcemap: false,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // Uploaded pandit photos and videos are served by the backend from
      // backend/public/uploads. Without this the dev server answers
      // /uploads/... with the SPA's index.html (its history fallback), so an
      // <img> gets HTML and renders broken while a <video> just stays black.
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
