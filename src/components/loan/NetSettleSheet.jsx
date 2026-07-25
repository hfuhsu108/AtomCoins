import { useState, useEffect, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faChevronDown } from '@fortawesome/free-solid-svg-icons'
import { addRepaymentsBatch } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { netSettlementPlan } from '../../lib/engine'
import { formatNumber } from '../../lib/format'
import { todayStr } from '../../lib/date'
import Sheet from '../Sheet'
import AccountPicker from '../transaction/AccountPicker'

// 一次結清（docs/03 §D）：對這個對象所有未結清的應收應付各補一筆全額還款，
// 全部指向同一帳戶同一天。應收 +、應付 − 在該帳戶相抵，淨變動剛好等於實際匯款金額，
// 因此不需要（也不該）另外記一筆轉帳。
export default function NetSettleSheet({ open, counterpartyId, name, txns, accounts, onClose }) {
  const [date, setDate] = useState(todayStr())
  const [accountId, setAccountId] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const { run, busy, error } = useAsyncAction()

  const plan = useMemo(
    () => (open ? netSettlementPlan(txns, counterpartyId) : { entries: [], recvTotal: 0, payTotal: 0, net: 0 }),
    [open, txns, counterpartyId],
  )

  useEffect(() => {
    if (open) setDate(todayStr())
  }, [open])

  const accObj = accounts.find((a) => a.id === accountId)
  const canSave = plan.entries.length > 0 && !!accountId
  const { net } = plan

  const save = () => {
    if (!canSave) return
    run(async () => {
      await settle(addRepaymentsBatch(
        plan.entries.map((e) => ({ txId: e.txId, repayment: { date, amount: e.amount, accountId } })),
      ))
      onClose()
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title={`與${name}結清`} bodyClassName="overflow-y-auto">
      <div className="p-[18px] flex flex-col gap-3.5">
        <div className="bg-surface-alt rounded-modal p-3.5 flex flex-col gap-2">
          <Row label="他欠你（應收）" value={plan.recvTotal} />
          <Row label="你欠他（應付）" value={plan.payTotal} />
          <div className="border-t border-line pt-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold">
              {net > 0 ? '對方付你' : net < 0 ? '你付對方' : '剛好互抵'}
            </span>
            <span className={`text-lg font-bold tabular-nums ${net > 0 ? 'text-income' : net < 0 ? 'text-expense' : ''}`}>
              NT$ {formatNumber(Math.abs(net))}
            </span>
          </div>
        </div>

        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">
            {net > 0 ? '收款帳戶' : net < 0 ? '付款帳戶' : '沖銷帳戶'}
          </div>
          <button
            onClick={() => setPickerOpen(true)}
            className="w-full px-3.5 py-2.5 bg-surface border border-line rounded-modal flex items-center justify-between text-[15px]"
          >
            <span className={accObj ? '' : 'text-text-tertiary'}>{accObj?.name ?? '選擇帳戶'}</span>
            <FontAwesomeIcon icon={faChevronDown} className="text-text-tertiary text-[11px]" />
          </button>
        </div>
        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">結清日</div>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-surface border border-line rounded-modal text-[15px] outline-none"
          />
        </div>

        <p className="text-[11px] text-text-tertiary">
          將對 {plan.entries.length} 筆借還款各記一筆全額還款到同一帳戶，該帳戶淨變動
          {net === 0 ? ' 0' : ` ${net > 0 ? '+' : '−'}NT$ ${formatNumber(Math.abs(net))}`}
          ，不另外產生轉帳記錄。
        </p>
        {error && <div className="text-[13px] text-error px-1">{error}</div>}
        <button
          onClick={save}
          disabled={!canSave || busy}
          className="flex items-center justify-center gap-1.5 h-[42px] rounded-btn bg-brand text-white text-[13px] font-semibold disabled:opacity-40"
        >
          <FontAwesomeIcon icon={faCheck} className="text-xs" /> 確認結清
        </button>
      </div>

      <AccountPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        accounts={accounts}
        value={accountId}
        title="結清帳戶"
        onSelect={(aid) => setAccountId(aid)}
      />
    </Sheet>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-text-secondary">{label}</span>
      <span className="tabular-nums">NT$ {formatNumber(value)}</span>
    </div>
  )
}
