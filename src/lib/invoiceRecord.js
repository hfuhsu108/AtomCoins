// 發票歸帳用的純函式：歸帳表單與發票列的「直接歸帳」共用同一套交易內容，避免兩邊記出不同的東西。
import { formatNumber } from './format'
import { resolveMerchant } from './merchant'
import { suggestAccountFromHistory } from './autoCategory'

// 發票品項明細 → 備註摘要（歸帳時帶入，docs/09 需求1）：「品名×數量 $金額、品名 $金額…」
// 數量 1 不贅述；金額缺值時只留品名，不印 $0——爬蟲偶有品項沒帶 amount，印 0 會誤導對帳。
export function invoiceItemsSummary(invoice) {
  const items = invoice.lineItems ?? []
  return items
    .map((it) => {
      if (!it.name) return null
      const qty = it.qty > 1 ? `×${it.qty}` : ''
      const amount = it.amount == null ? '' : ` $${formatNumber(it.amount)}`
      return `${it.name}${qty}${amount}`
    })
    .filter(Boolean)
    .join('、')
}

// 「直接歸帳」：分類與帳戶兩個建議都篤定時，不開表單直接記一筆。回傳 { tx, account } 或 null。
// 任一條不成立就回 null，列上只留原本的「歸帳」——寧可多點一次，也不記錯帳。
//   分類：建議 confidence 為 high、每列分類都還在（沒被刪或封存）、合計等於發票原額
//   帳戶：歷史同商家 ≥3 筆用同一帳戶（suggestAccountFromHistory 的 high），且帳戶未封存
export function quickRecordPlan(invoice, { suggestion, transactions, invoices, aliases, categories, accounts }) {
  const total = invoice?.totalAmount ?? 0
  if (!(total > 0) || !invoice.invoiceDate) return null
  if (suggestion?.confidence !== 'high') return null

  const rows = suggestion.splits?.length
    ? suggestion.splits
    : [{ categoryId: suggestion.categoryId, amount: total }]
  const validCat = new Set(
    (categories ?? []).filter((c) => c.kind === 'expense' && !c.isArchived).map((c) => c.id),
  )
  if (!rows.every((r) => validCat.has(r.categoryId) && r.amount > 0)) return null
  if (rows.reduce((sum, r) => sum + r.amount, 0) !== total) return null

  const acc = suggestAccountFromHistory(invoice, { transactions, invoices, aliases })
  if (acc?.confidence !== 'high') return null
  const account = (accounts ?? []).find((a) => a.id === acc.accountId && !a.isArchived)
  if (!account) return null

  return {
    account,
    tx: {
      type: 'expense',
      accountId: account.id,
      amount: total,
      tradeDate: invoice.invoiceDate,
      postingDate: invoice.invoiceDate,
      note: invoiceItemsSummary(invoice) || null,
      merchant: resolveMerchant(invoice.merchant, aliases) || null,
      tagIds: [],
      splits: rows.map((r) => ({ categoryId: r.categoryId, amount: r.amount, note: null, tagIds: [] })),
    },
  }
}
