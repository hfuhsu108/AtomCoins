import { useState, useEffect, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck } from '@fortawesome/free-solid-svg-icons'
import { getIcon } from '../../lib/icons'
import Sheet from '../Sheet'

// 分類選擇器：左母分類、右子分類（docs/04）。選子分類即提交；
// 無子項目的母分類（如「未分類」「其他」）可直接提交該母分類。
export default function CategoryPicker({ open, onClose, categories, value, onSelect }) {
  const parents = useMemo(
    () =>
      categories
        .filter((c) => c.parentId == null && !c.isArchived)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  )

  // 目前選到的分類，反推其母分類作為左欄高亮初值
  const selected = categories.find((c) => c.id === value)
  const initialParentId = selected
    ? selected.parentId ?? selected.id
    : parents[0]?.id

  const [activeParentId, setActiveParentId] = useState(initialParentId)

  // 每次打開時，左欄高亮對齊目前選取
  useEffect(() => {
    if (open) setActiveParentId(initialParentId)
  }, [open, initialParentId])

  const children = useMemo(
    () =>
      categories
        .filter((c) => c.parentId === activeParentId && !c.isArchived)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories, activeParentId],
  )

  const activeParent = parents.find((p) => p.id === activeParentId)

  const commit = (id) => {
    onSelect(id)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="選擇分類" bodyClassName="flex">
      {/* 母分類 */}
      <div className="w-[148px] flex-none bg-app-bg border-r border-line overflow-y-auto p-2">
        {parents.map((p) => {
          const active = p.id === activeParentId
          return (
            <button
              key={p.id}
              onClick={() => setActiveParentId(p.id)}
              className={`flex items-center gap-2.5 w-full p-3 rounded-chip text-left ${
                active ? 'bg-surface shadow-card' : ''
              }`}
            >
              <span
                className={`w-[30px] h-[30px] flex-none rounded-chip flex items-center justify-center text-[13px] border ${
                  active
                    ? 'bg-brand text-white border-brand'
                    : p.color
                      ? 'border-transparent'
                      : 'bg-surface text-text-secondary border-line'
                }`}
                style={!active && p.color ? { background: `color-mix(in srgb, ${p.color} 15%, transparent)`, color: p.color } : undefined}
              >
                <FontAwesomeIcon icon={getIcon(p.icon)} />
              </span>
              <span
                className={`text-sm flex-1 min-w-0 truncate ${
                  active ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'
                }`}
              >
                {p.name}
              </span>
            </button>
          )
        })}
      </div>

      {/* 子分類 */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="text-xs font-semibold text-text-tertiary px-2.5 pt-2 pb-1.5">
          {activeParent ? `${activeParent.name} · 子分類` : ''}
        </div>
        {children.map((c) => {
          const active = c.id === value
          return (
            <button
              key={c.id}
              onClick={() => commit(c.id)}
              className={`flex items-center justify-between gap-2 w-full p-3 rounded-chip text-left ${
                active ? 'bg-brand-light' : ''
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-7 h-7 flex-none rounded-chip flex items-center justify-center text-[12px] ${
                    c.color ? '' : 'bg-surface-alt text-text-secondary'
                  }`}
                  style={c.color ? { background: `color-mix(in srgb, ${c.color} 15%, transparent)`, color: c.color } : undefined}
                >
                  <FontAwesomeIcon icon={getIcon(c.icon ?? activeParent?.icon)} />
                </span>
                <span
                  className={`text-sm truncate ${
                    active ? 'font-semibold text-brand' : 'font-medium text-text-primary'
                  }`}
                >
                  {c.name}
                </span>
              </span>
              {active && <FontAwesomeIcon icon={faCheck} className="text-brand text-[13px] flex-none" />}
            </button>
          )
        })}
        {children.length === 0 && activeParent && (
          <button
            onClick={() => commit(activeParent.id)}
            className={`flex items-center justify-between w-full p-3 rounded-chip text-left ${
              activeParent.id === value ? 'bg-brand-light' : ''
            }`}
          >
            <span
              className={`text-sm ${
                activeParent.id === value
                  ? 'font-semibold text-brand'
                  : 'font-medium text-text-primary'
              }`}
            >
              使用「{activeParent.name}」
            </span>
            {activeParent.id === value && (
              <FontAwesomeIcon icon={faCheck} className="text-brand text-[13px]" />
            )}
          </button>
        )}
      </div>
    </Sheet>
  )
}
