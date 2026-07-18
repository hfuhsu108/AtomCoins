import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { createBroker, updateBroker, deleteBroker } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { useConfirm } from '../ConfirmSheet'
import Sheet from '../Sheet'

function initState(broker) {
  return {
    name: broker?.name ?? '',
    feeDiscount: broker?.feeDiscount != null ? String(broker.feeDiscount) : '1',
    minFee: broker?.minFee != null ? String(broker.minFee) : '20',
  }
}

export default function BrokerEditSheet({ open, broker, onClose, stockTxns = [] }) {
  const [s, setS] = useState(() => initState(broker))
  const set = (patch) => setS((prev) => ({ ...prev, ...patch }))

  const key = broker?.id ?? 'new'
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setS(initState(broker))
  }

  const canSave = s.name.trim().length > 0
  const discount = parseFloat(s.feeDiscount)
  const minFee = parseInt(s.minFee, 10)

  const { run, busy, error } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  const save = () => {
    if (!canSave) return
    const data = {
      name: s.name.trim(),
      feeDiscount: Number.isFinite(discount) ? discount : 1,
      minFee: Number.isFinite(minFee) ? minFee : 20,
      rounding: 'floor',
      note: broker?.note ?? null,
    }
    run(async () => {
      await settle(broker ? updateBroker(broker.id, data) : createBroker(data))
      onClose()
    })
  }

  const handleDelete = async () => {
    if (!broker) return
    const used = stockTxns.some((t) => t.brokerId === broker.id)
    const msg = used
      ? '此券商已有交易紀錄引用，刪除後相關交易的券商欄位將失效。確定刪除？'
      : '確定刪除此券商？'
    if (!(await confirm({ title: '刪除券商', message: msg, danger: true }))) return
    run(async () => {
      await settle(deleteBroker(broker.id))
      onClose()
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title={broker ? '編輯券商' : '新增券商'} bodyClassName="overflow-y-auto">
      <div className="p-[18px] flex flex-col gap-3.5">
        <Field label="名稱">
          <input
            value={s.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="例如：富邦證券"
            className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary"
          />
        </Field>

        <Field label="手續費折數" hint="例如 0.6＝6 折、0.28＝2.8 折、1＝不折">
          <input
            inputMode="decimal"
            value={s.feeDiscount}
            onChange={(e) => set({ feeDiscount: e.target.value.replace(/[^0-9.]/g, '') })}
            placeholder="1"
            className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary"
          />
        </Field>

        <Field label="最低手續費（元）">
          <input
            inputMode="numeric"
            value={s.minFee}
            onChange={(e) => set({ minFee: e.target.value.replace(/[^0-9]/g, '') })}
            placeholder="20"
            className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary"
          />
        </Field>

        <div className="px-3.5 py-2.5 bg-surface-alt border border-line rounded-modal text-[13px] text-text-tertiary">
          捨去方式：無條件捨去（floor）— 業界標準
        </div>

        {error && <div className="text-[13px] text-error px-1">{error}</div>}
        <div className="flex items-center gap-2 mt-1">
          {broker && (
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
