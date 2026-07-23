import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

// 語意版本取自 package.json（發布時手動 bump），附建置 SHA（CI 用 GITHUB_SHA、本機用 git），
// 供設定頁顯示「目前版本」，部署後可在手機比對是否更新到位（做法沿用 CoTravel）
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

function resolveAppVersion() {
  const sha = process.env.GITHUB_SHA
    ? process.env.GITHUB_SHA.slice(0, 7)
    : (() => {
        try {
          return execSync('git rev-parse --short HEAD').toString().trim()
        } catch {
          return ''
        }
      })()
  return sha ? `v${pkg.version} (${sha})` : `v${pkg.version}`
}

export default defineConfig({
  base: '/AtomCoins/',
  // 編譯期注入版本資訊（dev 與 build 皆生效），由設定頁顯示
  define: {
    __APP_VERSION__: JSON.stringify(resolveAppVersion()),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // prompt：偵測到新版時不靜默重載，由頂部橫幅／設定頁「檢查更新」讓使用者手動套用
      registerType: 'prompt',
      // Web Push（批次 7）：generateSW 模式下無法直接寫 SW，改用 importScripts 掛自訂 push handler。
      // push-handler.js 放 public/，build 後位於站台根 /AtomCoins/push-handler.js。
      workbox: {
        importScripts: ['push-handler.js'],
      },
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
