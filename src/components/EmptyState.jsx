import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

// 全站空狀態。原本各處留白從 py-6 到 py-16 有五種、文案在「尚無／尚未建立／沒有符合／是空的」
// 之間混用，且多半沒有下一步。語彙約定：
//   天生為空 → 「尚無 X」；篩選後為空 → 「找不到符合的 X」。
// compact 給卡片／面板內的清單用（整頁的留白塞進卡片裡會過空）。
export default function EmptyState({ icon, title, hint, action, compact = false }) {
  return (
    <div className={`${compact ? 'py-6' : 'py-12'} flex flex-col items-center text-center`}>
      {icon && (
        <span className="w-11 h-11 rounded-btn bg-surface-alt text-text-tertiary flex items-center justify-center mb-2.5">
          <FontAwesomeIcon icon={icon} className="text-base" />
        </span>
      )}
      <div className="text-sm text-text-tertiary">{title}</div>
      {hint && <div className="text-xs text-text-tertiary mt-1 px-6 leading-relaxed">{hint}</div>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3.5 h-[34px] px-3.5 rounded-chip bg-brand text-white text-[13px] font-semibold"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
