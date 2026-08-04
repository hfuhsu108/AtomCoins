import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faRepeat, faTrashCan, faPause, faPlay } from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../../db/DataProvider'
import { updateRecurringRule, deleteRecurringRule } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { useConfirm } from '../ConfirmSheet'
import { formatMd, weekday } from '../../lib/date'
import EmptyState from '../EmptyState'
import SwipeRow from '../SwipeRow'
import TransactionForm from '../transaction/TransactionForm'

const MODE_LABEL = { immediate: '自動入帳', deferred: '提前產生', reminder: '僅提醒' }

// 「每 2 個月 15 號」「每週 週二」——interval 為 1 時省略數字，讀起來才像人話。
// 星期幾沒有存成欄位（week 規則靠 +7 天推進，星期幾天然不變），直接從下次發生日反推。
function freqLabel(f, nextDate) {
  const n = f?.interval ?? 1
  if (f?.unit === 'week') return `${n === 1 ? '每週' : `每 ${n} 週`}${nextDate ? ` ${weekday(nextDate)}` : ''}`
  if (f?.unit === 'month') return `${n === 1 ? '每月' : `每 ${n} 個月`}${f.anchorDay ? ` ${f.anchorDay} 號` : ''}`
  if (f?.unit === 'year') return `${n === 1 ? '每年' : `每 ${n} 年`}${f.anchorDay ? ` ${f.anchorDay} 號` : ''}`
  return ''
}

// 週期性收支管理：列出、新增、編輯、暫停／啟用、刪除。
// 新增與編輯都開整張記帳表單（ruleMode），規則的 payload 本來就是一筆交易，
// 另寫一套精簡表單等於把金額鍵盤、拆帳、分類選擇器再實作一次，口徑必然分岔。
export default function RecurringManager() {
  const rules = useCollection('recurringRules')
  const [form, setForm] = useState(undefined) // undefined=關閉／null=新增／物件=編輯
  const { run, error } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  const list = rules.slice().sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1))

  const remove = async (r) => {
    if (
      await confirm({
        title: '刪除週期規則',
        message: '刪除此週期性規則？（已產生的交易不受影響）',
        danger: true,
      })
    ) {
      run(async () => { await settle(deleteRecurringRule(r.id)) })
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-2">
        <button
          onClick={() => setForm(null)}
          className="flex items-center gap-1.5 h-[34px] px-3 rounded-chip bg-brand text-white text-[13px] font-semibold"
        >
          <FontAwesomeIcon icon={faPlus} className="text-xs" /> 新增
        </button>
      </div>

      {/* 容器要 overflow-hidden、左右 padding 移到列上，抽屜才貼齊圓角卡片邊緣 */}
      <div className="bg-surface border border-line rounded-card shadow-card overflow-hidden divide-y divide-line-light">
        {list.length === 0 && (
          <div className="px-3.5">
            <EmptyState title="尚無週期性收支" hint="點右上「新增」建立，例如每月 5 號的房租" compact />
          </div>
        )}
        {list.map((r) => (
          <SwipeRow
            key={r.id}
            actions={[
              {
                key: 'toggle',
                label: r.isActive ? '暫停' : '啟用',
                icon: r.isActive ? faPause : faPlay,
                tone: 'brand',
                onClick: () => run(async () => { await settle(updateRecurringRule(r.id, { isActive: !r.isActive })) }),
              },
              { key: 'delete', label: '刪除', icon: faTrashCan, tone: 'danger', onClick: () => remove(r) },
            ]}
          >
            <button
              onClick={() => setForm(r)}
              className={`flex items-center gap-3 w-full px-3.5 py-3 text-left ${r.isActive ? '' : 'opacity-50'}`}
            >
              <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
                <FontAwesomeIcon icon={faRepeat} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium truncate">{r.name ?? '週期項目'}</div>
                <div className="text-xs text-text-tertiary tabular-nums">
                  {freqLabel(r.frequency, r.nextDate)} · {MODE_LABEL[r.postingMode] ?? ''} · 下次 {formatMd(r.nextDate)}
                  {r.isActive ? '' : '（已暫停）'}
                </div>
              </div>
            </button>
          </SwipeRow>
        ))}
        {error && <div className="px-3.5 py-2 text-[13px] text-error">{error}</div>}
      </div>

      {/* 表單走本地 overlay 而非路由：設定頁的子區塊是 local state，導去 /add 再回來會掉回選單 */}
      {form !== undefined && (
        <div className="fixed inset-0 z-50 bg-app-bg lg:bg-[rgba(17,20,24,0.45)] lg:flex lg:items-center lg:justify-center">
          <div className="w-full h-full lg:w-[760px] lg:h-[88vh] lg:max-h-[860px] lg:rounded-modal lg:overflow-hidden lg:shadow-modal bg-app-bg">
            <TransactionForm
              ruleMode
              initialRule={form}
              onClose={() => setForm(undefined)}
              onSaved={() => setForm(undefined)}
            />
          </div>
        </div>
      )}
      {confirmElement}
    </div>
  )
}
