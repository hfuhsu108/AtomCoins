import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEye, faEyeSlash, faArrowsRotate, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../db/DataProvider'
import { computeHoldings, holdingsMarketValue } from '../lib/stock'
import useSyncPrices from '../hooks/useSyncPrices'
import { formatBalance, formatSigned, formatNumber } from '../lib/format'
import { todayStr, formatMd, formatDateTime } from '../lib/date'
import FlowReport from '../components/report/FlowReport'
import AssetsReport from '../components/report/AssetsReport'

const TABS = [
  { id: 'flow', label: '收支' },
  { id: 'invest', label: '投資' },
  { id: 'assets', label: '資產' },
]

// 損益／報酬率上色：台股慣例，正=紅(買)、負=綠(賣)
function pnlClass(n) {
  return n >= 0 ? 'text-[var(--color-stock-buy)]' : 'text-[var(--color-stock-sell)]'
}

function pctLabel(pct) {
  if (pct == null) return ''
  return ` (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`
}

export default function ReportsPage() {
  const stockTxns = useCollection('stockTransactions')
  const prices = useCollection('stockPrices')

  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('tab') || 'flow')
  // 切分頁寫回 URL：離開報表再返回能停在原分頁；預設 flow 不帶參數
  const changeTab = (id) => {
    setTab(id)
    setSearchParams(id === 'flow' ? {} : { tab: id }, { replace: true })
  }
  const [hidden, setHidden] = useState(false)
  const opt = { hidden }
  const asOf = todayStr()

  const { holdings, realized } = useMemo(
    () => computeHoldings(stockTxns, prices, { asOf }),
    [stockTxns, prices, asOf],
  )

  // 未實現：跨帳戶依 symbol 彙總（同 symbol 現價相同，可直接加總股數／成本／市值）→ 報表視角
  const bySymbol = useMemo(() => {
    const m = new Map()
    for (const h of holdings) {
      let e = m.get(h.symbol)
      if (!e) {
        e = { symbol: h.symbol, name: h.name, shares: 0, costBasis: 0, marketValue: 0, hasPrice: h.hasPrice, price: h.price, priceDate: h.priceDate }
        m.set(h.symbol, e)
      }
      e.shares += h.shares
      e.costBasis += h.costBasis
      e.marketValue += h.marketValue
      if (h.name) e.name = h.name
      if (h.hasPrice) { e.hasPrice = true; e.price = h.price; e.priceDate = h.priceDate }
    }
    return [...m.values()]
      .map((e) => ({
        ...e,
        avgCost: e.shares > 0 ? e.costBasis / e.shares : 0,
        unrealizedPnl: e.hasPrice ? e.marketValue - e.costBasis : null,
        returnPct: e.hasPrice && e.costBasis > 0 ? ((e.marketValue - e.costBasis) / e.costBasis) * 100 : null,
      }))
      .sort((a, b) => (a.symbol < b.symbol ? -1 : 1))
  }, [holdings])

  // 已實現：依 symbol 加總損益
  const realizedBySymbol = useMemo(() => {
    const m = new Map()
    for (const r of realized) {
      let e = m.get(r.symbol)
      if (!e) { e = { symbol: r.symbol, name: r.name, pnl: 0, count: 0 }; m.set(r.symbol, e) }
      e.pnl += r.pnl
      e.count += 1
      if (r.name) e.name = r.name
    }
    return [...m.values()].sort((a, b) => (a.symbol < b.symbol ? -1 : 1))
  }, [realized])

  const totalCost = holdings.reduce((s, h) => s + h.costBasis, 0)
  const totalMarketValue = holdingsMarketValue(holdings)
  const totalUnrealized = holdings.reduce((s, h) => s + (h.unrealizedPnl ?? 0), 0)
  const totalRealized = realized.reduce((s, r) => s + r.pnl, 0)
  const totalReturnPct = totalCost > 0 ? ((totalMarketValue - totalCost) / totalCost) * 100 : 0
  const hasAny = holdings.length > 0 || realized.length > 0

  return (
    <div className="px-4 pt-4 pb-4 lg:px-7 lg:pt-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">報表</h1>
        <button
          onClick={() => setHidden((v) => !v)}
          className="w-[38px] h-[38px] rounded-chip bg-surface border border-line text-text-secondary flex items-center justify-center"
        >
          <FontAwesomeIcon icon={hidden ? faEyeSlash : faEye} />
        </button>
      </header>

      {/* 分頁：投資（本階段）｜收支（Stage 5） */}
      <div className="flex gap-1.5 p-1 mb-3 bg-surface-alt rounded-modal">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => changeTab(t.id)}
            className={`flex-1 py-2 rounded-btn text-[13px] font-semibold ${
              tab === t.id ? 'bg-surface text-text-primary shadow-segment' : 'text-text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'flow' ? (
        <FlowReport hidden={hidden} />
      ) : tab === 'assets' ? (
        <AssetsReport hidden={hidden} />
      ) : !hasAny ? (
        <div className="py-16 text-center text-text-tertiary text-sm">尚無投資資料</div>
      ) : (
        <>
          {/* 投資總結 */}
          <div className="bg-surface border border-line rounded-card shadow-card p-4 mb-3">
            <div className="text-[13px] text-text-secondary">投資總市值</div>
            <div className="text-[28px] font-bold leading-tight tabular-nums mt-0.5">
              {formatBalance(totalMarketValue, opt)}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3 pt-3 border-t border-line text-[13px]">
              <SummaryRow label="總成本" value={formatBalance(totalCost, opt)} />
              <SummaryRow
                label="未實現損益"
                value={`${formatSigned(totalUnrealized, opt)}${totalCost > 0 ? pctLabel(totalReturnPct) : ''}`}
                cls={pnlClass(totalUnrealized)}
              />
              <SummaryRow label="累計已實現" value={formatSigned(totalRealized, opt)} cls={pnlClass(totalRealized)} />
              <SummaryRow label="配息" value="—" />
            </div>
          </div>

          <SyncBar />

          {/* 各標的未實現 */}
          {bySymbol.length > 0 && (
            <div className="mb-3">
              <div className="text-[13px] font-semibold text-text-secondary px-1 mb-1.5">各標的未實現損益</div>
              <div className="bg-surface border border-line rounded-card shadow-card divide-y divide-line-light">
                {bySymbol.map((h) => (
                  <div key={h.symbol} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-semibold">{h.symbol}</span>
                        <span className="text-[13px] text-text-secondary truncate">{h.name}</span>
                      </div>
                      <div className="text-xs text-text-tertiary tabular-nums mt-0.5">
                        {formatNumber(h.shares)} 股 · 均價 {formatNumber(h.avgCost, 2)}
                        {h.hasPrice
                          ? ` · 現價 ${formatNumber(h.price, 2)}${h.priceDate ? `（${formatMd(h.priceDate)}）` : ''}`
                          : ' · 未同步現價'}
                      </div>
                    </div>
                    <div className="text-right flex-none">
                      <div className="text-[15px] font-semibold tabular-nums">{formatBalance(h.marketValue, opt)}</div>
                      {h.unrealizedPnl != null && (
                        <div className={`text-xs font-semibold tabular-nums mt-0.5 ${pnlClass(h.unrealizedPnl)}`}>
                          {formatSigned(h.unrealizedPnl, opt)}
                          {pctLabel(h.returnPct)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 各標的已實現 */}
          {realizedBySymbol.length > 0 && (
            <div className="mb-3">
              <div className="text-[13px] font-semibold text-text-secondary px-1 mb-1.5">各標的已實現損益</div>
              <div className="bg-surface border border-line rounded-card shadow-card divide-y divide-line-light">
                {realizedBySymbol.map((r) => (
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
        </>
      )}
    </div>
  )
}

function SummaryRow({ label, value, cls }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className={`tabular-nums font-medium ${cls ?? ''}`}>{value}</span>
    </div>
  )
}

// 現價新鮮度＋手動同步（重用 useSyncPrices）
function SyncBar() {
  const { sync, syncing, result, lastSyncAt } = useSyncPrices()
  const lastSync = formatDateTime(lastSyncAt)
  return (
    <div className="flex items-center justify-between gap-2 px-1 mb-3">
      <span className="text-xs text-text-tertiary tabular-nums">
        {lastSync ? `現價更新於 ${lastSync}` : '尚未同步現價'}
        {result && !result.ok && (
          <span className="text-error ml-1.5">
            <FontAwesomeIcon icon={faTriangleExclamation} className="text-[10px]" /> 同步失敗
          </span>
        )}
      </span>
      <button
        onClick={sync}
        disabled={syncing}
        className="flex items-center gap-1.5 h-[30px] px-3 rounded-chip bg-surface border border-line text-text-secondary text-xs font-semibold disabled:opacity-40"
      >
        <FontAwesomeIcon icon={faArrowsRotate} className="text-[11px]" spin={syncing} />
        {syncing ? '同步中' : '同步股價'}
      </button>
    </div>
  )
}
