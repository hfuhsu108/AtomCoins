// AI 輔助發票分類的第一層：從歷史交易學「這家店通常記哪個分類」。
// 純函式、無 firebase 相依——會由 functions/copy-shared.mjs 複製到後端共用，
// 讓前端即時顯示的建議與 Cloud Function 寫入的建議是同一套口徑，禁止手抄第二份。
//
// 第二層（歷史沒命中的新商家才送 LLM）在 functions/index.js，本檔不涉及。
import { resolveMerchant } from './merchant'

// 交易的商家取值與 merchant.js merchantStats 同一套：交易層 merchant 優先，
// 舊的歸帳交易沒有 merchant 欄時退回它對應發票的商家。
function txMerchantName(tx, invById, aliases) {
  const raw = tx.merchant ?? (tx.invoiceId ? invById.get(tx.invoiceId)?.merchant : null)
  return resolveMerchant(raw, aliases)
}

// 依商家比對歷史支出，回最常用的分類；無商家或查無歷史回 null（交給第二層）。
// excludeIds 排除「未分類」這類退路分類——建議它沒有意義；因 seed.js 有 firebase 相依
// 不能進 shared，故由呼叫端把 id 傳進來。
export function suggestFromHistory(invoice, { transactions, invoices, aliases, excludeIds = [] } = {}) {
  const name = resolveMerchant(invoice?.merchant, aliases)
  if (!name) return null

  const skip = new Set(excludeIds)
  const invById = new Map((invoices ?? []).map((i) => [i.id, i]))
  const tally = new Map()

  for (const tx of transactions ?? []) {
    if (tx.type !== 'expense') continue
    if (txMerchantName(tx, invById, aliases) !== name) continue
    // 拆帳交易的每個分類各計一票，單一分類交易即一票
    for (const sp of tx.splits ?? []) {
      if (!sp.categoryId || skip.has(sp.categoryId)) continue
      tally.set(sp.categoryId, (tally.get(sp.categoryId) ?? 0) + 1)
    }
  }
  if (tally.size === 0) return null

  // 票數相同時取先遇到的（Map 保插入序），避免同分時建議隨機跳動
  let best = null
  for (const [categoryId, count] of tally) {
    if (!best || count > best.count) best = { categoryId, count }
  }
  const confidence = best.count >= 3 ? 'high' : best.count >= 2 ? 'medium' : 'low'
  return { categoryId: best.categoryId, source: 'history', confidence, count: best.count }
}
