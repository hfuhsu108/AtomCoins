import { useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlass, faXmark, faChevronRight } from '@fortawesome/free-solid-svg-icons'
import { filterTransactions, searchTotals } from '../../lib/search'
import { formatAmount } from '../../lib/format'
import { todayStr, parseDate, monthPrefix, addMonth, formatMd, weekday } from '../../lib/date'
import EmptyState from '../EmptyState'
import TransactionRow from './TransactionRow'
import CategoryPicker from './CategoryPicker'
import AccountPicker from './AccountPicker'
import TagPicker from './TagPicker'
import DateInput from '../DateInput'
import { useCollection } from '../../db/DataProvider'

const TYPE_OPTIONS = [
  { id: 'expense', label: '支出' },
  { id: 'income', label: '收入' },
  { id: 'transfer', label: '轉帳' },
  { id: 'receivable', label: '應收' },
  { id: 'payable', label: '應付' },
  { id: 'adjust', label: '餘額調整' },
]

const RANGE_OPTIONS = [
  { id: 'all', label: '全部' },
  { id: 'month', label: '本月' },
  { id: '3m', label: '近 3 月' },
  { id: 'year', label: '今年' },
]

const CAP = 200

// 快捷區間 → { from, to }
function rangeDates(id) {
  const today = todayStr()
  const d = parseDate(today)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  if (id === 'month') return { from: `${monthPrefix(y, m)}-01`, to: today }
  if (id === '3m') {
    const start = addMonth({ year: y, month: m }, -2)
    return { from: `${monthPrefix(start.year, start.month)}-01`, to: today }
  }
  if (id === 'year') return { from: `${y}-01-01`, to: today }
  return { from: '', to: '' }
}

// 新到舊：tradeDate desc，同日 createdAt desc
function byNewest(a, b) {
  if (a.tradeDate !== b.tradeDate) return a.tradeDate < b.tradeDate ? 1 : -1
  return (a.createdAt ?? '') < (b.createdAt ?? '') ? 1 : -1
}

function groupByDate(list) {
  const map = new Map()
  for (const t of list) {
    if (!map.has(t.tradeDate)) map.set(t.tradeDate, [])
    map.get(t.tradeDate).push(t)
  }
  return [...map.entries()].map(([date, items]) => ({ date, items }))
}

// initialAccountId：由首頁點帳戶進來時預填的帳戶篩選（僅作初值，之後由使用者自由改）
export default function SearchPanel({ txns, categories, accounts, lookups, hidden, initialAccountId = null, onClose, onRowClick, rowActions }) {
  const tags = useCollection('tags')

  const [keyword, setKeyword] = useState('')
  const [types, setTypes] = useState([])
  const [categoryId, setCategoryId] = useState(null)
  const [accountId, setAccountId] = useState(initialAccountId)
  const [tagIds, setTagIds] = useState([])
  const [tagOpen, setTagOpen] = useState(false)
  const [rangeKey, setRangeKey] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [catOpen, setCatOpen] = useState(false)
  const [accOpen, setAccOpen] = useState(false)

  const opt = { hidden }

  const pickRange = (id) => {
    setRangeKey(id)
    const { from, to } = rangeDates(id)
    setDateFrom(from)
    setDateTo(to)
  }
  const editDate = (setter) => (e) => {
    setRangeKey('custom')
    setter(e.target.value)
  }

  const toggleType = (id) =>
    setTypes((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  const toggleTag = (id) =>
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))

  const filtered = useMemo(
    () =>
      filterTransactions(
        txns,
        { keyword, types, categoryId, accountId, tagIds, dateFrom, dateTo, amountMin, amountMax },
        lookups,
      ),
    [txns, keyword, types, categoryId, accountId, tagIds, dateFrom, dateTo, amountMin, amountMax, lookups],
  )

  // 合計要帶 criteria：有標籤條件時只加總命中的拆帳列（見 search.js）
  const totals = useMemo(() => searchTotals(filtered, { tagIds }), [filtered, tagIds])
  const sorted = useMemo(() => [...filtered].sort(byNewest), [filtered])
  const days = useMemo(() => groupByDate(sorted.slice(0, CAP)), [sorted])

  const selectedCat = categoryId ? categories.find((c) => c.id === categoryId) : null
  const selectedAcc = accountId ? accounts.find((a) => a.id === accountId) : null
  // 標籤顯示值：第一個名稱＋餘數（多選時避免把整列擠爆）
  const tagLabel = tagIds.length > 0
    ? (tags.find((t) => t.id === tagIds[0])?.name ?? '已選') + (tagIds.length > 1 ? ` +${tagIds.length - 1}` : '')
    : null

  return (
    <div>
      {/* 搜尋列 */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 flex items-center gap-2 h-[42px] px-3 bg-surface border border-line rounded-modal">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="text-text-tertiary text-sm" />
          <input
            autoFocus
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋備註、分類、對象、金額"
            className="flex-1 min-w-0 bg-transparent text-[15px] outline-none placeholder:text-text-tertiary"
          />
          {keyword && (
            <button onClick={() => setKeyword('')} className="text-text-tertiary">
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

      {/* 篩選 */}
      <div className="bg-surface border border-line rounded-card shadow-card p-3.5 mb-3 flex flex-col gap-3">
        {/* 類型 */}
        <div className="flex flex-wrap gap-1.5">
          {TYPE_OPTIONS.map((t) => {
            const on = types.includes(t.id)
            return (
              <button
                key={t.id}
                onClick={() => toggleType(t.id)}
                className={`px-3 py-1.5 rounded-chip text-[13px] font-medium border ${
                  on ? 'bg-brand text-white border-brand' : 'bg-surface text-text-secondary border-line'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* 分類／帳戶 */}
        <div className="grid grid-cols-2 gap-2">
          <FilterRow label="分類" value={selectedCat?.name} onClick={() => setCatOpen(true)} onClear={categoryId ? () => setCategoryId(null) : null} />
          <FilterRow label="帳戶" value={selectedAcc?.name} onClick={() => setAccOpen(true)} onClear={accountId ? () => setAccountId(null) : null} />
        </div>

        {/* 標籤：跨月專案的主要入口，可多選（任一命中）。合計只算掛標籤的拆帳列 */}
        <FilterRow
          label="標籤"
          value={tagLabel}
          onClick={() => setTagOpen(true)}
          onClear={tagIds.length > 0 ? () => setTagIds([]) : null}
        />

        {/* 日期區間 */}
        <div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.id}
                onClick={() => pickRange(r.id)}
                className={`px-3 py-1.5 rounded-chip text-[13px] font-medium border ${
                  rangeKey === r.id ? 'bg-brand text-white border-brand' : 'bg-surface text-text-secondary border-line'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <DateInput
              value={dateFrom}
              onChange={editDate(setDateFrom)}
              className="flex-1 min-w-0 h-9 px-2 bg-surface-alt rounded-btn text-[13px] tabular-nums outline-none"
            />
            <span className="text-text-tertiary text-xs">至</span>
            <DateInput
              value={dateTo}
              onChange={editDate(setDateTo)}
              className="flex-1 min-w-0 h-9 px-2 bg-surface-alt rounded-btn text-[13px] tabular-nums outline-none"
            />
          </div>
        </div>

        {/* 金額範圍 */}
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            value={amountMin}
            onChange={(e) => setAmountMin(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="最低金額"
            className="flex-1 min-w-0 h-9 px-2.5 bg-surface-alt rounded-btn text-[13px] tabular-nums outline-none placeholder:text-text-tertiary"
          />
          <span className="text-text-tertiary text-xs">~</span>
          <input
            inputMode="numeric"
            value={amountMax}
            onChange={(e) => setAmountMax(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="最高金額"
            className="flex-1 min-w-0 h-9 px-2.5 bg-surface-alt rounded-btn text-[13px] tabular-nums outline-none placeholder:text-text-tertiary"
          />
        </div>
      </div>

      {/* 合計 */}
      <div className="flex items-center gap-3 px-1 mb-2 text-[13px] tabular-nums">
        <span className="font-semibold">{totals.count} 筆</span>
        {totals.expense > 0 && <span className="text-expense">支出 {formatAmount(totals.expense, opt)}</span>}
        {totals.income > 0 && <span className="text-income">收入 {formatAmount(totals.income, opt)}</span>}
      </div>

      {/* 結果 */}
      {totals.count === 0 ? (
        <EmptyState title="找不到符合的記錄" hint="試著放寬關鍵字或日期區間" />
      ) : (
        <>
          {filtered.length > CAP && (
            <div className="text-center text-xs text-text-tertiary mb-2">
              共 {filtered.length} 筆，僅顯示最新 {CAP} 筆，請縮小條件
            </div>
          )}
          {days.map((d) => (
            <div key={d.date} className="mb-2">
              <div className="flex items-baseline gap-2 px-1 py-2">
                <span className="text-[15px] font-semibold">{formatMd(d.date)}</span>
                <span className="text-[13px] text-text-tertiary">{weekday(d.date)}</span>
              </div>
              <div className="bg-surface border border-line rounded-card shadow-card overflow-hidden divide-y divide-line-light">
                {d.items.map((t) => (
                  <TransactionRow
                    key={t.id}
                    tx={t}
                    lookups={lookups}
                    onClick={() => onRowClick(t)}
                    actions={rowActions?.(t)}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* 篩選要能跨收支挑分類，故不像記帳表單那樣先依 kind 過濾，改請 picker 分兩段顯示 */}
      <CategoryPicker
        open={catOpen}
        onClose={() => setCatOpen(false)}
        categories={categories}
        value={categoryId}
        onSelect={setCategoryId}
        groupByKind
      />
      <AccountPicker
        open={accOpen}
        onClose={() => setAccOpen(false)}
        accounts={accounts}
        value={accountId}
        onSelect={setAccountId}
      />
      {/* manage=false：篩選情境只選取，不在這裡建標籤或改名 */}
      <TagPicker
        open={tagOpen}
        onClose={() => setTagOpen(false)}
        tags={tags}
        value={tagIds}
        onToggle={toggleTag}
        manage={false}
      />
    </div>
  )
}

function FilterRow({ label, value, onClick, onClear }) {
  return (
    <div className="flex items-center h-9 px-3 bg-surface-alt rounded-btn">
      <span className="text-[13px] text-text-secondary flex-none">{label}</span>
      <button onClick={onClick} className="flex-1 min-w-0 flex items-center justify-end gap-1.5">
        <span className={`text-[13px] truncate ${value ? 'font-medium text-text-primary' : 'text-text-tertiary'}`}>
          {value ?? '全部'}
        </span>
        {onClear ? (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onClear() }}
            className="text-text-tertiary flex-none"
          >
            <FontAwesomeIcon icon={faXmark} className="text-xs" />
          </span>
        ) : (
          <FontAwesomeIcon icon={faChevronRight} className="text-text-tertiary text-[10px] flex-none" />
        )}
      </button>
    </div>
  )
}
