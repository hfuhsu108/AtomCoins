import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

// 集中管理 PWA 的「更新」與「安裝」狀態，元件一律消費 usePwa()，不各自呼叫 SW API。
// 更新採 prompt 模式（vite.config registerType）：偵測到新版不靜默重載，交使用者按鈕套用。
// 做法沿用 CoTravel（lib/pwa/PwaProvider.tsx）。

const PwaContext = createContext(null)

// 已安裝（standalone 開啟）：桌面/Android 看 display-mode，iOS Safari 看 navigator.standalone
function detectStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

function detectIOS() {
  // iPadOS 13+ 的 Safari 回報 MacIntel，需再看 maxTouchPoints
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function PwaProvider({ children }) {
  const regRef = useRef(undefined)
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, reg) {
      regRef.current = reg
      // 開啟 App 即主動檢查一次新版：抓到新版 → needRefresh 轉 true → 頂部橫幅浮現。
      // 離線或暫時失敗會 reject，吞掉即可（不影響設定頁手動檢查）。
      reg?.update().catch(() => {})
    },
  })

  // idle / checking / latest / available / error
  const [checkResult, setCheckResult] = useState('idle')
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled] = useState(detectStandalone)
  const isIOS = detectIOS()

  useEffect(() => {
    const onBeforeInstall = (e) => {
      // 攔下瀏覽器預設的安裝橫幅，改由設定頁按鈕觸發
      e.preventDefault()
      setDeferredPrompt(e)
    }
    const onInstalled = () => {
      setDeferredPrompt(null)
      setInstalled(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // 載入時 SW 主動回報有等待中的新版 → 同步為「有新版」（不靠使用者先按檢查）
  useEffect(() => {
    if (needRefresh) setCheckResult('available')
  }, [needRefresh])

  const checkForUpdate = useCallback(async () => {
    const reg = regRef.current
    if (!reg) {
      // 沒有 SW（dev 模式或瀏覽器不支援）→ 視為暫時無法檢查
      setCheckResult('error')
      return
    }
    setCheckResult('checking')
    try {
      await reg.update()
      // update() 後若已有 installing/waiting 代表抓到新版；needRefresh 是非同步到位的後備判斷
      const hasNew = !!reg.installing || !!reg.waiting || needRefresh
      setCheckResult(hasNew ? 'available' : 'latest')
    } catch {
      setCheckResult('error')
    }
  }, [needRefresh])

  const applyUpdate = useCallback(() => {
    // 觸發 skipWaiting 並重新載入到新版本
    updateServiceWorker(true)
  }, [updateServiceWorker])

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }, [deferredPrompt])

  const value = {
    version: __APP_VERSION__,
    builtAt: __APP_BUILT_AT__,
    needRefresh,
    checkResult,
    checkForUpdate,
    applyUpdate,
    canInstall: !!deferredPrompt && !installed,
    installed,
    isIOS,
    promptInstall,
  }

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>
}

export function usePwa() {
  const ctx = useContext(PwaContext)
  if (!ctx) throw new Error('usePwa 必須在 <PwaProvider> 內使用')
  return ctx
}
