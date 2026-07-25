import { useState, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faPen, faUser } from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../../db/DataProvider'
import { setSortOrders } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { counterpartyLoanStats } from '../../lib/engine'
import { formatNumber } from '../../lib/format'
import { ReorderBtns } from './CategoryManager'
import CounterpartyEditSheet from './CounterpartyEditSheet'

// 借貸對象管理：新增、改名、刪除、上下排序。排序影響記帳表單的對象選擇器順序。
export default function CounterpartyManager() {
  const counterparties = useCollection('counterparties')
  const txns = useCollection('transactions')
  const [sheet, setSheet] = useState(undefined) // undefined=關閉／null=新增／物件=編輯
  const { run } = useAsyncAction()

  const list = useMemo(
    () => [...counterparties].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [counterparties],
  )
  // 未結清摘要：讓使用者刪除前就看得出哪些對象還有帳沒清
  const statsById = useMemo(() => {
    const map = {}
    for (const r of counterpartyLoanStats(txns)) map[r.counterpartyId] = r
    return map
  }, [txns])

  // 上下移動：與相鄰項交換 sortOrder（sortOrder 缺值時以 index 兜底，同 CategoryManager）
  const move = (index, dir) => {
    const j = index + dir
    if (j < 0 || j >= list.length) return
    const a = list[index]
    const b = list[j]
    const soA = a.sortOrder != null ? a.sortOrder : index
    const soB = b.sortOrder != null ? b.sortOrder : j
    run(async () => {
      await settle(setSortOrders('counterparties', [
        { id: a.id, sortOrder: soB },
        { id: b.id, sortOrder: soA },
      ]))
    })
  }

  return (
    <div>
      <div className="flex justify-end mb-2">
        <button
          onClick={() => setSheet(null)}
          className="flex items-center gap-1.5 h-[34px] px-3 rounded-chip bg-brand text-white text-[13px] font-semibold"
        >
          <FontAwesomeIcon icon={faPlus} className="text-xs" /> 新增對象
        </button>
      </div>

      {list.length === 0 ? (
        <p className="text-[13px] text-text-tertiary text-center py-6">
          尚無對象。記帳時選「應收／應付」或標記代墊也可以直接新增。
        </p>
      ) : (
        <div className="bg-surface border border-line rounded-card shadow-card divide-y divide-line-light">
          {list.map((cp, i) => {
            const st = statsById[cp.id]
            return (
              <div key={cp.id} className="flex items-center gap-2 px-3 py-2.5">
                <ReorderBtns
                  onUp={() => move(i, -1)}
                  onDown={() => move(i, 1)}
                  first={i === 0}
                  last={i === list.length - 1}
                />
                <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
                  <FontAwesomeIcon icon={faUser} className="text-sm" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-medium truncate">{cp.name}</div>
                  <div className="text-xs text-text-tertiary tabular-nums">
                    {st
                      ? [
                        st.receivable > 0 ? `應收 ${formatNumber(st.receivable)}` : null,
                        st.payable > 0 ? `應付 ${formatNumber(st.payable)}` : null,
                      ].filter(Boolean).join('・')
                      : '無未結清'}
                  </div>
                </div>
                <button
                  onClick={() => setSheet(cp)}
                  className="w-8 h-8 flex items-center justify-center text-text-secondary"
                >
                  <FontAwesomeIcon icon={faPen} className="text-xs" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <CounterpartyEditSheet
        open={sheet !== undefined}
        counterparty={sheet ?? null}
        onClose={() => setSheet(undefined)}
      />
    </div>
  )
}
