// 記帳計算引擎（docs/02）。皆為純函式，餘額一律用 postingDate 累計。
//
// 三大核心觀念落地：
//  - 帳戶餘額：openingBalance + Σ postings(postingDate ≤ D)
//  - 收支統計：只取 expense/income 的拆帳列；轉帳/借還/股票本金不計入
//  - 收支配色：支出 expense（琥珀）、收入 income（藍），由元件用語意 token 上色
import { todayStr, addMonth, dayOfMonth, addDays, parseDate } from './date'

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

// 一筆交易是否「未入帳」：主入帳日尚未到（postingDate > asOf）。
// 信用卡分期未到期還款、deferred 週期性、未來股票交割皆屬此類。
export function isPending(tx, asOf = todayStr()) {
  return !!tx.postingDate && tx.postingDate > asOf
}

// 各帳戶「未入帳」金額：postingDate 在 asOf 之後的 postings 加總（帶正負）。
// 用於帳戶列在現餘額外另顯示「未入帳 ±X」。回傳 { accountId: pendingAmount }。
export function pendingByAccount(accounts, txns, asOf = todayStr()) {
  const map = {}
  for (const a of accounts) map[a.id] = 0
  for (const tx of txns) {
    for (const p of transactionPostings(tx)) {
      if (!(p.accountId in map)) continue
      if (p.date > asOf) map[p.accountId] += p.amount
    }
  }
  return map
}

// 信用卡帳單分期（docs/02 §4.1）。依 statementDay 切期，回傳近 months 期，
// 最新（含未出帳的本期）在前。每期：
//   { periodStart, periodEnd, statementDate, dueDate, total, charges, isOpen }
// total＝該期內「卡帳消費」淨額（expense 加、income 減；轉帳/繳款不算消費）。
// 繳款狀態由呼叫端比對 creditCardStatements（periodEnd）另行判定。
export function statementPeriods(account, txns, { months = 6, asOf = todayStr() } = {}) {
  const S = account.statementDay
  if (!S) return []
  const P = account.paymentDueDay ?? S

  // 找「本期」結帳年月：第一個 >= asOf 的結帳日（本期可能尚未出帳）
  const base = parseDate(asOf)
  let cur = { year: base.getFullYear(), month: base.getMonth() + 1 }
  if (asOf > dayOfMonth(cur.year, cur.month, S)) cur = addMonth(cur, 1)

  const periods = []
  for (let i = 0; i < months; i++) {
    const ym = addMonth(cur, -i)
    const periodEnd = dayOfMonth(ym.year, ym.month, S)
    const prev = addMonth(ym, -1)
    const periodStart = addDays(dayOfMonth(prev.year, prev.month, S), 1)
    // 繳費日在結帳日之後同月，否則順延次月
    const dueYm = P > S ? ym : addMonth(ym, 1)
    const dueDate = dayOfMonth(dueYm.year, dueYm.month, P)

    let total = 0
    const charges = []
    for (const tx of txns) {
      if (tx.accountId !== account.id) continue
      if (tx.tradeDate < periodStart || tx.tradeDate > periodEnd) continue
      if (tx.type === 'expense') {
        total += tx.amount
        charges.push(tx)
      } else if (tx.type === 'income') {
        total -= tx.amount
        charges.push(tx)
      }
    }
    periods.push({
      periodStart,
      periodEnd,
      statementDate: periodEnd,
      dueDate,
      total,
      charges,
      isOpen: asOf <= periodEnd,
    })
  }
  return periods
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
