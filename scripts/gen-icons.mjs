// 由 public/favicon.svg 產生 PWA 安裝所需的 PNG 圖示（缺 PNG icon 是 Chrome 拒絕安裝的主因）。
// 用 @resvg/resvg-js 而非 sharp——sharp 在含中文的專案路徑下會 ERR_DLOPEN_FAILED
// （libvips DLL 在非 ASCII 路徑解析失敗，CoTravel 專案實測）。換圖後 `npm run gen:icons` 重跑。
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const favicon = readFileSync(resolve(root, 'public/favicon.svg'), 'utf8')

// maskable 需滿版無圓角（Android 會裁圓/squircle，圓角會露白角），
// 主元素縮進中央 80% 安全區：藍底滿版＋「$」置中。
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#3B5BDB"/>
  <text x="16" y="21" text-anchor="middle" font-size="14" font-weight="700" fill="#fff" font-family="sans-serif">$</text>
</svg>`

const targets = [
  ['pwa-64x64.png', 64, favicon],
  ['pwa-192x192.png', 192, favicon],
  ['pwa-512x512.png', 512, favicon],
  ['apple-touch-icon-180x180.png', 180, favicon],
  ['maskable-icon-512x512.png', 512, maskable],
]

for (const [name, size, source] of targets) {
  const png = new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(resolve(root, 'public', name), png)
  console.log(`ok public/${name} (${size}x${size})`)
}
