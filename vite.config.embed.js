// ── Embed-Bundle-Build (ADR-0006 D4) ──
// Eigenes Vite-lib-mode-Build, getrennt von der Haupt-App: dist/embed.js als
// IIFE (selbstregistrierend, <script src> ohne Module-Handling), gleiche
// Origin wie aiui (kein CDN — ADR offene Frage 3). emptyOutDir:false, damit
// der App-Build daneben bleibt.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  // Das Bundle läuft in fremden Browser-Kontexten: dort gibt es KEIN `process`.
  // Ohne dieses Define bleibt process.env.NODE_ENV aus React/CJS-Interop im
  // Bundle und das IIFE wirft "process is not defined" BEVOR es sich
  // überhaupt registriert — das Widget mountet dann gar nicht. Production ist
  // hier korrekt: Prod-Hosts laden embed.js ohne Dev-Devtools-Zeug.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/embed/embed.jsx',
      formats: ['iife'],
      name: 'AiChatWidget',
      fileName: () => 'embed.js',
    },
  },
})
