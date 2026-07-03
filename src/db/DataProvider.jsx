// 讀取層基礎（docs/07 §2-1）：登入後對每個 collection 開 onSnapshot 整包訂閱進 context，
// M2 起頁面改用 useCollection(name)＋沿用既有 JS filter/聚合，取代逐條翻譯 Firestore query。
// 個人資料量（萬筆級）記憶體毫無壓力；persistentLocalCache 讓後續載入幾乎都吃本地快取。
import { createContext, useContext, useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { firestore } from '../lib/firebase'
import { useAuth } from '../hooks/useAuth'
import { processRecurringRules } from '../lib/recurring'
import { SETTINGS_ID } from './seed'

export const COLLECTIONS = [
  'accounts', 'categories', 'tags', 'projects', 'counterparties',
  'transactions', 'invoices', 'brokers', 'stockTransactions', 'stockPrices',
  'settings', 'creditCardStatements', 'installmentPlans', 'recurringRules',
]

const EMPTY = Object.freeze(Object.fromEntries(COLLECTIONS.map((n) => [n, []])))

const DataContext = createContext(EMPTY)

// 模組級防重入：StrictMode 雙掛載或 Provider 重建時，同一 uid 的登入後啟動任務只跑一次，
// 避免 processRecurringRules 並發雙跑造成重複入帳（原本在 main.jsx 啟動期只跑一次的等價保證）
let startupRanFor = null

export function DataProvider({ children }) {
  const user = useAuth()
  const [data, setData] = useState(EMPTY)

  useEffect(() => {
    if (!user || startupRanFor === user.uid) return
    startupRanFor = user.uid
    processRecurringRules().catch((e) => console.error('週期性收支處理失敗', e))
  }, [user])

  useEffect(() => {
    // undefined（確認中）與 null（未登入）都不訂閱；登出時清空避免殘留上一位使用者資料
    if (!user) {
      setData(EMPTY)
      return
    }
    const unsubs = COLLECTIONS.map((name) =>
      onSnapshot(
        collection(firestore, 'users', user.uid, name),
        (snap) => setData((prev) => ({ ...prev, [name]: snap.docs.map((d) => d.data()) })),
        // 訂閱錯誤（rules 拒絕、斷線逾時）浮現到 console，不吞錯；M2 切換後再視需要接 UI
        (err) => console.error(`[DataProvider] ${name} 訂閱失敗`, err),
      ),
    )
    return () => unsubs.forEach((u) => u())
  }, [user])

  return <DataContext.Provider value={data}>{children}</DataContext.Provider>
}

export function useCollection(name) {
  const data = useContext(DataContext)
  if (!(name in data)) throw new Error(`未知的 collection：${name}`)
  return data[name]
}

// settings 單例（docId=SETTINGS_ID）；未載入/未登入回 undefined，語義同原 db.settings.get()
export function useSettings() {
  return useCollection('settings').find((s) => s.id === SETTINGS_ID)
}
