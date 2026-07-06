import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCollection } from '../db/DataProvider'
import { deleteTransaction, deleteTransactionGroup, deleteInstallmentPlan, deleteStockTransaction } from '../db/repo'
import TransactionForm from '../components/transaction/TransactionForm'

// 記帳頁：無 id=新增；帶 ?id= 進入編輯（畫面2）；帶 ?stxId= 編輯股票交易；帶 ?invoiceId= 從發票歸帳。
export default function AddTransactionPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('id')
  const stxId = params.get('stxId')
  const invoiceId = params.get('invoiceId')
  const close = () => navigate(-1)

  const txns = useCollection('transactions')
  const stockTxns = useCollection('stockTransactions')
  const invoices = useCollection('invoices')
  // find 未命中回 undefined＝資料尚未到（或 id 無效），語義同原 useLiveQuery 載入中
  const editTx = id ? txns.find((t) => t.id === id) : null
  const editStock = stxId ? stockTxns.find((t) => t.id === stxId) : null
  const editInvoice = invoiceId ? invoices.find((i) => i.id === invoiceId) : null

  if (id && editTx === undefined) return null
  if (stxId && editStock === undefined) return null
  if (invoiceId && editInvoice === undefined) return null

  const handleDelete = async () => {
    if (editStock) {
      if (!window.confirm('確定刪除這筆股票交易？')) return
      await deleteStockTransaction(editStock.id)
      close()
      return
    }
    if (!editTx) return
    const planId = editTx.installmentPlanId
    const linked = !!editTx.linkGroupId
    const msg = planId
      ? '這筆屬於分期方案，將一併刪除全額消費與所有期款。確定刪除？'
      : linked
        ? '這筆與代墊／分帳的另一筆相連，將一併刪除整組。確定刪除？'
        : '確定刪除這筆記錄？'
    if (!window.confirm(msg)) return
    if (planId) await deleteInstallmentPlan(planId)
    else if (linked) await deleteTransactionGroup(editTx.linkGroupId)
    else await deleteTransaction(editTx.id)
    close()
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
        />
      </div>
    </div>
  )
}
