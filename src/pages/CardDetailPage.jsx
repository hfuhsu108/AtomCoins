import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft, faChevronRight, faChevronDown, faCheck, faClockRotateLeft, faRotateLeft, faPen, faTrash } from '@fortawesome/free-solid-svg-icons'
import { useCollection, useSettings } from '../db/DataProvider'
import { accountBalances, statementPeriods, deferredCharges, paidStatementSet } from '../lib/engine'
import { payCreditCardStatement, setPostingDates } from '../db/repo'
import { useAsyncAction, settle } from '../hooks/useAsyncAction'
import useCloseView from '../hooks/useCloseView'
import useDeleteTransaction from '../hooks/useDeleteTransaction'
import { formatAmount, formatBalance, formatNumber } from '../lib/format'
import { todayStr, formatMd, addDays, monthLabel } from '../lib/date'
import { accountIcon } from '../lib/icons'
import { useHiddenAmount, EyeButton } from '../components/HiddenAmountProvider'
import EmptyState from '../components/EmptyState'
import TransactionRow from '../components/transaction/TransactionRow'
import TransactionPreview from '../components/transaction/TransactionPreview'
import AccountPicker from '../components/transaction/AccountPicker'
import Sheet from '../components/Sheet'
import DateInput from '../components/DateInput'

const FUTURE = 1 // 額外產生的未來期數：能翻到下一期，看見剛延後的消費落在哪
const MONTHS = 12 // 往回可翻的期數
// periods[FUTURE] 恆為「本期」（累計中的那期）

// 帳單以結帳日所在月份命名（信用卡慣例：結帳日 7/15 → 「7 月帳單」）
function periodLabel(period) {
  const [y, m] = period.periodEnd.split('-').map(Number)
  return `${monthLabel(y, m)}帳單`
}

export default function CardDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  // 推播深連結可能讓本頁成為第一筆 history，此時 navigate(-1) 無效（見 useCloseView）
  const close = useCloseView()
  const accounts = useCollection('accounts')
  const txns = useCollection('transactions')
  const categories = useCollection('categories')
  const counterparties = useCollection('counterparties')
  const tags = useCollection('tags')
  const settings = useSettings()
  const allStatements = useCollection('creditCardStatements')
  const statements = id ? allStatements.filter((s) => s.accountId === id) : []

  const [paying, setPaying] = useState(null) // 繳費中的 period 物件
  const [deferring, setDeferring] = useState(null) // 延後入帳：{ preselectId } 或 null
  const [idx, setIdx] = useState(FUTURE) // 目前瀏覽的期別索引；idx-- 往未來、idx++ 往過去
  const [previewTx, setPreviewTx] = useState(null) // 單擊預覽中的消費
  const { run: runUndefer } = useAsyncAction()
  const { requestDelete, confirmElement, busy: deleteBusy } = useDeleteTransaction()
  // 頁面主體的金額跟隨全站遮蔽；繳費／延後面板內不遮，那是操作中必須看清的數字
  const { hidden, opt } = useHiddenAmount()

  const card = accounts.find((a) => a.id === id)
  const asOf = todayStr()
  const periods = useMemo(
    () => (card ? statementPeriods(card, txns, { months: MONTHS, asOf, future: FUTURE }) : []),
    [card, txns, asOf],
  )
  if (!card) return null

  const balance = accountBalances(accounts, txns, asOf)[card.id] ?? 0
  const used = -balance
  const limit = card.creditLimit ?? 0
  const pct = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0
  // 繳費轉帳被刪掉的快照不算已繳（見 engine.paidStatementSet）
  const paidSet = paidStatementSet(statements, txns)

  const lookups = (() => {
    const cat = {}, acc = {}, cp = {}, tag = {}
    for (const c of categories) cat[c.id] = c
    for (const a of accounts) acc[a.id] = a
    for (const c of counterparties) cp[c.id] = c
    for (const t of tags) tag[t.id] = t
    return { cat, acc, cp, tag }
  })()

  const period = periods[idx] ?? null // 沒設 statementDay 時 periods 為空
  const current = periods[FUTURE] ?? null // 本期（累計中）
  const viewingCurrent = idx === FUTURE
  const isPaid = period ? paidSet.has(`${card.id}|${period.periodEnd}`) : false
  const charges = period ? period.charges.slice().sort((a, b) => (a.tradeDate < b.tradeDate ? 1 : -1)) : []

  // 入帳日被挪到本期結帳日之後的消費：不屬於任何一期，另闢一區才不會憑空消失。
  // 只在瀏覽本期時列出——它的用途是對帳時看「我把哪幾筆挪走了」，其他期沒有意義。
  const deferred = viewingCurrent && current ? deferredCharges(card, txns, current.periodEnd) : []
  const deferredTotal = deferred.reduce((s, t) => s + (t.type === 'expense' ? t.amount : -t.amount), 0)
  // 收回＝入帳日設回消費日
  const undefer = (tx) => runUndefer(async () => {
    await settle(setPostingDates([{ id: tx.id, postingDate: tx.tradeDate }]))
  })

  // 左滑抽屜。延後／收回是這一頁對帳時的主要動作，排在最前面
  const rowActions = (t) => {
    const isDeferred = !!t.postingDate && t.postingDate > t.tradeDate
    return [
      {
        key: 'defer',
        label: isDeferred ? '收回' : '延後',
        icon: isDeferred ? faRotateLeft : faClockRotateLeft,
        onClick: () => (isDeferred ? undefer(t) : setDeferring({ preselectId: t.id })),
      },
      { key: 'edit', label: '編輯', icon: faPen, tone: 'brand', onClick: () => navigate(`/add?id=${t.id}`) },
      { key: 'delete', label: '刪除', icon: faTrash, tone: 'danger', disabled: deleteBusy, onClick: () => requestDelete(t) },
    ]
  }

  return (
    <div className="fixed inset-0 z-40 bg-app-bg overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 pt-4 pb-10 lg:px-7 lg:pt-6">
        <header className="flex items-center gap-3 mb-4">
          <button
            onClick={close}
            className="w-[38px] h-[38px] rounded-chip bg-surface border border-line text-text-secondary flex items-center justify-center"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
              <FontAwesomeIcon icon={accountIcon(card)} />
            </span>
            <h1 className="text-lg font-semibold">{card.name}</h1>
          </div>
          <span className="flex-1" />
          <EyeButton />
        </header>

        {/* 額度摘要 */}
        <div className="bg-surface border border-line rounded-card shadow-card p-[18px] mb-3">
          <div className="text-[13px] text-text-secondary">已用額度</div>
          <div className="text-[30px] font-bold leading-tight tabular-nums mt-0.5">{formatAmount(used, opt)}</div>
          {limit > 0 && (
            <>
              {/* 隱藏金額時進度條固定等寬淡色，不洩漏使用率比例（同首頁卡片列） */}
              <div className="h-1.5 bg-surface-alt rounded-pill my-3 overflow-hidden">
                <div
                  className="h-full rounded-pill"
                  style={{ width: hidden ? '40%' : `${pct}%`, background: hidden ? 'var(--color-line)' : 'var(--color-brand)' }}
                />
              </div>
              <div className="flex justify-between text-[13px] text-text-secondary tabular-nums">
                <span>可用 {formatAmount(limit + balance, opt)}</span>
                <span>額度 {formatAmount(limit, opt)}</span>
              </div>
            </>
          )}
        </div>

        {/* 期別導航（版面比照明細頁的月份摘要卡）*/}
        {period ? (
          <div className="bg-surface border border-line rounded-card shadow-card p-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setIdx((i) => i + 1)}
                disabled={idx >= periods.length - 1}
                className="w-7 h-7 flex-none rounded-chip bg-surface-alt text-text-secondary flex items-center justify-center disabled:opacity-30"
              >
                <FontAwesomeIcon icon={faChevronLeft} className="text-xs" />
              </button>
              <div className="text-center min-w-0">
                <div className="text-[15px] font-semibold">{periodLabel(period)}</div>
                <div className="text-[11px] text-text-tertiary tabular-nums mt-0.5">
                  {formatMd(period.periodStart)} – {formatMd(period.periodEnd)}
                </div>
              </div>
              <button
                onClick={() => setIdx((i) => i - 1)}
                disabled={idx <= 0}
                className="w-7 h-7 flex-none rounded-chip bg-surface-alt text-text-secondary flex items-center justify-center disabled:opacity-30"
              >
                <FontAwesomeIcon icon={faChevronRight} className="text-xs" />
              </button>
            </div>
            <div className="mt-3 pt-3 border-t border-line-light flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-text-secondary">
                    {period.isFuture || period.isOpen ? '累計金額' : '應繳金額'}
                  </span>
                  <StatusBadge period={period} paid={isPaid} />
                </div>
                <div className="text-[26px] font-bold leading-tight tabular-nums mt-0.5">
                  {formatAmount(period.total, opt)}
                </div>
                <div className="text-xs text-text-tertiary tabular-nums mt-0.5">
                  {period.isOpen
                    ? `出帳 ${formatMd(period.statementDate)}`
                    : `繳款截止 ${formatMd(period.dueDate)}`}
                </div>
              </div>
              {!period.isOpen && !isPaid && period.total > 0 && (
                <button
                  onClick={() => setPaying(period)}
                  className="flex-none h-[34px] px-3 rounded-btn bg-brand text-white text-[13px] font-semibold"
                >
                  繳費
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-surface border border-line rounded-card shadow-card p-4 text-[13px] text-text-tertiary text-center">
            尚未設定結帳日，無法產生帳單
          </div>
        )}

        {/* 該期明細。延後入帳在每一期都提供——對帳時發現銀行沒收的那筆，多半正是
            已出帳期別裡的消費。已延後的列改顯示「收回」，不必回到本期才收得回來。*/}
        {period && (
          <>
            <div className="px-0.5 mt-4 mb-2 flex items-center justify-between">
              <span className="text-[15px] font-semibold">明細</span>
              {charges.length > 0 && (
                <button
                  onClick={() => setDeferring({ preselectId: null })}
                  className="flex items-center gap-1.5 h-[30px] px-2.5 rounded-chip bg-surface border border-line text-[12px] font-medium text-text-secondary"
                >
                  <FontAwesomeIcon icon={faClockRotateLeft} className="text-[10px]" /> 延後入帳
                </button>
              )}
            </div>
            {charges.length === 0 ? (
              <EmptyState title="這期尚無消費" />
            ) : (
              <div className="bg-surface border border-line rounded-card shadow-card overflow-hidden divide-y divide-line-light">
                {charges.map((t) => (
                  <TransactionRow
                    key={t.id}
                    tx={t}
                    lookups={lookups}
                    onClick={() => setPreviewTx(t)}
                    actions={rowActions(t)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* 已延後至下期：店家尚未請款而手動挪走入帳日的消費，可隨時收回 */}
        {deferred.length > 0 && (
          <>
            <div className="px-0.5 mt-4 mb-2 flex items-center justify-between">
              <span className="text-[15px] font-semibold">已延後至下期</span>
              <span className="text-[13px] text-text-secondary tabular-nums">{formatAmount(deferredTotal, opt)}</span>
            </div>
            <div className="bg-surface border border-line rounded-card shadow-card overflow-hidden divide-y divide-line-light">
              {deferred.map((t) => (
                <TransactionRow
                  key={t.id}
                  tx={t}
                  lookups={lookups}
                  onClick={() => setPreviewTx(t)}
                  actions={rowActions(t)}
                />
              ))}
            </div>
            <p className="text-[11px] text-text-tertiary mt-2 px-1">
              這些消費不計入本期帳單與已用額度，會落在下一期。
            </p>
          </>
        )}
      </div>

      <PaySheet
        period={paying}
        card={card}
        defaultFundingId={card.linkedDebitAccountId ?? settings?.defaultAccountId ?? null}
        accounts={accounts}
        onClose={() => setPaying(null)}
      />

      <DeferSheet
        request={deferring}
        charges={period?.charges ?? []}
        paid={isPaid}
        lookups={lookups}
        // 該期結帳日的隔天＝最早能落到下一期的入帳日
        defaultDate={period ? addDays(period.periodEnd, 1) : todayStr()}
        onClose={() => setDeferring(null)}
      />

      <TransactionPreview
        tx={previewTx}
        lookups={lookups}
        hidden={hidden}
        onClose={() => setPreviewTx(null)}
        onOpen={() => {
          const txId = previewTx?.id
          setPreviewTx(null)
          if (txId) navigate(`/add?id=${txId}`)
        }}
      />
      {confirmElement}
    </div>
  )
}

// 期別狀態。isOpen 對未來期同樣為真，故必須先判 isFuture（見 engine.statementPeriods）
function StatusBadge({ period, paid }) {
  const s = period.isFuture
    ? { label: '未開始', cls: 'text-text-tertiary bg-surface-alt' }
    : period.isOpen
      ? { label: '本期累計', cls: 'text-text-secondary bg-surface-alt' }
      : paid
        ? { label: '已繳', cls: 'text-success bg-success-bg' }
        : period.total > 0
          ? { label: '未繳', cls: 'text-warning-text bg-warning-bg' }
          : { label: '無消費', cls: 'text-text-tertiary bg-surface-alt' }
  return <span className={`text-[11px] font-medium rounded-pill px-2 py-0.5 ${s.cls}`}>{s.label}</span>
}

// 延後入帳：把選定消費的入帳日挪到該期結帳日之後，該筆就改列下一期帳單、
// 也不再計入卡片已用額度（店家尚未向銀行請款 ＝ 這筆還沒真的欠）。
// 同一個面板兼顧逐列（帶 preselectId 進來）與批次勾選。
function DeferSheet({ request, charges, paid, lookups, defaultDate, onClose }) {
  const open = !!request
  const [selected, setSelected] = useState(() => new Set())
  const [date, setDate] = useState(defaultDate)
  const { run, busy, error } = useAsyncAction()

  // 每次開啟重置：逐列進來只勾那筆，從標題進來則全不勾。
  // defaultDate 納入 key，換一期再開才會重算預設入帳日。
  const key = open ? `${defaultDate}|${request.preselectId ?? 'batch'}` : 'closed'
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setSelected(new Set(open && request.preselectId ? [request.preselectId] : []))
    setDate(defaultDate)
  }

  const rows = charges.slice().sort((a, b) => (a.tradeDate < b.tradeDate ? 1 : -1))
  const picked = rows.filter((t) => selected.has(t.id))
  // 入帳日不得早於消費日，否則餘額會在消費前就變動
  const minDate = picked.reduce((m, t) => (t.tradeDate > m ? t.tradeDate : m), '')
  const total = picked.reduce((s, t) => s + (t.type === 'expense' ? t.amount : -t.amount), 0)
  const canSave = picked.length > 0 && !!date && date >= minDate

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const confirm = () => {
    if (!canSave) return
    run(async () => {
      await settle(setPostingDates(picked.map((t) => ({ id: t.id, postingDate: date }))))
      onClose()
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title="延後入帳" bodyClassName="overflow-y-auto">
      <div className="p-[18px] flex flex-col gap-3.5">
        <p className="text-[13px] text-text-secondary">
          店家還沒向銀行請款、對帳時金額對不上的消費，挪到下一期帳單。
        </p>
        {paid && (
          <p className="text-[12px] text-warning-text bg-warning-bg rounded-modal px-3 py-2">
            這期帳單已繳費。延後後帳單金額會與當初的繳款金額不符，確認是要調整的話再繼續。
          </p>
        )}

        <div>
          <div className="text-[13px] text-text-secondary mb-1.5 px-1">
            要延後的項目（已選 {picked.length}）
          </div>
          <div className="bg-surface border border-line rounded-modal divide-y divide-line-light">
            {rows.map((t) => {
              const on = selected.has(t.id)
              const cat = lookups.cat[t.splits?.[0]?.categoryId]
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left"
                >
                  <span
                    className={`w-[18px] h-[18px] flex-none rounded-[5px] border flex items-center justify-center ${
                      on ? 'bg-brand border-brand text-white' : 'border-line'
                    }`}
                  >
                    {on && <FontAwesomeIcon icon={faCheck} className="text-[10px]" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium truncate">
                      {t.merchant || cat?.name || t.note || '未分類'}
                    </div>
                    <div className="text-[11px] text-text-tertiary tabular-nums">{formatMd(t.tradeDate)}</div>
                  </div>
                  <span className="text-[14px] font-semibold tabular-nums flex-none">
                    {formatAmount(t.type === 'expense' ? t.amount : -t.amount)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">改為入帳日</div>
          <DateInput
            value={date}
            min={minDate || undefined}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-surface border border-line rounded-modal text-[15px] outline-none"
          />
        </div>

        <p className="text-[11px] text-text-tertiary">
          {picked.length === 0
            ? '請至少勾選一筆。'
            : `這 ${picked.length} 筆共 ${formatAmount(total)} 將移出本期帳單、改列下一期，卡片已用額度同步不計。`}
        </p>
        {error && <div className="text-[13px] text-error px-1">{error}</div>}
        <button
          onClick={confirm}
          disabled={!canSave || busy}
          className="flex items-center justify-center gap-1.5 h-[42px] rounded-btn bg-brand text-white text-[13px] font-semibold disabled:opacity-40"
        >
          <FontAwesomeIcon icon={faCheck} className="text-xs" /> 確認延後
        </button>
      </div>
    </Sheet>
  )
}

// 繳費面板：金額（預設本期應繳，可改）＋扣款銀行＋日期 → 一次寫轉帳＋帳單快照
function PaySheet({ period, card, defaultFundingId, accounts, onClose }) {
  const open = !!period
  const [amountStr, setAmountStr] = useState('')
  const [fundingId, setFundingId] = useState(null)
  const [date, setDate] = useState(todayStr())
  const [pickerOpen, setPickerOpen] = useState(false)

  // period 改變時重置預設值
  const key = period?.periodEnd ?? 'none'
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setAmountStr(period ? String(period.total) : '')
    setFundingId(defaultFundingId)
    setDate(todayStr())
  }

  const amount = parseInt(amountStr.replace(/[^0-9]/g, ''), 10) || 0
  const fundingObj = accounts.find((a) => a.id === fundingId)
  const candidates = accounts.filter((a) => a.type === 'cash' || a.type === 'bank')
  const canPay = amount > 0 && !!fundingId

  const { run, busy, error } = useAsyncAction()

  const confirm = () => {
    if (!canPay) return
    run(async () => {
      await settle(payCreditCardStatement({ card, fundingAccountId: fundingId, amount, postingDate: date, period }))
      onClose()
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title="信用卡繳費" bodyClassName="overflow-y-auto">
      <div className="p-[18px] flex flex-col gap-3.5">
        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">繳款金額</div>
          <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal flex items-center gap-1 text-[15px] tabular-nums">
            <span className="text-text-tertiary text-sm">NT$</span>
            <input
              inputMode="numeric"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-full outline-none bg-transparent"
            />
          </div>
          {period && (
            <div className="text-[11px] text-text-tertiary mt-1">本期應繳 NT$ {formatNumber(period.total)}</div>
          )}
        </div>
        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">扣款銀行</div>
          <button
            onClick={() => setPickerOpen(true)}
            className="w-full px-3.5 py-2.5 bg-surface border border-line rounded-modal flex items-center justify-between text-[15px]"
          >
            <span className={fundingObj ? '' : 'text-text-tertiary'}>{fundingObj?.name ?? '選擇帳戶'}</span>
            <FontAwesomeIcon icon={faChevronDown} className="text-text-tertiary text-[11px]" />
          </button>
        </div>
        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">繳款日</div>
          <DateInput
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-surface border border-line rounded-modal text-[15px] outline-none"
          />
        </div>
        {error && <div className="text-[13px] text-error px-1">{error}</div>}
        <button
          onClick={confirm}
          disabled={!canPay || busy}
          className="flex items-center justify-center gap-1.5 h-[42px] rounded-btn bg-brand text-white text-[13px] font-semibold disabled:opacity-40"
        >
          <FontAwesomeIcon icon={faCheck} className="text-xs" /> 確認繳費（轉帳 {formatBalance(-amount)}）
        </button>
      </div>

      <AccountPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        accounts={candidates}
        value={fundingId}
        title="扣款銀行"
        onSelect={(aid) => setFundingId(aid)}
      />
    </Sheet>
  )
}
