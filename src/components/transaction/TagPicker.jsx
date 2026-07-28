import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faPlus, faTag, faPen, faXmark } from '@fortawesome/free-solid-svg-icons'
import { createTag } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { newId } from '../../lib/id'
import Sheet from '../Sheet'
import TagEditSheet from '../settings/TagEditSheet'

// 標籤沒有天然順序，一律依名稱排（中文要 Collator，直接比字串是 UTF-16 碼位序）
const TAG_COLLATOR = new Intl.Collator('zh-Hant')

// 標籤選擇器（多選）。輸入框一框兩用：既過濾清單，也是新增來源。
// 與單選的 CategoryPicker/CounterpartyPicker 不同，點選不關閉 Sheet，靠底部「完成」結束。
// manage=false 時只能選（搜尋篩選情境不需要在那裡建標籤或改名）。
export default function TagPicker({ open, onClose, tags, value = [], onToggle, manage = true }) {
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(null)
  const { run, busy, error } = useAsyncAction()

  const q = name.trim().toLowerCase()
  const list = tags
    .filter((t) => !q || (t.name ?? '').toLowerCase().includes(q))
    .sort((a, b) => TAG_COLLATOR.compare(a.name ?? '', b.name ?? ''))
  // 同名已存在就不給新增，避免打字過程中建出重複標籤
  const exists = tags.some((t) => (t.name ?? '').trim().toLowerCase() === q)
  const canAdd = manage && !!q && !exists

  const addNew = () => {
    if (!canAdd) return
    // 先產生 id 再寫入：settle 離線逾時仍能取得 id 選回（不依賴 createTag 的回傳）
    const id = newId()
    run(async () => {
      await settle(createTag({ name: name.trim(), color: null, id }))
      setName('')
      onToggle(id)
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title="選擇標籤" bodyClassName="flex flex-col">
      <div className="flex gap-2 p-3 border-b border-line">
        <div className="flex-1 flex items-center gap-2 h-10 px-3 rounded-btn bg-surface-alt">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addNew()}
            placeholder={manage ? '搜尋或新增標籤' : '搜尋標籤'}
            className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-text-tertiary"
          />
          {name && (
            <button onClick={() => setName('')} className="flex-none text-text-tertiary">
              <FontAwesomeIcon icon={faXmark} className="text-sm" />
            </button>
          )}
        </div>
        {canAdd && (
          <button
            onClick={addNew}
            disabled={busy}
            className="h-10 px-4 flex-none rounded-btn bg-brand text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-40"
          >
            <FontAwesomeIcon icon={faPlus} className="text-xs" /> 新增
          </button>
        )}
      </div>
      {error && <div className="px-3 pt-2 text-[13px] text-error">{error}</div>}

      <div className="flex-1 overflow-y-auto p-2">
        {tags.length === 0 ? (
          <div className="py-8 text-center text-text-tertiary text-sm">
            {manage ? '尚無標籤，於上方輸入新增' : '尚無標籤'}
          </div>
        ) : list.length === 0 ? (
          <div className="py-8 text-center text-text-tertiary text-sm">找不到符合的標籤</div>
        ) : (
          list.map((tag) => {
            const active = value.includes(tag.id)
            return (
              <div
                key={tag.id}
                className={`flex items-center gap-3 w-full pr-1 rounded-chip ${active ? 'bg-brand-light' : ''}`}
              >
                <button
                  onClick={() => onToggle(tag.id)}
                  className="flex items-center gap-3 flex-1 min-w-0 p-3 text-left"
                >
                  <span
                    className={`w-9 h-9 flex-none rounded-chip flex items-center justify-center ${tag.color ? '' : 'bg-surface-alt text-text-secondary'}`}
                    style={tag.color ? { background: `color-mix(in srgb, ${tag.color} 15%, transparent)`, color: tag.color } : undefined}
                  >
                    <FontAwesomeIcon icon={faTag} className="text-sm" />
                  </span>
                  <span className={`flex-1 truncate text-[15px] ${active ? 'font-semibold text-brand' : 'font-medium'}`}>
                    {tag.name}
                  </span>
                  {active && <FontAwesomeIcon icon={faCheck} className="text-brand text-[13px]" />}
                </button>
                {manage && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditing(tag)
                    }}
                    className="w-8 h-8 flex-none flex items-center justify-center text-text-tertiary"
                  >
                    <FontAwesomeIcon icon={faPen} className="text-xs" />
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="p-3 border-t border-line">
        <button
          onClick={onClose}
          className="w-full h-[46px] rounded-btn bg-brand text-white text-[15px] font-semibold"
        >
          完成{value.length > 0 ? `（已選 ${value.length}）` : ''}
        </button>
      </div>

      <TagEditSheet open={!!editing} tag={editing} onClose={() => setEditing(null)} />
    </Sheet>
  )
}
