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
        // icons 由 scripts/gen-icons.mjs 從 public/favicon.svg 產生（換圖重跑 npm run gen:icons）
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
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
          {
            // Android 自適應圖示用：滿版無圓角、主元素縮進安全區
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // 長按 app icon 的捷徑（iOS 桌面 widget 無法用純 PWA 達成，改捷徑秒開，docs/06 §5）
        shortcuts: [
          {
            name: '記一筆',
            short_name: '記一筆',
            url: '/AtomCoins/#/add',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: '發票匣',
            short_name: '發票匣',
            url: '/AtomCoins/#/transactions?tab=invoice',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
    }),
  ],
})
