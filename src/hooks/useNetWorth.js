import { useMemo } from 'react'
import { useCollection } from '../db/DataProvider'
import { netWorth } from '../lib/engine'
import { computeHoldings, holdingsMarketValue } from '../lib/stock'
import { todayStr } from '../lib/date'

// 淨資產單一口徑（docs/09 批次 1、6）：首頁顯示、每日快照、趨勢圖共用同一算式，
// 不複製兩份。asOf 預設今天；回傳 { total, holdingsValue, holdings }。
export default function useNetWorth(asOf = todayStr()) {
  const accounts = useCollection('accounts')
  const txns = useCollection('transactions')
  const stockTxns = useCollection('stockTransactions')
  const stockPrices = useCollection('stockPrices')

  return useMemo(() => {
    const { holdings } = computeHoldings(stockTxns, stockPrices, { asOf })
    const holdingsValue = holdingsMarketValue(holdings)
    const total = netWorth(accounts, txns, { holdingsValue, asOf, stockTxns })
    return { total, holdingsValue, holdings }
  }, [accounts, txns, stockTxns, stockPrices, asOf])
}
