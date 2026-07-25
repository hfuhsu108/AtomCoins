import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../../db/DataProvider'
import { createCounterparty, updateCounterparty, deleteCounterparty } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { useConfirm } from '../ConfirmSheet'
import Sheet from '../Sheet'

// 借貸對象新增/編輯。counterparty=null 為新增。
// 刪除只在完全沒有借還款引用時開放——對象沒有「未分類」那種退路，連動刪交易等於抹掉
// 真實的債權債務，改歸又無處可歸，所以擋下並要求先處理那些記錄（repo 端另有同樣的守衛）。
// 交易自己訂閱而不靠 prop：這個 Sheet 也從記帳表單的對象選擇器開啟，那裡沒有交易清單。
export default function CounterpartyEditSheet({ open, counterparty = null, onClose }) {
  const txns = useCollection('transactions')
  const isNew = !counterparty
  const [name, setName] = useState(counterparty?.name ?? '')

  // 切換編輯對象時重置（仿 CategoryEditSheet）
  const key = counterparty?.id ?? '__new__'
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setName(counterparty?.name ?? '')
  }

  const { run, busy, error } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  const refCount = counterparty ? txns.filter((t) => t.counterpartyId === counterparty.id).length : 0
  const canSave = name.trim().length > 0

  const save = () => {
    if (!canSave) return
    run(async () => {
      if (isNew) await settle(createCounterparty({ name: name.trim() }))
      else await settle(updateCounterparty(counterparty.id, { name: name.trim() }))
      onClose()
    })
  }

  const handleDelete = async () => {
    if (!counterparty) return
    if (refCount > 0) {
      await confirm({
        title: '無法刪除',
        message: `「${counterparty.name}」仍有 ${refCount} 筆借還款記錄。請先刪除那些記錄或改指其他對象，再刪除這個對象。`,
        alert: true,
        confirmLabel: '知道了',
      })
      return
    }
    if (!(await confirm({ title: '刪除對象', message: `刪除「${counterparty.name}」？`, danger: true }))) return
    run(async () => {
      await settle(deleteCounterparty(counterparty.id))
      onClose()
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title={isNew ? '新增對象' : '編輯對象'} bodyClassName="overflow-y-auto">
      <div className="p-[18px] flex flex-col gap-4">
        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">名稱</div>
          <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="姓名或群組，例如：小明、日本旅行團"
              className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary"
            />
          </div>
          {refCount > 0 && (
            <div className="text-[11px] text-text-tertiary mt-1">
              有 {refCount} 筆借還款記錄使用這個對象，改名後全部一起更新
            </div>
          )}
        </div>

        {error && <div className="text-[13px] text-error px-1">{error}</div>}
        <div className="flex items-center gap-2 mt-1">
          {counterparty && (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="flex items-center justify-center h-[42px] w-[42px] flex-none rounded-btn bg-surface border border-line text-error disabled:opacity-40"
              title="刪除對象"
            >
              <FontAwesomeIcon icon={faTrashCan} className="text-sm" />
            </button>
          )}
          <button
            onClick={save}
            disabled={!canSave || busy}
            className="flex-1 flex items-center justify-center gap-1.5 h-[42px] rounded-btn bg-brand text-white text-[13px] font-semibold disabled:opacity-40"
          >
            <FontAwesomeIcon icon={faCheck} className="text-xs" /> 儲存
          </button>
        </div>
      </div>
      {confirmElement}
    </Sheet>
  )
}
