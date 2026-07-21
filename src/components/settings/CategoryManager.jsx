import { useState, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faPen, faChevronUp, faChevronDown, faChevronRight } from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../../db/DataProvider'
import { setSortOrders } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { getIcon } from '../../lib/icons'
import CategoryEditSheet from './CategoryEditSheet'

const KIND_TABS = [
  { id: 'expense', label: '支出' },
  { id: 'income', label: '收入' },
]

// 分類管理（docs/09 後續調整）：支出/收入切換、母子清單、上下箭頭排序、新增/編輯/刪除。
export default function CategoryManager() {
  const categories = useCollection('categories')
  const [kind, setKind] = useState('expense')
  const [expanded, setExpanded] = useState({}) // parentId → bool
  const [sheet, setSheet] = useState(null) // { category, kind, parentId } | null
  const { run } = useAsyncAction()

  const parents = useMemo(
    () => categories.filter((c) => c.kind === kind && c.parentId == null).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [categories, kind],
  )
  const childrenOf = (pid) =>
    categories.filter((c) => c.parentId === pid).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  // 上下移動：與相鄰同層項目交換 sortOrder
  const move = (list, index, dir) => {
    const j = index + dir
    if (j < 0 || j >= list.length) return
    const a = list[index]
    const b = list[j]
    const soA = a.sortOrder != null ? a.sortOrder : index
    const soB = b.sortOrder != null ? b.sortOrder : j
    run(async () => {
      await settle(setSortOrders('categories', [
        { id: a.id, sortOrder: soB },
        { id: b.id, sortOrder: soA },
      ]))
    })
  }

  return (
    <div>
      {/* 支出/收入切換 */}
      <div className="flex gap-1.5 p-1 mb-3 bg-surface-alt rounded-modal">
        {KIND_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setKind(t.id)}
            className={`flex-1 py-2 rounded-btn text-[13px] font-semibold ${
              kind === t.id ? 'bg-surface text-text-primary shadow-segment' : 'text-text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex justify-end mb-2">
        <button
          onClick={() => setSheet({ category: null, kind, parentId: null })}
          className="flex items-center gap-1.5 h-[34px] px-3 rounded-chip bg-brand text-white text-[13px] font-semibold"
        >
          <FontAwesomeIcon icon={faPlus} className="text-xs" /> 新增大分類
        </button>
      </div>

      <div className="bg-surface border border-line rounded-card shadow-card divide-y divide-line-light">
        {parents.map((p, pi) => {
          const kids = childrenOf(p.id)
          const open = !!expanded[p.id]
          return (
            <div key={p.id}>
              {/* 母分類列 */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <ReorderBtns onUp={() => move(parents, pi, -1)} onDown={() => move(parents, pi, 1)} first={pi === 0} last={pi === parents.length - 1} />
                <button onClick={() => setExpanded((s) => ({ ...s, [p.id]: !open }))} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                  <CatIcon icon={p.icon} color={p.color} />
                  <span className="text-[15px] font-medium truncate">{p.name}</span>
                  {kids.length > 0 && <span className="text-xs text-text-tertiary">{kids.length}</span>}
                  <FontAwesomeIcon icon={open ? faChevronDown : faChevronRight} className="text-text-tertiary text-[11px]" />
                </button>
                <button onClick={() => setSheet({ category: p, kind, parentId: null })} className="w-8 h-8 flex items-center justify-center text-text-secondary">
                  <FontAwesomeIcon icon={faPen} className="text-xs" />
                </button>
              </div>

              {/* 子分類 */}
              {open && (
                <div className="pb-2">
                  {kids.map((c, ci) => (
                    <div key={c.id} className="flex items-center gap-2 pl-10 pr-3 py-2">
                      <ReorderBtns onUp={() => move(kids, ci, -1)} onDown={() => move(kids, ci, 1)} first={ci === 0} last={ci === kids.length - 1} />
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <CatIcon icon={c.icon ?? p.icon} color={c.color} small />
                        <span className="text-[15px] truncate">{c.name}</span>
                      </div>
                      <button onClick={() => setSheet({ category: c, kind, parentId: p.id })} className="w-8 h-8 flex items-center justify-center text-text-secondary">
                        <FontAwesomeIcon icon={faPen} className="text-xs" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setSheet({ category: null, kind, parentId: p.id })}
                    className="flex items-center gap-1.5 pl-10 py-2 text-[13px] font-medium text-brand"
                  >
                    <FontAwesomeIcon icon={faPlus} className="text-xs" /> 新增子分類
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <CategoryEditSheet
        open={!!sheet}
        category={sheet?.category ?? null}
        kind={sheet?.kind ?? kind}
        parentId={sheet?.parentId ?? null}
        categories={categories}
        onClose={() => setSheet(null)}
      />
    </div>
  )
}

function CatIcon({ icon, color, small }) {
  const size = small ? 'w-7 h-7 text-[13px]' : 'w-9 h-9 text-[15px]'
  return (
    <span
      className={`${size} flex-none rounded-btn flex items-center justify-center ${color ? '' : 'bg-surface-alt text-text-secondary'}`}
      style={color ? { background: `color-mix(in srgb, ${color} 15%, transparent)`, color } : undefined}
    >
      <FontAwesomeIcon icon={getIcon(icon)} />
    </span>
  )
}

export function ReorderBtns({ onUp, onDown, first, last }) {
  return (
    <div className="flex flex-col flex-none">
      <button onClick={onUp} disabled={first} className="w-6 h-5 flex items-center justify-center text-text-tertiary disabled:opacity-25">
        <FontAwesomeIcon icon={faChevronUp} className="text-[11px]" />
      </button>
      <button onClick={onDown} disabled={last} className="w-6 h-5 flex items-center justify-center text-text-tertiary disabled:opacity-25">
        <FontAwesomeIcon icon={faChevronDown} className="text-[11px]" />
      </button>
    </div>
  )
}
