import { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faPen, faBookmark, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../../db/DataProvider'
import { updateTemplate, deleteTemplate } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { useConfirm } from '../ConfirmSheet'
import { formatAmount } from '../../lib/format'
import EmptyState from '../EmptyState'
import Sheet from '../Sheet'
import SwipeRow from '../SwipeRow'
import TransactionForm from '../transaction/TransactionForm'

const TX_TYPE_LABEL = { expense: '支出', income: '收入', transfer: '轉帳', receivable: '應收', payable: '應付' }

// 範本摘要行（docs/09 批次 2）：型別＋分類／帳戶／對象＋金額
function templateSummary(t, { catById, accById, cpById }) {
  const p = t.payload ?? {}
  const parts = [TX_TYPE_LABEL[p.type] ?? '']
  if (p.type === 'expense' || p.type === 'income') {
    const names = (p.splits ?? []).map((s) => catById[s.categoryId]?.name).filter(Boolean)
    if (names.length) parts.push(names.join('、'))
    const sum = (p.splits ?? []).reduce((a, s) => a + (s.amount ?? 0), 0)
    if (sum > 0) parts.push(formatAmount(sum))
  } else if (p.type === 'transfer') {
    parts.push(`${accById[p.fromAccountId]?.name ?? '?'} → ${accById[p.toAccountId]?.name ?? '?'}`)
  } else {
    if (p.counterpartyId) parts.push(cpById[p.counterpartyId]?.name ?? '')
    if (p.amount > 0) parts.push(formatAmount(p.amount))
  }
  return parts.filter(Boolean).join(' · ')
}

// 範本管理：列出、新增、編輯內容、改名、刪除。
// 新增與編輯都開整張記帳表單（templateMode）——範本的 payload 就是一筆交易，
// 與週期規則同一套做法（見 RecurringManager）。
export default function TemplateManager() {
  const templates = useCollection('templates')
  const categories = useCollection('categories')
  const accounts = useCollection('accounts')
  const counterparties = useCollection('counterparties')
  const [form, setForm] = useState(undefined) // undefined=關閉／null=新增／物件=編輯內容
  const [renaming, setRenaming] = useState(null)
  const { run, error } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  const lookups = {
    catById: Object.fromEntries(categories.map((c) => [c.id, c])),
    accById: Object.fromEntries(accounts.map((a) => [a.id, a])),
    cpById: Object.fromEntries(counterparties.map((c) => [c.id, c])),
  }

  const list = templates.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const remove = async (t) => {
    if (await confirm({ title: '刪除範本', message: `刪除範本「${t.name}」？`, danger: true })) {
      run(async () => { await settle(deleteTemplate(t.id)) })
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
            <EmptyState title="尚無範本" hint="點右上「新增」建立，記帳表單的「存為範本」也可以" compact />
          </div>
        )}
        {list.map((t) => (
          <SwipeRow
            key={t.id}
            actions={[
              { key: 'rename', label: '改名', icon: faPen, tone: 'brand', onClick: () => setRenaming(t) },
              { key: 'delete', label: '刪除', icon: faTrashCan, tone: 'danger', onClick: () => remove(t) },
            ]}
          >
            <button onClick={() => setForm(t)} className="flex items-center gap-3 w-full px-3.5 py-3 text-left">
              <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
                <FontAwesomeIcon icon={faBookmark} className="text-sm" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium truncate">{t.name}</div>
                <div className="text-xs text-text-tertiary truncate">{templateSummary(t, lookups)}</div>
              </div>
            </button>
          </SwipeRow>
        ))}
        {error && <div className="px-3.5 py-2 text-[13px] text-error">{error}</div>}
      </div>

      <TemplateRenameSheet
        template={renaming}
        onClose={() => setRenaming(null)}
        onSave={(id, name) => run(async () => {
          await settle(updateTemplate(id, { name }))
          setRenaming(null)
        })}
      />

      {/* 表單走本地 overlay 而非路由：設定頁的子區塊是 local state，導去 /add 再回來會掉回選單 */}
      {form !== undefined && (
        <div className="fixed inset-0 z-50 bg-app-bg lg:bg-[rgba(17,20,24,0.45)] lg:flex lg:items-center lg:justify-center">
          <div className="w-full h-full lg:w-[760px] lg:h-[88vh] lg:max-h-[860px] lg:rounded-modal lg:overflow-hidden lg:shadow-modal bg-app-bg">
            <TransactionForm
              templateMode
              initialTemplate={form}
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

function TemplateRenameSheet({ template, onClose, onSave }) {
  const open = !!template
  const [name, setName] = useState('')
  // 每次開啟時以現有名稱預填
  useEffect(() => {
    if (open) setName(template?.name ?? '')
  }, [open, template])
  const trimmed = name.trim()
  return (
    <Sheet open={open} onClose={onClose} title="範本改名" bodyClassName="p-4">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="範本名稱"
        className="w-full h-[46px] px-3.5 bg-surface-alt rounded-modal text-[15px] outline-none placeholder:text-text-tertiary mb-3"
      />
      <button
        onClick={() => trimmed && onSave(template.id, trimmed)}
        disabled={!trimmed}
        className="w-full h-[46px] rounded-btn bg-brand text-white text-[15px] font-semibold disabled:opacity-40"
      >
        儲存
      </button>
    </Sheet>
  )
}
