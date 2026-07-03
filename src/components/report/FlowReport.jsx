import { useState, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft, faChevronRight, faArrowUp, faArrowDown, faMinus } from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../../db/DataProvider'
import { monthlyCategoryStats, monthlyTrend } from '../../lib/engine'
import { formatAmount, formatNumber } from '../../lib/format'
import { monthLabel, addMonth, daysInMonth, todayStr, parseDate } from '../../lib/date'
import { getIcon } from '../../lib/icons'

// 圓餅／排名色盤（對應 index.css --color-chart-1..7）；超過 7 類時尾端收斂成「其他」用灰
const CHART_VARS = [
  'var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)',
  'var(--color-chart-4)', 'var(--color-chart-5)', 'var(--color-chart-6)',
  'var(--color-chart-7)',
]
const OTHER_COLOR = 'var(--color-text-tertiary)'
const MAX_SLICES = 7 // 超過則取 top 6 + 其他，避免圓餅切片過碎、色盤用盡

const KIND_TABS = [
  { id: 'expense', label: '支出' },
  { id: 'income', label: '收入' },
]

export default function FlowReport({ hidden }) {
  const txns = useCollection('transactions')
  const categories = useCollection('categories')

  const now = parseDate(todayStr())
  const [viewMonth, setViewMonth] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [kind, setKind] = useState('expense')

  const opt = { hidden }
  const isExpense = kind === 'expense'
  const tabWord = isExpense ? '支出' : '收入'

  // 禁止往未來導航：viewMonth 已達（或超過）本月時停用「下一月」
  const curYm = now.getFullYear() * 12 + now.getMonth()
  const atCurrent = viewMonth.year * 12 + (viewMonth.month - 1) >= curYm

  const stats = useMemo(
    () => monthlyCategoryStats(txns, categories, kind, viewMonth.year, viewMonth.month),
    [txns, categories, kind, viewMonth],
  )
  const trend = useMemo(
    () => monthlyTrend(txns, viewMonth.year, viewMonth.month),
    [txns, viewMonth],
  )

  // 圓餅切片：>7 類時 top 6 保留、其餘併「其他」；同時指派色盤
  const slices = useMemo(() => {
    const rows = stats.rows
    if (rows.length <= MAX_SLICES) {
      return rows.map((r, i) => ({ ...r, color: CHART_VARS[i] }))
    }
    const top = rows.slice(0, MAX_SLICES - 1).map((r, i) => ({ ...r, color: CHART_VARS[i] }))
    const restAmt = rows.slice(MAX_SLICES - 1).reduce((s, r) => s + r.amount, 0)
    return [...top, { id: '__other', name: '其他', icon: 'ellipsis', amount: restAmt, color: OTHER_COLOR }]
  }, [stats.rows])

  const total = stats.total
  const maxAmt = slices.length ? slices[0].amount : 0

  // conic-gradient：各切片依累積百分比串接（整數金額相加恰好到 total，末端達 100%）
  const donutBg = useMemo(() => {
    if (total <= 0) return 'var(--color-surface-alt)'
    let acc = 0
    const stops = slices.map((s) => {
      const start = (acc / total) * 100
      acc += s.amount
      const end = (acc / total) * 100
      return `${s.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`
    })
    return `conic-gradient(${stops.join(', ')})`
  }, [slices, total])

  // 較上月：trend 末筆＝viewMonth、前一筆＝上月；百分比為 null 代表無上月基準
  const curV = isExpense ? trend[trend.length - 1].expense : trend[trend.length - 1].income
  const prevRow = trend[trend.length - 2]
  const prevV = prevRow ? (isExpense ? prevRow.expense : prevRow.income) : 0
  const change = prevV ? ((curV - prevV) / prevV) * 100 : null

  // 日均：本月除以今天日數、過去月除以整月天數（防除 0）
  const days = atCurrent ? now.getDate() : daysInMonth(viewMonth.year, viewMonth.month)
  const avg = days > 0 ? total / days : 0

  const trendMax = Math.max(1, ...trend.flatMap((m) => [m.income, m.expense]))

  return (
    <>
      {/* 月份導航 */}
      <div className="flex items-center justify-center gap-4 mb-3">
        <NavBtn icon={faChevronLeft} onClick={() => setViewMonth((m) => addMonth(m, -1))} />
        <span className="text-[15px] font-semibold tabular-nums">{monthLabel(viewMonth.year, viewMonth.month)}</span>
        <NavBtn icon={faChevronRight} disabled={atCurrent} onClick={() => setViewMonth((m) => addMonth(m, 1))} />
      </div>

      {/* 支出／收入切換 */}
      <div className="flex gap-1.5 p-1 mb-3 bg-surface-alt rounded-modal">
        {KIND_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setKind(t.id)}
            className={`flex-1 py-2 rounded-btn text-[13px] font-semibold ${
              kind === t.id ? 'bg-surface text-text-primary shadow-segment' : 'text-text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 統計摘要 */}
      <div className="bg-surface border border-line rounded-card shadow-card p-4 mb-3">
        <div className="text-[13px] text-text-secondary">本月{tabWord}</div>
        <div className="flex items-end gap-2.5 mt-1 flex-wrap">
          <div className={`text-[30px] font-bold leading-none tabular-nums ${isExpense ? 'text-expense' : 'text-income'}`}>
            {formatAmount(total, opt)}
          </div>
          <ChangeChip change={change} isExpense={isExpense} />
        </div>
        <div className="grid grid-cols-3 mt-3.5 pt-3.5 border-t border-line">
          <Stat label="日均" value={formatAmount(avg, opt)} />
          <Stat label="交易筆數" value={`${stats.count} 筆`} />
          <Stat label="分類數" value={`${stats.rows.length} 類`} />
        </div>
      </div>

      {/* 分布 ＋ 趨勢（桌面雙欄） */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* 分類分布 */}
        <div className="bg-surface border border-line rounded-card shadow-card p-4">
          <div className="text-[15px] font-semibold mb-3.5">{tabWord}分布</div>
          {total <= 0 ? (
            <div className="flex flex-col items-center py-6">
              <div className="relative w-44 h-44 flex-none">
                <div className="absolute inset-0 rounded-full bg-surface-alt" />
                <div className="absolute inset-[26px] rounded-full bg-surface" />
              </div>
              <div className="text-sm text-text-tertiary mt-3">本月無{tabWord}</div>
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-1.5">
                <div className="relative w-44 h-44 flex-none">
                  <div className="absolute inset-0 rounded-full" style={{ background: donutBg }} />
                  <div className="absolute inset-[26px] rounded-full bg-surface flex flex-col items-center justify-center gap-0.5">
                    <div className="text-[11px] text-text-tertiary">本月{tabWord}</div>
                    <div className="text-[22px] font-bold tabular-nums">{hidden ? '••••' : formatNumber(total)}</div>
                    <div className="text-[11px] text-text-tertiary tabular-nums">{stats.count} 筆</div>
                  </div>
                </div>
              </div>
              <div className="mt-2">
                {slices.map((s) => (
                  <RankRow key={s.id} slice={s} total={total} maxAmt={maxAmt} opt={opt} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* 近 6 個月趨勢 */}
        <div className="bg-surface border border-line rounded-card shadow-card p-4 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[15px] font-semibold">近 6 個月趨勢</span>
            <div className="flex gap-3">
              <Legend color="var(--color-income)" label="收入" />
              <Legend color="var(--color-expense)" label="支出" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-1.5 flex-1 min-h-[160px]">
            {trend.map((m, i) => (
              <div key={`${m.year}-${m.month}`} className="flex-1 h-full flex flex-col items-center justify-end gap-2">
                <div className="flex-1 flex items-end justify-center gap-[3px] w-full">
                  <Bar value={m.income} max={trendMax} color="var(--color-income)" />
                  <Bar value={m.expense} max={trendMax} color="var(--color-expense)" />
                </div>
                <span className={`text-[11px] ${i === trend.length - 1 ? 'text-text-primary font-semibold' : 'text-text-tertiary'}`}>
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function NavBtn({ icon, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-7 h-7 rounded-chip bg-surface-alt text-text-secondary flex items-center justify-center text-xs disabled:opacity-40"
    >
      <FontAwesomeIcon icon={icon} />
    </button>
  )
}

// 較上月變化 chip：支出減少或收入增加＝good（綠），反向＝紅，持平／無基準＝中性灰
function ChangeChip({ change, isExpense }) {
  const noPrev = change == null
  const flat = !noPrev && Math.abs(change) < 0.05
  const neutral = noPrev || flat
  const good = neutral ? null : isExpense ? change < 0 : change > 0
  const icon = neutral ? faMinus : change > 0 ? faArrowUp : faArrowDown
  const cls = neutral
    ? 'text-text-secondary bg-surface-alt'
    : good
      ? 'text-success bg-success-bg'
      : 'text-error bg-error-bg'
  const text = noPrev ? '較上月 —' : flat ? '較上月 持平' : `較上月 ${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}%`
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-pill px-2.5 py-1 ${cls}`}>
      <FontAwesomeIcon icon={icon} className="text-[10px]" /> {text}
    </span>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-[11px] text-text-secondary">{label}</div>
      <div className="text-base font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  )
}

function RankRow({ slice, total, maxAmt, opt }) {
  const pct = total > 0 ? (slice.amount / total) * 100 : 0
  const barW = maxAmt > 0 ? (slice.amount / maxAmt) * 100 : 0
  return (
    <div className="flex items-center gap-3 py-2.5 border-t border-line-light first:border-t-0">
      <span
        className="w-9 h-9 flex-none rounded-btn flex items-center justify-center text-[15px]"
        style={{ background: `color-mix(in srgb, ${slice.color} 12%, transparent)`, color: slice.color }}
      >
        <FontAwesomeIcon icon={getIcon(slice.icon)} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium truncate">{slice.name}</span>
          <span className="text-sm font-semibold tabular-nums flex-none">{formatAmount(slice.amount, opt)}</span>
        </div>
        <div className="flex items-center gap-2.5 mt-1.5">
          <div className="flex-1 h-1.5 bg-surface-alt rounded-pill overflow-hidden">
            <div className="h-full rounded-pill" style={{ width: `${barW}%`, background: slice.color }} />
          </div>
          <span className="text-[11px] text-text-tertiary tabular-nums w-8 text-right">{pct.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  )
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-text-secondary">
      <span className="w-2 h-2 rounded-[2px]" style={{ background: color }} /> {label}
    </span>
  )
}

// 柱高＝值／區間 max；值 >0 時最少 2% 以保可見，值 =0 不畫柱
function Bar({ value, max, color }) {
  const h = value > 0 ? Math.max((value / max) * 100, 2) : 0
  return <div className="w-2.5 rounded-t-[3px]" style={{ height: `${h}%`, background: color }} />
}
