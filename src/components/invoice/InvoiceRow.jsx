import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowDown,
  faXmark,
  faRotateLeft,
  faReceipt,
  faChevronDown,
  faChevronUp,
} from '@fortawesome/free-solid-svg-icons'
import { formatAmount, formatNumber } from '../../lib/format'
import { formatMd } from '../../lib/date'

// 單張發票列。動作按鈕依 status 而異（inbox 歸帳/略過、recorded 取消歸帳、ignored 復原）。
// 有 lineItems 時可點列展開唯讀明細，供歸帳拆帳時對照。
export default function InvoiceRow({ invoice, hidden, onRecord, onIgnore, onRestore, onUnrecord, onOpenTx }) {
  const [open, setOpen] = useState(false)
  const items = invoice.lineItems ?? []
  const hasItems = items.length > 0
  const status = invoice.status

  // 已歸帳點列跳對應交易；否則有明細才展開
  const onRowClick = () => {
    if (status === 'recorded') onOpenTx?.()
    else if (hasItems) setOpen((v) => !v)
  }

  return (
    <div className="border-b border-line-light last:border-b-0">
      <div className="flex items-center gap-3 py-3">
        <button
          onClick={onRowClick}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
            <FontAwesomeIcon icon={faReceipt} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-medium truncate">{invoice.merchant || '未知商家'}</span>
              {hasItems && (
                <span className="flex-none text-[11px] text-text-tertiary bg-surface-alt rounded-pill px-1.5 py-0.5">
                  {items.length} 品項
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-text-tertiary min-w-0">
              <span className="flex-none">{formatMd(invoice.invoiceDate)}</span>
              {invoice.carrierId && <span className="truncate">{invoice.carrierId}</span>}
            </div>
          </div>
          <span className="text-[15px] font-semibold tabular-nums whitespace-nowrap text-text-primary">
            {formatAmount(invoice.totalAmount, { hidden })}
          </span>
          {status === 'recorded' && hasItems ? null : hasItems ? (
            <FontAwesomeIcon icon={open ? faChevronUp : faChevronDown} className="text-text-tertiary text-[11px]" />
          ) : null}
        </button>

        <div className="flex items-center gap-1.5 flex-none">
          {status === 'inbox' && (
            <>
              <button
                onClick={onRecord}
                className="flex items-center gap-1 h-8 px-3 rounded-chip bg-brand text-white text-[13px] font-semibold"
              >
                <FontAwesomeIcon icon={faArrowDown} className="text-xs" /> 歸帳
              </button>
              <button
                onClick={onIgnore}
                title="略過"
                className="w-8 h-8 rounded-chip bg-surface-alt text-text-secondary flex items-center justify-center"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </>
          )}
          {status === 'recorded' && (
            <>
              <span className="text-[11px] font-semibold text-income bg-brand-light rounded-pill px-2 py-1">
                已歸帳
              </span>
              <button
                onClick={onUnrecord}
                title="取消歸帳"
                className="w-8 h-8 rounded-chip bg-surface-alt text-text-secondary flex items-center justify-center"
              >
                <FontAwesomeIcon icon={faRotateLeft} className="text-xs" />
              </button>
            </>
          )}
          {status === 'ignored' && (
            <>
              <span className="text-[11px] font-semibold text-text-tertiary bg-surface-alt rounded-pill px-2 py-1">
                已略過
              </span>
              <button
                onClick={onRestore}
                title="復原"
                className="w-8 h-8 rounded-chip bg-surface-alt text-text-secondary flex items-center justify-center"
              >
                <FontAwesomeIcon icon={faRotateLeft} className="text-xs" />
              </button>
            </>
          )}
        </div>
      </div>

      {open && hasItems && (
        <div className="pb-3 pl-12 pr-1 flex flex-col gap-1">
          {items.map((it, i) => (
            <div key={i} className="flex items-center justify-between text-[13px] text-text-secondary">
              <span className="truncate">
                {it.name || '（未命名）'}
                {it.qty > 1 && <span className="text-text-tertiary"> ×{it.qty}</span>}
              </span>
              <span className="tabular-nums flex-none ml-2">{formatNumber(it.amount ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
