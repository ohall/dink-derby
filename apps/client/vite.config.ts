import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  // shared-types is a linked CommonJS workspace, now used for runtime validation.
  optimizeDeps: { include: ['@dink-derby/shared-types'] },
  build: { commonjsOptions: { include: [/shared-types\/dist/, /node_modules/] } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['dink-derby-icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Dink Derby',
        short_name: 'Dink Derby',
        description: 'Offline fishing derbies with shared scoring and catch photos.',
        start_url: '/',
        display: 'standalone',
        background_color: '#f3e5c5',
        theme_color: '#123b35',
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // Auth responses and private photos must not cross account boundaries
        // through a URL-keyed service-worker cache. Dexie owns offline data.
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['e2e/**', 'node_modules/**'],
  },
} as any)
