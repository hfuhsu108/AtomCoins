// 股價同步（docs/00 §股價來源、docs/01 §3.11）。前端只負責 fetch，CORS／查 TWSE 由 GAS 端處理。
// 核心原則：同步失敗一律「退回上次快取價」（完全不覆寫 StockPrice），錯誤結構化回傳、絕不吞錯。
import { upsertStockPrice, updateSettings } from '../db/repo'
import { todayStr } from './date'

// 個人自用單裝置為主，網址已刻意寫死（非機密：Access:Anyone、只回傳公開股價，額度濫用是唯一風險）。
// 見 gas/README.md；日後要換部署／URL 需改這裡並重新 build。
export const GAS_STOCK_PROXY_URL =
  'https://script.google.com/macros/s/AKfycbyzDBKShTop7DorFX4YbpZ4dOebfkK78BqB9zAanIIQNtS-6Qn_hFbkbuYqji4_ffz-/exec'

// 把 GAS 回傳正規化成 [{ symbol, closePrice, priceDate }]。
// GAS 實際回傳格式待定 —— 此函式容錯多種常見形狀與欄位別名，是格式對不上時的「唯一調整點」。
export function parseGasPrices(json) {
  // GAS 端明確回報的錯誤（如 TWSE 查詢失敗）要原樣浮現，不能被下面的「格式無法解析」蓋掉
  if (json && typeof json.error === 'string') throw new Error(json.error)

  const rows = extractRows(json)
  if (!Array.isArray(rows)) throw new Error('GAS 回傳格式無法解析')

  const today = todayStr()
  const out = []
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const symbol = String(raw.symbol ?? raw.code ?? raw.s ?? '').trim()
    const close = Number(raw.close ?? raw.closePrice ?? raw.price ?? raw.c)
    // symbol 缺失或價格非有限數（含 NaN / null）→ 略過該列，不讓髒資料污染快取
    if (!symbol || !Number.isFinite(close)) continue
    const priceDate = String(raw.date ?? raw.priceDate ?? raw.d ?? today).slice(0, 10)
    out.push({ symbol, closePrice: close, priceDate })
  }
  return out
}

// 把各種容器攤成「列陣列」；物件 map（{ '2330': {...} }）把 key 補回 symbol。無法辨識回 null。
function extractRows(json) {
  if (Array.isArray(json)) return json
  if (json && typeof json === 'object') {
    if (Array.isArray(json.prices)) return json.prices
    if (Array.isArray(json.data)) return json.data
    const entries = Object.entries(json)
    if (entries.length > 0 && entries.every(([, v]) => v && typeof v === 'object')) {
      return entries.map(([k, v]) => ({ symbol: v.symbol ?? v.code ?? k, ...v }))
    }
  }
  return null
}

// 依 proxyUrl 組 query 並 fetch；HTTP/解析錯誤原樣往上拋（由 syncStockPrices 收斂）。
export async function fetchGasPrices(proxyUrl, symbols) {
  const u = new URL(proxyUrl) // proxyUrl 非法 → 這裡即 throw
  if (symbols?.length) u.searchParams.set('symbols', symbols.join(','))
  const res = await fetch(u.toString(), { redirect: 'follow' }) // GAS /exec 常 302 到 googleusercontent
  if (!res.ok) throw new Error(`GAS 回應 HTTP ${res.status}`)
  return parseGasPrices(await res.json())
}

// 高階協調：永不 throw、絕不吞錯。回傳 { ok, updated?, missing?, error? }。
// 成功才逐筆 upsert（失敗完全不動 StockPrice = 自動退回上次快取價），並記 lastPriceSyncAt。
export async function syncStockPrices({ proxyUrl, symbols } = {}) {
  const url = (proxyUrl ?? '').trim()
  if (!url) return { ok: false, error: '尚未設定 GAS 股價網址' }

  const wanted = [...new Set((symbols ?? []).filter(Boolean))]
  if (wanted.length === 0) return { ok: true, updated: [], missing: [] }

  try {
    const prices = await fetchGasPrices(url, wanted)
    const returned = new Set()
    for (const p of prices) {
      await upsertStockPrice(p)
      returned.add(p.symbol)
    }
    await updateSettings({ lastPriceSyncAt: new Date().toISOString() })
    return {
      ok: true,
      updated: [...returned],
      // 有請求、但 GAS 沒回價的標的（symbol 格式對不上時會現形於此，作為調整 normalizer 的訊號）
      missing: wanted.filter((s) => !returned.has(s)),
    }
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}
