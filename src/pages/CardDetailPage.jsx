import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft, faChevronDown, faCheck } from '@fortawesome/free-solid-svg-icons'
import { useCollection, useSettings } from '../db/DataProvider'
import { accountBalances, statementPeriods } from '../lib/engine'
import { payCreditCardStatement } from '../db/repo'
import { formatAmount, formatBalance, formatNumber } from '../lib/format'
import { todayStr, formatMd } from '../lib/date'
import { accountIcon } from '../lib/icons'
import TransactionRow from '../components/transaction/TransactionRow'
import AccountPicker from '../components/transaction/AccountPicker'
import Sheet from '../components/Sheet'

export default function CardDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const accounts = useCollection('accounts')
  const txns = useCollection('transactions')
  const categories = useCollection('categories')
  const counterparties = useCollection('counterparties')
  const settings = useSettings()
  const allStatements = useCollection('creditCardStatements')
  const statements = id ? allStatements.filter((s) => s.accountId === id) : []

  const [paying, setPaying] = useState(null) // 繳費中的 period 物件

  const card = accounts.find((a) => a.id === id)
  if (!card) return null

  const asOf = todayStr()
  const balance = accountBalances(accounts, txns, asOf)[card.id] ?? 0
  const used = -balance
  const limit = card.creditLimit ?? 0
  const pct = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0
  const periods = statementPeriods(card, txns, { months: 6, asOf })
  const paidByEnd = {}
  for (const s of statements) if (s.isPaid) paidByEnd[s.periodEnd] = s

  const lookups = (() => {
    const cat = {}, acc = {}, cp = {}
    for (const c of categories) cat[c.id] = c
    for (const a of accounts) acc[a.id] = a
    for (const c of counterparties) cp[c.id] = c
    return { cat, acc, cp }
  })()

  const openPeriod = periods.find((p) => p.isOpen)

  return (
    <div className="fixed inset-0 z-40 bg-app-bg overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 pt-4 pb-10 lg:px-7 lg:pt-6">
        <header className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate(-1)}
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
        </header>

        {/* 額度摘要 */}
        <div className="bg-surface border border-line rounded-card shadow-card p-[18px] mb-3">
          <div className="text-[13px] text-text-secondary">已用額度</div>
          <div className="text-[30px] font-bold leading-tight tabular-nums mt-0.5">{formatAmount(used)}</div>
          {limit > 0 && (
            <>
              <div className="h-1.5 bg-surface-alt rounded-pill my-3 overflow-hidden">
                <div className="h-full bg-brand rounded-pill" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-[13px] text-text-secondary tabular-nums">
                <span>可用 {formatAmount(limit + balance)}</span>
                <span>額度 {formatAmount(limit)}</span>
              </div>
            </>
          )}
        </div>

        {/* 帳單列表 */}
        <div className="px-0.5 mb-2 text-[15px] font-semibold">帳單</div>
        <div className="bg-surface border border-line rounded-card shadow-card divide-y divide-line-light">
          {periods.map((p) => {
            const paid = paidByEnd[p.periodEnd]
            return (
              <div key={p.periodEnd} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-medium tabular-nums">
                      {formatMd(p.periodStart)} – {formatMd(p.periodEnd)}
                    </span>
                    {p.isOpen ? (
                      <span className="text-[11px] font-medium text-text-secondary bg-surface-alt rounded-pill px-2 py-0.5">
                        本期累計
                      </span>
                    ) : paid ? (
                      <span className="text-[11px] font-medium text-success bg-success-bg rounded-pill px-2 py-0.5">
                        已繳
                      </span>
                    ) : p.total > 0 ? (
                      <span className="text-[11px] font-medium text-warning-text bg-warning-bg rounded-pill px-2 py-0.5">
                        未繳
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-text-tertiary bg-surface-alt rounded-pill px-2 py-0.5">
                        無消費
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-tertiary tabular-nums mt-0.5">
                    {p.isOpen ? `出帳 ${formatMd(p.statementDate)}` : `繳款截止 ${formatMd(p.dueDate)}`}
                  </div>
                </div>
                <span className="text-[15px] font-semibold tabular-nums">{formatAmount(p.total)}</span>
                {!p.isOpen && !paid && p.total > 0 && (
                  <button
                    onClick={() => setPaying(p)}
                    className="h-[34px] px-3 rounded-btn bg-brand text-white text-[13px] font-semibold"
                  >
                    繳費
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* 本期明細 */}
        {openPeriod && openPeriod.charges.length > 0 && (
          <>
            <div className="px-0.5 mt-4 mb-2 text-[15px] font-semibold">本期明細</div>
            <div className="bg-surface border border-line rounded-card shadow-card px-4 divide-y divide-line-light">
              {openPeriod.charges
                .slice()
                .sort((a, b) => (a.tradeDate < b.tradeDate ? 1 : -1))
                .map((t) => (
                  <TransactionRow
                    key={t.id}
                    tx={t}
                    lookups={lookups}
                    onClick={() => navigate(`/add?id=${t.id}`)}
                  />
                ))}
            </div>
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
    </div>
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

  const confirm = async () => {
    if (!canPay) return
    await payCreditCardStatement({ card, fundingAccountId: fundingId, amount, postingDate: date, period })
    onClose()
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
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-surface border border-line rounded-modal text-[15px] outline-none"
          />
        </div>
        <button
          onClick={confirm}
          disabled={!canPay}
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
