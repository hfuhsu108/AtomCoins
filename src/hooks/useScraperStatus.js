import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { firestore } from '../lib/firebase'
import { useAuth } from './useAuth'

// 爬蟲同步健康度：users/{uid}/meta/scraperStatus（爬蟲每日以 firebase-admin 寫入）。
// 此文件不在 DataProvider 全域訂閱（meta 不在 COLLECTIONS，且文件無 id 欄），故獨立訂閱。
// 回傳：文件資料物件、null（未登入/尚無文件）、undefined（載入中）。
export function useScraperStatus() {
  const user = useAuth()
  const [status, setStatus] = useState(undefined)

  useEffect(() => {
    if (!user) {
      setStatus(user === null ? null : undefined)
      return
    }
    const ref = doc(firestore, 'users', user.uid, 'meta', 'scraperStatus')
    return onSnapshot(
      ref,
      (snap) => setStatus(snap.exists() ? snap.data() : null),
      (err) => {
        console.error('[useScraperStatus] 訂閱失敗', err)
        setStatus(null)
      },
    )
  }, [user])

  return status
}
