import { useState, useCallback } from 'react'
import { useCollection, useSettings } from '../db/DataProvider'
import { computeHoldings } from '../lib/stock'
import { syncStockPrices, GAS_STOCK_PROXY_URL } from '../lib/priceSync'

// 手動同步股價的共用 hook（供 StockPanel、ReportsPage）。
// 標的取自「目前持股」的相異 symbol；proxyUrl 為寫死常數（見 lib/priceSync）。
// 回傳 { sync, syncing, result, lastSyncAt }；sync 期間以 syncing 防重入。
export default function useSyncPrices() {
  const settings = useSettings()
  const stockTxns = useCollection('stockTransactions')
  const prices = useCollection('stockPrices')
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState(null)

  const sync = useCallback(async () => {
    if (syncing) return
    const { holdings } = computeHoldings(stockTxns, prices, {})
    const symbols = [...new Set(holdings.map((h) => h.symbol))]
    setSyncing(true)
    const r = await syncStockPrices({ proxyUrl: GAS_STOCK_PROXY_URL, symbols })
    setResult(r)
    setSyncing(false)
    return r
  }, [syncing, stockTxns, prices])

  return {
    sync,
    syncing,
    result,
    lastSyncAt: settings?.lastPriceSyncAt ?? null,
  }
}
