import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCollection } from '../db/DataProvider'
import { deleteTransaction, deleteTransactionGroup, deleteInstallmentPlan, deleteStockTransaction, unrecordInvoice } from '../db/repo'
import { useAsyncAction, settle } from '../hooks/useAsyncAction'
import { useConfirm } from '../components/ConfirmSheet'
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
  // hooks 必須在任何 early return 之前呼叫（rules-of-hooks）
  const { run: runDelete, busy: deleteBusy, error: deleteError } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  // find 未命中回 undefined＝資料尚未到（或 id 無效），語義同原 useLiveQuery 載入中
  const editTx = id ? txns.find((t) => t.id === id) : null
  const editStock = stxId ? stockTxns.find((t) => t.id === stxId) : null
  const editInvoice = invoiceId ? invoices.find((i) => i.id === invoiceId) : null

  if (id && editTx === undefined) return null
  if (stxId && editStock === undefined) return null
  if (invoiceId && editInvoice === undefined) return null

  const handleDelete = async () => {
    if (editStock) {
      if (!(await confirm({ title: '刪除股票交易', message: '確定刪除這筆股票交易？', danger: true }))) return
      runDelete(async () => {
        await settle(deleteStockTransaction(editStock.id))
        close()
      })
      return
    }
    if (!editTx) return
    // 歸帳產生的交易：改走取消歸帳（原子刪交易含整組＋發票退回 inbox），
    // 直接刪會讓 recorded 發票指向已刪交易、之後無法重新歸帳
    if (editTx.invoiceId) {
      const inv = invoices.find((i) => i.id === editTx.invoiceId)
      if (inv) {
        if (!(await confirm({ title: '刪除交易', message: '這筆交易由發票歸帳產生：將刪除交易（含關聯筆）並把發票退回未歸帳。確定刪除？', danger: true }))) return
        runDelete(async () => {
          await settle(unrecordInvoice(inv))
          close()
        })
        return
      }
      // 發票已被刪 → 落回一般刪除路徑
    }
    const planId = editTx.installmentPlanId
    const linked = !!editTx.linkGroupId
    const msg = planId
      ? '這筆屬於分期方案，將一併刪除全額消費與所有期款。確定刪除？'
      : linked
        ? '這筆與代墊／分帳的另一筆相連，將一併刪除整組。確定刪除？'
        : '確定刪除這筆記錄？'
    if (!(await confirm({ title: '刪除記錄', message: msg, danger: true }))) return
    runDelete(async () => {
      if (planId) await settle(deleteInstallmentPlan(planId))
      else if (linked) await settle(deleteTransactionGroup(editTx.linkGroupId))
      else await settle(deleteTransaction(editTx.id))
      close()
    })
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
