import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowDown, faReceipt } from '@fortawesome/free-solid-svg-icons'
import { formatAmount } from '../../lib/format'
import { formatMd } from '../../lib/date'
import { resolveMerchant } from '../../lib/merchant'
import { getIcon } from '../../lib/icons'

// 單張發票列。列上只留「歸帳」這顆高頻正向動作，其餘（略過／編輯／取消歸帳／復原／
// 查看記帳）收進左滑抽屜，由 InvoicePanel 依 status 組好用 actions 傳入。
// 單擊＝開預覽（品項明細、發票號碼都在裡面，故列上不再做展開）。
// 顯示名稱套用商家別名（原始名 invoice.merchant 永不改寫）。
// suggestion＝自動分類建議 { label, icon, color, source, splitCount, detail }，僅未歸帳列顯示，
// 點歸帳時會預填（splitCount > 1 代表歸帳表單會直接開好多列拆帳）。
export default function InvoiceRow({ invoice, aliases, suggestion = null, hidden, onRecord, onPreview }) {
  const displayName = resolveMerchant(invoice.merchant, aliases)
  const items = invoice.lineItems ?? []
  const status = invoice.status

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button onClick={onPreview} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
          <FontAwesomeIcon icon={faReceipt} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-medium truncate">{displayName || '未知商家'}</span>
            {items.length > 0 && (
              <span className="flex-none text-[11px] text-text-tertiary bg-surface-alt rounded-pill px-1.5 py-0.5">
                {items.length} 品項
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-text-tertiary min-w-0">
            <span className="flex-none">{formatMd(invoice.invoiceDate)}</span>
            {suggestion && (
              <span
                className={`flex-none flex items-center gap-1 px-1.5 py-0.5 rounded-pill text-[11px] ${
                  suggestion.color ? '' : 'bg-surface-alt text-text-secondary'
                }`}
                style={
                  suggestion.color
                    ? { background: `color-mix(in srgb, ${suggestion.color} 15%, transparent)`, color: suggestion.color }
                    : undefined
                }
                title={`${suggestion.source === 'ai' ? 'AI 建議' : '依你的歷史記錄建議'}：${suggestion.detail ?? suggestion.label}${
                  suggestion.splitCount > 1 ? `（歸帳時自動拆成 ${suggestion.splitCount} 列）` : ''
                }，歸帳時可改`}
              >
                <FontAwesomeIcon icon={getIcon(suggestion.icon)} />
                {suggestion.label}
                <span className="opacity-60">{suggestion.source === 'ai' ? 'AI' : '歷史'}</span>
              </span>
            )}
            {invoice.carrierId && <span className="truncate">{invoice.carrierId}</span>}
          </div>
        </div>
        <span className="text-[15px] font-semibold tabular-nums whitespace-nowrap text-text-primary">
          {formatAmount(invoice.totalAmount, { hidden })}
        </span>
      </button>

      <div className="flex items-center gap-1.5 flex-none">
        {status === 'inbox' && (
          <button
            onClick={onRecord}
            className="flex items-center gap-1 h-8 px-3 rounded-chip bg-brand text-white text-[13px] font-semibold"
          >
            <FontAwesomeIcon icon={faArrowDown} className="text-xs" /> 歸帳
          </button>
        )}
        {/* 完成態一律用 success 綠，與「已結清」「已繳」同一套語彙 */}
        {status === 'recorded' && (
          <span className="text-[11px] font-semibold text-success bg-success-bg rounded-pill px-2 py-1">
            已歸帳
          </span>
        )}
        {status === 'ignored' && (
          <span className="text-[11px] font-semibold text-text-tertiary bg-surface-alt rounded-pill px-2 py-1">
            已略過
          </span>
        )}
      </div>
    </div>
  )
}
