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

// 關鍵字比對 note／merchant／拆帳列分類名／counterparty 名；純數字時另比對交易總額精確相等
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
  const cp = lookups.cp[tx.counterpartyId]
  if (cp?.name) hay.push(cp.name)
  if (hay.join(' ').toLowerCase().includes(kw)) return true
  if (kwNum != null && total === kwNum) return true
  return false
}

// criteria: { keyword, types:[], categoryId, accountId, dateFrom, dateTo, amountMin, amountMax }
// lookups: { cat, acc, cp }（id → entity，同 TransactionsPage）
export function filterTransactions(txns, criteria, lookups) {
  const {
    keyword, types = [], categoryId, accountId,
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
    if (dateFrom && (tx.tradeDate ?? '') < dateFrom) return false
    if (dateTo && (tx.tradeDate ?? '') > dateTo) return false
    const total = txTotal(tx)
    if (min != null && total < min) return false
    if (max != null && total > max) return false
    if (kw && !matchKeyword(tx, kw, kwNum, total, lookups)) return false
    return true
  })
}

// 結果合計：筆數＋支出／收入總額（拆帳列口徑，與月摘要一致）
export function searchTotals(txns) {
  let expense = 0
  let income = 0
  for (const tx of txns) {
    if (tx.type === 'expense') expense += txTotal(tx)
    else if (tx.type === 'income') income += txTotal(tx)
  }
  return { count: txns.length, expense, income }
}
