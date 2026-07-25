import { useState, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faHandHoldingDollar, faChevronRight, faUser } from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../../db/DataProvider'
import { counterpartyLoanStats } from '../../lib/engine'
import { formatSigned, formatNumber } from '../../lib/format'
import CounterpartyLoanSheet from './CounterpartyLoanSheet'

// 首頁借貸卡：依對象列出未結清的應收應付與淨額，點進去看明細／登錄還款／一次結清。
// 全部結清後整張卡消失，平時不佔首頁版面。合計與淨資產卡共用 engine 的同一組口徑。
export default function LoanCard({ txns, accounts, asOf, opt }) {
  const counterparties = useCollection('counterparties')
  const [detail, setDetail] = useState(null) // { counterpartyId, name } | null

  const rows = useMemo(() => counterpartyLoanStats(txns, asOf), [txns, asOf])
  const nameOf = (id) => counterparties.find((c) => c.id === id)?.name ?? '未指定對象'

  // 明細開著時不整個消失：在明細裡結清完最後一筆會讓 rows 變空，
  // 若此時卡片連同 Sheet 一起卸載，畫面會突然抽掉。等使用者自己關閉。
  if (rows.length === 0 && !detail) return null

  const net = rows.reduce((s, r) => s + r.net, 0)

  return (
    <>
      {rows.length > 0 && (
        <div className="bg-surface border border-line rounded-card shadow-card p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-2 text-[15px] font-semibold">
              <FontAwesomeIcon icon={faHandHoldingDollar} className="text-text-tertiary text-sm" />
              借貸
            </span>
            <span className={`text-[15px] font-semibold tabular-nums ${net >= 0 ? 'text-income' : 'text-expense'}`}>
              {formatSigned(net, opt)}
            </span>
          </div>

          <div className="divide-y divide-line-light">
            {rows.map((r) => (
              <button
                key={r.counterpartyId ?? '__none__'}
                onClick={() => setDetail({ counterpartyId: r.counterpartyId, name: nameOf(r.counterpartyId) })}
                className="flex items-center gap-2.5 w-full py-2.5 text-left"
              >
                <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
                  <FontAwesomeIcon icon={faUser} className="text-sm" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium truncate">{nameOf(r.counterpartyId)}</span>
                  <span className="block text-xs text-text-tertiary tabular-nums">
                    {r.receivable > 0 && `應收 ${formatNumber(r.receivable)}`}
                    {r.receivable > 0 && r.payable > 0 && '・'}
                    {r.payable > 0 && `應付 ${formatNumber(r.payable)}`}
                  </span>
                </span>
                <span
                  className={`text-[15px] font-semibold tabular-nums ${
                    r.net > 0 ? 'text-income' : r.net < 0 ? 'text-expense' : 'text-text-tertiary'
                  }`}
                >
                  {r.net === 0 ? '互抵' : formatSigned(r.net, opt)}
                </span>
                <FontAwesomeIcon icon={faChevronRight} className="text-text-tertiary text-[11px] flex-none" />
              </button>
            ))}
          </div>
        </div>
      )}

      <CounterpartyLoanSheet
        open={!!detail}
        counterpartyId={detail?.counterpartyId ?? null}
        name={detail?.name ?? ''}
        txns={txns}
        accounts={accounts}
        onClose={() => setDetail(null)}
      />
    </>
  )
}
