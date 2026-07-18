import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBell,
  faEye,
  faEyeSlash,
  faChevronDown,
  faChevronUp,
  faChevronRight,
  faArrowTrendUp,
  faArrowTrendDown,
  faCheck,
} from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../db/DataProvider'
import {
  accountBalances,
  netWorth,
  monthlySummary,
  outstandingAsOf,
  pendingByAccount,
} from '../lib/engine'
import { computeHoldings, holdingsMarketValue } from '../lib/stock'
import { dueReminders, fireReminder } from '../lib/recurring'
import { formatBalance, formatSigned, formatAmount } from '../lib/format'
import { todayStr, parseDate, monthLabel, formatMd } from '../lib/date'
import { getIcon, ACCOUNT_TYPE_ICON } from '../lib/icons'
import Sheet from '../components/Sheet'

const GROUPS = [
  { type: 'cash', label: '現金' },
  { type: 'bank', label: '銀行' },
  { type: 'credit_card', label: '信用卡' },
  { type: 'securities', label: '證券' },
]

// 上月最後一天的 'YYYY-MM-DD'，用來算「較上月」淨資產變化
function lastMonthEnd() {
  const d = parseDate(todayStr())
  d.setDate(1)
  d.setDate(0) // 退到上月最後一天
  return todayStr(d)
}

export default function HomePage() {
  const navigate = useNavigate()
  const accounts = useCollection('accounts')
  const txns = useCollection('transactions')
  const rules = useCollection('recurringRules')
  const stockTxns = useCollection('stockTransactions')
  const stockPrices = useCollection('stockPrices')

  const [hidden, setHidden] = useState(false)
  const [compOpen, setCompOpen] = useState(false)
  const [collapsed, setCollapsed] = useState({})
  const [remindersOpen, setRemindersOpen] = useState(false)

  const reminders = dueReminders(rules)

  const asOf = todayStr()
  const today = parseDate(asOf)
  const year = today.getFullYear()
  const month = today.getMonth() + 1

  // 持股計算
  const { holdings } = useMemo(
    () => computeHoldings(stockTxns, stockPrices, { asOf }),
    [stockTxns, stockPrices, asOf],
  )
  const holdingsValue = holdingsMarketValue(holdings)

  // 各證券帳戶的持股市值
  const holdingsByAcct = useMemo(() => {
    const m = {}
    for (const h of holdings) {
      m[h.securitiesAccountId] = (m[h.securitiesAccountId] ?? 0) + h.marketValue
    }
    return m
  }, [holdings])

  // 現餘額／淨資產一律以「今天」為入帳截止：未來入帳日記錄（未入帳）不計入現況
  const balances = accountBalances(accounts, txns, asOf, stockTxns)
  const pending = pendingByAccount(accounts, txns, asOf, stockTxns)
  const nw = netWorth(accounts, txns, { holdingsValue, asOf, stockTxns })
  const nwPrev = netWorth(accounts, txns, { holdingsValue, asOf: lastMonthEnd(), stockTxns })
  const change = nw - nwPrev
  const { income, expense, balance } = monthlySummary(txns, year, month)

  // 淨資產組成（與 nw 同口徑：asOf=今天）
  const live = accounts.filter((a) => !a.isArchived)
  const sumType = (t) => live.filter((a) => a.type === t).reduce((s, a) => s + balances[a.id], 0)
  const comp = {
    cash: sumType('cash'),
    bank: sumType('bank'),
    invest: holdingsValue,
    recv: txns.filter((t) => t.type === 'receivable').reduce((s, t) => s + outstandingAsOf(t, asOf), 0),
    card: sumType('credit_card'),
    pay: txns.filter((t) => t.type === 'payable').reduce((s, t) => s + outstandingAsOf(t, asOf), 0),
  }

  const opt = { hidden }

  return (
    <div className="px-4 pt-4 pb-4 lg:px-7 lg:pt-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">首頁</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHidden((v) => !v)}
            className="w-[38px] h-[38px] rounded-chip bg-surface border border-line text-text-secondary flex items-center justify-center"
          >
            <FontAwesomeIcon icon={hidden ? faEyeSlash : faEye} />
          </button>
          <button
            onClick={() => setRemindersOpen(true)}
            className="relative w-[38px] h-[38px] rounded-chip bg-surface border border-line text-text-secondary flex items-center justify-center"
          >
            <FontAwesomeIcon icon={faBell} />
            {reminders.length > 0 && (
              <span className="absolute top-2 right-2 w-[7px] h-[7px] bg-error rounded-full" />
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {/* 淨資產卡 */}
        <div className="bg-surface border border-line rounded-card shadow-card p-[18px]">
          <div className="text-[13px] text-text-secondary">淨資產</div>
          <div className="text-[34px] font-bold leading-tight tabular-nums mt-0.5">
            {formatBalance(nw, opt)}
          </div>
          <button
            onClick={() => setCompOpen((v) => !v)}
            className="flex items-center gap-1.5 mt-2"
          >
            <FontAwesomeIcon
              icon={change >= 0 ? faArrowTrendUp : faArrowTrendDown}
              className={`text-xs ${change >= 0 ? 'text-success' : 'text-error'}`}
            />
            <span className={`text-[13px] font-medium tabular-nums ${change >= 0 ? 'text-success' : 'text-error'}`}>
              較上月 {formatSigned(change, opt)}
            </span>
            <FontAwesomeIcon
              icon={compOpen ? faChevronUp : faChevronDown}
              className="text-text-tertiary text-[10px] ml-0.5"
            />
          </button>
          {compOpen && (
            <div className="mt-3.5 border-t border-line pt-3 grid grid-cols-1 lg:grid-cols-2 gap-2 lg:gap-x-8">
              <CompRow label="現金" value={formatBalance(comp.cash, opt)} />
              <CompRow label="銀行" value={formatBalance(comp.bank, opt)} />
              <CompRow label="投資市值" value={formatBalance(comp.invest, opt)} />
              <CompRow label="應收" value={formatSigned(comp.recv, opt)} />
              <CompRow label="信用卡未繳" value={formatBalance(comp.card, opt)} danger={comp.card < 0} />
              <CompRow label="應付" value={formatSigned(-comp.pay, opt)} danger={comp.pay > 0} />
            </div>
          )}
        </div>

        {/* 本月收支卡 */}
        <div className="bg-surface border border-line rounded-card shadow-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold">本月收支</span>
            <span className="text-xs text-text-tertiary">{monthLabel(year, month)}</span>
          </div>
          <div className="flex mt-3.5">
            <div className="flex-1">
              <div className="text-xs text-text-secondary">收入</div>
              <div className="text-lg font-semibold text-income tabular-nums mt-0.5">
                {formatAmount(income, opt)}
              </div>
            </div>
            <div className="w-px bg-line mx-3.5" />
            <div className="flex-1">
              <div className="text-xs text-text-secondary">支出</div>
              <div className="text-lg font-semibold text-expense tabular-nums mt-0.5">
                {formatAmount(expense, opt)}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3.5 pt-3 border-t border-line">
            <span className="text-[13px] text-text-secondary">結餘</span>
            <span className={`text-[15px] font-semibold tabular-nums ${balance >= 0 ? 'text-income' : 'text-expense'}`}>
              {formatSigned(balance, opt)}
            </span>
          </div>
        </div>

        {/* 帳戶列表 */}
        <div className="flex items-center justify-between px-0.5 pt-1">
          <span className="text-[15px] font-semibold">帳戶</span>
        </div>
        <div className="bg-surface border border-line rounded-card shadow-card px-3.5">
          {GROUPS.map((g, gi) => {
            const list = live
              .filter((a) => a.type === g.type)
              .sort((a, b) => a.sortOrder - b.sortOrder)
            if (list.length === 0) return null
            const groupTotal = g.type === 'securities'
              ? list.reduce((s, a) => s + (holdingsByAcct[a.id] ?? 0), 0)
              : list.reduce((s, a) => s + balances[a.id], 0)
            const open = !collapsed[g.type]
            return (
              <div key={g.type} className={gi > 0 ? 'border-t border-line-light' : ''}>
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [g.type]: open }))}
                  className="flex items-center gap-2 w-full py-3"
                >
                  <FontAwesomeIcon
                    icon={open ? faChevronDown : faChevronRight}
                    className="text-text-tertiary text-[11px] w-3"
                  />
                  <span className="text-[13px] font-semibold text-text-secondary">{g.label}</span>
                  <span className="flex-1" />
                  <span className="text-[13px] text-text-secondary tabular-nums font-medium">
                    {g.type === 'credit_card'
                      ? `已用 ${formatAmount(-groupTotal, opt)}`
                      : g.type === 'securities'
                        ? `市值 ${formatBalance(groupTotal, opt)}`
                        : formatBalance(groupTotal, opt)}
                  </span>
                </button>
                {open &&
                  list.map((a) => (
                    <AccountRow
                      key={a.id}
                      account={a}
                      balance={a.type === 'securities' ? (holdingsByAcct[a.id] ?? 0) : balances[a.id]}
                      pending={pending[a.id]}
                      opt={opt}
                      settlementBankName={
                        a.type === 'securities' && a.defaultSettlementBankId
                          ? accounts.find((b) => b.id === a.defaultSettlementBankId)?.name
                          : undefined
                      }
                      settlementBankBalance={
                        a.type === 'securities' && a.defaultSettlementBankId
                          ? balances[a.defaultSettlementBankId]
                          : undefined
                      }
                      onClick={
                        a.type === 'credit_card'
                          ? () => navigate(`/card/${a.id}`)
                          : a.type === 'securities'
                            ? () => navigate('/transactions?tab=stock')
                            : undefined
                      }
                    />
                  ))}
              </div>
            )
          })}
        </div>
      </div>

      <RemindersSheet
        open={remindersOpen}
        reminders={reminders}
        onClose={() => setRemindersOpen(false)}
      />
    </div>
  )
}

function RemindersSheet({ open, reminders, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title="週期性提醒" bodyClassName="overflow-y-auto p-3">
      {reminders.length === 0 ? (
        <div className="py-10 text-center text-text-tertiary text-sm">目前沒有待確認的提醒</div>
      ) : (
        <div className="flex flex-col gap-2">
          {reminders.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 p-3 bg-surface border border-line rounded-modal"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium truncate">{r.name ?? '週期項目'}</div>
                <div className="text-xs text-text-tertiary tabular-nums">到期 {formatMd(r.nextDate)}</div>
              </div>
              <button
                onClick={() => fireReminder(r)}
                className="flex items-center gap-1.5 h-[34px] px-3 rounded-btn bg-brand text-white text-[13px] font-semibold"
              >
                <FontAwesomeIcon icon={faCheck} className="text-xs" /> 記一筆
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}

function CompRow({ label, value, danger }) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-text-secondary">{label}</span>
      <span className={`tabular-nums ${danger ? 'text-error' : ''}`}>{value}</span>
    </div>
  )
}

function AccountRow({ account, balance, pending = 0, opt, onClick, settlementBankName, settlementBankBalance }) {
  const isCard = account.type === 'credit_card'
  const isSecurities = account.type === 'securities'
  const used = -balance
  const limit = account.creditLimit ?? 0
  const pct = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0
  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-3 py-2 ${onClick ? 'cursor-pointer' : ''}`}
    >
      <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center text-[15px]">
        <FontAwesomeIcon icon={getIcon(account.icon ?? ACCOUNT_TYPE_ICON[account.type])} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-medium truncate">{account.name}</span>
          <span className="text-[15px] font-semibold tabular-nums">
            {isCard ? `已用 ${formatAmount(used, opt)}` : formatBalance(balance, opt)}
          </span>
        </div>
        {isSecurities && settlementBankName && (
          <div className="text-xs text-text-tertiary tabular-nums mt-0.5">
            交割銀行 {settlementBankName} {settlementBankBalance != null ? formatBalance(settlementBankBalance, opt) : ''}
          </div>
        )}
        {pending !== 0 && (
          <div className="text-xs text-text-tertiary tabular-nums mt-0.5">
            {isSecurities ? '未交割' : '未入帳'} {formatSigned(pending, opt)}
          </div>
        )}
        {isCard && limit > 0 && (
          <>
            {/* 隱藏金額時進度條固定等寬淡色，不洩漏使用率比例 */}
            <div className="h-1.5 bg-surface-alt rounded-pill my-2 overflow-hidden">
              <div
                className="h-full rounded-pill"
                style={{ width: opt?.hidden ? '40%' : `${pct}%`, background: opt?.hidden ? 'var(--color-line)' : 'var(--color-brand)' }}
              />
            </div>
            <div className="flex justify-between text-xs text-text-tertiary tabular-nums">
              <span>可用 {formatAmount(limit + balance, opt)}</span>
              <span>額度 {formatAmount(limit, opt)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
