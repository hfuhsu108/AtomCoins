import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { createInvoice, updateInvoice, deleteInvoice } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { todayStr } from '../../lib/date'
import { useConfirm } from '../ConfirmSheet'
import Sheet from '../Sheet'

function initState(invoice) {
  return {
    merchant: invoice?.merchant ?? '',
    totalAmount: invoice?.totalAmount != null ? String(invoice.totalAmount) : '',
    invoiceDate: invoice?.invoiceDate ?? todayStr(),
    invoiceNumber: invoice?.invoiceNumber ?? '',
    note: invoice?.note ?? '',
  }
}

// 手動補登/編輯發票（source='manual'）。爬蟲抓的發票不走此表單，只在 InvoicePanel 歸帳/略過。
export default function InvoiceEditSheet({ open, invoice, onClose }) {
  const [s, setS] = useState(() => initState(invoice))
  const set = (patch) => setS((prev) => ({ ...prev, ...patch }))

  // open 時 invoice 換人但 state 未重置的守衛（同 BrokerEditSheet）
  const key = invoice?.id ?? 'new'
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setS(initState(invoice))
  }

  const amount = parseInt(s.totalAmount, 10)
  const canSave = s.merchant.trim().length > 0 && Number.isFinite(amount) && amount > 0

  const { run, busy, error } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  const save = () => {
    if (!canSave) return
    const data = {
      merchant: s.merchant.trim(),
      totalAmount: amount,
      invoiceDate: s.invoiceDate,
      invoiceNumber: s.invoiceNumber.trim() || null,
      note: s.note.trim() || null,
    }
    run(async () => {
      await settle(invoice ? updateInvoice(invoice.id, data) : createInvoice(data))
      onClose()
    })
  }

  const handleDelete = async () => {
    if (!invoice) return
    // 已歸帳發票硬擋直接刪（少數硬擋情境）：刪了會留下帶懸空 invoiceId 的交易
    if (invoice.transactionId) {
      await confirm({ title: '無法刪除', message: '此發票已歸帳，請先到發票列表取消歸帳，再刪除。', alert: true, confirmLabel: '知道了' })
      return
    }
    if (!(await confirm({ title: '刪除發票', message: '確定刪除此發票？', danger: true }))) return
    run(async () => {
      await settle(deleteInvoice(invoice.id))
      onClose()
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title={invoice ? '編輯發票' : '手動新增發票'} bodyClassName="overflow-y-auto">
      <div className="p-[18px] flex flex-col gap-3.5">
        <Field label="商家">
          <input
            value={s.merchant}
            onChange={(e) => set({ merchant: e.target.value })}
            placeholder="例如：全家便利商店"
            className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary"
          />
        </Field>

        <Field label="金額（元）">
          <div className="flex items-center gap-1 text-[15px] tabular-nums">
            <span className="text-text-tertiary text-sm">NT$</span>
            <input
              inputMode="numeric"
              value={s.totalAmount}
              onChange={(e) => set({ totalAmount: e.target.value.replace(/[^0-9]/g, '') })}
              placeholder="0"
              className="w-full outline-none bg-transparent"
            />
          </div>
        </Field>

        <Field label="發票日期">
          <input
            type="date"
            value={s.invoiceDate}
            onChange={(e) => e.target.value && set({ invoiceDate: e.target.value })}
            className="w-full text-[15px] outline-none bg-transparent"
          />
        </Field>

        <Field label="發票號碼" hint="選填，例如 AB-12345678">
          <input
            value={s.invoiceNumber}
            onChange={(e) => set({ invoiceNumber: e.target.value })}
            placeholder="選填"
            className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary"
          />
        </Field>

        <Field label="備註">
          <input
            value={s.note}
            onChange={(e) => set({ note: e.target.value })}
            placeholder="選填"
            className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary"
          />
        </Field>

        {error && <div className="text-[13px] text-error px-1">{error}</div>}
        <div className="flex items-center gap-2 mt-1">
          {invoice && (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="flex items-center gap-1.5 h-[42px] px-3.5 rounded-btn bg-surface border border-line text-[13px] font-medium text-error disabled:opacity-40"
            >
              <FontAwesomeIcon icon={faTrashCan} className="text-xs" /> 刪除
            </button>
          )}
          <button
            onClick={save}
            disabled={!canSave || busy}
            className="flex-1 flex items-center justify-center gap-1.5 h-[42px] rounded-btn bg-brand text-white text-[13px] font-semibold disabled:opacity-40"
          >
            <FontAwesomeIcon icon={faCheck} className="text-xs" /> 儲存
          </button>
        </div>
      </div>
      {confirmElement}
    </Sheet>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div className="text-[13px] text-text-secondary mb-1.5">{label}</div>
      <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal">{children}</div>
      {hint && <div className="text-[11px] text-text-tertiary mt-1 px-1">{hint}</div>}
    </div>
  )
}
