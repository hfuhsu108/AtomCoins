import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faCircleCheck, faTriangleExclamation, faRotate, faRotateLeft, faWandMagicSparkles, faReceipt, faXmark, faPen, faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase'
import { useCollection } from '../../db/DataProvider'
import { useScraperStatus } from '../../hooks/useScraperStatus'
import { filterInvoices } from '../../lib/search'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { updateInvoice, unrecordInvoice } from '../../db/repo'
import { formatDateTime } from '../../lib/date'
import { useConfirm } from '../ConfirmSheet'
import EmptyState from '../EmptyState'
import SwipeRow from '../SwipeRow'
import InvoiceRow from './InvoiceRow'
import InvoiceEditSheet from './InvoiceEditSheet'
import InvoicePreview from './InvoicePreview'

// 依發票日新到舊、同日再依建立時間新到舊
function byDateDesc(a, b) {
  if (a.invoiceDate !== b.invoiceDate) return a.invoiceDate < b.invoiceDate ? 1 : -1
  return (a.createdAt ?? '') < (b.createdAt ?? '') ? 1 : -1
}

export default function InvoicePanel({ hidden, keyword = '' }) {
  const navigate = useNavigate()
  const invoices = useCollection('invoices')
  const merchantAliases = useCollection('merchantAliases')
  const categories = useCollection('categories')
  const suggestions = useCollection('invoiceSuggestions')
  const status = useScraperStatus()
  const [sub, setSub] = useState('inbox') // inbox | processed
  const [preview, setPreview] = useState(null) // 單擊預覽中的發票
  // 發票編輯 sheet：undefined=關閉、null=手動新增、發票物件=編輯
  const [editTarget, setEditTarget] = useState(undefined)

  const { inbox, processed } = useMemo(() => {
    const inbox = invoices.filter((i) => i.status === 'inbox').sort(byDateDesc)
    const processed = invoices.filter((i) => i.status === 'recorded' || i.status === 'ignored').sort(byDateDesc)
    return { inbox, processed }
  }, [invoices])

  // 子分頁標籤上的數字維持總數（那是「有幾張」），關鍵字只影響列出來的清單
  const searching = !!keyword.trim()
  const list = useMemo(
    () => filterInvoices(sub === 'inbox' ? inbox : processed, keyword, merchantAliases),
    [sub, inbox, processed, keyword, merchantAliases],
  )

  // 自動分類建議 → 顯示用資料：名稱走「母·子」、圖示與顏色沿用母分類（同 TransactionRow 口徑）。
  // 建議可能是多列拆帳（依品項金額拆），列上塞不下全名，兩列並列、三列以上收成「+N」。
  const suggestionView = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]))
    const fullName = (c) => (c.parentId ? `${byId.get(c.parentId)?.name ?? ''}·${c.name}` : c.name)
    const m = new Map()
    for (const s of suggestions) {
      // 舊建議沒有 splits 欄位，退回單值 categoryId（免遷移）
      const rows = s.splits?.length ? s.splits : [{ categoryId: s.categoryId }]
      const cats = rows.map((r) => byId.get(r.categoryId)).filter(Boolean)
      if (cats.length === 0) continue // 分類已被刪除，建議失效
      const first = cats[0]
      const parent = first.parentId ? byId.get(first.parentId) : first
      m.set(s.invoiceId, {
        label:
          cats.length === 1
            ? fullName(first)
            : cats.length === 2
              ? `${first.name}＋${cats[1].name}`
              : `${first.name} +${cats.length - 1}`,
        icon: parent?.icon ?? null,
        color: parent?.color ?? null,
        source: s.source,
        splitCount: cats.length,
        detail: cats.map(fullName).join('、'),
      })
    }
    return m
  }, [suggestions, categories])

  const { run, error } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  // 略過後的行內回饋（可復原）：略過是單一 × 動作、無提示，容易誤點
  const [ignoredNotice, setIgnoredNotice] = useState(null) // { id }
  const noticeTimer = useRef(null)
  const aiTimer = useRef(null)
  useEffect(
    () => () => {
      clearTimeout(noticeTimer.current)
      clearTimeout(aiTimer.current)
    },
    [],
  )

  // 手動重新分析未歸帳發票：兩層（歷史比對＋LLM）都在 Cloud Function 內跑，
  // 已有建議的發票會被略過，故重按不會重複計費。
  const { run: runAi, busy: aiBusy, error: aiError } = useAsyncAction()
  const [aiNotice, setAiNotice] = useState(null)
  const analyze = () =>
    runAi(async () => {
      const res = await httpsCallable(functions, 'suggestInvoiceCategories')()
      const { history = 0, ai = 0, pending = 0 } = res.data ?? {}
      setAiNotice(
        history + ai === 0
          ? '沒有需要分類的發票'
          : `已分類 ${history + ai} 張（歷史比對 ${history}、AI ${ai}）${pending > 0 ? `，另有 ${pending} 張待下次` : ''}`,
      )
      clearTimeout(aiTimer.current)
      aiTimer.current = setTimeout(() => setAiNotice(null), 5000)
    })

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

  // 左滑抽屜。列上只留「歸帳」那顆高頻正向動作，其餘按 status 收進這裡
  const rowActions = (inv) => {
    if (inv.status === 'recorded') {
      return [
        {
          key: 'open',
          label: '看記帳',
          icon: faArrowUpRightFromSquare,
          tone: 'brand',
          disabled: !inv.transactionId,
          onClick: () => inv.transactionId && navigate(`/add?id=${inv.transactionId}`),
        },
        { key: 'unrecord', label: '取消歸帳', icon: faRotateLeft, tone: 'danger', onClick: () => onUnrecord(inv) },
      ]
    }
    if (inv.status === 'ignored') {
      return [{ key: 'restore', label: '復原', icon: faRotateLeft, tone: 'brand', onClick: () => onRestore(inv) }]
    }
    // inbox：手動新增的才可編輯／刪除（誤加時用），爬蟲抓來的每日覆寫、改了也會被洗掉
    return [
      inv.source === 'manual'
        ? { key: 'edit', label: '編輯', icon: faPen, tone: 'brand', onClick: () => setEditTarget(inv) }
        : null,
      { key: 'ignore', label: '略過', icon: faXmark, onClick: () => onIgnore(inv) },
    ]
  }

  return (
    <>
      {/* 爬蟲同步狀態條 */}
      <SyncBar
        status={status}
        onAdd={() => setEditTarget(null)}
        onAnalyze={sub === 'inbox' && inbox.length > 0 ? analyze : null}
        analyzing={aiBusy}
      />

      {(error || aiError) && (
        <div className="mb-3 px-4 py-2.5 bg-error-bg text-error text-[13px] rounded-card">{error ?? aiError}</div>
      )}

      {aiNotice && (
        <div className="mb-3 px-4 py-2.5 bg-surface border border-line rounded-card text-[13px] text-text-secondary">
          {aiNotice}
        </div>
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
        searching ? (
          <EmptyState title="找不到符合的發票" hint="可試商家名、發票號碼、載具或品項名稱" />
        ) : (
          <EmptyState
            icon={faReceipt}
            title={sub === 'inbox' ? '尚無待歸帳發票' : '尚無已處理的發票'}
            hint={sub === 'inbox' ? '爬蟲每日自動抓取，也可用上方「手動新增」' : undefined}
          />
        )
      ) : (
        <div className="bg-surface border border-line rounded-card shadow-card overflow-hidden divide-y divide-line-light">
          {list.map((inv) => (
            <SwipeRow key={inv.id} actions={rowActions(inv)}>
              <InvoiceRow
                invoice={inv}
                aliases={merchantAliases}
                suggestion={inv.status === 'inbox' ? (suggestionView.get(inv.id) ?? null) : null}
                hidden={hidden}
                onRecord={() => navigate(`/add?invoiceId=${inv.id}`)}
                onPreview={() => setPreview(inv)}
              />
            </SwipeRow>
          ))}
        </div>
      )}

      <InvoiceEditSheet
        open={editTarget !== undefined}
        invoice={editTarget ?? null}
        onClose={() => setEditTarget(undefined)}
      />

      <InvoicePreview
        invoice={preview}
        aliases={merchantAliases}
        hidden={hidden}
        onClose={() => setPreview(null)}
        onOpenTx={() => {
          const id = preview?.transactionId
          setPreview(null)
          if (id) navigate(`/add?id=${id}`)
        }}
      />
      {confirmElement}
    </>
  )
}

function SyncBar({ status, onAdd, onAnalyze, analyzing }) {
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
      {onAnalyze && (
        <button
          onClick={onAnalyze}
          disabled={analyzing}
          title="重新分析未歸帳發票的分類"
          className="flex items-center gap-1.5 h-8 px-3 rounded-chip bg-surface-alt text-text-primary text-[13px] font-semibold flex-none disabled:opacity-40"
        >
          <FontAwesomeIcon icon={faWandMagicSparkles} className="text-xs" /> {analyzing ? '分析中…' : '分析'}
        </button>
      )}
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
