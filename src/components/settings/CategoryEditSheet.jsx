import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { createCategory, updateCategory, deleteCategoryReassign } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { useConfirm } from '../ConfirmSheet'
import { getIcon, CATEGORY_ICON_NAMES, CATEGORY_COLORS } from '../../lib/icons'
import { UNCATEGORIZED_EXPENSE_ID, UNCATEGORIZED_INCOME_ID, FEE_CATEGORY_ID } from '../../db/seed'
import Sheet from '../Sheet'

const PROTECTED = new Set([UNCATEGORIZED_EXPENSE_ID, UNCATEGORIZED_INCOME_ID, FEE_CATEGORY_ID])

// 分類新增/編輯（docs/09 後續調整）。category=null 為新增；kind/parentId 決定新增的歸屬。
// 名稱必填；圖示與顏色可留空（子分類留空＝沿用母分類圖示、中性色）。
export default function CategoryEditSheet({ open, category, kind, parentId = null, categories, onClose }) {
  const isNew = !category
  const isChild = isNew ? parentId != null : category?.parentId != null

  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? null)
  const [color, setColor] = useState(category?.color ?? null)

  // 切換編輯對象時重置
  const key = category?.id ?? `new-${parentId ?? 'root'}`
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setName(category?.name ?? '')
    setIcon(category?.icon ?? null)
    setColor(category?.color ?? null)
  }

  const { run, busy, error } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  const childIds = category ? categories.filter((c) => c.parentId === category.id).map((c) => c.id) : []
  const deletable = category && !PROTECTED.has(category.id) && !childIds.some((id) => PROTECTED.has(id))
  const canSave = name.trim().length > 0

  const save = () => {
    if (!canSave) return
    run(async () => {
      if (isNew) {
        const k = kind
        const siblings = categories.filter((c) => c.kind === k && (c.parentId ?? null) === (parentId ?? null))
        const sortOrder = siblings.length ? Math.max(...siblings.map((c) => c.sortOrder ?? 0)) + 1 : 0
        await settle(createCategory({ kind: k, parentId: parentId ?? null, name: name.trim(), icon: icon ?? null, color: color ?? null, sortOrder }))
      } else {
        await settle(updateCategory(category.id, { name: name.trim(), icon: icon ?? null, color: color ?? null }))
      }
      onClose()
    })
  }

  const handleDelete = async () => {
    if (!category) return
    if (!deletable) {
      await confirm({ title: '無法刪除', message: '系統內建的「未分類／手續費」分類為其他資料的退路，不可刪除，可改用封存。', alert: true, confirmLabel: '知道了' })
      return
    }
    const hasChild = childIds.length > 0
    const msg = `刪除分類「${category.name}」${hasChild ? `及其 ${childIds.length} 個子分類` : ''}？被它記錄的交易會改歸「未分類」，此動作無法復原。`
    if (!(await confirm({ title: '刪除分類', message: msg, danger: true }))) return
    run(async () => {
      await settle(deleteCategoryReassign(category))
      onClose()
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title={isNew ? (isChild ? '新增子分類' : '新增分類') : '編輯分類'} bodyClassName="overflow-y-auto">
      <div className="p-[18px] flex flex-col gap-4">
        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">名稱</div>
          <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：餐飲"
              className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary"
            />
          </div>
        </div>

        {/* 圖示 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13px] text-text-secondary">圖示</span>
            {isChild && (
              <button
                onClick={() => setIcon(null)}
                className={`text-[12px] font-medium ${icon == null ? 'text-brand' : 'text-text-tertiary'}`}
              >
                沿用母分類
              </button>
            )}
          </div>
          <div className="grid grid-cols-8 gap-1.5 max-h-[180px] overflow-y-auto p-1 bg-surface border border-line rounded-modal">
            {CATEGORY_ICON_NAMES.map((n) => {
              const active = icon === n
              return (
                <button
                  key={n}
                  onClick={() => setIcon(n)}
                  style={active && color ? { background: color, color: '#fff' } : undefined}
                  className={`aspect-square rounded-btn flex items-center justify-center text-[15px] ${
                    active ? (color ? '' : 'bg-brand text-white') : 'bg-surface-alt text-text-secondary'
                  }`}
                >
                  <FontAwesomeIcon icon={getIcon(n)} />
                </button>
              )
            })}
          </div>
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
          <div className="flex flex-wrap gap-2">
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

        {/* 預覽 */}
        <div className="flex items-center gap-3">
          <span
            className="w-11 h-11 flex-none rounded-btn flex items-center justify-center text-[17px]"
            style={color ? { background: `color-mix(in srgb, ${color} 15%, transparent)`, color } : undefined}
          >
            <FontAwesomeIcon icon={getIcon(icon)} className={color ? '' : 'text-text-secondary'} />
          </span>
          <span className="text-[15px] font-medium">{name.trim() || '預覽'}</span>
        </div>

        {error && <div className="text-[13px] text-error px-1">{error}</div>}
        <div className="flex items-center gap-2 mt-1">
          {category && (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="flex items-center justify-center h-[42px] w-[42px] flex-none rounded-btn bg-surface border border-line text-error disabled:opacity-40"
              title="刪除分類"
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
