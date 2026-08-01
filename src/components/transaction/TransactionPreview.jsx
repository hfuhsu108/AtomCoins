import { formatAmount, formatNumber } from '../../lib/format'
import { formatMd, weekday } from '../../lib/date'
import { settlementStatus, outstanding, isPending } from '../../lib/engine'
import { STATUS } from './TransactionRow'
import PreviewSheet, { PreviewRow, PreviewSection } from '../PreviewSheet'
import TagChip from '../TagChip'

const TYPE_LABEL = {
  expense: '支出',
  income: '收入',
  transfer: '轉帳',
  receivable: '應收',
  payable: '應付',
}

// 「母·子」分類名（同 TransactionRow 口徑）
function catName(categoryId, lookups) {
  const cat = lookups.cat[categoryId]
  if (!cat) return '未分類'
  const parent = cat.parentId ? lookups.cat[cat.parentId] : cat
  return cat.parentId ? `${parent?.name ?? ''}·${cat.name}` : parent.name
}

// 長按帳本列的預覽：一次看完這筆的全部欄位（拆帳列、標籤、入帳日），不必進編輯頁。
export default function TransactionPreview({ tx, lookups, hidden, onClose, onOpen }) {
  if (!tx) return null

  const opt = { hidden }
  const isFlow = tx.type === 'expense' || tx.type === 'income'
  const isLoan = tx.type === 'receivable' || tx.type === 'payable'
  const splits = tx.splits ?? []
  const toTags = (ids) => (ids ?? []).map((id) => lookups.tag[id]).filter(Boolean)
  // 標籤取用口徑同 search.js：拆帳列有就用它，沒有才看交易層
  const headTags = isFlow
    ? toTags(splits[0]?.tagIds?.length ? splits[0].tagIds : tx.tagIds)
    : toTags(tx.tagIds)

  const deferred = !!tx.postingDate && tx.postingDate > tx.tradeDate
  const left = isLoan ? outstanding(tx) : 0
  const status = isLoan ? STATUS[settlementStatus(tx)] : null
  const amountCls =
    tx.type === 'expense' || tx.type === 'receivable'
      ? 'text-expense'
      : tx.type === 'income' || tx.type === 'payable'
        ? 'text-income'
        : 'text-text-primary'

  return (
    <PreviewSheet
      open={!!tx}
      title={TYPE_LABEL[tx.type] ?? '記錄'}
      onClose={onClose}
      footer={
        <button
          onClick={onOpen}
          className="w-full h-[42px] rounded-btn bg-brand text-white text-[14px] font-semibold"
        >
          編輯這筆
        </button>
      }
    >
      {/* 金額 */}
      <div className="text-center pb-1">
        <div className={`text-[32px] font-bold leading-tight tabular-nums ${amountCls}`}>
          {formatAmount(tx.amount, opt)}
        </div>
        <div className="flex items-center justify-center gap-1.5 mt-1.5 flex-wrap">
          {status && (
            <span className={`text-[11px] font-medium rounded-pill px-2 py-0.5 ${status.cls}`}>
              {status.label}
            </span>
          )}
          {isPending(tx) && (
            <span className="text-[11px] font-medium text-warning-text bg-warning-bg rounded-pill px-2 py-0.5">
              未入帳
            </span>
          )}
          {tx.installmentPlanId && (
            <span className="text-[11px] font-medium text-text-secondary bg-surface-alt rounded-chip px-1.5 py-0.5">
              分期
            </span>
          )}
          {tx.isReconciled && (
            <span className="text-[11px] font-medium text-success bg-success-bg rounded-pill px-2 py-0.5">
              已對帳
            </span>
          )}
        </div>
      </div>

      <PreviewRow label="記錄日" value={`${formatMd(tx.tradeDate)} ${weekday(tx.tradeDate)}`} />
      {deferred && (
        <PreviewRow label="入帳日" value={formatMd(tx.postingDate)} cls="text-warning-text font-medium" />
      )}

      {tx.type === 'transfer' ? (
        <>
          <PreviewRow label="轉出" value={lookups.acc[tx.fromAccountId]?.name ?? '—'} />
          <PreviewRow label="轉入" value={lookups.acc[tx.toAccountId]?.name ?? '—'} />
          {tx.fee > 0 && <PreviewRow label="手續費" value={formatAmount(tx.fee, opt)} />}
        </>
      ) : (
        <PreviewRow label="帳戶" value={lookups.acc[tx.accountId]?.name ?? '—'} />
      )}

      {isLoan && (
        <>
          <PreviewRow label="對象" value={lookups.cp[tx.counterpartyId]?.name ?? '—'} />
          <PreviewRow
            label="未結清"
            value={hidden ? formatAmount(left, opt) : `NT$ ${formatNumber(left)}`}
          />
        </>
      )}

      {isFlow && splits.length === 1 && (
        <PreviewRow label="分類" value={catName(splits[0].categoryId, lookups)} />
      )}
      <PreviewRow label="商家" value={tx.merchant} />
      <PreviewRow label="備註" value={tx.note} />

      {headTags.length > 0 && (
        <div className="flex items-baseline justify-between gap-4 text-[14px]">
          <span className="text-text-secondary flex-none">標籤</span>
          <span className="flex flex-wrap justify-end gap-1.5">
            {headTags.map((t) => <TagChip key={t.id} tag={t} />)}
          </span>
        </div>
      )}

      {/* 拆帳明細：預覽的主要價值——列表上一次只看得到一列 */}
      {isFlow && splits.length > 1 && (
        <PreviewSection title={`拆帳明細（${splits.length} 列）`}>
          {splits.map((sp, i) => {
            const spTags = toTags(sp.tagIds?.length ? sp.tagIds : tx.tagIds)
            return (
              <div key={i} className="px-3.5 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-medium min-w-0 truncate">
                    {catName(sp.categoryId, lookups)}
                  </span>
                  <span className="text-[14px] font-semibold tabular-nums flex-none">
                    {formatAmount(sp.amount, opt)}
                  </span>
                </div>
                {(sp.note || spTags.length > 0) && (
                  <div className="flex items-center flex-wrap gap-1.5 mt-1">
                    {spTags.map((t) => <TagChip key={t.id} tag={t} />)}
                    {sp.note && <span className="text-xs text-text-tertiary">{sp.note}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </PreviewSection>
      )}
    </PreviewSheet>
  )
}
