import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faCircleCheck, faTriangleExclamation, faRotate, faRotateLeft } from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../../db/DataProvider'
import { useScraperStatus } from '../../hooks/useScraperStatus'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { updateInvoice, unrecordInvoice } from '../../db/repo'
import { formatDateTime } from '../../lib/date'
import { useConfirm } from '../ConfirmSheet'
import InvoiceRow from './InvoiceRow'
import InvoiceEditSheet from './InvoiceEditSheet'

// 依發票日新到舊、同日再依建立時間新到舊
function byDateDesc(a, b) {
  if (a.invoiceDate !== b.invoiceDate) return a.invoiceDate < b.invoiceDate ? 1 : -1
  return (a.createdAt ?? '') < (b.createdAt ?? '') ? 1 : -1
}

export default function InvoicePanel({ hidden }) {
  const navigate = useNavigate()
  const invoices = useCollection('invoices')
  const merchantAliases = useCollection('merchantAliases')
  const status = useScraperStatus()
  const [sub, setSub] = useState('inbox') // inbox | processed
  const [sheetOpen, setSheetOpen] = useState(false)

  const { inbox, processed } = useMemo(() => {
    const inbox = invoices.filter((i) => i.status === 'inbox').sort(byDateDesc)
    const processed = invoices.filter((i) => i.status === 'recorded' || i.status === 'ignored').sort(byDateDesc)
    return { inbox, processed }
  }, [invoices])

  const list = sub === 'inbox' ? inbox : processed

  const { run, error } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  // 略過後的行內回饋（可復原）：略過是單一 × 動作、無提示，容易誤點
  const [ignoredNotice, setIgnoredNotice] = useState(null) // { id }
  const noticeTimer = useRef(null)
  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  const onRestore = (inv) => run(async () => { await settle(updateInvoice(inv.id, { status: 'inbox' })) })
  const onIgnore = (inv) =>
    run(async () => {
      await settle(updateInvoice(inv.id, { status: 'ignored' }))
      setIgnoredNotice({ id: inv.id })
      clearTimeout(noticeTimer.current)
      noticeTimer.current = setTimeout(() => setIgnoredNotice(null), 4000)
    })
  const undoIgnore = () => {
    const inv = invoices.find((i) => i.id === ignoredNotice?.id)
    clearTimeout(noticeTimer.current)
    setIgnoredNotice(null)
    if (inv) onRestore(inv)
  }
  const onUnrecord = async (inv) => {
    if (!(await confirm({ title: '取消歸帳', message: '取消歸帳將刪除這張發票對應的交易，發票回到未歸帳。確定？', danger: true }))) return
    run(async () => { await settle(unrecordInvoice(inv)) })
  }

  return (
    <>
      {/* 爬蟲同步狀態條 */}
      <SyncBar status={status} onAdd={() => setSheetOpen(true)} />

      {error && (
        <div className="mb-3 px-4 py-2.5 bg-error-bg text-error text-[13px] rounded-card">{error}</div>
      )}

      {ignoredNotice && (
        <div className="mb-3 flex items-center gap-2 px-4 py-2.5 bg-surface border border-line rounded-card text-[13px] text-text-secondary">
          <span className="flex-1 min-w-0">已略過，可於「已處理」分頁復原</span>
          <button onClick={undoIgnore} className="flex items-center gap-1.5 text-brand font-semibold flex-none">
            <FontAwesomeIcon icon={faRotateLeft} className="text-xs" /> 復原
          </button>
        </div>
      )}

      {/* 子分頁 */}
      <div className="flex gap-1.5 p-1 mb-3 bg-surface-alt rounded-modal">
        <SubTab active={sub === 'inbox'} onClick={() => setSub('inbox')} label="未歸帳" count={inbox.length} />
        <SubTab active={sub === 'processed'} onClick={() => setSub('processed')} label="已處理" count={processed.length} />
      </div>

      {list.length === 0 ? (
        <div className="py-16 text-center text-text-tertiary text-sm">
          {sub === 'inbox' ? '發票匣是空的，爬蟲每日自動抓取' : '尚無已處理的發票'}
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-card shadow-card px-4">
          {list.map((inv) => (
            <InvoiceRow
              key={inv.id}
              invoice={inv}
              aliases={merchantAliases}
              hidden={hidden}
              onRecord={() => navigate(`/add?invoiceId=${inv.id}`)}
              onIgnore={() => onIgnore(inv)}
              onRestore={() => onRestore(inv)}
              onUnrecord={() => onUnrecord(inv)}
              onOpenTx={() => inv.transactionId && navigate(`/add?id=${inv.transactionId}`)}
            />
          ))}
        </div>
      )}

      <InvoiceEditSheet open={sheetOpen} invoice={null} onClose={() => setSheetOpen(false)} />
      {confirmElement}
    </>
  )
}

function SyncBar({ status, onAdd }) {
  // status：undefined 載入中、null 尚未同步、物件 有紀錄
  let icon = faRotate
  let cls = 'text-text-tertiary'
  let text = '同步狀態載入中…'
  if (status === null) {
    text = '尚未同步'
  } else if (status) {
    const ok = status.ok !== false
    icon = ok ? faCircleCheck : faTriangleExclamation
    cls = ok ? 'text-income' : 'text-expense'
    const when = formatDateTime(status.lastRunAt)
    text = ok
      ? `上次同步 ${when ?? '—'} · 抓到 ${status.fetched ?? 0} 張`
      : `同步失敗 ${when ?? ''}${status.error ? `：${status.error}` : ''}`
  }
  return (
    <div className="flex items-center gap-2 bg-surface border border-line rounded-card shadow-card px-4 py-2.5 mb-3">
      <FontAwesomeIcon icon={icon} className={`${cls} text-sm`} />
      <span className="flex-1 min-w-0 text-[13px] text-text-secondary truncate">{text}</span>
      <button
        onClick={onAdd}
        className="flex items-center gap-1.5 h-8 px-3 rounded-chip bg-surface-alt text-text-primary text-[13px] font-semibold flex-none"
      >
        <FontAwesomeIcon icon={faPlus} className="text-xs" /> 手動新增
      </button>
    </div>
  )
}

function SubTab({ active, onClick, label, count }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 rounded-btn text-[13px] font-semibold ${
        active ? 'bg-surface text-text-primary shadow-segment' : 'text-text-secondary'
      }`}
    >
      {label}
      {count > 0 && <span className="ml-1.5 text-text-tertiary tabular-nums">{count}</span>}
    </button>
  )
}
