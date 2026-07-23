// predeploy hook：把前端 src/lib 的純函式複製到 functions/shared/，供 Cloud Functions 共用同一套口徑。
// 禁止手抄第二份——發送端的信用卡／交割／週期判定必須與 App 首頁鈴鐺完全一致。
// 只搬「無 firebase import」的純檔（engine/date/notifications）；recurring.js 有 firebase 相依，
// 其純函式 dueReminders 已移入 notifications.js。
//
// 前端在 Vite/瀏覽器下 relative import 可省副檔名（from './date'），但 Cloud Functions 是
// Node 20 純 ESM，relative import 必須帶副檔名，否則 deploy 後 ERR_MODULE_NOT_FOUND。
// 故複製時同步把相對 import／export 補上 .js。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const srcLib = join(here, '..', 'src', 'lib')
const outDir = join(here, 'shared')

const FILES = ['engine.js', 'date.js', 'notifications.js']

// 把 from './x' / from '../x' 這類無副檔名的相對指定補成 './x.js'；已帶副檔名者不動。
function addJsExtensions(code) {
  return code.replace(/(from\s+['"])(\.\.?\/[^'"]*?)(['"])/g, (m, pre, spec, post) => {
    if (/\.(js|mjs|cjs|json)$/.test(spec)) return m
    return `${pre}${spec}.js${post}`
  })
}

mkdirSync(outDir, { recursive: true })
for (const f of FILES) {
  const code = addJsExtensions(readFileSync(join(srcLib, f), 'utf8'))
  writeFileSync(join(outDir, f), code)
  console.log(`[copy-shared] ${f} → functions/shared/${f}`)
}
