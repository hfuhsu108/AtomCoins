import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCloudArrowUp } from '@fortawesome/free-solid-svg-icons'

// 離線時頂部的小提示：記帳照常可用（Firestore 離線快取），只是要讓使用者知道還沒同步到雲端。
// pointer-events-none：只是提示，不擋住底下表頭的按鈕。
export default function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)

  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[190] flex justify-center"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 2px)' }}
      role="status"
    >
      <div className="flex items-center gap-1.5 rounded-pill bg-warning-bg px-2.5 py-0.5 text-[11px] font-medium text-warning-text shadow-modal">
        <FontAwesomeIcon icon={faCloudArrowUp} className="text-[10px]" />
        離線中，記錄會在連線後同步
      </div>
    </div>
  )
}
