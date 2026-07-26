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
  // 「使用母分類」那顆按鈕的選中態配色（與子分類列同一套邏輯）
  const parentSelected = activeParent?.id === value
  const parentAccent = activeParent?.color ?? null

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
                  p.color
                    ? 'border-transparent'
                    : active
                      ? 'bg-brand text-white border-brand'
                      : 'bg-surface text-text-secondary border-line'
                }`}
                // 有自訂色就吃自訂色：選中＝實心該色＋白 icon，未選＝同色淡底；沒設色才退回品牌藍
                style={
                  p.color
                    ? active
                      ? { background: p.color, color: '#fff', borderColor: p.color }
                      : { background: `color-mix(in srgb, ${p.color} 15%, transparent)`, color: p.color }
                    : undefined
                }
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
          // 選中態的強調色：子分類沒設色就沿用母分類的，兩者都沒設才退回品牌藍
          const accent = c.color ?? activeParent?.color ?? null
          return (
            <button
              key={c.id}
              onClick={() => commit(c.id)}
              className={`flex items-center justify-between gap-2 w-full p-3 rounded-chip text-left ${
                active && !accent ? 'bg-brand-light' : ''
              }`}
              style={active && accent ? { background: `color-mix(in srgb, ${accent} 12%, transparent)` } : undefined}
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
                    active ? `font-semibold${accent ? '' : ' text-brand'}` : 'font-medium text-text-primary'
                  }`}
                  style={active && accent ? { color: accent } : undefined}
                >
                  {c.name}
                </span>
              </span>
              {active && (
                <FontAwesomeIcon
                  icon={faCheck}
                  className={`text-[13px] flex-none${accent ? '' : ' text-brand'}`}
                  style={accent ? { color: accent } : undefined}
                />
              )}
            </button>
          )
        })}
        {children.length === 0 && activeParent && (
          <button
            onClick={() => commit(activeParent.id)}
            className={`flex items-center justify-between w-full p-3 rounded-chip text-left ${
              parentSelected && !parentAccent ? 'bg-brand-light' : ''
            }`}
            style={
              parentSelected && parentAccent
                ? { background: `color-mix(in srgb, ${parentAccent} 12%, transparent)` }
                : undefined
            }
          >
            <span
              className={`text-sm ${
                parentSelected
                  ? `font-semibold${parentAccent ? '' : ' text-brand'}`
                  : 'font-medium text-text-primary'
              }`}
              style={parentSelected && parentAccent ? { color: parentAccent } : undefined}
            >
              使用「{activeParent.name}」
            </span>
            {parentSelected && (
              <FontAwesomeIcon
                icon={faCheck}
                className={`text-[13px]${parentAccent ? '' : ' text-brand'}`}
                style={parentAccent ? { color: parentAccent } : undefined}
              />
            )}
          </button>
        )}
      </div>
    </Sheet>
  )
}
