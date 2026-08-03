import { useSearchParams } from 'react-router-dom'
import { useCollection } from '../db/DataProvider'
import useCloseView from '../hooks/useCloseView'
import useDeleteTransaction from '../hooks/useDeleteTransaction'
import TransactionForm from '../components/transaction/TransactionForm'

// 記帳頁：無 id=新增；帶 ?id= 進入編輯（畫面2）；帶 ?stxId= 編輯股票交易；帶 ?invoiceId= 從發票歸帳。
export default function AddTransactionPage() {
  const [params] = useSearchParams()
  const id = params.get('id')
  const stxId = params.get('stxId')
  const invoiceId = params.get('invoiceId')
  // 從 PWA 捷徑／推播冷啟動時本頁是第一筆 history，回不去就落回首頁（見 useCloseView）
  const close = useCloseView()

  const txns = useCollection('transactions')
  const stockTxns = useCollection('stockTransactions')
  const invoices = useCollection('invoices')
  // hooks 必須在任何 early return 之前呼叫（rules-of-hooks）
  const { requestDelete, confirmElement, busy: deleteBusy, error: deleteError } = useDeleteTransaction()

  // find 未命中回 undefined＝資料尚未到（或 id 無效），語義同原 useLiveQuery 載入中
  const editTx = id ? txns.find((t) => t.id === id) : null
  const editStock = stxId ? stockTxns.find((t) => t.id === stxId) : null
  const editInvoice = invoiceId ? invoices.find((i) => i.id === invoiceId) : null

  if (id && editTx === undefined) return null
  if (stxId && editStock === undefined) return null
  if (invoiceId && editInvoice === undefined) return null

  const handleDelete = async () => {
    const target = editStock ?? editTx
    if (await requestDelete(target, editStock ? 'stock' : 'tx')) close()
  }

  return (
    <div className="fixed inset-0 z-50 bg-app-bg lg:bg-[rgba(17,20,24,0.45)] lg:flex lg:items-center lg:justify-center">
      <div className="w-full h-full lg:w-[760px] lg:h-[88vh] lg:max-h-[860px] lg:rounded-modal lg:overflow-hidden lg:shadow-modal bg-app-bg">
        <TransactionForm
          initialTx={editTx ?? null}
          initialStock={editStock ?? null}
          initialInvoice={editInvoice ?? null}
          onClose={close}
          onSaved={close}
          onDelete={id || stxId ? handleDelete : undefined}
          deleteBusy={deleteBusy}
          deleteError={deleteError}
        />
      </div>
      {confirmElement}
    </div>
  )
}
