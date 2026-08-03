import { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faChevronDown } from '@fortawesome/free-solid-svg-icons'
import { addRepayment } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { outstanding } from '../../lib/engine'
import { formatNumber } from '../../lib/format'
import { todayStr } from '../../lib/date'
import Sheet from '../Sheet'
import DateInput from '../DateInput'
import AccountPicker from '../transaction/AccountPicker'

// 登錄一筆還款（docs/01 §3.6）。應收＝錢回到帳戶、應付＝錢離開帳戶，方向由引擎依型別決定。
// 金額硬綁未結清上限：超額會讓 outstanding 變負而使淨資產算錯；多收的利息請另記一筆收入。
export default function RepaymentSheet({ open, tx, accounts, onClose }) {
  const [amountStr, setAmountStr] = useState('')
  const [date, setDate] = useState(todayStr())
  const [accountId, setAccountId] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const { run, busy, error } = useAsyncAction()

  useEffect(() => {
    if (open && tx) {
      setAmountStr(String(outstanding(tx)))
      setDate(todayStr())
      setAccountId(tx.accountId ?? null)
    }
  }, [open, tx])

  const left = tx ? outstanding(tx) : 0
  const isRecv = tx?.type === 'receivable'
  const amount = Number(amountStr || 0)
  const over = amount > left
  const canSave = amount > 0 && !over && !!accountId
  const accObj = accounts.find((a) => a.id === accountId)

  const save = () => {
    if (!canSave) return
    run(async () => {
      await settle(addRepayment(tx.id, { date, amount, accountId }))
      onClose()
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title={isRecv ? '登錄收款' : '登錄還款'} bodyClassName="overflow-y-auto">
      <div className="p-[18px] flex flex-col gap-3.5">
        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">金額</div>
          <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal flex items-center gap-1 text-[15px] tabular-nums">
            <span className="text-text-tertiary text-sm">NT$</span>
            <input
              inputMode="numeric"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-full outline-none bg-transparent"
            />
          </div>
          <div className={`text-[11px] mt-1 ${over ? 'text-error' : 'text-text-tertiary'}`}>
            {over
              ? `超過未結清餘額，最多 NT$ ${formatNumber(left)}（多收的利息請另記一筆收入）`
              : `未結清 NT$ ${formatNumber(left)}`}
          </div>
        </div>
        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">{isRecv ? '收款帳戶' : '付款帳戶'}</div>
          <button
            onClick={() => setPickerOpen(true)}
            className="w-full px-3.5 py-2.5 bg-surface border border-line rounded-modal flex items-center justify-between text-[15px]"
          >
            <span className={accObj ? '' : 'text-text-tertiary'}>{accObj?.name ?? '選擇帳戶'}</span>
            <FontAwesomeIcon icon={faChevronDown} className="text-text-tertiary text-[11px]" />
          </button>
        </div>
        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">日期</div>
          <DateInput
            value={date}
            min={tx?.postingDate}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-surface border border-line rounded-modal text-[15px] outline-none"
          />
        </div>
        {error && <div className="text-[13px] text-error px-1">{error}</div>}
        <button
          onClick={save}
          disabled={!canSave || busy}
          className="flex items-center justify-center gap-1.5 h-[42px] rounded-btn bg-brand text-white text-[13px] font-semibold disabled:opacity-40"
        >
          <FontAwesomeIcon icon={faCheck} className="text-xs" /> 確認（{isRecv ? '收入' : '支付'} NT$ {formatNumber(amount)}）
        </button>
      </div>

      <AccountPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        accounts={accounts}
        value={accountId}
        title={isRecv ? '收款帳戶' : '付款帳戶'}
        onSelect={(aid) => setAccountId(aid)}
      />
    </Sheet>
  )
}
