import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faPlus, faUser, faPen } from '@fortawesome/free-solid-svg-icons'
import { createCounterparty } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { newId } from '../../lib/id'
import Sheet from '../Sheet'
import CounterpartyEditSheet from '../settings/CounterpartyEditSheet'

// 對象選擇器（借還款／代墊用）。清單空時可直接輸入新增。
// 每列的鉛筆鈕可改名（刪除只放在設定頁——記帳途中誤觸的代價太高）。
export default function CounterpartyPicker({ open, onClose, counterparties, value, onSelect }) {
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(null)
  const { run, busy, error } = useAsyncAction()

  const list = [...counterparties].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const pick = (id) => {
    onSelect(id)
    onClose()
  }

  const addNew = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    // 先產生 id 再寫入：settle 離線逾時仍能取得 id 選回（不依賴 createCounterparty 的回傳）
    const id = newId()
    run(async () => {
      await settle(createCounterparty({ name: trimmed, id }))
      setName('')
      pick(id)
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title="選擇對象" bodyClassName="flex flex-col">
      <div className="flex gap-2 p-3 border-b border-line">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addNew()}
          placeholder="新增對象（姓名／群組）"
          className="flex-1 h-10 px-3 rounded-btn bg-surface-alt text-sm outline-none focus:ring-2 focus:ring-brand/30"
        />
        <button
          onClick={addNew}
          disabled={!name.trim() || busy}
          className="h-10 px-4 rounded-btn bg-brand text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-40"
        >
          <FontAwesomeIcon icon={faPlus} className="text-xs" /> 新增
        </button>
      </div>
      {error && <div className="px-3 pt-2 text-[13px] text-error">{error}</div>}
      <div className="flex-1 overflow-y-auto p-2">
        {list.length === 0 && (
          <div className="py-8 text-center text-text-tertiary text-sm">
            尚無對象，於上方輸入新增
          </div>
        )}
        {list.map((cp) => {
          const active = cp.id === value
          return (
            <div
              key={cp.id}
              className={`flex items-center gap-3 w-full pr-1 rounded-chip ${active ? 'bg-brand-light' : ''}`}
            >
              <button onClick={() => pick(cp.id)} className="flex items-center gap-3 flex-1 min-w-0 p-3 text-left">
                <span className="w-9 h-9 flex-none rounded-chip bg-surface-alt text-text-secondary flex items-center justify-center">
                  <FontAwesomeIcon icon={faUser} className="text-sm" />
                </span>
                <span className={`flex-1 truncate text-[15px] ${active ? 'font-semibold text-brand' : 'font-medium'}`}>
                  {cp.name}
                </span>
                {active && <FontAwesomeIcon icon={faCheck} className="text-brand text-[13px]" />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(cp)
                }}
                className="w-8 h-8 flex-none flex items-center justify-center text-text-tertiary"
              >
                <FontAwesomeIcon icon={faPen} className="text-xs" />
              </button>
            </div>
          )
        })}
      </div>

      <CounterpartyEditSheet
        open={!!editing}
        counterparty={editing}
        onClose={() => setEditing(null)}
      />
    </Sheet>
  )
}
