import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRotate, faXmark } from '@fortawesome/free-solid-svg-icons'
import { usePwa } from './PwaProvider'

// 全 App 頂部「有新版」提示橫幅：開啟 App 自動檢查到新版時浮現。
// prompt 決策——只提示、不自動重載；點「立即更新」才套用（會重新載入到新版）。
// dismiss 只在本次啟動隱藏；下次開啟若仍有等待中的新版會再次出現。
export default function PwaUpdateBanner() {
  const { needRefresh, applyUpdate } = usePwa()
  const [dismissed, setDismissed] = useState(false)

  if (!needRefresh || dismissed) return null

  return (
    <div
      className="fixed inset-x-0 top-0 z-[200] flex items-center gap-3 bg-brand px-4 pb-3 text-white shadow-modal"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      role="status"
    >
      <FontAwesomeIcon icon={faRotate} className="flex-none" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[13.5px] font-bold">有新版本可用</div>
        <div className="text-[11.5px] text-white/85">更新以取得最新功能與修正</div>
      </div>
      <button
        onClick={applyUpdate}
        className="flex-none rounded-pill bg-white px-3.5 py-1.5 text-[13px] font-bold text-brand"
      >
        立即更新
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="稍後再說"
        className="flex-none w-8 h-8 flex items-center justify-center text-white/80"
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  )
}
