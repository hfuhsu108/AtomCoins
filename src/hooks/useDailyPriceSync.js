import { useEffect, useRef } from 'react'
import { useCollection, useSettings } from '../db/DataProvider'
import { computeHoldings } from '../lib/stock'
import { syncStockPrices, GAS_STOCK_PROXY_URL } from '../lib/priceSync'
import { todayStr } from '../lib/date'

// 每日開啟自動同步一次（docs/05 階段4）：當日尚未同步 + 有持股 → 抓一次。
// 失敗靜默（錯誤留給手動同步顯示），非阻塞；用 ref 防重入（含 StrictMode 二次掛載）。
export default function useDailyPriceSync() {
  const settings = useSettings()
  const stockTxns = useCollection('stockTransactions')
  const prices = useCollection('stockPrices')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current || !settings) return
    // lastPriceSyncAt 存 ISO（UTC）；以「本地日」比對才不會在午夜前後誤判當日是否已同步
    const lastDay = settings.lastPriceSyncAt ? todayStr(new Date(settings.lastPriceSyncAt)) : null
    if (lastDay === todayStr()) return

    const { holdings } = computeHoldings(stockTxns, prices, {})
    const symbols = [...new Set(holdings.map((h) => h.symbol))]
    if (symbols.length === 0) return

    ran.current = true // 先鎖再打，避免 settings 更新導致的重入
    syncStockPrices({ proxyUrl: GAS_STOCK_PROXY_URL, symbols }).catch(() => {})
  }, [settings, stockTxns, prices])
}
