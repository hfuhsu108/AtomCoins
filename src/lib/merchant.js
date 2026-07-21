// 商家別名與統計（docs/09 批次 3）。皆為純函式。
//
// 別名解析：載具發票的冗長公司名（如「統一超商股份有限公司澎湖縣第xx分公司」）
// 可設別名（如「7-11 xx店」）。contains 比對＋最長 match 勝出，讓一條「統一超商股份有限公司」
// 規則吃下所有分公司；要對特定分公司給店名時，設更長的 match（如「澎湖縣第xx分公司」）自然勝出。

// raw 空 → null；命中 raw.includes(match) 者取 match 最長的一條回其 alias；無命中 → raw 原樣
export function resolveMerchant(raw, aliases) {
  if (!raw) return null
  let best = null
  for (const a of aliases ?? []) {
    if (a.match && raw.includes(a.match)) {
      if (!best || a.match.length > best.match.length) best = a
    }
  }
  return best ? best.alias : raw
}

// 收支交易的商家統計（日期區間版，供批次 3 月視角與批次 4 年視角共用）。
// 商家取 tx.merchant ?? invoiceById[tx.invoiceId]?.merchant（舊歸帳交易免遷移即納入），再過 resolveMerchant。
// 無商家者不列。回傳 [{ merchant, amount, count }] 依金額由大到小。
export function merchantStats(txns, invoices, aliases, kind, { from, to } = {}) {
  const invById = new Map((invoices ?? []).map((i) => [i.id, i]))
  const buckets = new Map()
  for (const tx of txns) {
    if (tx.type !== kind) continue
    if (from && (tx.tradeDate ?? '') < from) continue
    if (to && (tx.tradeDate ?? '') > to) continue
    const raw = tx.merchant ?? (tx.invoiceId ? invById.get(tx.invoiceId)?.merchant : null)
    const name = resolveMerchant(raw, aliases)
    if (!name) continue
    const amount = (tx.splits ?? []).reduce((s, sp) => s + sp.amount, 0)
    const cur = buckets.get(name)
    if (cur) {
      cur.amount += amount
      cur.count += 1
    } else {
      buckets.set(name, { merchant: name, amount, count: 1 })
    }
  }
  return [...buckets.values()].sort((a, b) => b.amount - a.amount)
}

// 商家建議來源：既有交易 merchant 去重 ＋ 全部別名 alias，前綴／包含比對，最多 limit 筆
export function merchantSuggestions(query, txns, aliases, limit = 8) {
  const names = new Set()
  for (const tx of txns) if (tx.merchant) names.add(tx.merchant)
  for (const a of aliases ?? []) if (a.alias) names.add(a.alias)
  const q = query?.trim().toLowerCase()
  const all = [...names]
  if (!q) return all.slice(0, limit)
  // 前綴優先於包含
  const starts = all.filter((n) => n.toLowerCase().startsWith(q))
  const contains = all.filter((n) => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q))
  return [...starts, ...contains].slice(0, limit)
}
