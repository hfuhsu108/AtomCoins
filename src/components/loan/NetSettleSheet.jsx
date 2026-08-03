import { useState, useEffect, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faChevronDown } from '@fortawesome/free-solid-svg-icons'
import { addRepaymentsBatch } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { netSettlementPlan } from '../../lib/engine'
import { formatNumber } from '../../lib/format'
import { todayStr, formatMd } from '../../lib/date'
import Sheet from '../Sheet'
import DateInput from '../DateInput'
import AccountPicker from '../transaction/AccountPicker'

const EMPTY_PLAN = { entries: [], recvTotal: 0, payTotal: 0, net: 0 }

// 結清（docs/03 §D）：對勾選的應收應付各補一筆全額還款，全部指向同一帳戶同一天。
// 應收 +、應付 − 在該帳戶相抵，淨變動剛好等於實際匯款金額，因此不需要（也不該）
// 另外記一筆轉帳。分批還款時只勾要結清的那幾筆；單筆部分金額走 RepaymentSheet。
export default function NetSettleSheet({ open, counterpartyId, name, txns, accounts, onClose }) {
  const [date, setDate] = useState(todayStr())
  const [accountId, setAccountId] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const { run, busy, error } = useAsyncAction()

  // 候選清單（該對象全部未結清）與實際結清方案（只含勾選的）皆由 engine 算，
  // 兩者共用同一套 outstanding 口徑，UI 不自行加總。
  const allPlan = useMemo(
    () => (open ? netSettlementPlan(txns, counterpartyId) : EMPTY_PLAN),
    [open, txns, counterpartyId],
  )
  const plan = useMemo(
    () => (open ? netSettlementPlan(txns, counterpartyId, [...selected]) : EMPTY_PLAN),
    [open, txns, counterpartyId, selected],
  )

  const txById = useMemo(() => {
    const m = {}
    for (const t of txns) m[t.id] = t
    return m
  }, [txns])

  // 開啟時預設全選（維持原本「一次結清全部」的手感）。
  // 刻意不隨 txns 重置：多裝置同步進來的新項目不該被自動勾選。
  // 反之選了卻已結清／消失的項目，engine 會自動排除，不必在這裡清。
  useEffect(() => {
    if (!open) return
    setDate(todayStr())
    setSelected(new Set(allPlan.entries.map((e) => e.txId)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggleOne = (txId) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(txId)) next.delete(txId)
      else next.add(txId)
      return next
    })
  const allSelected = allPlan.entries.length > 0 && plan.entries.length === allPlan.entries.length
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(allPlan.entries.map((e) => e.txId)))

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
        {/* 結清項目：分批還款時只勾這次要結清的 */}
        <div>
          <div className="flex items-center justify-between mb-1.5 px-1">
            <span className="text-[13px] text-text-secondary">結清項目（{plan.entries.length}／{allPlan.entries.length}）</span>
            {allPlan.entries.length > 1 && (
              <button onClick={toggleAll} className="text-[13px] font-medium text-brand">
                {allSelected ? '全不選' : '全選'}
              </button>
            )}
          </div>
          <div className="bg-surface border border-line rounded-modal divide-y divide-line-light">
            {allPlan.entries.map((e) => {
              const tx = txById[e.txId]
              const isRecv = e.type === 'receivable'
              const on = selected.has(e.txId)
              return (
                <button
                  key={e.txId}
                  onClick={() => toggleOne(e.txId)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left"
                >
                  <span
                    className={`w-[18px] h-[18px] flex-none rounded-[5px] border flex items-center justify-center ${
                      on ? 'bg-brand border-brand text-white' : 'border-line'
                    }`}
                  >
                    {on && <FontAwesomeIcon icon={faCheck} className="text-[10px]" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium">
                      {tx?.linkGroupId ? (isRecv ? '代墊' : '代付') : isRecv ? '借出' : '借入'}
                    </div>
                    <div className="text-[11px] text-text-tertiary truncate">
                      {tx ? formatMd(tx.postingDate) : ''}
                      {tx?.note ? `・${tx.note}` : ''}
                    </div>
                  </div>
                  <span
                    className={`text-[14px] font-semibold tabular-nums flex-none ${
                      isRecv ? 'text-income' : 'text-expense'
                    }`}
                  >
                    NT$ {formatNumber(e.amount)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

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
          <DateInput
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-surface border border-line rounded-modal text-[15px] outline-none"
          />
        </div>

        <p className="text-[11px] text-text-tertiary">
          {plan.entries.length === 0 ? (
            '請至少勾選一筆要結清的項目。'
          ) : (
            <>
              將對 {plan.entries.length} 筆借還款各記一筆全額還款到同一帳戶，該帳戶淨變動
              {net === 0 ? ' 0' : ` ${net > 0 ? '+' : '−'}NT$ ${formatNumber(Math.abs(net))}`}
              ，不另外產生轉帳記錄。未勾選的項目維持原未結清金額。
            </>
          )}
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
