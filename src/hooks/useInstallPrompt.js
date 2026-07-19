import { useEffect, useState } from 'react'

// PWA 安裝提示（階段 7）：Chromium 走 beforeinstallprompt；iOS 無此事件，
// 回報 isIos 供 UI 顯示「分享 → 加入主畫面」指引。
export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null)
  const [installed, setInstalled] = useState(false)

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  // iPadOS 13+ 的 Safari 回報 MacIntel，需再看 maxTouchPoints
  const isIos =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault()
      setPromptEvent(e)
    }
    const onInstalled = () => {
      setPromptEvent(null)
      setInstalled(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!promptEvent) return
    promptEvent.prompt()
    await promptEvent.userChoice
    setPromptEvent(null)
  }

  return { canInstall: !!promptEvent, install, isIos, isStandalone: standalone || installed }
}
