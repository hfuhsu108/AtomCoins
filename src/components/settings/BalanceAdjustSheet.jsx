import { useState, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck } from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../../db/DataProvider'
import { createTransaction, updateTransaction } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { useConfirm } from '../ConfirmSheet'
import { accountBalances } from '../../lib/engine'
import { formatBalance, formatSigned } from '../../lib/format'
import { todayStr } from '../../lib/date'
import Sheet from '../Sheet'
import DateInput from '../DateInput'

// 允許負號（信用卡未繳額為負，雖然 v1 入口只開現金/銀行，公式本身不設限）
function toInt(s) {
  const n = parseInt(String(s).replace(/[^0-9-]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

// 餘額調整（錨定型，docs/02 §4.1）。存的是「這天結束時實際上有多少錢」，不是差額——
// 因此錨點日之前再怎麼補記或刪除，該日起的餘額都不再變動。差額只是給人看的，引擎不讀。
export default function BalanceAdjustSheet({ open, account, tx = null, onClose }) {
  const accounts = useCollection('accounts')
  const txns = useCollection('transactions')
  const stockTxns = useCollection('stockTransactions')

  const [date, setDate] = useState(tx?.postingDate ?? todayStr())
  const [targetStr, setTargetStr] = useState(tx?.targetBalance != null ? String(tx.targetBalance) : '')
  const [note, setNote] = useState(tx?.note ?? '')

  // 切換對象（換帳戶或改編輯既有錨點）時重置表單
  const key = `${account?.id ?? 'none'}:${tx?.id ?? 'new'}`
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setDate(tx?.postingDate ?? todayStr())
    setTargetStr(tx?.targetBalance != null ? String(tx.targetBalance) : '')
    setNote(tx?.note ?? '')
  }

  const { run, busy, error } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  // 編輯既有錨點時要把自己排除，否則「目前餘額」會直接顯示自己宣告的目標值，差額恆為 0
  const current = useMemo(() => {
    if (!account) return 0
    const others = tx ? txns.filter((t) => t.id !== tx.id) : txns
    return accountBalances(accounts, others, date, stockTxns)[account.id] ?? 0
  }, [account, accounts, txns, stockTxns, date, tx])

  const hasTarget = targetStr !== '' && targetStr !== '-'
  const target = toInt(targetStr)
  const delta = target - current

  const save = () => {
    if (!account || !hasTarget) return
    run(async () => {
      if (tx) {
        const ok = await confirm({
          title: '修改餘額調整',
          message: `此帳戶自 ${date} 起的所有餘額與淨資產都會跟著改變。確定修改？`,
          danger: true,
        })
        if (!ok) return
        // 三欄同一次 patch：兩個日期分岔會讓引擎、卡帳、CSV 各走各的口徑
        await settle(
          updateTransaction(tx.id, {
            targetBalance: target,
            snapshotDelta: delta,
            amount: Math.abs(delta),
            tradeDate: date,
            postingDate: date,
            note: note.trim() || null,
          }),
        )
      } else {
        await settle(
          createTransaction({
            type: 'adjust',
            accountId: account.id,
            targetBalance: target,
            // snapshotDelta / amount 純顯示與搜尋用（明細列與金額區間篩選都讀 amount），
            // 引擎一律以 targetBalance 為準——讀了差額就退化成固定差額，錨定語義即失效
            snapshotDelta: delta,
            amount: Math.abs(delta),
            tradeDate: date,
            postingDate: date,
            note: note.trim() || null,
          }),
        )
      }
      onClose()
    })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tx ? '修改餘額調整' : '調整餘額'}
      bodyClassName="overflow-y-auto"
    >
      <div className="p-[18px] flex flex-col gap-3.5">
        <div className="flex items-baseline justify-between px-1">
          <span className="text-[13px] text-text-secondary">帳戶</span>
          <span className="text-[15px] font-semibold">{account?.name ?? '—'}</span>
        </div>

        {/* 基準日：不允許未來——錨點是「已經確認過的事實」，先寫未來值會讓中間的餘額變成猜測 */}
        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">基準日</div>
          <DateInput
            value={date}
            max={todayStr()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-surface border border-line rounded-modal text-[15px] outline-none"
          />
        </div>

        <div className="p-3.5 rounded-modal border border-line bg-surface-alt">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text-secondary">App 目前記錄</span>
            <span className="text-[15px] font-semibold tabular-nums">{formatBalance(current)}</span>
          </div>
        </div>

        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">實際餘額</div>
          <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal flex items-center gap-1 text-[17px] font-semibold tabular-nums">
            <span className="text-text-tertiary text-sm">NT$</span>
            <input
              inputMode="numeric"
              value={targetStr}
              onChange={(e) => setTargetStr(e.target.value.replace(/[^0-9-]/g, ''))}
              placeholder={String(current)}
              className="w-full outline-none bg-transparent placeholder:text-text-tertiary placeholder:font-normal"
            />
          </div>
        </div>

        {hasTarget && (
          <div className="p-3.5 rounded-modal border border-line bg-surface-alt">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-text-secondary">差額</span>
              <span
                className={`text-lg font-bold tabular-nums ${
                  delta === 0 ? 'text-text-secondary' : delta > 0 ? 'text-income' : 'text-expense'
                }`}
              >
                {delta === 0 ? '沒有差額' : formatSigned(delta)}
              </span>
            </div>
          </div>
        )}

        <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="備註（選填），例如：對帳補正"
            className="w-full text-sm outline-none bg-transparent placeholder:text-text-tertiary"
          />
        </div>

        <p className="text-[11px] text-text-tertiary px-1 leading-relaxed">
          儲存後，此帳戶在 {date} 的餘額就固定為你填的金額。之後就算補記或刪除該日以前的交易，
          這天起的餘額也不會再變。基準日<span className="font-semibold">當天</span>的交易會一併被吸收，
          當天稍後才補的帳請記在隔天。
        </p>

        {error && <div className="text-[13px] text-error px-1">{error}</div>}
        <button
          onClick={save}
          disabled={!hasTarget || busy}
          className="flex items-center justify-center gap-1.5 h-[42px] rounded-btn bg-brand text-white text-[13px] font-semibold disabled:opacity-40"
        >
          <FontAwesomeIcon icon={faCheck} className="text-xs" />
          {tx ? '儲存修改' : '設定為實際餘額'}
        </button>
      </div>
      {confirmElement}
    </Sheet>
  )
}
