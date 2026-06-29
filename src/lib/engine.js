// 記帳計算引擎（docs/02）。皆為純函式，餘額一律用 postingDate 累計。
//
// 三大核心觀念落地：
//  - 帳戶餘額：openingBalance + Σ postings(postingDate ≤ D)
//  - 收支統計：只取 expense/income 的拆帳列；轉帳/借還/股票本金不計入
//  - 收支配色：支出 expense（琥珀）、收入 income（藍），由元件用語意 token 上色

// 把單筆交易攤成 postings：{ accountId, amount, date }
// amount 已帶正負；date 為實際入帳/還款日。
export function transactionPostings(tx) {
  const postings = []
  switch (tx.type) {
    case 'expense':
      postings.push({ accountId: tx.accountId, amount: -tx.amount, date: tx.postingDate })
      break
    case 'income':
      postings.push({ accountId: tx.accountId, amount: tx.amount, date: tx.postingDate })
      break
    case 'transfer':
      postings.push({ accountId: tx.fromAccountId, amount: -tx.amount, date: tx.postingDate })
      postings.push({ accountId: tx.toAccountId, amount: tx.amount, date: tx.postingDate })
      // 手續費另從轉出帳戶扣（本金不算支出，但手續費計入支出 — 報表端處理）
      if (tx.fee) {
        postings.push({ accountId: tx.fromAccountId, amount: -tx.fee, date: tx.postingDate })
      }
      break
    case 'receivable': // 借出：資金離開帳戶，還款再回來
      postings.push({ accountId: tx.accountId, amount: -tx.amount, date: tx.postingDate })
      for (const r of tx.repayments ?? []) {
        postings.push({ accountId: r.accountId, amount: r.amount, date: r.date })
      }
      break
    case 'payable': // 借入：資金進入帳戶，還款再離開
      postings.push({ accountId: tx.accountId, amount: tx.amount, date: tx.postingDate })
      for (const r of tx.repayments ?? []) {
        postings.push({ accountId: r.accountId, amount: -r.amount, date: r.date })
      }
      break
  }
  return postings
}

// 一次算出多帳戶餘額，回傳 { accountId: balance }。asOf 為 'YYYY-MM-DD'，null=全部。
export function accountBalances(accounts, txns, asOf = null) {
  const map = {}
  for (const a of accounts) map[a.id] = a.openingBalance ?? 0
  for (const tx of txns) {
    for (const p of transactionPostings(tx)) {
      if (!(p.accountId in map)) continue
      if (asOf && p.date > asOf) continue
      map[p.accountId] += p.amount
    }
  }
  return map
}

// 單一帳戶餘額
export function accountBalance(account, txns, asOf = null) {
  return accountBalances([account], txns, asOf)[account.id]
}

// 應收/應付未結清 = amount − Σ 還款
export function outstanding(tx) {
  const paid = (tx.repayments ?? []).reduce((s, r) => s + r.amount, 0)
  return tx.amount - paid
}

// 截至某日的未結清：尚未發生（postingDate > asOf）視為 0；只扣截止日前的還款。
// 用於歷史淨資產（如「較上月」），與帳戶餘額的 asOf 口徑一致。
export function outstandingAsOf(tx, asOf) {
  if (!asOf) return outstanding(tx)
  if (tx.postingDate > asOf) return 0
  const paid = (tx.repayments ?? [])
    .filter((r) => r.date <= asOf)
    .reduce((s, r) => s + r.amount, 0)
  return tx.amount - paid
}

// 結清狀態：unpaid / partial / settled
export function settlementStatus(tx) {
  const left = outstanding(tx)
  if (left >= tx.amount) return 'unpaid'
  if (left <= 0) return 'settled'
  return 'partial'
}

// 淨資產（docs/02 §4.3）。holdingsValue=持股市值（階段3 後接入，Stage 1 給 0）。
export function netWorth(accounts, txns, { holdingsValue = 0, asOf = null } = {}) {
  const balances = accountBalances(accounts, txns, asOf)
  let sum = 0
  for (const a of accounts) {
    if (a.isArchived) continue
    // 證券帳戶本金以持股市值另計，避免重複
    if (a.type === 'securities') continue
    sum += balances[a.id]
  }
  // 帳戶餘額已反映借出/借入的資金進出，未結清部分補回才能讓淨資產不變
  for (const tx of txns) {
    if (tx.type === 'receivable') sum += outstandingAsOf(tx, asOf)
    else if (tx.type === 'payable') sum -= outstandingAsOf(tx, asOf)
  }
  return sum + holdingsValue
}

// 本月收支（docs/02 §4.4）。依 tradeDate 歸月（見 docs/03 §J：刷卡日決定計入哪個月），
// 只取 expense/income，金額對「拆帳列」聚合。
export function monthlySummary(txns, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  let income = 0
  let expense = 0
  for (const tx of txns) {
    if (tx.type !== 'expense' && tx.type !== 'income') continue
    if (!tx.tradeDate?.startsWith(prefix)) continue
    const total = (tx.splits ?? []).reduce((s, sp) => s + sp.amount, 0)
    if (tx.type === 'income') income += total
    else expense += total
  }
  return { income, expense, balance: income - expense }
}
