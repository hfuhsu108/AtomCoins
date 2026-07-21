import { useState, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft, faChevronRight, faArrowUp, faArrowDown, faMinus } from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../../db/DataProvider'
import { categoryStatsRange, monthlyTrend, yearlySummary, dailyExpenseTotals } from '../../lib/engine'
import { merchantStats } from '../../lib/merchant'
import { formatAmount, formatNumber } from '../../lib/format'
import { monthLabel, monthPrefix, addMonth, daysInMonth, todayStr, parseDate } from '../../lib/date'
import { getIcon } from '../../lib/icons'
import YearHeatmap from './YearHeatmap'

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
  const invoices = useCollection('invoices')
  const merchantAliases = useCollection('merchantAliases')

  const now = parseDate(todayStr())
  const [view, setView] = useState('month') // 'month' | 'year'
  const [viewMonth, setViewMonth] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [kind, setKind] = useState('expense')

  const opt = { hidden }
  const isExpense = kind === 'expense'
  const isYear = view === 'year'
  const tabWord = isExpense ? '支出' : '收入'
  const periodWord = isYear ? '本年' : '本月'

  // 禁止往未來導航
  const curYm = now.getFullYear() * 12 + now.getMonth()
  const atCurrentMonth = viewMonth.year * 12 + (viewMonth.month - 1) >= curYm
  const atCurrentYear = viewYear >= now.getFullYear()
  const atCurrent = isYear ? atCurrentYear : atCurrentMonth

  // 統計區間（含端點，比對 tradeDate）
  const range = useMemo(() => {
    if (isYear) return { from: `${viewYear}-01-01`, to: `${viewYear}-12-31` }
    const prefix = monthPrefix(viewMonth.year, viewMonth.month)
    return { from: `${prefix}-01`, to: `${prefix}-${String(daysInMonth(viewMonth.year, viewMonth.month)).padStart(2, '0')}` }
  }, [isYear, viewYear, viewMonth])

  const stats = useMemo(
    () => categoryStatsRange(txns, categories, kind, range.from, range.to),
    [txns, categories, kind, range],
  )
  // 趨勢：月視角近 6 月、年視角該年 1–12 月
  const trend = useMemo(
    () => (isYear ? monthlyTrend(txns, viewYear, 12, 12) : monthlyTrend(txns, viewMonth.year, viewMonth.month, 6)),
    [txns, isYear, viewYear, viewMonth],
  )

  // 商家排行 top 10（含歷史歸帳交易 fallback），區間隨月/年視角
  const merchantRows = useMemo(
    () => merchantStats(txns, invoices, merchantAliases, kind, range).slice(0, 10),
    [txns, invoices, merchantAliases, kind, range],
  )

  // 年度消費熱力圖資料（僅年視角需要）
  const dailyTotals = useMemo(
    () => (isYear ? dailyExpenseTotals(txns, viewYear) : {}),
    [isYear, txns, viewYear],
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

  // 較上期：月視角＝較上月（取 trend 末兩筆）、年視角＝較去年（yearlySummary）
  const change = useMemo(() => {
    if (isYear) {
      const cur = isExpense ? yearlySummary(txns, viewYear).expense : yearlySummary(txns, viewYear).income
      const prev = isExpense ? yearlySummary(txns, viewYear - 1).expense : yearlySummary(txns, viewYear - 1).income
      return prev ? ((cur - prev) / prev) * 100 : null
    }
    const lastTrend = trend[trend.length - 1] ?? { income: 0, expense: 0 }
    const curV = isExpense ? lastTrend.expense : lastTrend.income
    const prevRow = trend[trend.length - 2]
    const prevV = prevRow ? (isExpense ? prevRow.expense : prevRow.income) : 0
    return prevV ? ((curV - prevV) / prevV) * 100 : null
  }, [isYear, isExpense, txns, viewYear, trend])
  const changeLabel = isYear ? '較去年' : '較上月'

  // 均值：月視角＝日均（本月除以今天日數、過去月除以整月天數）；年視角＝月均（除以已過月數）
  const avgLabel = isYear ? '月均' : '日均'
  const divisor = isYear
    ? viewYear === now.getFullYear() ? now.getMonth() + 1 : 12
    : atCurrentMonth ? now.getDate() : daysInMonth(viewMonth.year, viewMonth.month)
  const avg = divisor > 0 ? total / divisor : 0

  // 趨勢柱高亮：月視角末筆；年視角當年當月（非本年不高亮）
  const highlightIdx = isYear
    ? viewYear === now.getFullYear() ? now.getMonth() : -1
    : trend.length - 1

  const trendMax = Math.max(1, ...trend.flatMap((m) => [m.income, m.expense]))

  return (
    <>
      {/* 月/年 視角 ＋ 期間導航 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex bg-surface-alt rounded-btn p-0.5">
          {[['month', '月'], ['year', '年']].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`h-8 px-3.5 rounded-[8px] text-[13px] font-medium ${
                view === v ? 'bg-surface shadow-segment font-semibold' : 'text-text-secondary'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <NavBtn
            icon={faChevronLeft}
            onClick={() => (isYear ? setViewYear((y) => y - 1) : setViewMonth((m) => addMonth(m, -1)))}
          />
          <span className="text-[15px] font-semibold tabular-nums min-w-[92px] text-center">
            {isYear ? `${viewYear} 年` : monthLabel(viewMonth.year, viewMonth.month)}
          </span>
          <NavBtn
            icon={faChevronRight}
            disabled={atCurrent}
            onClick={() => (isYear ? setViewYear((y) => y + 1) : setViewMonth((m) => addMonth(m, 1)))}
          />
        </div>
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
        <div className="text-[13px] text-text-secondary">{periodWord}{tabWord}</div>
        <div className="flex items-end gap-2.5 mt-1 flex-wrap">
          <div className={`text-[30px] font-bold leading-none tabular-nums ${isExpense ? 'text-expense' : 'text-income'}`}>
            {formatAmount(total, opt)}
          </div>
          <ChangeChip change={change} isExpense={isExpense} label={changeLabel} />
        </div>
        <div className="grid grid-cols-3 mt-3.5 pt-3.5 border-t border-line">
          <Stat label={avgLabel} value={formatAmount(avg, opt)} />
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
              <div className="text-sm text-text-tertiary mt-3">{periodWord}無{tabWord}</div>
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-1.5">
                <div className="relative w-44 h-44 flex-none">
                  {/* 隱藏金額時 donut 改單色環，不洩漏各分類比例 */}
                  <div className="absolute inset-0 rounded-full" style={{ background: hidden ? 'var(--color-surface-alt)' : donutBg }} />
                  <div className="absolute inset-[26px] rounded-full bg-surface flex flex-col items-center justify-center gap-0.5">
                    <div className="text-[11px] text-text-tertiary">{periodWord}{tabWord}</div>
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

        {/* 收支趨勢：月視角近 6 月、年視角 1–12 月 */}
        <div className="bg-surface border border-line rounded-card shadow-card p-4 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[15px] font-semibold">{isYear ? `${viewYear} 年各月趨勢` : '近 6 個月趨勢'}</span>
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
                <span className={`text-[11px] ${i === highlightIdx ? 'text-text-primary font-semibold' : 'text-text-tertiary'}`}>
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 商家排行（當期 top 10，隨月/年視角） */}
      {merchantRows.length > 0 && (
        <div className="bg-surface border border-line rounded-card shadow-card p-4 mt-3">
          <div className="text-[15px] font-semibold mb-2">商家排行</div>
          <div>
            {merchantRows.map((m, i) => (
              <MerchantRankRow key={m.merchant} rank={i + 1} row={m} maxAmt={merchantRows[0].amount} opt={opt} />
            ))}
          </div>
        </div>
      )}

      {/* 年度消費熱力圖（僅年視角） */}
      {isYear && <YearHeatmap year={viewYear} totals={dailyTotals} hidden={hidden} />}
    </>
  )
}

function MerchantRankRow({ rank, row, maxAmt, opt }) {
  const hidden = opt?.hidden
  const barW = hidden ? 100 : maxAmt > 0 ? (row.amount / maxAmt) * 100 : 0
  return (
    <div className="flex items-center gap-3 py-2.5 border-t border-line-light first:border-t-0">
      <span className="w-6 flex-none text-[13px] font-semibold text-text-tertiary tabular-nums text-center">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium truncate">{row.merchant}</span>
          <span className="text-sm font-semibold tabular-nums flex-none">{formatAmount(row.amount, opt)}</span>
        </div>
        <div className="flex items-center gap-2.5 mt-1.5">
          <div className="flex-1 h-1.5 bg-surface-alt rounded-pill overflow-hidden">
            <div
              className="h-full rounded-pill"
              style={{ width: `${barW}%`, background: hidden ? 'var(--color-surface-alt)' : 'var(--color-brand)' }}
            />
          </div>
          <span className="text-[11px] text-text-tertiary tabular-nums w-10 text-right">{row.count} 筆</span>
        </div>
      </div>
    </div>
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

// 較上期變化 chip：支出減少或收入增加＝good（綠），反向＝紅，持平／無基準＝中性灰
function ChangeChip({ change, isExpense, label = '較上月' }) {
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
  const text = noPrev ? `${label} —` : flat ? `${label} 持平` : `${label} ${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}%`
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
  const hidden = opt?.hidden
  const pct = total > 0 ? (slice.amount / total) * 100 : 0
  // 隱藏金額時長條等寬淡色、百分比遮掉，不洩漏比例
  const barW = hidden ? 100 : maxAmt > 0 ? (slice.amount / maxAmt) * 100 : 0
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
            <div className="h-full rounded-pill" style={{ width: `${barW}%`, background: hidden ? 'var(--color-surface-alt)' : slice.color }} />
          </div>
          <span className="text-[11px] text-text-tertiary tabular-nums w-8 text-right">{hidden ? '••' : `${pct.toFixed(0)}%`}</span>
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
