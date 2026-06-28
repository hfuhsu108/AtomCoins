import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/AtomCoins/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '原子記帳 AtomCoins',
        short_name: '原子記帳',
        description: '個人記帳 PWA — 收支、信用卡、台股、發票',
        theme_color: '#3B5BDB',
        background_color: '#F6F7F9',
        display: 'standalone',
        scope: '/AtomCoins/',
        start_url: '/AtomCoins/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
})
