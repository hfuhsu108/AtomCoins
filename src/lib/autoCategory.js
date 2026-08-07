// AI 輔助發票分類的第一層：從歷史交易學「這家店通常記哪個分類」。
// 純函式、無 firebase 相依——會由 functions/copy-shared.mjs 複製到後端共用，
// 讓前端即時顯示的建議與 Cloud Function 寫入的建議是同一套口徑，禁止手抄第二份。
//
// 第二層（歷史沒命中的新商家才送 LLM）在 functions/index.js，本檔不涉及。
import { resolveMerchant } from './merchant'

// 「這家店的歷史夠篤定嗎」的門檻。全聯這種一次買生鮮＋日用品的店，歷史票數天生分散，
// 硬取最高票等於擲骰子——分散時寧可讓看得見品項的第二層（LLM）接手。
const DOMINANCE_MIN = 0.6 // 最高票佔比低於此即視為分歧
const LEAD_MIN = 2 // 與第二名的票數差需達此值，差 1 票不算贏
// confidence 必須同時看票數與佔比：3/14 票也是 3 票，只看絕對值會把亂猜標成 high
const HIGH_COUNT = 3
const HIGH_SHARE = 0.7
const MEDIUM_COUNT = 2
const MEDIUM_SHARE = 0.5
const TOP_N = 3 // 回給表單當快捷 chips 的分類數

// 交易的商家取值與 merchant.js merchantStats 同一套：交易層 merchant 優先，
// 舊的歸帳交易沒有 merchant 欄時退回它對應發票的商家。
function txMerchantName(tx, invById, aliases) {
  const raw = tx.merchant ?? (tx.invoiceId ? invById.get(tx.invoiceId)?.merchant : null)
  return resolveMerchant(raw, aliases)
}

// 依商家比對歷史支出，回最常用的分類；無商家或查無歷史回 null（交給第二層）。
// excludeIds 排除「未分類」這類退路分類——建議它沒有意義；因 seed.js 有 firebase 相依
// 不能進 shared，故由呼叫端把 id 傳進來。
//
// 回傳除了最高票的 categoryId，另附三個判斷材料：
//   share      最高票佔比
//   dispersed  這家店的歷史是否分歧到不該直接採用（呼叫端據此決定要不要降級送 LLM）
//   top        前 TOP_N 名，供歸帳表單顯示「這家店常用：食物 · 日用品 · 寵物」快捷
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

  // 票數相同時取先遇到的：Map 保插入序，sort 在 ES2019 起保證穩定，故同分不會隨機跳動
  const ranked = [...tally].map(([categoryId, count]) => ({ categoryId, count }))
  ranked.sort((a, b) => b.count - a.count)
  const best = ranked[0]
  const totalVotes = ranked.reduce((sum, r) => sum + r.count, 0)
  const share = best.count / totalVotes
  const lead = best.count - (ranked[1]?.count ?? 0)
  // 只有一類就沒有分歧可言（lead 會等於 best.count，不該被 LEAD_MIN 誤判）
  const dispersed = ranked.length > 1 && (share < DOMINANCE_MIN || lead < LEAD_MIN)

  const confidence =
    best.count >= HIGH_COUNT && share >= HIGH_SHARE
      ? 'high'
      : best.count >= MEDIUM_COUNT && share >= MEDIUM_SHARE
        ? 'medium'
        : 'low'
  return {
    categoryId: best.categoryId,
    source: 'history',
    confidence,
    count: best.count,
    totalVotes,
    share,
    dispersed,
    top: ranked.slice(0, TOP_N),
  }
}

// 同一套商家比對，改投票給「這家店通常用哪個帳戶付」。發票沒有卡號之類的付款欄位
// （docs/01 §3.7），歷史交易是唯一的推論來源。
// 與分類版的差別：帳戶是交易層欄位，所以**一筆一票**，不像分類要對每個拆帳列各投一票。
// 只在前端歸帳時即時呼叫（不寫進 invoiceSuggestions）——這層不需要 LLM，即時算才吃得到
// 使用者剛記的帳，爬蟲抓進來當下算好的建議反而會過時。
export function suggestAccountFromHistory(invoice, { transactions, invoices, aliases } = {}) {
  const name = resolveMerchant(invoice?.merchant, aliases)
  if (!name) return null

  const invById = new Map((invoices ?? []).map((i) => [i.id, i]))
  const tally = new Map()

  for (const tx of transactions ?? []) {
    if (tx.type !== 'expense' || !tx.accountId) continue
    if (txMerchantName(tx, invById, aliases) !== name) continue
    tally.set(tx.accountId, (tally.get(tx.accountId) ?? 0) + 1)
  }
  if (tally.size === 0) return null

  // 票數相同時取先遇到的（Map 保插入序），避免同分時建議隨機跳動
  let best = null
  for (const [accountId, count] of tally) {
    if (!best || count > best.count) best = { accountId, count }
  }
  const confidence = best.count >= 3 ? 'high' : best.count >= 2 ? 'medium' : 'low'
  // merchant 一併回傳：UI 要顯示「依『全家』過去 N 筆」，比對用的名稱是別名解析後的版本
  return { accountId: best.accountId, merchant: name, source: 'history', confidence, count: best.count }
}

// ── 拆帳建議的門檻 ───────────────────────────────────────────
// 只有 Cloud Function 會呼叫（驗證 LLM 回來的多列分類），放在這裡是為了跟上面的判定同檔、
// 且能離線驗算——functions/index.js 有 firebase 相依，搬不進測試。
// 模型可能回碎列、湊不平、或為了拆而拆，違反任一條就退回單列（取金額最大那列的分類）。
export const SPLIT_MAX_ROWS = 3
const SPLIT_MIN_SHARE = 0.15
const SPLIT_MIN_AMOUNT = 50
const SPLIT_TOLERANCE = 0.01 // 合計與發票原額的可補差額上限（佔總額比例）

// 回合法的 splits（合計必等於 total）或 null（完全無可用分類）
export function normalizeSplits(rows, total, validIds) {
  if (!(total > 0)) return null
  const clean = (rows ?? [])
    .filter((r) => r && validIds.has(r.categoryId) && Number.isFinite(r.amount) && r.amount > 0)
    .map((r) => ({ categoryId: r.categoryId, amount: Math.round(r.amount) }))
  if (clean.length === 0) return null

  // 同分類重複出現先合併，否則表單會開出兩列一樣的分類
  const merged = []
  for (const r of clean) {
    const cur = merged.find((m) => m.categoryId === r.categoryId)
    if (cur) cur.amount += r.amount
    else merged.push(r)
  }
  merged.sort((a, b) => b.amount - a.amount)

  const single = () => [{ categoryId: merged[0].categoryId, amount: total }]
  if (merged.length === 1) return single()
  if (merged.length > SPLIT_MAX_ROWS) return single()
  if (merged.some((r) => r.amount < SPLIT_MIN_AMOUNT || r.amount < total * SPLIT_MIN_SHARE)) return single()

  const diff = total - merged.reduce((s, r) => s + r.amount, 0)
  if (diff !== 0) {
    if (Math.abs(diff) > total * SPLIT_TOLERANCE) return single()
    merged[0].amount += diff // 差額補進金額最大那列，讓合計湊回發票原額
    if (merged[0].amount < SPLIT_MIN_AMOUNT) return single()
  }
  return merged
}
