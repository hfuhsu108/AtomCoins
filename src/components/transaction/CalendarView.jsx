import { useMemo, useState, useEffect } from 'react'
import { WEEKDAYS, todayStr, daysInMonth, formatMd, weekday } from '../../lib/date'
import { formatWan, formatAmount } from '../../lib/format'
import TransactionRow from './TransactionRow'

// 月曆檢視（docs/09 批次 5）：7 欄（週日起始）× 5-6 列；每格日數字＋當日支出（有才顯示），
// 有收入另加小圓點；今日格框線高亮。點日期列該日交易。日聚合直接重用 TransactionsPage 的 days。
export default function CalendarView({ ym, days, lookups, hidden, onRowClick }) {
  const today = todayStr()
  const prefix = `${ym.year}-${String(ym.month).padStart(2, '0')}`

  // date → { items, dayIn, dayOut }
  const dayMap = useMemo(() => {
    const m = {}
    for (const d of days) m[d.date] = d
    return m
  }, [days])

  // 網格：前置空白（該月 1 號的星期）＋各日＋補滿最後一週
  const cells = useMemo(() => {
    const total = daysInMonth(ym.year, ym.month)
    const firstWeekday = new Date(ym.year, ym.month - 1, 1).getDay()
    const out = []
    for (let i = 0; i < firstWeekday; i++) out.push(null)
    for (let d = 1; d <= total; d++) out.push(`${prefix}-${String(d).padStart(2, '0')}`)
    while (out.length % 7 !== 0) out.push(null)
    return out
  }, [ym, prefix])

  // 預設選今日（僅當本月含今日）；換月時重置
  const [selected, setSelected] = useState(null)
  useEffect(() => {
    setSelected(today.startsWith(prefix) ? today : null)
  }, [prefix, today])

  const selDay = selected ? dayMap[selected] : null

  return (
    <div>
      <div className="bg-surface border border-line rounded-card shadow-card p-3">
        {/* 星期表頭 */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-[11px] text-text-tertiary py-1">{w}</div>
          ))}
        </div>
        {/* 日格 */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <div key={`b${i}`} />
            const info = dayMap[date]
            const dayNum = Number(date.slice(8, 10))
            const isToday = date === today
            const isSel = date === selected
            return (
              <button
                key={date}
                onClick={() => setSelected(date)}
                className={`aspect-square rounded-btn flex flex-col items-center justify-center gap-0.5 border ${
                  isSel ? 'border-brand bg-brand-light/40' : isToday ? 'border-brand/50' : 'border-transparent'
                }`}
              >
                <span className={`text-[13px] tabular-nums ${isToday ? 'font-bold text-brand' : 'font-medium'}`}>
                  {dayNum}
                </span>
                {info?.dayOut > 0 && (
                  <span className="text-[10px] leading-none text-expense tabular-nums">
                    {hidden ? '••' : formatWan(info.dayOut)}
                  </span>
                )}
                {info?.dayIn > 0 && <span className="w-1 h-1 rounded-full bg-income" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* 所選日交易 */}
      {selected && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between px-1 py-2">
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-semibold">{formatMd(selected)}</span>
              <span className="text-[13px] text-text-tertiary">{weekday(selected)}</span>
            </div>
            {selDay && (
              <div className="flex gap-2.5 text-xs font-semibold tabular-nums">
                {selDay.dayIn > 0 && <span className="text-income">{formatAmount(selDay.dayIn, { hidden })}</span>}
                {selDay.dayOut > 0 && <span className="text-expense">{formatAmount(selDay.dayOut, { hidden })}</span>}
              </div>
            )}
          </div>
          {selDay?.items?.length ? (
            <div className="bg-surface border border-line rounded-card shadow-card px-4 divide-y divide-line-light">
              {selDay.items.map((t) => (
                <TransactionRow key={t.id} tx={t} lookups={lookups} onClick={() => onRowClick(t)} />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-text-tertiary text-sm">當日無記錄</div>
          )}
        </div>
      )}
    </div>
  )
}
