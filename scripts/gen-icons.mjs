// 由 branding/icon.png（優先）或 public/favicon.svg 產生 PWA 安裝所需的 PNG 圖示
// （缺 PNG icon 是 Chrome 拒絕安裝的主因）。來源大圖放 branding/ 而非 public/——
// public/ 的 png 會進 workbox 預快取，>2MB 單檔會讓 build 直接失敗（CoTravel 實測）。
// 用 @resvg/resvg-js 而非 sharp——sharp 在含中文的專案路徑下會 ERR_DLOPEN_FAILED。
// 換圖後 `npm run gen:icons` 重跑。
import { Resvg } from '@resvg/resvg-js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// PNG 以 data URI 包進正方形 SVG，preserveAspectRatio=slice 置中裁切非正方形來源，
// 交 resvg 依各目標尺寸重新柵格化。來源為全滿版設計（藍底、主元素置中於安全區），
// maskable 直接用同一張（Android 裁圓時外圍是背景色，不裁到主元素）。
function loadSource() {
  const pngPath = resolve(root, 'branding/icon.png')
  if (existsSync(pngPath)) {
    const b64 = readFileSync(pngPath).toString('base64')
    const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048" viewBox="0 0 2048 2048"><image href="data:image/png;base64,${b64}" width="2048" height="2048" preserveAspectRatio="xMidYMid slice"/></svg>`
    return { normal: wrapped, maskable: wrapped }
  }
  // 後備：favicon.svg（圓角方塊）＋合成滿版 maskable（圓角會被 Android 裁出白角，需另組）
  const favicon = readFileSync(resolve(root, 'public/favicon.svg'), 'utf8')
  const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#3B5BDB"/>
  <text x="16" y="21" text-anchor="middle" font-size="14" font-weight="700" fill="#fff" font-family="sans-serif">$</text>
</svg>`
  return { normal: favicon, maskable }
}

const { normal, maskable } = loadSource()

const targets = [
  ['pwa-64x64.png', 64, normal],
  ['pwa-192x192.png', 192, normal],
  ['pwa-512x512.png', 512, normal],
  ['apple-touch-icon-180x180.png', 180, normal],
  ['maskable-icon-512x512.png', 512, maskable],
]

for (const [name, size, source] of targets) {
  const png = new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(resolve(root, 'public', name), png)
  console.log(`ok public/${name} (${size}x${size})`)
}
