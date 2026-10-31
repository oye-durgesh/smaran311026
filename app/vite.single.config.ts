import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Self-contained build (everything inlined into one HTML file) for sharing a demo. Not used for production hosting. */
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist-single', assetsInlineLimit: 100_000_000, cssCodeSplit: false, rollupOptions: { output: { inlineDynamicImports: true } } },
})
