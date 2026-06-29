import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'

// 通用底部彈出面板：手機貼底、桌面置中。選擇器（分類/帳戶/對象）共用。
export default function Sheet({ open, onClose, title, children, bodyClassName = '' }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <div
        className="absolute inset-0 bg-[rgba(17,20,24,0.4)]"
        onClick={onClose}
      />
      <div className="relative w-full lg:max-w-[480px] bg-surface rounded-t-sheet lg:rounded-sheet shadow-sheet flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-[18px] pt-4 pb-3">
          <span className="text-base font-semibold">{title}</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-chip bg-surface-alt text-text-secondary flex items-center justify-center"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <div className={`flex-1 min-h-0 border-t border-line ${bodyClassName}`}>
          {children}
        </div>
      </div>
    </div>
  )
}
