// 產生分類選圖器用的完整 Font Awesome solid 圖示目錄 public/fa-icons.json。
// 為什麼要落成 JSON 而不是在前端 import 整包：整包 barrel（約 1MB）一旦被靜態引用就會併進
// 主 chunk，讓每次開 app 都多載一份幾乎用不到的資料。改成執行期 fetch 的 JSON——
// vite-plugin-pwa 預設 globPatterns 不含 .json，因此它也不會進 PWA 預快取。
// 選圖器選定後只把該圖示的向量資料存進分類文件，渲染端不需要這份目錄（見 lib/icons.js getIcon）。
// FA 升版後重跑 `npm run gen:icon-catalog`。
import * as solid from '@fortawesome/free-solid-svg-icons'
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { version } = require('@fortawesome/free-solid-svg-icons/package.json')

// barrel 除了 faXxx 定義外還匯出 prefix/iconName 等純字串，且多個 export 會指向同一個
// iconName（FA7 對改名的舊名保留 alias export），故以 iconName 去重。
const byName = new Map()
for (const def of Object.values(solid)) {
  if (!def || typeof def !== 'object') continue
  const { iconName, icon } = def
  if (typeof iconName !== 'string' || !Array.isArray(icon)) continue
  const [w, h, ligatures, , path] = icon
  // duotone 等圖示的 path 是陣列，free-solid 應皆為字串；非字串一律跳過以免渲染端拿到壞資料
  if (typeof path !== 'string' || !path) continue
  if (byName.has(iconName)) continue
  // ligatures 混雜字串與數字 unicode，只留字串當搜尋用的別名（含 FA6 舊名，可解決改名查不到）
  const aliases = (ligatures ?? []).filter((x) => typeof x === 'string')
  byName.set(iconName, { n: iconName, w, h, p: path, ...(aliases.length ? { a: aliases } : {}) })
}

const icons = [...byName.values()].sort((a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : 0))
const out = resolve(root, 'public/fa-icons.json')
writeFileSync(out, JSON.stringify({ v: version, icons }))

const kb = (JSON.stringify({ v: version, icons }).length / 1024).toFixed(0)
console.log(`ok public/fa-icons.json — ${icons.length} 個圖示，FA ${version}，${kb} KB`)
