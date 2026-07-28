import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronDown,
  faChevronRight,
  faTrashCan,
  faPlus,
  faHandshake,
  faPen,
} from '@fortawesome/free-solid-svg-icons'
import { removeRepayment } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { useConfirm } from '../ConfirmSheet'
import { outstanding, settlementStatus } from '../../lib/engine'
import { formatNumber } from '../../lib/format'
import { formatMd } from '../../lib/date'
import Sheet from '../Sheet'
import { STATUS } from '../transaction/TransactionRow'
import RepaymentSheet from './RepaymentSheet'
import NetSettleSheet from './NetSettleSheet'

const TABS = [
  { id: 'open', label: '未結清' },
  { id: 'all', label: '全部' },
]

// 某個對象的借還款明細：逐筆看未結清與還款記錄、登錄還款、一次結清（docs/03 §D）。
// counterpartyId 可為 null（未指定對象的舊資料也要看得到）。
export default function CounterpartyLoanSheet({ open, counterpartyId = null, name, txns, accounts, onClose }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('open')
  const [expanded, setExpanded] = useState({}) // txId → bool
  const [repaying, setRepaying] = useState(null) // 登錄還款中的交易
  const [settleOpen, setSettleOpen] = useState(false)
  const { run } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  const rows = useMemo(() => {
    const mine = txns
      .filter(
        (t) =>
          (t.type === 'receivable' || t.type === 'payable') &&
          (t.counterpartyId ?? null) === (counterpartyId ?? null),
      )
      .sort((a, b) => (a.postingDate < b.postingDate ? 1 : -1))
    return tab === 'open' ? mine.filter((t) => outstanding(t) > 0) : mine
  }, [txns, counterpartyId, tab])

  const totals = useMemo(() => {
    let recv = 0
    let pay = 0
    for (const t of txns) {
      if ((t.counterpartyId ?? null) !== (counterpartyId ?? null)) continue
      const left = outstanding(t)
      if (left <= 0) continue
      if (t.type === 'receivable') recv += left
      else if (t.type === 'payable') pay += left
    }
    return { recv, pay, net: recv - pay }
  }, [txns, counterpartyId])

  const accName = (id) => accounts.find((a) => a.id === id)?.name ?? '未知帳戶'

  const delRepayment = async (tx, r) => {
    const ok = await confirm({
      title: '刪除還款記錄',
      message: `刪除 ${formatMd(r.date)} 的 NT$ ${formatNumber(r.amount)}？帳戶餘額與未結清金額會一併回復。`,
      danger: true,
    })
    if (!ok) return
    run(async () => {
      await settle(removeRepayment(tx.id, r))
    })
  }

  const hasOpen = totals.recv > 0 || totals.pay > 0

  return (
    <Sheet open={open} onClose={onClose} title={name} bodyClassName="overflow-y-auto">
      <div className="p-[18px] flex flex-col gap-3.5">
        {/* 摘要 */}
        <div className="bg-surface-alt rounded-modal p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-text-secondary">他欠你（應收）</span>
            <span className="tabular-nums">NT$ {formatNumber(totals.recv)}</span>
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-text-secondary">你欠他（應付）</span>
            <span className="tabular-nums">NT$ {formatNumber(totals.pay)}</span>
          </div>
          <div className="border-t border-line pt-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold">
              {totals.net > 0 ? '淨額他欠你' : totals.net < 0 ? '淨額你欠他' : '互不相欠'}
            </span>
            <span
              className={`text-lg font-bold tabular-nums ${
                totals.net > 0 ? 'text-income' : totals.net < 0 ? 'text-expense' : ''
              }`}
            >
              NT$ {formatNumber(Math.abs(totals.net))}
            </span>
          </div>
        </div>

        {hasOpen && (
          <button
            onClick={() => setSettleOpen(true)}
            className="flex items-center justify-center gap-1.5 h-[42px] rounded-btn bg-brand text-white text-[13px] font-semibold"
          >
            <FontAwesomeIcon icon={faHandshake} className="text-xs" /> 結清
          </button>
        )}

        {/* 未結清 / 全部 */}
        <div className="flex gap-1.5 p-1 bg-surface-alt rounded-modal">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 rounded-btn text-[13px] font-semibold ${
                tab === t.id ? 'bg-surface text-text-primary shadow-segment' : 'text-text-secondary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="text-[13px] text-text-tertiary text-center py-6">
            {tab === 'open' ? '沒有未結清的借還款' : '沒有借還款記錄'}
          </p>
        ) : (
          <div className="bg-surface border border-line rounded-card divide-y divide-line-light">
            {rows.map((tx) => {
              const st = STATUS[settlementStatus(tx)]
              const left = outstanding(tx)
              const isRecv = tx.type === 'receivable'
              const reps = tx.repayments ?? []
              const isOpen = !!expanded[tx.id]
              return (
                <div key={tx.id}>
                  <button
                    onClick={() => setExpanded((s) => ({ ...s, [tx.id]: !isOpen }))}
                    className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left"
                  >
                    <FontAwesomeIcon
                      icon={isOpen ? faChevronDown : faChevronRight}
                      className="text-text-tertiary text-[11px] flex-none"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-medium">
                          {tx.linkGroupId ? (isRecv ? '代墊' : '代付') : isRecv ? '借出' : '借入'}
                        </span>
                        <span className={`text-[11px] font-semibold rounded-pill px-2 py-0.5 ${st.cls}`}>
                          {st.label}
                        </span>
                      </div>
                      <div className="text-xs text-text-tertiary truncate mt-0.5">
                        {formatMd(tx.postingDate)}
                        {tx.note ? `・${tx.note}` : ''}
                      </div>
                    </div>
                    <div className="text-right flex-none">
                      <div className={`text-[15px] font-semibold tabular-nums ${isRecv ? 'text-income' : 'text-expense'}`}>
                        NT$ {formatNumber(tx.amount)}
                      </div>
                      {left > 0 && left !== tx.amount && (
                        <div className="text-[11px] text-text-tertiary tabular-nums">未結清 {formatNumber(left)}</div>
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-3.5 pb-3 pl-9 flex flex-col gap-1.5">
                      {reps.map((r, i) => (
                        <div key={`${r.date}-${r.amount}-${r.accountId}-${i}`} className="flex items-center gap-2 text-[13px]">
                          <span className="text-text-tertiary tabular-nums flex-none">{formatMd(r.date)}</span>
                          <span className="text-text-secondary truncate flex-1">{accName(r.accountId)}</span>
                          <span className="tabular-nums flex-none">NT$ {formatNumber(r.amount)}</span>
                          <button
                            onClick={() => delRepayment(tx, r)}
                            className="w-7 h-7 flex-none flex items-center justify-center text-text-tertiary"
                          >
                            <FontAwesomeIcon icon={faTrashCan} className="text-xs" />
                          </button>
                        </div>
                      ))}
                      {reps.length === 0 && (
                        <div className="text-[13px] text-text-tertiary">尚未登錄任何{isRecv ? '收款' : '還款'}</div>
                      )}
                      <div className="flex gap-2 mt-1">
                        {left > 0 && (
                          <button
                            onClick={() => setRepaying(tx)}
                            className="flex items-center gap-1.5 h-[34px] px-3 rounded-chip bg-brand text-white text-[13px] font-semibold"
                          >
                            <FontAwesomeIcon icon={faPlus} className="text-xs" />
                            {isRecv ? '登錄收款' : '登錄還款'}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            onClose()
                            navigate(`/add?id=${tx.id}`)
                          }}
                          className="flex items-center gap-1.5 h-[34px] px-3 rounded-chip bg-surface border border-line text-[13px] font-medium text-text-secondary"
                        >
                          <FontAwesomeIcon icon={faPen} className="text-xs" /> 編輯這筆
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <RepaymentSheet
        open={!!repaying}
        tx={repaying}
        accounts={accounts}
        onClose={() => setRepaying(null)}
      />
      <NetSettleSheet
        open={settleOpen}
        counterpartyId={counterpartyId}
        name={name}
        txns={txns}
        accounts={accounts}
        onClose={() => setSettleOpen(false)}
      />
      {confirmElement}
    </Sheet>
  )
}
