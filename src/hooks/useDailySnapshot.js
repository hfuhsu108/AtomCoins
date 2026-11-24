import { useEffect } from 'react'
import { useAuth } from './useAuth'
import { useCollection, useSettings, useSynced } from '../db/DataProvider'
import { upsertNetWorthSnapshot } from '../db/repo'
import { todayStr } from '../lib/date'
import useNetWorth from './useNetWorth'

// 淨資產每日快照（docs/09 批次 1/6a）：登入且資料就緒（settings 單例已載入）、
// 當日尚無快照 → 寫入今日 doc。趨勢圖資料自啟用日起累積。
// 模組級防重入（仿 DataProvider startupRanFor）：同日同 uid 只寫一次，避免每次 render 觸發；
// 寫入前另查 netWorthSnapshots 有無今日 doc（重整後 module 變數已重置但 doc 仍在 → 不重寫）。
let snapshotRanFor = null

// 淨資產算式用到的全部 collection，加上用來判斷「今日已寫過」的快照本身。
// 少等任何一個，就可能拿空陣列算出偏低的總額，或誤判今日還沒寫而覆寫
const NEEDED = ['settings', 'netWorthSnapshots', 'accounts', 'transactions', 'stockTransactions', 'stockPrices']

export default function useDailySnapshot() {
  const user = useAuth()
  const settings = useSettings()
  const snapshots = useCollection('netWorthSnapshots')
  const ready = useSynced(NEEDED)
  const { total, holdingsValue } = useNetWorth()

  useEffect(() => {
    if (!user || !settings || !ready) return
    const day = todayStr()
    const key = `${user.uid}:${day}`
    if (snapshotRanFor === key) return
    // 今日已有快照：鎖住並跳過，reload 後不重複寫（createdAt 維持不變）
    if (snapshots.some((s) => s.id === day)) {
      snapshotRanFor = key
      return
    }
    snapshotRanFor = key // 先鎖再寫，避免 total 更新造成重入
    upsertNetWorthSnapshot({ date: day, total, holdingsValue }).catch((e) => {
      console.error('淨資產快照寫入失敗', e)
      snapshotRanFor = null // 失敗解鎖，容後重試
    })
  }, [user, settings, ready, snapshots, total, holdingsValue])
}
