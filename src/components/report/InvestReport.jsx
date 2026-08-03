import { useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../../db/DataProvider'
import { computeHoldings } from '../../lib/stock'
import useNetWorth from '../../hooks/useNetWorth'
import { formatBalance, formatSigned } from '../../lib/format'
import { todayStr, parseDate } from '../../lib/date'
import EmptyState from '../EmptyState'

// 報表>投資：跨期分析視角。持股清單、改現價、同步股價等「操作」一律留在明細>股票
// （唯一入口），這裡只回答兩件報表才該回答的事：這段期間投資賺賠多少、投資佔我多少資產。
//
// 刻意不做「期間報酬率（含未實現）」：那需要期初持股市值，而淨資產快照自啟用日起才累積、
// 期初多半缺值，算出來會誤導（同 AssetsReport 標明的「歷史不回補」限制）。

// 損益上色：台股慣例，正=紅、負=綠
function pnlClass(n) {
  return n >= 0 ? 'text-[var(--color-stock-buy)]' : 'text-[var(--color-stock-sell)]'
}

export default function InvestReport({ hidden }) {
  const stockTxns = useCollection('stockTransactions')
  const prices = useCollection('stockPrices')
  const { total: netWorthTotal, holdingsValue } = useNetWorth()

  const now = parseDate(todayStr())
  const [year, setYear] = useState(now.getFullYear())
  const opt = { hidden }
  const asOf = todayStr()

  const { realized, dividends } = useMemo(
    () => computeHoldings(stockTxns, prices, { asOf }),
    [stockTxns, prices, asOf],
  )

  // 該年已實現：依賣出日歸年，與收支報表用 tradeDate 歸月同一條規則
  const yearRealized = useMemo(
    () => realized.filter((r) => r.date?.startsWith(`${year}-`)),
    [realized, year],
  )
  const yearPnl = yearRealized.reduce((s, r) => s + r.pnl, 0)
  const yearCost = yearRealized.reduce((s, r) => s + r.cost, 0)
  const yearReturnPct = yearCost > 0 ? (yearPnl / yearCost) * 100 : null
  const lifetimePnl = realized.reduce((s, r) => s + r.pnl, 0)

  // 股利依「發放日」歸年（現金實際入帳的那一年），與已實現用賣出日歸年同樣是「錢落地」的口徑
  const yearDividends = useMemo(
    () => dividends.filter((d) => d.date?.startsWith(`${year}-`)),
    [dividends, year],
  )
  const yearDivCash = yearDividends.reduce((s, d) => s + d.cash, 0)
  const yearDivShares = yearDividends.reduce((s, d) => s + d.shares, 0)

  // 各標的已實現排行（該年），賺最多在前
  const bySymbol = useMemo(() => {
    const m = new Map()
    for (const r of yearRealized) {
      let e = m.get(r.symbol)
      if (!e) {
        e = { symbol: r.symbol, name: r.name, pnl: 0, count: 0 }
        m.set(r.symbol, e)
      }
      e.pnl += r.pnl
      e.count += 1
      if (r.name) e.name = r.name
    }
    return [...m.values()].sort((a, b) => b.pnl - a.pnl)
  }, [yearRealized])

  const atCurrentYear = year >= now.getFullYear()
  // 投資佔淨資產：兩個數字都取自 useNetWorth，與首頁「投資市值」必然同口徑。
  // 淨資產 ≤ 0（負債大於資產）時比重沒有意義，顯示 — 而不是硬算一個誤導的百分比。
  const investPct = netWorthTotal > 0 ? (holdingsValue / netWorthTotal) * 100 : null

  return (
    <>
      {/* 年度導航 */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] text-text-secondary">年度已實現損益</span>
        <div className="flex items-center gap-3">
          <NavBtn icon={faChevronLeft} onClick={() => setYear((y) => y - 1)} />
          <span className="text-[15px] font-semibold tabular-nums min-w-[72px] text-center">
            {year} 年
          </span>
          <NavBtn icon={faChevronRight} disabled={atCurrentYear} onClick={() => setYear((y) => y + 1)} />
        </div>
      </div>

      {/* 該年已實現 */}
      <div className="bg-surface border border-line rounded-card shadow-card p-4 mb-3">
        <div className="text-[13px] text-text-secondary">{year} 年已實現損益</div>
        <div className={`text-[30px] font-bold leading-tight tabular-nums mt-0.5 ${pnlClass(yearPnl)}`}>
          {formatSigned(yearPnl, opt)}
        </div>
        <div className="grid grid-cols-3 mt-3.5 pt-3.5 border-t border-line">
          <Stat label="賣出筆數" value={`${yearRealized.length} 筆`} />
          <Stat
            label="報酬率"
            value={yearReturnPct == null ? '—' : `${yearReturnPct >= 0 ? '+' : ''}${yearReturnPct.toFixed(2)}%`}
            cls={yearReturnPct == null ? '' : pnlClass(yearReturnPct)}
          />
          <Stat label="累計已實現" value={formatSigned(lifetimePnl, opt)} cls={pnlClass(lifetimePnl)} />
        </div>
      </div>

      {/* 年度股利：只有記過配息才顯示，沒配息的人不必多看一張永遠是 0 的卡 */}
      {dividends.length > 0 && (
        <div className="bg-surface border border-line rounded-card shadow-card p-4 mb-3">
          <div className="text-[13px] text-text-secondary">{year} 年股利</div>
          <div className="text-[30px] font-bold leading-tight tabular-nums mt-0.5 text-brand">
            {formatSigned(yearDivCash, opt)}
          </div>
          <div className="grid grid-cols-3 mt-3.5 pt-3.5 border-t border-line">
            <Stat label="配息筆數" value={`${yearDividends.length} 筆`} />
            <Stat label="配股" value={yearDivShares > 0 ? `${yearDivShares} 股` : '—'} />
            {/* 已實現與股利分開算再相加：報酬率公式維持只看買賣，避免口徑漂移 */}
            <Stat
              label="已實現＋股利"
              value={formatSigned(yearPnl + yearDivCash, opt)}
              cls={pnlClass(yearPnl + yearDivCash)}
            />
          </div>
        </div>
      )}

      {/* 投資佔淨資產 */}
      <div className="bg-surface border border-line rounded-card shadow-card p-4 mb-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-text-secondary">投資佔淨資產</span>
          <span className="text-[15px] font-semibold tabular-nums">
            {hidden || investPct == null ? '—' : `${investPct.toFixed(1)}%`}
          </span>
        </div>
        {/* 隱藏金額時進度條固定等寬淡色，不洩漏比例（同首頁卡片列） */}
        <div className="h-1.5 bg-surface-alt rounded-pill my-3 overflow-hidden">
          <div
            className="h-full rounded-pill"
            style={{
              width: hidden ? '40%' : `${Math.min(100, Math.max(0, investPct ?? 0))}%`,
              background: hidden ? 'var(--color-line)' : 'var(--color-brand)',
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-text-tertiary tabular-nums">
          <span>投資市值 {formatBalance(holdingsValue, opt)}</span>
          <span>淨資產 {formatBalance(netWorthTotal, opt)}</span>
        </div>
      </div>

      {/* 各標的已實現排行 */}
      {bySymbol.length === 0 ? (
        <EmptyState title={`${year} 年沒有賣出紀錄`} hint="已實現損益在賣出時才產生" />
      ) : (
        <div>
          <div className="text-[13px] font-semibold text-text-secondary px-1 mb-1.5">
            各標的已實現（{year} 年）
          </div>
          <div className="bg-surface border border-line rounded-card shadow-card divide-y divide-line-light">
            {bySymbol.map((r) => (
              <div key={r.symbol} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold">{r.symbol}</span>
                    <span className="text-[13px] text-text-secondary truncate">{r.name}</span>
                  </div>
                  <div className="text-xs text-text-tertiary tabular-nums mt-0.5">{r.count} 筆賣出</div>
                </div>
                <span className={`text-[15px] font-bold tabular-nums ${pnlClass(r.pnl)}`}>
                  {formatSigned(r.pnl, opt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-text-tertiary mt-3 px-1 leading-relaxed">
        持股明細、現價與買賣操作在「明細 → 股票」。未實現損益隨股價浮動，不列入年度結算。
        股利依發放日歸年、不計入收支報表；配股只增加股數不增加成本，反映在均價下降。
      </p>
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

function Stat({ label, value, cls }) {
  return (
    <div>
      <div className="text-[11px] text-text-secondary">{label}</div>
      <div className={`text-base font-semibold tabular-nums mt-0.5 ${cls ?? ''}`}>{value}</div>
    </div>
  )
}
