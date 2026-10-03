import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0'),
  },
  base: process.env.VITE_BASE || '/',
  build: {
    // dist/ wird MIT dem embed.js des lib-mode-Builds geteilt — der App-Build
    // darf das Verzeichnis nicht leeren, sonst verschwindet embed.js je nach
    // Build-Reihenfolge (build:embed hat emptyOutDir:false, build nicht).
    emptyOutDir: false,
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['lubuntu.local', 'neusiedl.duckdns.org'],
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.PORT || 3107}`,
        changeOrigin: true,
      },
    },
  },
})
