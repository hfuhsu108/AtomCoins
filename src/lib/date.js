// 日期一律 'YYYY-MM-DD'（本地時區，避免 toISOString 的 UTC 位移踩坑）

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function todayStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 把 'YYYY-MM-DD' 拆成數字，並以本地時間建 Date（不經 UTC 解析）
export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// '6/23'（無前導零）
export function formatMd(str) {
  const [, m, d] = str.split('-').map(Number)
  return `${m}/${d}`
}

// '週二'
export function weekday(str) {
  return '週' + WEEKDAYS[parseDate(str).getDay()]
}

// '2026 年 6 月'
export function monthLabel(year, month) {
  return `${year} 年 ${month} 月`
}

// 該年月的 'YYYY-MM' 前綴，用來篩月份
export function monthPrefix(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`
}

// 月份加減，回傳 { year, month }（month 為 1-12）
export function addMonth({ year, month }, delta) {
  const idx = (year * 12 + (month - 1)) + delta
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}
