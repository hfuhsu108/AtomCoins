import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft, faChevronRight, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../db/DataProvider'
import { monthlySummary } from '../lib/engine'
import { formatAmount, formatSigned } from '../lib/format'
import { todayStr, parseDate, monthLabel, monthPrefix, addMonth, formatMd, weekday } from '../lib/date'
import TransactionRow from '../components/transaction/TransactionRow'
import StockPanel from '../components/stock/StockPanel'
import InvoicePanel from '../components/invoice/InvoicePanel'

const TABS = [
  { id: 'ledger', label: '帳本' },
  { id: 'stock', label: '股票' },
  { id: 'invoice', label: '發票載具' },
]

export default function TransactionsPage() {
  const navigate = useNavigate()
  const accounts = useCollection('accounts')
  const txns = useCollection('transactions')
  const categories = useCollection('categories')
  const counterparties = useCollection('counterparties')

  const [searchParams] = useSearchParams()

  const now = parseDate(todayStr())
  const [tab, setTab] = useState(searchParams.get('tab') || 'ledger')
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [hidden, setHidden] = useState(false)

  const lookups = useMemo(() => {
    const cat = {}, acc = {}, cp = {}
    for (const c of categories) cat[c.id] = c
    for (const a of accounts) acc[a.id] = a
    for (const c of counterparties) cp[c.id] = c
    return { cat, acc, cp }
  }, [categories, accounts, counterparties])

  const prefix = monthPrefix(ym.year, ym.month)
  const monthTxns = txns.filter((t) => t.tradeDate?.startsWith(prefix))
  const summary = monthlySummary(txns, ym.year, ym.month)
  const opt = { hidden }

  // 依日期分組（新到舊），組內依建立時間新到舊
  const days = useMemo(() => {
    const map = new Map()
    for (const t of monthTxns) {
      if (!map.has(t.tradeDate)) map.set(t.tradeDate, [])
      map.get(t.tradeDate).push(t)
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => {
        items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        let dayIn = 0, dayOut = 0
        for (const t of items) {
          const tot = (t.splits ?? []).reduce((s, sp) => s + sp.amount, 0)
          if (t.type === 'income') dayIn += tot
          else if (t.type === 'expense') dayOut += tot
        }
        return { date, items, dayIn, dayOut }
      })
  }, [monthTxns])

  return (
    <div className="px-4 pt-4 pb-4 lg:px-7 lg:pt-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold">明細</h1>
        <button
          onClick={() => setHidden((v) => !v)}
          className="w-[38px] h-[38px] rounded-chip bg-surface border border-line text-text-secondary flex items-center justify-center"
        >
          <FontAwesomeIcon icon={hidden ? faEyeSlash : faEye} />
        </button>
      </header>

      {/* 分頁 */}
      <div className="flex gap-1.5 p-1 mb-3 bg-surface-alt rounded-modal">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-btn text-[13px] font-semibold ${
              tab === t.id ? 'bg-surface text-text-primary shadow-segment' : 'text-text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'stock' ? (
        <StockPanel hidden={hidden} />
      ) : tab === 'invoice' ? (
        <InvoicePanel hidden={hidden} />
      ) : (
        <>
          {/* 月份摘要 */}
          <div className="bg-surface border border-line rounded-card shadow-card p-4 mb-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setYm((p) => addMonth(p, -1))}
                className="w-7 h-7 rounded-chip bg-surface-alt text-text-secondary flex items-center justify-center"
              >
                <FontAwesomeIcon icon={faChevronLeft} className="text-xs" />
              </button>
              <span className="text-[15px] font-semibold">{monthLabel(ym.year, ym.month)}</span>
              <button
                onClick={() => setYm((p) => addMonth(p, 1))}
                className="w-7 h-7 rounded-chip bg-surface-alt text-text-secondary flex items-center justify-center"
              >
                <FontAwesomeIcon icon={faChevronRight} className="text-xs" />
              </button>
            </div>
            <div className="flex mt-3 pt-3 border-t border-line-light">
              <SummaryCell label="收入" value={formatAmount(summary.income, opt)} cls="text-income" />
              <SummaryCell label="支出" value={formatAmount(summary.expense, opt)} cls="text-expense" />
              <SummaryCell
                label="結餘"
                value={formatSigned(summary.balance, opt)}
                cls={summary.balance >= 0 ? 'text-income' : 'text-expense'}
              />
            </div>
          </div>

          {/* 列表 */}
          {days.length === 0 ? (
            <div className="py-16 text-center text-text-tertiary text-sm">本月尚無記錄</div>
          ) : (
            days.map((d) => (
              <div key={d.date} className="mb-2">
                <div className="flex items-baseline justify-between px-1 py-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[15px] font-semibold">{formatMd(d.date)}</span>
                    <span className="text-[13px] text-text-tertiary">{weekday(d.date)}</span>
                  </div>
                  <div className="flex gap-2.5 text-xs font-semibold tabular-nums">
                    {d.dayIn > 0 && <span className="text-income">{formatAmount(d.dayIn, opt)}</span>}
                    {d.dayOut > 0 && <span className="text-expense">{formatAmount(d.dayOut, opt)}</span>}
                  </div>
                </div>
                <div className="bg-surface border border-line rounded-card shadow-card px-4 divide-y divide-line-light">
                  {d.items.map((t) => (
                    <TransactionRow
                      key={t.id}
                      tx={t}
                      lookups={lookups}
                      onClick={() => navigate(`/add?id=${t.id}`)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  )
}

function SummaryCell({ label, value, cls }) {
  return (
    <div className="flex-1">
      <div className="text-[11px] text-text-secondary">{label}</div>
      <div className={`text-base font-semibold tabular-nums mt-0.5 ${cls}`}>{value}</div>
    </div>
  )
}
