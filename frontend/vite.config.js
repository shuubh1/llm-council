import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
    allowedHosts: [
      'fatcataiconsulting.tech',
      'www.fatcataiconsulting.tech',
      'amusing-integrity-production.up.railway.app',
      'localhost',
      '127.0.0.1',
    ],
  },
})
