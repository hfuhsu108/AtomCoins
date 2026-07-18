import { useState } from 'react'

// Firestore 離線寫入：本地快取立即生效、listener 立刻反映，但 await 的 promise 要等
// 連線後 server ack 才 resolve——離線存檔會讓 await 永久 pending。故寫入以 settle() 包裝：
// 4 秒內沒結果就視為「已排入離線佇列」照常收尾（上線後自動同步）；真正 reject（權限/
// 驗證錯誤，通常很快）才浮現錯誤。
const OFFLINE_TIMEOUT_MS = 4000

export function settle(promise) {
  // 逾時後 promise 才 reject 會變 unhandledrejection，先吞掉（此情境視為離線佇列，非使用者可修）
  promise.catch(() => {})
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(resolve, OFFLINE_TIMEOUT_MS)),
  ])
}

// 包住寫入動作：busy 防連點＋供按鈕 disabled，error 給行內顯示。
// 成功後的收尾（關表單等）放進 fn 內部，失敗就不會執行。
export function useAsyncAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const run = async (fn) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e?.message ?? '操作失敗，請再試一次')
    } finally {
      setBusy(false)
    }
  }
  return { run, busy, error }
}
