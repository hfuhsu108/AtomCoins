// 對帳反推延後：App 本期金額 − 銀行帳單金額 ＝ 銀行沒收（該延後）的那幾筆合計。
// 交界處通常只有幾筆，窮舉子集合即可，結果是確定的，不需要猜。

// 只在最晚的 N 筆裡找：銀行沒收的必然是結帳日前最後幾天的消費；
// 2^15 ＝ 32768 種組合，手機上仍是瞬間算完。
export const MAX_CANDIDATES = 15
const MAX_RESULTS = 5

const signed = (t) => (t.type === 'expense' ? t.amount : -t.amount)

// charges：該期的消費列（engine.statementPeriods 的 period.charges）
// 回傳 { diff, combos: Array<Array<tx>>, comboCount, searched }
//   diff > 0：App 比銀行多，combos 是加總剛好等於 diff 的組合（筆數少的在前）
//   diff ≤ 0：不需延後或銀行比 App 多（漏記），combos 為空
export function findDeferCombos(charges, bankTotal) {
  const appTotal = charges.reduce((s, t) => s + signed(t), 0)
  const diff = appTotal - bankTotal
  const candidates = charges
    .slice()
    .sort((a, b) => (a.tradeDate < b.tradeDate ? 1 : a.tradeDate > b.tradeDate ? -1 : 0))
    .slice(0, MAX_CANDIDATES)
  const searched = candidates.length
  if (diff <= 0) return { diff, combos: [], comboCount: 0, searched }

  // 同金額的不同筆（兩筆 $50）對帳上無從區分，以金額多重集合去重，只留一組代表
  const seen = new Set()
  const n = candidates.length
  const values = candidates.map(signed)
  for (let mask = 1; mask < 1 << n; mask++) {
    let sum = 0
    const amounts = []
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += values[i]
        amounts.push(values[i])
      }
    }
    if (sum !== diff) continue
    seen.add(amounts.sort((a, b) => a - b).join(','))
  }

  // 代表組合：每個金額取日期最晚、尚未用過的那筆（candidates 已按日期新到舊排）
  const combos = [...seen].map((key) => {
    const used = new Set()
    for (const amt of key.split(',').map(Number)) {
      used.add(values.findIndex((v, i) => v === amt && !used.has(i)))
    }
    return [...used].sort((a, b) => a - b).map((i) => candidates[i])
  })
  combos.sort((a, b) => a.length - b.length)
  return { diff, combos: combos.slice(0, MAX_RESULTS), comboCount: combos.length, searched }
}
