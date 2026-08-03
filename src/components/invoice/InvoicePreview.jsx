import { formatAmount, formatNumber, MASK_SHORT } from '../../lib/format'
import { formatMd } from '../../lib/date'
import { resolveMerchant } from '../../lib/merchant'
import PreviewSheet, { PreviewRow, PreviewSection } from '../PreviewSheet'

const STATUS_LABEL = {
  inbox: { label: '未歸帳', cls: 'text-warning-text bg-warning-bg' },
  recorded: { label: '已歸帳', cls: 'text-success bg-success-bg' },
  ignored: { label: '已略過', cls: 'text-text-tertiary bg-surface-alt' },
}

// 單擊發票列的預覽：一次看完品項明細與發票號碼（列上已不做展開，明細只在這裡看）。
// 別名與原始商家名並列——對帳時要比對的是財政部給的原始名。
export default function InvoicePreview({ invoice, aliases, hidden, onClose, onOpenTx }) {
  if (!invoice) return null
  const opt = { hidden }
  const display = resolveMerchant(invoice.merchant, aliases)
  const aliased = display && display !== invoice.merchant
  const items = invoice.lineItems ?? []
  const status = STATUS_LABEL[invoice.status]

  return (
    <PreviewSheet
      open={!!invoice}
      title="發票"
      onClose={onClose}
      footer={
        invoice.status === 'recorded' && invoice.transactionId ? (
          <button
            onClick={onOpenTx}
            className="w-full h-[42px] rounded-btn bg-brand text-white text-[14px] font-semibold"
          >
            查看記帳
          </button>
        ) : null
      }
    >
      <div className="text-center pb-1">
        <div className="text-[15px] font-semibold">{display || '未知商家'}</div>
        <div className="text-[26px] font-bold tabular-nums mt-1">
          {formatAmount(invoice.totalAmount, opt)}
        </div>
        {status && (
          <span className={`inline-block text-[11px] font-medium rounded-pill px-2 py-0.5 mt-1.5 ${status.cls}`}>
            {status.label}
          </span>
        )}
      </div>

      <PreviewRow label="發票日期" value={formatMd(invoice.invoiceDate)} />
      {aliased && <PreviewRow label="原始商家名" value={invoice.merchant} cls="text-text-secondary text-[13px]" />}
      <PreviewRow label="發票號碼" value={invoice.invoiceNumber} />
      <PreviewRow label="載具" value={invoice.carrierId} />
      <PreviewRow label="來源" value={invoice.source === 'manual' ? '手動新增' : '載具自動同步'} />
      <PreviewRow label="備註" value={invoice.note} />

      {items.length > 0 && (
        <PreviewSection title={`品項明細（${items.length} 項）`}>
          {items.map((it, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 px-3.5 py-2">
              <span className="text-[14px] min-w-0 break-words">
                {it.name || '（未命名）'}
                {it.qty > 1 && <span className="text-text-tertiary"> ×{it.qty}</span>}
              </span>
              <span className="text-[14px] tabular-nums flex-none">
                {hidden ? MASK_SHORT : formatNumber(it.amount ?? 0)}
              </span>
            </div>
          ))}
        </PreviewSection>
      )}
    </PreviewSheet>
  )
}
