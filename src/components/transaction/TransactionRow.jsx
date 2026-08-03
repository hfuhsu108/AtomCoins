import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faRightLeft,
  faHandHoldingDollar,
  faArrowsSplitUpAndLeft,
  faCircleCheck,
  faLayerGroup,
  faScaleBalanced,
} from '@fortawesome/free-solid-svg-icons'
import { getIcon } from '../../lib/icons'
import { formatNumber, formatAmount, MASK } from '../../lib/format'
import { formatMd } from '../../lib/date'
import { settlementStatus, outstanding, isPending } from '../../lib/engine'
import { useHiddenAmount } from '../HiddenAmountProvider'
import SwipeRow from '../SwipeRow'
import TagChip from '../TagChip'

// 借還款三態 badge：export 供記帳表單與借貸明細共用，避免各寫一份導致配色漂移
export const STATUS = {
  unpaid: { label: '未結清', cls: 'text-warning-text bg-warning-bg' },
  partial: { label: '部分結清', cls: 'text-warning-text bg-warning-bg' },
  settled: { label: '已結清', cls: 'text-success bg-success-bg' },
}

// 副標：有商家時商家優先，與 note 並存則「商家・note」（docs/09 批次 3）
function mergeMerchant(merchant, note) {
  if (!merchant) return note
  return note ? `${merchant}・${note}` : merchant
}

// 由分類 id 取「母·子」（或母）名稱、圖示與顏色。
// 圖示以子分類優先、子沒設才沿用母（同 CategoryPicker 慣例，也是 docs/01 §3.2 的欄位語義）；
// 顏色一律取母分類，讓同群組的交易在列表上維持一致的識別色。
function categoryView(categoryId, lookups) {
  const cat = lookups.cat[categoryId]
  const parent = cat?.parentId ? lookups.cat[cat.parentId] : cat
  return {
    icon: getIcon(cat?.icon ?? parent?.icon),
    color: parent?.color ?? null,
    title: cat ? (cat.parentId ? `${parent.name}·${cat.name}` : parent.name) : '未分類',
  }
}

// id 陣列 → 標籤物件（略過已刪除的）。取用口徑：拆帳列有自己的標籤就用它、沒有才繼承
// 交易層，與 search.js／backup.js 同一條規則
function tagViews(ids, lookups) {
  return (ids ?? []).map((id) => lookups.tag?.[id]).filter(Boolean)
}

// 依交易型別決定圖示、標題、副標、金額顏色與正負（單列視圖）。
// hidden 一路傳進來是因為副標裡也嵌了金額（手續費、未結清），只遮右側大數字會漏。
function describe(tx, lookups, hidden) {
  if (tx.type === 'expense' || tx.type === 'income') {
    const first = tx.splits?.[0]
    const { icon, title, color } = categoryView(first?.categoryId, lookups)
    const acct = lookups.acc[tx.accountId]
    return {
      icon,
      color,
      title,
      acct: acct?.name,
      tags: tagViews(tx.splits?.[0]?.tagIds?.length ? tx.splits[0].tagIds : tx.tagIds, lookups),
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
      tags: tagViews(tx.tagIds, lookups),
      note: tx.fee ? `手續費 ${formatAmount(tx.fee, { hidden })}${tx.note ? ' · ' + tx.note : ''}` : tx.note,
      amount: tx.amount,
      amountColor: 'text-text-primary',
      sign: '',
    }
  }
  if (tx.type === 'adjust') {
    // 真值是 targetBalance；差額是推導值，取 lookups 算好的現值（見 engine.adjustDeltas）——
    // 在基準日之前補記或刪帳後差額會變，顯示存下來的 snapshotDelta 會與帳面矛盾。
    // 用中性色：它不是收入也不是支出。
    const acct = lookups.acc[tx.accountId]
    const d = lookups.adjustDelta?.[tx.id] ?? tx.snapshotDelta ?? 0
    return {
      icon: faScaleBalanced,
      title: '餘額調整',
      acct: acct?.name,
      tags: [],
      note: `調整為 ${formatAmount(tx.targetBalance ?? 0, { hidden })}${tx.note ? ' · ' + tx.note : ''}`,
      amount: Math.abs(d),
      amountColor: 'text-text-primary',
      sign: d === 0 ? '' : d > 0 ? '+' : '−',
    }
  }
  // receivable / payable
  const cp = lookups.cp[tx.counterpartyId]
  const isRecv = tx.type === 'receivable'
  // 群組筆分兩個方向：應收＝我幫人墊、應付＝別人幫我墊（docs/03 §F）
  const lent = tx.linkGroupId ? (isRecv ? '代墊' : '代付') : isRecv ? '借出' : '借入'
  const st = STATUS[settlementStatus(tx)]
  const left = outstanding(tx)
  return {
    icon: faHandHoldingDollar,
    title: `${lent} · ${cp?.name ?? '對象'}`,
    statusBadge: st,
    // 代墊拆出的應收沒有 splits，標籤存在交易層（見 TransactionForm.buildList）
    tags: tagViews(tx.tagIds, lookups),
    note: left > 0 && left !== tx.amount ? `未結清 ${formatAmount(left, { hidden })}` : tx.note,
    amount: tx.amount,
    amountColor: isRecv ? 'text-expense' : 'text-income',
    sign: isRecv ? '−' : '+',
  }
}

// 拆帳列各自的視圖：類別、金額、備註取自該 split（badge 標「拆帳 i/N」）
function splitView(tx, split, index, count, lookups) {
  const { icon, title, color } = categoryView(split.categoryId, lookups)
  const acct = lookups.acc[tx.accountId]
  return {
    icon,
    color,
    title,
    badge: { label: `拆帳 ${index + 1}/${count}`, icon: faArrowsSplitUpAndLeft },
    acct: acct?.name,
    tags: tagViews(split.tagIds?.length ? split.tagIds : tx.tagIds, lookups),
    note: mergeMerchant(tx.merchant, split.note || tx.note),
    amount: split.amount,
    amountColor: tx.type === 'expense' ? 'text-expense' : 'text-income',
    sign: tx.type === 'expense' ? '−' : '+',
  }
}

// onClick＝開預覽（最低成本的動作）；編輯與刪除收進左滑抽屜，由呼叫端以 actions 傳入
// （卡片頁還要多塞一顆「延後／收回」，故用泛用陣列而非固定的 onEdit/onDelete）。
export default function TransactionRow({ tx, lookups, onClick, actions }) {
  const { hidden } = useHiddenAmount()
  const pending = isPending(tx)
  const installment = !!tx.installmentPlanId

  // 拆帳（expense/income 且多列）：每個拆帳列各自成列顯示（docs/04-ui.md、docs/08 批次 3）
  const isSplitExpanded =
    (tx.type === 'expense' || tx.type === 'income') && (tx.splits?.length ?? 0) > 1

  const common = {
    hidden,
    pending,
    installment,
    reconciled: tx.isReconciled,
    pendingDate: tx.postingDate,
    onClick,
  }

  if (isSplitExpanded) {
    // 每列各包一層 SwipeRow：抽屜的動作對整筆生效，但視覺上開的是被滑的那一列
    return tx.splits.map((sp, i) => (
      <SwipeRow key={`${tx.id}:${i}`} actions={actions}>
        <Row view={splitView(tx, sp, i, tx.splits.length, lookups)} {...common} />
      </SwipeRow>
    ))
  }

  return (
    <SwipeRow actions={actions}>
      <Row view={describe(tx, lookups, hidden)} {...common} />
    </SwipeRow>
  )
}

function Row({ view: d, hidden, pending, installment, reconciled, pendingDate, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-4 py-3 text-left"
    >
      <span
        className={`w-9 h-9 flex-none rounded-btn flex items-center justify-center ${d.color ? '' : 'bg-surface-alt text-text-secondary'}`}
        style={d.color ? { background: `color-mix(in srgb, ${d.color} 15%, transparent)`, color: d.color } : undefined}
      >
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
          {/* 與「拆帳」badge 區分：兩者原本同為 brand 色，同時出現時只能靠有無圖示分辨 */}
          {installment && (
            <span className="flex-none text-[11px] font-medium text-text-secondary bg-surface-alt rounded-chip px-1.5 py-0.5">
              <FontAwesomeIcon icon={faLayerGroup} className="text-[9px] mr-1" />
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
          {/* 標籤最多兩個＋餘數：這一行的 note 本來就是被壓縮的那個，chip 再多會把它吃光 */}
          {d.tags?.slice(0, 2).map((t) => <TagChip key={t.id} tag={t} />)}
          {d.tags?.length > 2 && (
            <span className="flex-none text-xs text-text-tertiary">+{d.tags.length - 2}</span>
          )}
          {d.note && <span className="text-xs text-text-tertiary truncate">{d.note}</span>}
        </div>
      </div>
      <span className={`text-[15px] font-semibold tabular-nums whitespace-nowrap ${d.amountColor}`}>
        {/* 遮蔽時連正負號一起收掉，與 formatSigned／formatBalance 的行為一致 */}
        {hidden ? MASK : `${d.sign}NT$ ${formatNumber(d.amount)}`}
      </span>
    </button>
  )
}
