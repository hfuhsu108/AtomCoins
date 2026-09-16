import { useMemo } from 'react'
import { useCollection, useSettings } from '../db/DataProvider'
import { unseenInvoices } from '../lib/unseenInvoices'

// 尚未看過的新發票（判定見 lib/unseenInvoices）。導覽列「明細」、明細頁「發票載具」分頁
// 與發票面板共用同一份，亮紅點與標已讀才不會各算各的。
export default function useUnseenInvoices() {
  const invoices = useCollection('invoices')
  const settings = useSettings()
  // settings 還沒載入時不知道已讀時間，先當沒有新發票，免得每次開 App 紅點都閃一下
  return useMemo(
    () => (settings ? unseenInvoices(invoices, settings.invoiceSeenAt) : []),
    [invoices, settings],
  )
}
