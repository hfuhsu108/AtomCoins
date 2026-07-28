// 明細全域搜尋的純函式（docs/09 批次 1）。跨月、純 client-side filter；
// DataProvider 已整包在記憶體，個人資料量無壓力。所有條件 AND 組合。

// 交易總額：收支取拆帳列合計，其餘型別取 amount
function txTotal(tx) {
  if (tx.type === 'expense' || tx.type === 'income') {
    return (tx.splits ?? []).reduce((s, sp) => s + sp.amount, 0)
  }
  return tx.amount ?? 0
}

// 分類篩選：選母分類含其子分類（子分類的 parentId 命中亦算）；非收支型別一律不符
function categoryMatches(tx, categoryId, lookups) {
  if (!categoryId) return true
  if (tx.type !== 'expense' && tx.type !== 'income') return false
  for (const sp of tx.splits ?? []) {
    if (sp.categoryId === categoryId) return true
    const cat = lookups.cat[sp.categoryId]
    if (cat?.parentId === categoryId) return true
  }
  return false
}

// 標籤取用口徑：拆帳列有自己的標籤就用它、沒有才繼承交易層。與 backup.js 的 CSV 匯出同一條規則，
// 兩邊漂移會讓搜尋合計與匯出檔對不上。標籤的唯一真值在 splits[].tagIds，交易層只有代墊拆出的應收在用。
function tagIdsOf(tx, sp) {
  return sp?.tagIds?.length ? sp.tagIds : tx.tagIds ?? []
}

// 多標籤為 OR（任一命中），與交易型別多選一致
function hitAny(ids, wanted) {
  return ids.some((id) => wanted.includes(id))
}

// 收支逐拆帳列比對；其餘型別比對交易層——代墊拆出的應收沒有 splits，標籤存在交易層，
// 所以不能仿 categoryMatches 那樣「非收支一律不符」，否則會漏掉。
function tagMatches(tx, tagIds) {
  if (tagIds.length === 0) return true
  if (tx.type === 'expense' || tx.type === 'income') {
    return (tx.splits ?? []).some((sp) => hitAny(tagIdsOf(tx, sp), tagIds))
  }
  return hitAny(tx.tagIds ?? [], tagIds)
}

// 只加總標籤命中的拆帳列（專案花費口徑）
function taggedTotal(tx, tagIds) {
  return (tx.splits ?? []).reduce(
    (sum, sp) => sum + (hitAny(tagIdsOf(tx, sp), tagIds) ? sp.amount : 0),
    0,
  )
}

// 關鍵字比對 note／merchant／拆帳列分類名／標籤名／counterparty 名；純數字時另比對交易總額精確相等
function matchKeyword(tx, kw, kwNum, total, lookups) {
  const hay = []
  if (tx.note) hay.push(tx.note)
  if (tx.merchant) hay.push(tx.merchant)
  for (const sp of tx.splits ?? []) {
    if (sp.note) hay.push(sp.note)
    const cat = lookups.cat[sp.categoryId]
    if (cat) {
      hay.push(cat.name)
      const parent = cat.parentId ? lookups.cat[cat.parentId] : null
      if (parent) hay.push(parent.name)
    }
  }
  // 標籤名也可直接打字搜到，不必先選條件
  for (const id of new Set([...(tx.tagIds ?? []), ...(tx.splits ?? []).flatMap((sp) => sp.tagIds ?? [])])) {
    const tag = lookups.tag?.[id]
    if (tag?.name) hay.push(tag.name)
  }
  const cp = lookups.cp[tx.counterpartyId]
  if (cp?.name) hay.push(cp.name)
  if (hay.join(' ').toLowerCase().includes(kw)) return true
  if (kwNum != null && total === kwNum) return true
  return false
}

// criteria: { keyword, types:[], categoryId, accountId, tagIds:[], dateFrom, dateTo, amountMin, amountMax }
// lookups: { cat, acc, cp, tag }（id → entity，同 TransactionsPage）
export function filterTransactions(txns, criteria, lookups) {
  const {
    keyword, types = [], categoryId, accountId, tagIds = [],
    dateFrom, dateTo, amountMin, amountMax,
  } = criteria
  const kw = keyword?.trim().toLowerCase()
  const kwNum = kw && /^\d+$/.test(kw) ? Number(kw) : null
  const min = amountMin != null && amountMin !== '' ? Number(amountMin) : null
  const max = amountMax != null && amountMax !== '' ? Number(amountMax) : null

  return txns.filter((tx) => {
    if (types.length > 0 && !types.includes(tx.type)) return false
    if (accountId && ![tx.accountId, tx.fromAccountId, tx.toAccountId].includes(accountId)) return false
    if (!categoryMatches(tx, categoryId, lookups)) return false
    if (!tagMatches(tx, tagIds)) return false
    if (dateFrom && (tx.tradeDate ?? '') < dateFrom) return false
    if (dateTo && (tx.tradeDate ?? '') > dateTo) return false
    const total = txTotal(tx)
    if (min != null && total < min) return false
    if (max != null && total > max) return false
    if (kw && !matchKeyword(tx, kw, kwNum, total, lookups)) return false
    return true
  })
}

// 結果合計：筆數＋支出／收入總額（拆帳列口徑，與月摘要一致）。
// 有標籤條件時只加總命中的拆帳列：一筆 1000 元裡只有 300 元那列掛了 #某專案，
// 專案花費就是 300——整筆加總會高估。criteria 有預設值，其他呼叫端不受影響。
export function searchTotals(txns, criteria = {}) {
  const tagIds = criteria.tagIds ?? []
  let expense = 0
  let income = 0
  for (const tx of txns) {
    if (tx.type !== 'expense' && tx.type !== 'income') continue
    const amount = tagIds.length > 0 ? taggedTotal(tx, tagIds) : txTotal(tx)
    if (tx.type === 'expense') expense += amount
    else income += amount
  }
  return { count: txns.length, expense, income }
}
