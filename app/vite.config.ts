import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development, /api is forwarded to the local prescription-reader API (npm run dev:api).
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
})
