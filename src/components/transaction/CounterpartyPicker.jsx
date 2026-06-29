import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faPlus, faUser } from '@fortawesome/free-solid-svg-icons'
import { createCounterparty } from '../../db/repo'
import Sheet from '../Sheet'

// 對象選擇器（借還款／代墊用）。清單空時可直接輸入新增。
export default function CounterpartyPicker({ open, onClose, counterparties, value, onSelect }) {
  const [name, setName] = useState('')

  const pick = (id) => {
    onSelect(id)
    onClose()
  }

  const addNew = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const cp = await createCounterparty({ name: trimmed })
    setName('')
    pick(cp.id)
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
          disabled={!name.trim()}
          className="h-10 px-4 rounded-btn bg-brand text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-40"
        >
          <FontAwesomeIcon icon={faPlus} className="text-xs" /> 新增
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {counterparties.length === 0 && (
          <div className="py-8 text-center text-text-tertiary text-sm">
            尚無對象，於上方輸入新增
          </div>
        )}
        {counterparties.map((cp) => {
          const active = cp.id === value
          return (
            <button
              key={cp.id}
              onClick={() => pick(cp.id)}
              className={`flex items-center gap-3 w-full p-3 rounded-chip text-left ${
                active ? 'bg-brand-light' : ''
              }`}
            >
              <span className="w-9 h-9 flex-none rounded-chip bg-surface-alt text-text-secondary flex items-center justify-center">
                <FontAwesomeIcon icon={faUser} className="text-sm" />
              </span>
              <span className={`flex-1 text-[15px] ${active ? 'font-semibold text-brand' : 'font-medium'}`}>
                {cp.name}
              </span>
              {active && <FontAwesomeIcon icon={faCheck} className="text-brand text-[13px]" />}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
