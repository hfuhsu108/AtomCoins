import { useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faPen, faTag, faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../../db/DataProvider'
import TagEditSheet from './TagEditSheet'

// 標籤依名稱排序：中文直接比字串是 UTF-16 碼位序（等同亂序），需 Collator 才有筆畫／注音序
const TAG_COLLATOR = new Intl.Collator('zh-Hant')

// 標籤管理：新增、改名、換色、刪除。
// 刻意不做上下排序（Tag 沒有 sortOrder 欄位）——標籤沒有天然順序，名稱序＋搜尋列就夠用。
export default function TagManager() {
  const tags = useCollection('tags')
  const txns = useCollection('transactions')
  const [sheet, setSheet] = useState(undefined) // undefined=關閉／null=新增／物件=編輯
  const [query, setQuery] = useState('')

  // 每個標籤的引用筆數：以交易為單位，同一筆的多個拆帳列掛同標籤只算一次
  const countById = useMemo(() => {
    const map = {}
    for (const t of txns) {
      const ids = new Set([...(t.tagIds ?? []), ...(t.splits ?? []).flatMap((s) => s.tagIds ?? [])])
      for (const id of ids) map[id] = (map[id] ?? 0) + 1
    }
    return map
  }, [txns])

  const q = query.trim().toLowerCase()
  // filter 已產生新陣列，sort 不會動到來源
  const list = tags
    .filter((t) => !q || (t.name ?? '').toLowerCase().includes(q))
    .sort((a, b) => TAG_COLLATOR.compare(a.name ?? '', b.name ?? ''))

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 flex items-center gap-2 h-[34px] px-3 bg-surface border border-line rounded-modal">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="text-text-tertiary text-sm" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋標籤"
            className="flex-1 min-w-0 bg-transparent text-[15px] outline-none placeholder:text-text-tertiary"
          />
          {query && (
            <button onClick={() => setQuery('')} className="flex-none text-text-tertiary">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </div>
        <button
          onClick={() => setSheet(null)}
          className="flex items-center gap-1.5 h-[34px] px-3 flex-none rounded-chip bg-brand text-white text-[13px] font-semibold"
        >
          <FontAwesomeIcon icon={faPlus} className="text-xs" /> 新增
        </button>
      </div>

      {tags.length === 0 ? (
        <p className="text-[13px] text-text-tertiary text-center py-6">
          尚無標籤。記帳時的「標籤」列也可以直接新增。
        </p>
      ) : list.length === 0 ? (
        <p className="text-[13px] text-text-tertiary text-center py-6">找不到符合的標籤。</p>
      ) : (
        <div className="bg-surface border border-line rounded-card shadow-card divide-y divide-line-light">
          {list.map((tag) => {
            const count = countById[tag.id] ?? 0
            return (
              <div key={tag.id} className="flex items-center gap-2 px-3 py-2.5">
                <span
                  className={`w-9 h-9 flex-none rounded-btn flex items-center justify-center ${tag.color ? '' : 'bg-surface-alt text-text-secondary'}`}
                  style={tag.color ? { background: `color-mix(in srgb, ${tag.color} 15%, transparent)`, color: tag.color } : undefined}
                >
                  <FontAwesomeIcon icon={faTag} className="text-sm" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-medium truncate">{tag.name}</div>
                  <div className="text-xs text-text-tertiary tabular-nums">
                    {count > 0 ? `${count} 筆記錄` : '尚未使用'}
                  </div>
                </div>
                <button
                  onClick={() => setSheet(tag)}
                  className="w-8 h-8 flex items-center justify-center text-text-secondary"
                >
                  <FontAwesomeIcon icon={faPen} className="text-xs" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <TagEditSheet open={sheet !== undefined} tag={sheet ?? null} onClose={() => setSheet(undefined)} />
    </div>
  )
}
