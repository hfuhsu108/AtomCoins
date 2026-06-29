import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { deleteTransaction, deleteTransactionGroup } from '../db/repo'
import TransactionForm from '../components/transaction/TransactionForm'

// 記帳頁：無 id=新增；帶 ?id= 進入編輯（畫面2）。手機全螢幕、桌面置中 modal。
export default function AddTransactionPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('id')
  const close = () => navigate(-1)

  // 編輯模式才查；id 為 null 時回傳 null（非 undefined）
  const editTx = useLiveQuery(() => (id ? db.transactions.get(id) : null), [id])

  // 載入中（查詢未回）先不渲染，避免用初值建表單後又被覆蓋
  if (id && editTx === undefined) return null

  const handleDelete = async () => {
    if (!editTx) return
    const linked = !!editTx.linkGroupId
    const msg = linked
      ? '這筆與代墊／分帳的另一筆相連，將一併刪除整組。確定刪除？'
      : '確定刪除這筆記錄？'
    if (!window.confirm(msg)) return
    if (linked) await deleteTransactionGroup(editTx.linkGroupId)
    else await deleteTransaction(editTx.id)
    close()
  }

  return (
    <div className="fixed inset-0 z-50 bg-app-bg lg:bg-[rgba(17,20,24,0.45)] lg:flex lg:items-center lg:justify-center">
      <div className="w-full h-full lg:w-[760px] lg:h-auto lg:max-h-[860px] lg:rounded-modal lg:overflow-hidden lg:shadow-modal bg-app-bg">
        <TransactionForm
          initialTx={editTx ?? null}
          onClose={close}
          onSaved={close}
          onDelete={id ? handleDelete : undefined}
        />
      </div>
    </div>
  )
}
