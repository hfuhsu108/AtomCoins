import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTag } from '@fortawesome/free-solid-svg-icons'

// 標籤 chip：記帳表單、明細列、標籤編輯預覽共用一份，避免三處配色漂移（同 TransactionRow 的 STATUS）。
// 自訂色走 color-mix（深淺主題皆可讀，也是分類色的既有慣例），未設色用中性底。
export default function TagChip({ tag }) {
  return (
    <span
      className={`flex-none inline-flex items-center gap-1 text-xs rounded-chip px-1.5 py-0.5 whitespace-nowrap ${
        tag.color ? '' : 'text-text-secondary bg-surface-alt'
      }`}
      style={tag.color ? { background: `color-mix(in srgb, ${tag.color} 15%, transparent)`, color: tag.color } : undefined}
    >
      <FontAwesomeIcon icon={faTag} className="text-[9px]" />
      {tag.name}
    </span>
  )
}
