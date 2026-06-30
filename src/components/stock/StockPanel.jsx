import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronRight, faPen } from '@fortawesome/free-solid-svg-icons'
import { db } from '../../db'
import { computeHoldings, holdingsMarketValue } from '../../lib/stock'
import { upsertStockPrice } from '../../db/repo'
import { formatNumber, formatBalance, formatSigned } from '../../lib/format'
import { todayStr, formatMd } from '../../lib/date'
import Sheet from '../Sheet'

const SUB_TABS = [
  { id: 'holdings', label: '持股' },
  { id: 'history', label: '交易紀錄' },
  { id: 'realized', label: '已實現損益' },
]

export default function StockPanel({ hidden = false }) {
  const navigate = useNavigate()
  const stockTxns = useLiveQuery(() => db.stockTransactions.toArray(), [], [])
  const prices = useLiveQuery(() => db.stockPrices.toArray(), [], [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])
  const brokers = useLiveQuery(() => db.brokers.toArray(), [], [])

  const [subTab, setSubTab] = useState('holdings')
  const [editingPrice, setEditingPrice] = useState(null)

  const asOf = todayStr()
  const opt = { hidden }

  const { holdings, realized } = useMemo(
    () => computeHoldings(stockTxns, prices, { asOf }),
    [stockTxns, prices, asOf],
  )

  const totalMarketValue = holdingsMarketValue(holdings)
  const totalCost = holdings.reduce((s, h) => s + h.costBasis, 0)
  const totalUnrealized = holdings.reduce((s, h) => s + (h.unrealizedPnl ?? 0), 0)
  const totalRealized = realized.reduce((s, r) => s + r.pnl, 0)
  const totalReturnPct = totalCost > 0 ? ((totalMarketValue - totalCost) / totalCost) * 100 : 0

  const accMap = useMemo(() => {
    const m = {}
    for (const a of accounts) m[a.id] = a
    return m
  }, [accounts])

  const brokerMap = useMemo(() => {
    const m = {}
    for (const b of brokers) m[b.id] = b
    return m
  }, [brokers])

  // 交易紀錄依 tradeDate 新到舊
  const sortedTxns = useMemo(
    () => [...stockTxns].sort((a, b) => {
      if (a.tradeDate !== b.tradeDate) return a.tradeDate < b.tradeDate ? 1 : -1
      return (a.createdAt ?? '') < (b.createdAt ?? '') ? 1 : -1
    }),
    [stockTxns],
  )

  // 已實現依賣出日新到舊
  const sortedRealized = useMemo(
    () => [...realized].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [realized],
  )

  // 持股依證券帳戶分組
  const holdingGroups = useMemo(() => {
    const map = new Map()
    for (const h of holdings) {
      const key = h.securitiesAccountId
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(h)
    }
    return [...map.entries()]
  }, [holdings])

  return (
    <div>
      {/* 投資總覽 */}
      <div className="bg-surface border border-line rounded-card shadow-card p-4 mb-3">
        <div className="text-[13px] text-text-secondary">投資總覽</div>
        <div className="text-[28px] font-bold leading-tight tabular-nums mt-0.5">
          {formatBalance(totalMarketValue, opt)}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[13px] tabular-nums">
          <span className={totalUnrealized >= 0 ? 'text-[var(--color-stock-buy)]' : 'text-[var(--color-stock-sell)]'}>
            未實現 {formatSigned(totalUnrealized, opt)}
            {totalCost > 0 && ` (${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}%)`}
          </span>
          <span className={totalRealized >= 0 ? 'text-[var(--color-stock-buy)]' : 'text-[var(--color-stock-sell)]'}>
            已實現 {formatSigned(totalRealized, opt)}
          </span>
        </div>
      </div>

      {/* 次分頁 */}
      <div className="flex gap-1.5 p-1 mb-3 bg-surface-alt rounded-modal">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex-1 py-2 rounded-btn text-[13px] font-semibold ${
              subTab === t.id ? 'bg-surface text-text-primary shadow-segment' : 'text-text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 持股 */}
      {subTab === 'holdings' && (
        holdings.length === 0 ? (
          <Empty>尚無持股</Empty>
        ) : (
          holdingGroups.map(([acctId, items]) => (
            <div key={acctId} className="mb-3">
              <div className="text-[13px] font-semibold text-text-secondary px-1 mb-1.5">
                {accMap[acctId]?.name ?? '未知帳戶'}
              </div>
              <div className="bg-surface border border-line rounded-card shadow-card divide-y divide-line-light">
                {items.map((h) => (
                  <button
                    key={`${h.securitiesAccountId}-${h.symbol}`}
                    onClick={() => setEditingPrice(h)}
                    className="flex items-center gap-3 w-full px-4 py-3 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-semibold">{h.symbol}</span>
                        <span className="text-[13px] text-text-secondary truncate">{h.name}</span>
                      </div>
                      <div className="text-xs text-text-tertiary tabular-nums mt-0.5">
                        {formatNumber(h.shares)} 股 · 均價 {formatNumber(h.avgCost, 2)}
                        {h.hasPrice ? ` · 現價 ${formatNumber(h.price, 2)}` : ' · 未設定現價'}
                      </div>
                    </div>
                    <div className="text-right flex-none">
                      <div className="text-[15px] font-semibold tabular-nums">
                        {formatBalance(h.marketValue, opt)}
                      </div>
                      {h.unrealizedPnl != null && (
                        <div className={`text-xs font-semibold tabular-nums mt-0.5 ${
                          h.unrealizedPnl >= 0 ? 'text-[var(--color-stock-buy)]' : 'text-[var(--color-stock-sell)]'
                        }`}>
                          {formatSigned(h.unrealizedPnl, opt)}
                          {h.returnPct != null && ` (${h.returnPct >= 0 ? '+' : ''}${h.returnPct.toFixed(2)}%)`}
                        </div>
                      )}
                    </div>
                    <FontAwesomeIcon icon={faPen} className="text-text-tertiary text-[11px] flex-none" />
                  </button>
                ))}
              </div>
            </div>
          ))
        )
      )}

      {/* 交易紀錄 */}
      {subTab === 'history' && (
        sortedTxns.length === 0 ? (
          <Empty>尚無交易紀錄</Empty>
        ) : (
          <div className="bg-surface border border-line rounded-card shadow-card divide-y divide-line-light">
            {sortedTxns.map((t) => {
              const isBuy = t.side === 'buy'
              const gross = Math.round(t.shares * t.price)
              const cash = isBuy ? gross + (t.fee ?? 0) : gross - (t.fee ?? 0) - (t.tax ?? 0)
              const unsettled = t.settlementDate > asOf
              const broker = brokerMap[t.brokerId]
              return (
                <button
                  key={t.id}
                  onClick={() => navigate(`/add?stxId=${t.id}`)}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left"
                >
                  <span className={`flex-none text-[11px] font-bold rounded-pill px-2.5 py-1 ${
                    isBuy
                      ? 'text-white bg-[var(--color-stock-buy)]'
                      : 'text-white bg-[var(--color-stock-sell)]'
                  }`}>
                    {isBuy ? '買' : '賣'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-medium">{t.symbol}</span>
                      {unsettled && (
                        <span className="text-[11px] font-medium text-warning-text bg-warning-bg rounded-pill px-2 py-0.5">
                          未交割 {formatMd(t.settlementDate)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-text-tertiary tabular-nums mt-0.5">
                      {formatMd(t.tradeDate)} · {formatNumber(t.shares)} 股 @ {formatNumber(t.price, 2)}
                      {broker ? ` · ${broker.name}` : ''}
                    </div>
                  </div>
                  <div className="text-right flex-none">
                    <div className={`text-[15px] font-semibold tabular-nums ${
                      isBuy ? 'text-[var(--color-stock-buy)]' : 'text-[var(--color-stock-sell)]'
                    }`}>
                      {isBuy ? '−' : '+'}NT$ {formatNumber(cash)}
                    </div>
                    <div className="text-[11px] text-text-tertiary tabular-nums mt-0.5">
                      手續費 {formatNumber(t.fee ?? 0)}{!isBuy ? ` · 稅 ${formatNumber(t.tax ?? 0)}` : ''}
                    </div>
                  </div>
                  <FontAwesomeIcon icon={faChevronRight} className="text-text-tertiary text-[11px] flex-none" />
                </button>
              )
            })}
          </div>
        )
      )}

      {/* 已實現損益 */}
      {subTab === 'realized' && (
        sortedRealized.length === 0 ? (
          <Empty>尚無已實現損益</Empty>
        ) : (
          <>
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-[13px] text-text-secondary">累計已實現損益</span>
              <span className={`text-[15px] font-bold tabular-nums ${
                totalRealized >= 0 ? 'text-[var(--color-stock-buy)]' : 'text-[var(--color-stock-sell)]'
              }`}>
                {formatSigned(totalRealized, opt)}
              </span>
            </div>
            <div className="bg-surface border border-line rounded-card shadow-card divide-y divide-line-light">
              {sortedRealized.map((r) => (
                <div key={r.stxId} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium">{r.symbol}</div>
                    <div className="text-xs text-text-tertiary tabular-nums mt-0.5">
                      {formatMd(r.date)} · {formatNumber(r.shares)} 股 · 淨收入 {formatNumber(r.proceeds)} · 成本 {formatNumber(r.cost)}
                    </div>
                  </div>
                  <span className={`text-[15px] font-bold tabular-nums ${
                    r.pnl >= 0 ? 'text-[var(--color-stock-buy)]' : 'text-[var(--color-stock-sell)]'
                  }`}>
                    {formatSigned(r.pnl, opt)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )
      )}

      {/* 手動現價 Sheet */}
      <PriceSheet
        holding={editingPrice}
        prices={prices}
        onClose={() => setEditingPrice(null)}
      />
    </div>
  )
}

function Empty({ children }) {
  return <div className="py-16 text-center text-text-tertiary text-sm">{children}</div>
}

function PriceSheet({ holding, prices, onClose }) {
  const open = !!holding
  const existing = prices.find((p) => p.symbol === holding?.symbol)
  const [priceStr, setPriceStr] = useState('')
  const [dateStr, setDateStr] = useState(todayStr())

  const key = holding?.symbol ?? 'none'
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setPriceStr(existing?.closePrice != null ? String(existing.closePrice) : '')
    setDateStr(existing?.priceDate ?? todayStr())
  }

  const save = async () => {
    const p = parseFloat(priceStr)
    if (!holding || !Number.isFinite(p) || p <= 0) return
    await upsertStockPrice({ symbol: holding.symbol, closePrice: p, priceDate: dateStr })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={holding ? `${holding.symbol} 現價` : '現價'} bodyClassName="overflow-y-auto">
      <div className="p-[18px] flex flex-col gap-3.5">
        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">收盤價</div>
          <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal flex items-center gap-1 text-[15px] tabular-nums">
            <span className="text-text-tertiary text-sm">NT$</span>
            <input
              inputMode="decimal"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder={existing?.closePrice != null ? String(existing.closePrice) : '輸入現價'}
              className="w-full outline-none bg-transparent placeholder:text-text-tertiary"
            />
          </div>
        </div>
        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">報價日期</div>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => e.target.value && setDateStr(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-surface border border-line rounded-modal text-[15px] outline-none"
          />
        </div>
        <button
          onClick={save}
          disabled={!priceStr || !(parseFloat(priceStr) > 0)}
          className="flex items-center justify-center gap-1.5 h-[42px] rounded-btn bg-brand text-white text-[13px] font-semibold disabled:opacity-40"
        >
          儲存現價
        </button>
      </div>
    </Sheet>
  )
}
