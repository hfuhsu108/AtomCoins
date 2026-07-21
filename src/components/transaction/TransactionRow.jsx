import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faRightLeft,
  faHandHoldingDollar,
  faArrowsSplitUpAndLeft,
  faCircleCheck,
} from '@fortawesome/free-solid-svg-icons'
import { getIcon } from '../../lib/icons'
import { formatNumber } from '../../lib/format'
import { formatMd } from '../../lib/date'
import { settlementStatus, outstanding, isPending } from '../../lib/engine'

const STATUS = {
  unpaid: { label: '未結清', cls: 'text-warning-text bg-warning-bg' },
  partial: { label: '部分結清', cls: 'text-warning-text bg-warning-bg' },
  settled: { label: '已結清', cls: 'text-success bg-success-bg' },
}

// 副標：有商家時商家優先，與 note 並存則「商家・note」（docs/09 批次 3）
function mergeMerchant(merchant, note) {
  if (!merchant) return note
  return note ? `${merchant}・${note}` : merchant
}

// 由分類 id 取「母·子」（或母）名稱與母分類圖示
function categoryView(categoryId, lookups) {
  const cat = lookups.cat[categoryId]
  const parent = cat?.parentId ? lookups.cat[cat.parentId] : cat
  return {
    icon: getIcon(parent?.icon),
    title: cat ? (cat.parentId ? `${parent.name}·${cat.name}` : parent.name) : '未分類',
  }
}

// 依交易型別決定圖示、標題、副標、金額顏色與正負（單列視圖）
function describe(tx, lookups) {
  if (tx.type === 'expense' || tx.type === 'income') {
    const first = tx.splits?.[0]
    const { icon, title } = categoryView(first?.categoryId, lookups)
    const acct = lookups.acc[tx.accountId]
    return {
      icon,
      title,
      acct: acct?.name,
      note: mergeMerchant(tx.merchant, tx.note),
      amount: tx.amount,
      amountColor: tx.type === 'expense' ? 'text-expense' : 'text-income',
      sign: tx.type === 'expense' ? '−' : '+',
    }
  }
  if (tx.type === 'transfer') {
    const from = lookups.acc[tx.fromAccountId]
    const to = lookups.acc[tx.toAccountId]
    return {
      icon: faRightLeft,
      title: '轉帳',
      acct: `${from?.name ?? '?'} → ${to?.name ?? '?'}`,
      note: tx.fee ? `手續費 NT$ ${formatNumber(tx.fee)}${tx.note ? ' · ' + tx.note : ''}` : tx.note,
      amount: tx.amount,
      amountColor: 'text-text-primary',
      sign: '',
    }
  }
  // receivable / payable
  const cp = lookups.cp[tx.counterpartyId]
  const isRecv = tx.type === 'receivable'
  const lent = tx.linkGroupId ? '代墊' : isRecv ? '借出' : '借入'
  const st = STATUS[settlementStatus(tx)]
  const left = outstanding(tx)
  return {
    icon: faHandHoldingDollar,
    title: `${lent} · ${cp?.name ?? '對象'}`,
    statusBadge: st,
    note: left > 0 && left !== tx.amount ? `未結清 NT$ ${formatNumber(left)}` : tx.note,
    amount: tx.amount,
    amountColor: isRecv ? 'text-expense' : 'text-income',
    sign: isRecv ? '−' : '+',
  }
}

// 拆帳列各自的視圖：類別、金額、備註取自該 split（badge 標「拆帳 i/N」）
function splitView(tx, split, index, count, lookups) {
  const { icon, title } = categoryView(split.categoryId, lookups)
  const acct = lookups.acc[tx.accountId]
  return {
    icon,
    title,
    badge: { label: `拆帳 ${index + 1}/${count}`, icon: faArrowsSplitUpAndLeft },
    acct: acct?.name,
    note: mergeMerchant(tx.merchant, split.note || tx.note),
    amount: split.amount,
    amountColor: tx.type === 'expense' ? 'text-expense' : 'text-income',
    sign: tx.type === 'expense' ? '−' : '+',
  }
}

export default function TransactionRow({ tx, lookups, onClick }) {
  const pending = isPending(tx)
  const installment = !!tx.installmentPlanId

  // 拆帳（expense/income 且多列）：每個拆帳列各自成列顯示（docs/04-ui.md、docs/08 批次 3）
  const isSplitExpanded =
    (tx.type === 'expense' || tx.type === 'income') && (tx.splits?.length ?? 0) > 1

  if (isSplitExpanded) {
    return tx.splits.map((sp, i) => (
      <Row
        key={`${tx.id}:${i}`}
        view={splitView(tx, sp, i, tx.splits.length, lookups)}
        pending={pending}
        installment={installment}
        reconciled={tx.isReconciled}
        pendingDate={tx.postingDate}
        onClick={onClick}
      />
    ))
  }

  return (
    <Row
      view={describe(tx, lookups)}
      pending={pending}
      installment={installment}
      reconciled={tx.isReconciled}
      pendingDate={tx.postingDate}
      onClick={onClick}
    />
  )
}

function Row({ view: d, pending, installment, reconciled, pendingDate, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 w-full py-3 text-left">
      <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
        <FontAwesomeIcon icon={d.icon} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] font-medium truncate">{d.title}</span>
          {d.badge && (
            <span className="flex-none text-[11px] font-medium text-brand bg-brand-light rounded-chip px-1.5 py-0.5">
              <FontAwesomeIcon icon={d.badge.icon} className="text-[9px] mr-1" />
              {d.badge.label}
            </span>
          )}
          {d.statusBadge && (
            <span className={`flex-none text-[11px] font-medium rounded-pill px-2 py-0.5 ${d.statusBadge.cls}`}>
              {d.statusBadge.label}
            </span>
          )}
          {installment && (
            <span className="flex-none text-[11px] font-medium text-brand bg-brand-light rounded-chip px-1.5 py-0.5">
              分期
            </span>
          )}
          {pending && (
            <span className="flex-none text-[11px] font-medium text-warning-text bg-warning-bg rounded-pill px-2 py-0.5">
              未入帳 {formatMd(pendingDate)}
            </span>
          )}
          {reconciled && (
            <FontAwesomeIcon icon={faCircleCheck} className="flex-none text-success text-[12px]" title="已對帳" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 min-w-0">
          {d.acct && (
            <span className="flex-none text-xs text-text-secondary bg-surface-alt rounded-chip px-1.5 py-0.5">
              {d.acct}
            </span>
          )}
          {d.note && <span className="text-xs text-text-tertiary truncate">{d.note}</span>}
        </div>
      </div>
      <span className={`text-[15px] font-semibold tabular-nums whitespace-nowrap ${d.amountColor}`}>
        {d.sign}NT$ {formatNumber(d.amount)}
      </span>
    </button>
  )
}
