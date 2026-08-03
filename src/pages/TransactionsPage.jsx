import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft, faChevronRight, faMagnifyingGlass, faList, faCalendarDays, faReceipt, faXmark, faPen, faTrash } from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../db/DataProvider'
import useDeleteTransaction from '../hooks/useDeleteTransaction'
import { monthlySummary, adjustDeltas } from '../lib/engine'
import { formatAmount, formatSigned } from '../lib/format'
import { todayStr, parseDate, monthLabel, monthPrefix, addMonth, formatMd, weekday } from '../lib/date'
import { useHiddenAmount, EyeButton } from '../components/HiddenAmountProvider'
import EmptyState from '../components/EmptyState'
import TransactionRow from '../components/transaction/TransactionRow'
import TransactionPreview from '../components/transaction/TransactionPreview'
import BalanceAdjustSheet from '../components/settings/BalanceAdjustSheet'
import SearchPanel from '../components/transaction/SearchPanel'
import CalendarView from '../components/transaction/CalendarView'
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
  // 餘額調整的差額要動態算，交割銀行的股票 posting 也要算進去，否則證券戶差額會失真
  const stockTxns = useCollection('stockTransactions')
  const categories = useCollection('categories')
  const counterparties = useCollection('counterparties')
  const tags = useCollection('tags')

  const [searchParams, setSearchParams] = useSearchParams()

  const now = parseDate(todayStr())
  const initialTab = searchParams.get('tab') || 'ledger'
  const [tab, setTab] = useState(initialTab)
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const { hidden, opt } = useHiddenAmount()
  // 首頁點帳戶會帶 ?accountId= 進來。同一個參數兩種語義，靠 tab 分流：
  // 現金／銀行（ledger）＝開搜尋面板並預填帳戶；證券（stock）＝篩該證券帳戶的持股與交易。
  const [initialAccountId] = useState(searchParams.get('accountId'))
  const [searching, setSearching] = useState(!!initialAccountId && initialTab === 'ledger')
  const [stockAccountId, setStockAccountId] = useState(
    initialTab === 'stock' ? searchParams.get('accountId') : null,
  )
  // 股票／發票分頁的關鍵字（帳本另有多條件的 SearchPanel）
  const [keyword, setKeyword] = useState('')

  // 切分頁寫回 URL：歸帳離開再返回（navigate -1）能停在原分頁；預設 ledger 不帶參數
  const changeTab = (id) => {
    setTab(id)
    // 換分頁就結束搜尋：關鍵字是對「當時那份清單」下的，留著會讓新分頁看起來莫名奇妙全空
    setSearching(false)
    setKeyword('')
    setStockAccountId(null)
    setSearchParams(id === 'ledger' ? {} : { tab: id }, { replace: true })
  }
  // 關閉搜尋時一併清掉 URL 參數，否則本頁重掛時又會被帶回篩選狀態（但要保留 tab）
  const closeSearch = () => {
    setSearching(false)
    setKeyword('')
    if (searchParams.get('accountId')) {
      setSearchParams(tab === 'ledger' ? {} : { tab }, { replace: true })
    }
  }
  const clearStockAccount = () => {
    setStockAccountId(null)
    if (searchParams.get('accountId')) setSearchParams({ tab: 'stock' }, { replace: true })
  }
  const [ledgerView, setLedgerView] = useState('list') // list | calendar
  const [previewTx, setPreviewTx] = useState(null) // 單擊預覽中的交易
  const [adjustTx, setAdjustTx] = useState(null) // 編輯中的餘額調整

  // 帳本列表、日曆、搜尋結果三處共用同一份刪除流程與同一個 confirmElement
  const { requestDelete, confirmElement, busy: deleteBusy } = useDeleteTransaction()
  // 餘額調整沒有分類也沒有拆帳，記帳表單不認得它——送進去會被當成支出存回來，資料就毀了。
  // 它的編輯一律走自己的 sheet（新增入口在設定＞帳戶）。
  const openEdit = (t) => {
    if (t.type === 'adjust') setAdjustTx(t)
    else navigate(`/add?id=${t.id}`)
  }
  const rowActions = (t) => [
    { key: 'edit', label: '編輯', icon: faPen, tone: 'brand', onClick: () => openEdit(t) },
    { key: 'delete', label: '刪除', icon: faTrash, tone: 'danger', disabled: deleteBusy, onClick: () => requestDelete(t) },
  ]

  const lookups = useMemo(() => {
    const cat = {}, acc = {}, cp = {}, tag = {}
    for (const c of categories) cat[c.id] = c
    for (const a of accounts) acc[a.id] = a
    for (const c of counterparties) cp[c.id] = c
    for (const t of tags) tag[t.id] = t
    // 一次算完所有餘額調整的現值差額，逐列各算一次會是 O(n²)
    return { cat, acc, cp, tag, adjustDelta: adjustDeltas(accounts, txns, stockTxns) }
  }, [categories, accounts, counterparties, tags, txns, stockTxns])

  const prefix = monthPrefix(ym.year, ym.month)
  const monthTxns = txns.filter((t) => t.tradeDate?.startsWith(prefix))
  const summary = monthlySummary(txns, ym.year, ym.month)
  // 禁止翻到未來月（與報表頁同一口徑）：未來沒有記錄，翻過去只會是連續的空畫面
  const atCurrentMonth = ym.year * 12 + (ym.month - 1) >= now.getFullYear() * 12 + now.getMonth()

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
        <div className="flex items-center gap-2">
          {!searching && (
            <button
              onClick={() => setSearching(true)}
              className="w-[38px] h-[38px] rounded-chip bg-surface border border-line text-text-secondary flex items-center justify-center"
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </button>
          )}
          <EyeButton />
        </div>
      </header>

      {searching && tab === 'ledger' ? (
        <SearchPanel
          txns={txns}
          categories={categories}
          accounts={accounts}
          lookups={lookups}
          hidden={hidden}
          initialAccountId={initialAccountId}
          onClose={closeSearch}
          onRowClick={setPreviewTx}
          rowActions={rowActions}
        />
      ) : (
        <>
      {/* 分頁 */}
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

      {/* 股票／發票分頁的關鍵字列：擺在分頁列下方＝它濾的是當前分頁的清單，
          且不像帳本那樣整頁覆蓋，分頁列始終看得見 */}
      {searching && tab !== 'ledger' && (
        <TabSearchBar
          value={keyword}
          onChange={setKeyword}
          placeholder={tab === 'stock' ? '搜尋代號、股名、券商' : '搜尋商家、發票號碼、品項'}
          onClose={closeSearch}
        />
      )}

      {tab === 'stock' ? (
        <StockPanel
          hidden={hidden}
          keyword={keyword}
          accountId={stockAccountId}
          accountName={stockAccountId ? lookups.acc[stockAccountId]?.name : null}
          onClearAccount={clearStockAccount}
        />
      ) : tab === 'invoice' ? (
        <InvoicePanel hidden={hidden} keyword={keyword} />
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
                disabled={atCurrentMonth}
                className="w-7 h-7 rounded-chip bg-surface-alt text-text-secondary flex items-center justify-center disabled:opacity-40"
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

          {/* 列表／日曆切換 */}
          <div className="flex justify-end mb-2">
            <div className="flex bg-surface-alt rounded-btn p-0.5">
              {[['list', faList], ['calendar', faCalendarDays]].map(([v, icon]) => (
                <button
                  key={v}
                  onClick={() => setLedgerView(v)}
                  className={`w-9 h-8 rounded-[8px] flex items-center justify-center text-[13px] ${
                    ledgerView === v ? 'bg-surface shadow-segment text-text-primary' : 'text-text-secondary'
                  }`}
                >
                  <FontAwesomeIcon icon={icon} />
                </button>
              ))}
            </div>
          </div>

          {ledgerView === 'calendar' ? (
            <CalendarView
              ym={ym}
              days={days}
              lookups={lookups}
              hidden={hidden}
              onRowClick={setPreviewTx}
              rowActions={rowActions}
            />
          ) : days.length === 0 ? (
            <EmptyState
              icon={faReceipt}
              title="本月尚無記錄"
              action={{ label: '記一筆', onClick: () => navigate('/add') }}
            />
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
                <div className="bg-surface border border-line rounded-card shadow-card overflow-hidden divide-y divide-line-light">
                  {d.items.map((t) => (
                    <TransactionRow
                      key={t.id}
                      tx={t}
                      lookups={lookups}
                      onClick={() => setPreviewTx(t)}
                      actions={rowActions(t)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
        </>
      )}

      <TransactionPreview
        tx={previewTx}
        lookups={lookups}
        hidden={hidden}
        onClose={() => setPreviewTx(null)}
        onOpen={() => {
          const t = previewTx
          setPreviewTx(null)
          if (t) openEdit(t)
        }}
      />

      <BalanceAdjustSheet
        open={!!adjustTx}
        account={accounts.find((a) => a.id === adjustTx?.accountId) ?? null}
        tx={adjustTx}
        onClose={() => setAdjustTx(null)}
      />
      {confirmElement}
    </div>
  )
}

// 股票／發票分頁共用的關鍵字列（帳本用條件較多的 SearchPanel）
function TabSearchBar({ value, onChange, placeholder, onClose }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex-1 flex items-center gap-2 h-[42px] px-3 bg-surface border border-line rounded-modal">
        <FontAwesomeIcon icon={faMagnifyingGlass} className="text-text-tertiary text-sm" />
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent text-[15px] outline-none placeholder:text-text-tertiary"
        />
        {value && (
          <button onClick={() => onChange('')} aria-label="清除關鍵字" className="text-text-tertiary">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        )}
      </div>
      <button
        onClick={onClose}
        className="h-[42px] px-3 rounded-modal bg-surface border border-line text-[13px] font-semibold text-text-secondary flex-none"
      >
        取消
      </button>
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
