// 記帳金額鍵盤的計算機核心。鍵盤無括號，故四則＋百分比用兩階段求值即可，
// 不使用 eval / Function（避開 lint no-eval 與 CSP 風險）。

const OPS = ['+', '-', '*', '/']

// 求值字串運算式，回傳 number；非法回傳 NaN，除以零等回傳 Infinity（呼叫端判 isFinite）。
export function evaluate(expr) {
  if (expr == null) return 0
  let e = String(expr).replace(/[+\-*/.]$/, '') // 去掉懸空的結尾運算子/小數點
  if (e === '' || e === '-') return 0

  const nums = []
  const ops = []
  let num = ''
  for (let i = 0; i < e.length; i++) {
    const ch = e[i]
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      num += ch
    } else if (ch === '%') {
      if (num === '' || num === '-') return NaN
      num = String(parseFloat(num) / 100)
    } else if (OPS.includes(ch)) {
      if (num === '' || num === '-') {
        if (ch === '-' && num === '') { num = '-'; continue } // 一元負號
        return NaN
      }
      nums.push(parseFloat(num))
      num = ''
      ops.push(ch)
    } else {
      return NaN
    }
  }
  if (num === '' || num === '-') return NaN
  nums.push(parseFloat(num))

  // 第一階段：* /
  const folded = [nums[0]]
  const addOps = []
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    const v = nums[i + 1]
    if (op === '*') folded[folded.length - 1] *= v
    else if (op === '/') folded[folded.length - 1] /= v
    else { addOps.push(op); folded.push(v) }
  }
  // 第二階段：+ -
  let r = folded[0]
  for (let i = 0; i < addOps.length; i++) {
    r = addOps[i] === '+' ? r + folded[i + 1] : r - folded[i + 1]
  }
  return r
}

// 求值並取整數（元）。無效或非有限 → null。
export function toAmount(expr) {
  const r = evaluate(expr)
  if (isNaN(r) || !isFinite(r)) return null
  return Math.round(r)
}

// 運算式是否含運算子（決定是否顯示運算過程那一行）
export function hasOperator(expr) {
  return /[+*/%]/.test(expr) || /\d-/.test(expr)
}

// 把運算式轉成好看的顯示（× ÷ − ＋）
export function prettyExpr(expr) {
  return String(expr)
    .replace(/\*/g, ' × ')
    .replace(/\//g, ' ÷ ')
    .replace(/\+/g, ' + ')
    .replace(/-/g, ' − ')
    .replace(/\s+/g, ' ')
    .trim()
}

// 套用一次按鍵，回傳新的運算式字串（對齊設計稿 press 行為）
export function applyKey(expr, key) {
  const a = expr ?? ''
  if (key === 'AC') return ''
  if (key === 'back') return a.slice(0, -1)
  if (key === '=') {
    const r = toAmount(a)
    return r == null ? a : String(r)
  }
  if (OPS.includes(key)) {
    if (a === '') return key === '-' ? '-' : ''
    if (a.endsWith('%')) return a + key
    if (OPS.includes(a.slice(-1))) return a.slice(0, -1) + key // 換運算子
    return a + key
  }
  if (key === '%') {
    if (a === '' || a.endsWith('%') || OPS.includes(a.slice(-1)) || a.endsWith('.')) return a
    return a + '%'
  }
  if (key === '.') {
    const seg = a.split(/[+\-*/%]/).pop()
    if (seg.includes('.')) return a
    return seg === '' ? a + '0.' : a + '.'
  }
  // 數字
  if (a.endsWith('%')) return a + '*' + key
  return a === '0' ? key : a + key
}
