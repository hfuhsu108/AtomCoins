import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../../db/DataProvider'
import { createTag, updateTag, deleteTagCleanup } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { useConfirm } from '../ConfirmSheet'
import { CATEGORY_COLORS } from '../../lib/icons'
import Sheet from '../Sheet'
import TagChip from '../TagChip'

// 標籤新增/編輯。tag=null 為新增。
// 刪除不像借貸對象那樣「有引用就擋下」——標籤只是標記，移除不動到任何金額，
// 所以直接把引用清掉（repo.deleteTagCleanup），只在確認框告知會影響幾筆。
// 交易自己訂閱而不靠 prop：這個 Sheet 也從記帳表單的標籤選擇器開啟，那裡沒有交易清單。
// 刪除確認文案：本 Sheet 與標籤清單的左滑抽屜共用，避免兩處說法不一致
export function tagDeleteMessage(tag, refCount) {
  return refCount > 0
    ? `刪除「${tag.name}」？有 ${refCount} 筆記錄使用它，標籤會從那些記錄上移除（記錄本身不會被刪）。`
    : `刪除「${tag.name}」？`
}

export default function TagEditSheet({ open, tag = null, onClose }) {
  const txns = useCollection('transactions')
  const isNew = !tag
  const [name, setName] = useState(tag?.name ?? '')
  const [color, setColor] = useState(tag?.color ?? null)

  // 切換編輯對象時重置（仿 CategoryEditSheet）
  const key = tag?.id ?? '__new__'
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setName(tag?.name ?? '')
    setColor(tag?.color ?? null)
  }

  const { run, busy, error } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  // 引用筆數以「交易」為單位：同一筆的多個拆帳列掛同一標籤只算一次
  const refCount = tag
    ? txns.filter(
      (t) =>
        (t.tagIds ?? []).includes(tag.id) ||
          (t.splits ?? []).some((s) => (s.tagIds ?? []).includes(tag.id)),
    ).length
    : 0
  const canSave = name.trim().length > 0

  const save = () => {
    if (!canSave) return
    run(async () => {
      const data = { name: name.trim(), color }
      if (isNew) await settle(createTag(data))
      else await settle(updateTag(tag.id, data))
      onClose()
    })
  }

  const handleDelete = async () => {
    if (!tag) return
    const message = tagDeleteMessage(tag, refCount)
    if (!(await confirm({ title: '刪除標籤', message, danger: true }))) return
    run(async () => {
      await settle(deleteTagCleanup(tag.id))
      onClose()
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title={isNew ? '新增標籤' : '編輯標籤'} bodyClassName="overflow-y-auto">
      <div className="p-[18px] flex flex-col gap-4">
        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">名稱</div>
          <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="專案或主題，例如：福岡自由行"
              className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary"
            />
          </div>
          {refCount > 0 && (
            <div className="text-[11px] text-text-tertiary mt-1">
              有 {refCount} 筆記錄使用這個標籤，改名後全部一起更新
            </div>
          )}
        </div>

        {/* 顏色 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13px] text-text-secondary">顏色</span>
            <button
              onClick={() => setColor(null)}
              className={`text-[12px] font-medium ${color == null ? 'text-brand' : 'text-text-tertiary'}`}
            >
              無（中性色）
            </button>
          </div>
          <div className="grid grid-cols-8 gap-2 justify-items-center">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ background: c }}
                className={`w-8 h-8 rounded-full flex items-center justify-center ${color === c ? 'ring-2 ring-offset-2 ring-offset-surface' : ''}`}
              >
                {color === c && <FontAwesomeIcon icon={faCheck} className="text-white text-xs" />}
              </button>
            ))}
          </div>
        </div>

        {/* 預覽：與記帳表單、明細列共用同一個 chip 元件 */}
        <div className="flex items-center gap-2">
          <TagChip tag={{ name: name.trim() || '預覽', color }} />
        </div>

        {error && <div className="text-[13px] text-error px-1">{error}</div>}
        <div className="flex items-center gap-2 mt-1">
          {tag && (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="flex items-center justify-center h-[42px] w-[42px] flex-none rounded-btn bg-surface border border-line text-error disabled:opacity-40"
              title="刪除標籤"
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
