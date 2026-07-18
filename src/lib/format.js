// 金額一律整數（元）；顯示加千分位、NT$，正負由呼叫端決定
// 負號統一用 U+2212（−）而非 hyphen，對齊設計稿排版

const MASK = '••••••'

// 純數字千分位（無貨幣符號），股價等小數用 maximumFractionDigits 控制
export function formatNumber(n, maxFractionDigits = 0) {
  // 缺值/非數欄位顯示 NT$ 0 勝過 NT$ NaN
  if (!Number.isFinite(Number(n))) n = 0
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: maxFractionDigits })
}

// NT$ + 千分位，取絕對值（正負交給呼叫端上色/加號）
export function formatAmount(n, { hidden = false } = {}) {
  if (hidden) return MASK
  return 'NT$ ' + formatNumber(Math.abs(n))
}

// 帶正負號：收入/應收用 +，支出/應付/負餘額用 −
export function formatSigned(n, { hidden = false } = {}) {
  if (hidden) return MASK
  const sign = n < 0 ? '−' : '+'
  return sign + 'NT$ ' + formatNumber(Math.abs(n))
}

// 餘額顯示：負數帶 −，正數不帶號（帳戶餘額慣例）
export function formatBalance(n, { hidden = false } = {}) {
  if (hidden) return MASK
  return (n < 0 ? '−' : '') + 'NT$ ' + formatNumber(Math.abs(n))
}
