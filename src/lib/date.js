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

// ISO 時間戳 → '6/23 14:05'（上次同步時間顯示用）；空值/非法回 null
export function formatDateTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`
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

// 日期加減 n 天，回傳 'YYYY-MM-DD'
export function addDays(str, n) {
  const d = parseDate(str)
  d.setDate(d.getDate() + n)
  return todayStr(d)
}

// 該年月實際天數（year, month 為 1-12），供出帳日落在 29-31 時夾住
export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

// 指定年月的某「日」字串，超過當月天數則夾到月底（如 2 月設 31 → 28/29）
export function dayOfMonth(year, month, day) {
  const d = Math.min(day, daysInMonth(year, month))
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// 依頻率把日期往後推一個週期。frequency = { unit:'week'|'month'|'year', interval:n }
export function advanceDate(str, { unit, interval = 1 } = {}) {
  // 未知 unit 若靜默走 month 分支會產出 'NaN-…' 髒日期並寫回規則使其永久失效；fail loud
  if (unit !== 'week' && unit !== 'month' && unit !== 'year') {
    throw new Error(`未知的週期單位：${unit}`)
  }
  if (unit === 'week') return addDays(str, 7 * interval)
  const d = parseDate(str)
  const day = d.getDate()
  if (unit === 'year') {
    d.setFullYear(d.getFullYear() + interval)
  } else {
    // month：先設 1 號避免跨月溢位，再夾回原日（或月底）
    const y = d.getFullYear()
    const m = d.getMonth() + interval // 0-based
    const ny = y + Math.floor(m / 12)
    const nm = ((m % 12) + 12) % 12
    const last = new Date(ny, nm + 1, 0).getDate()
    return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`
  }
  return todayStr(d)
}
