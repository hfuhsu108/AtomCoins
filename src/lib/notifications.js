// 通知聚合：信用卡繳費到期＋T+2 交割缺口＋週期提醒／扣款預告。皆為純查詢，
// 供首頁鈴鐺通知區顯示，並被 Cloud Functions（Web Push 推播）複製共用同一套口徑。
import { statementPeriods, availableForSettlement } from './engine'
import { todayStr, addDays } from './date'

// 已出帳、未繳、金額>0，且繳款日已逾期或在 asOf 起 days 天內的信用卡帳單。
// 繳款狀態沿用 CardDetailPage 口徑：creditCardStatements 以 periodEnd 比對 isPaid。
export function dueCardPayments(accounts, txns, statements, asOf = todayStr(), days = 7) {
  const paid = new Set(
    statements.filter((s) => s.isPaid).map((s) => `${s.accountId}|${s.periodEnd}`),
  )
  const limit = addDays(asOf, days)
  const out = []
  for (const card of accounts) {
    if (card.type !== 'credit_card' || card.isArchived || !card.statementDay) continue
    for (const p of statementPeriods(card, txns, { months: 3, asOf })) {
      if (p.isOpen || p.total <= 0) continue
      if (paid.has(`${card.id}|${p.periodEnd}`)) continue
      if (p.dueDate > limit) continue
      out.push({
        account: card,
        periodEnd: p.periodEnd,
        dueDate: p.dueDate,
        amount: p.total,
        overdue: p.dueDate < asOf,
      })
    }
  }
  return out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
}

// 未來（含今天）交割日的交割銀行餘額缺口：對每個（銀行×交割日）組合
// 用 availableForSettlement 算該日可用餘額，<0 者列出缺口。
export function settlementShortfalls(accounts, txns, stockTxns, asOf = todayStr()) {
  const checks = new Map()
  for (const stx of stockTxns) {
    if (!stx.settlementDate || stx.settlementDate < asOf) continue
    checks.set(`${stx.settlementBankId}|${stx.settlementDate}`, {
      bankId: stx.settlementBankId,
      date: stx.settlementDate,
    })
  }
  const accById = {}
  for (const a of accounts) accById[a.id] = a
  const out = []
  for (const { bankId, date } of checks.values()) {
    const avail = availableForSettlement(bankId, accounts, txns, stockTxns, date)
    if (avail < 0) out.push({ bank: accById[bankId], date, shortfall: -avail })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

// 到期的提醒（reminder 模式且 nextDate ≤ asOf）。供通知區與推播列出。
// 原置於 recurring.js，因該檔有 firebase 相依、無法整檔複製到 Cloud Functions，
// 故將此純函式移入本檔（純檔）共用；recurring.js re-export 保持既有 caller 相容。
export function dueReminders(rules, asOf = todayStr()) {
  return (rules ?? []).filter(
    (r) => r.isActive && r.postingMode === 'reminder' && r.nextDate && r.nextDate <= asOf,
  )
}

// 明天將自動入帳的週期規則（immediate／deferred 且 nextDate == 明天）。
// 供推播情境 F「明天將自動入帳」預告；已結束（超過 endDate）的規則不列。
export function dueRecurringPostings(rules, asOf = todayStr()) {
  const tomorrow = addDays(asOf, 1)
  return (rules ?? []).filter(
    (r) =>
      r.isActive &&
      (r.postingMode === 'immediate' || r.postingMode === 'deferred') &&
      r.nextDate === tomorrow &&
      !(r.endDate && tomorrow > r.endDate),
  )
}
