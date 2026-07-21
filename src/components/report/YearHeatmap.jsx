import { useMemo, useState } from 'react'
import { todayStr, weekday, formatMd } from '../../lib/date'
import { formatAmount } from '../../lib/format'

// 年度消費熱力圖（docs/09 批次 5，GitHub 風格）：週為欄 × 7 列（日～六）。
// 色階 5 級：0＝surface-alt；非零按該年非零值四分位分 4 級（color-mix N=25/45/70/100）。
// 未來日不上色。用 div grid（資料視覺化屬 svg 禁令例外），顏色一律 CSS token 供深色自動適配。

const LEVEL_N = { 1: 25, 2: 45, 3: 70, 4: 100 }

function quantile(sorted, p) {
  if (sorted.length === 0) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function buildHeatmap(year, totals) {
  const today = todayStr()
  const jan1 = new Date(year, 0, 1)
  const dec31 = new Date(year, 11, 31)
  // 網格首欄＝含 1/1 那週的週日；末欄＝含 12/31 那週的週六
  const gridStart = new Date(jan1)
  gridStart.setDate(gridStart.getDate() - gridStart.getDay())
  const gridEnd = new Date(dec31)
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()))

  // 四分位（僅該年非零值）
  const vals = []
  for (const k in totals) if (totals[k] > 0) vals.push(totals[k])
  vals.sort((a, b) => a - b)
  const q1 = quantile(vals, 0.25)
  const q2 = quantile(vals, 0.5)
  const q3 = quantile(vals, 0.75)
  const levelOf = (v) => (v <= 0 ? 0 : v <= q1 ? 1 : v <= q2 ? 2 : v <= q3 ? 3 : 4)

  const columns = []
  const cur = new Date(gridStart)
  let col = null
  while (cur <= gridEnd) {
    if (cur.getDay() === 0) {
      col = []
      columns.push(col)
    }
    const dstr = todayStr(cur)
    const inYear = cur >= jan1 && cur <= dec31
    const future = dstr > today
    if (inYear) {
      const amount = totals[dstr] ?? 0
      col.push({ date: dstr, amount, level: future ? -1 : levelOf(amount), future })
    } else {
      col.push(null)
    }
    cur.setDate(cur.getDate() + 1)
  }

  // 月份刻度：每欄第一個在年內的日之月份，與前一欄不同才標籤
  const labels = columns.map((c, i) => {
    const firstDay = c.find((x) => x)
    const m = firstDay ? Number(firstDay.date.slice(5, 7)) : null
    const prev = columns[i - 1]?.find((x) => x)
    const pm = prev ? Number(prev.date.slice(5, 7)) : null
    return m && m !== pm ? `${m}月` : ''
  })

  return { columns, labels }
}

function cellStyle(cell) {
  if (!cell) return { background: 'transparent' }
  if (cell.future) return { background: 'var(--color-surface-alt)', opacity: 0.4 }
  if (cell.level === 0) return { background: 'var(--color-surface-alt)' }
  return { background: `color-mix(in srgb, var(--color-expense) ${LEVEL_N[cell.level]}%, transparent)` }
}

export default function YearHeatmap({ year, totals, hidden }) {
  const { columns, labels } = useMemo(() => buildHeatmap(year, totals), [year, totals])
  const [sel, setSel] = useState(null)

  return (
    <div className="bg-surface border border-line rounded-card shadow-card p-4 mt-3">
      <div className="text-[15px] font-semibold mb-3">{year} 年消費熱力圖</div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1 min-w-max">
          {/* 月份刻度 */}
          <div className="flex gap-[3px]">
            {labels.map((l, i) => (
              <div key={i} className="w-[11px] text-[9px] text-text-tertiary whitespace-nowrap leading-none">
                {l}
              </div>
            ))}
          </div>
          {/* 週欄 × 7 列 */}
          <div className="flex gap-[3px]">
            {columns.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-[3px]">
                {col.map((cell, ri) => (
                  <button
                    key={ri}
                    disabled={!cell || cell.future}
                    onClick={() => cell && setSel({ date: cell.date, amount: cell.amount })}
                    style={cellStyle(cell)}
                    className={`w-[11px] h-[11px] rounded-[2px] ${
                      sel && cell && sel.date === cell.date ? 'ring-1 ring-brand ring-offset-1 ring-offset-surface' : ''
                    }`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* 圖例＋caption */}
      <div className="flex items-center justify-between mt-3">
        <div className="text-xs text-text-tertiary tabular-nums min-h-[16px]">
          {sel
            ? `${formatMd(sel.date)} ${weekday(sel.date)}・支出 ${hidden ? '••••' : formatAmount(sel.amount)}`
            : '點方格看當日支出'}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-text-tertiary">
          <span>少</span>
          {[0, 1, 2, 3, 4].map((lv) => (
            <span key={lv} className="w-[11px] h-[11px] rounded-[2px]" style={cellStyle({ level: lv })} />
          ))}
          <span>多</span>
        </div>
      </div>
    </div>
  )
}
