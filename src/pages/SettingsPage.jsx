import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faChevronRight, faTrashCan, faRepeat, faPercent } from '@fortawesome/free-solid-svg-icons'
import { db } from '../db'
import { accountBalances } from '../lib/engine'
import { updateRecurringRule, deleteRecurringRule } from '../db/repo'
import { formatBalance, formatAmount } from '../lib/format'
import { todayStr, formatMd } from '../lib/date'
import { accountIcon } from '../lib/icons'
import AccountEditSheet from '../components/settings/AccountEditSheet'
import BrokerEditSheet from '../components/settings/BrokerEditSheet'

const FREQ_LABEL = { week: '每週', month: '每月', year: '每年' }
const MODE_LABEL = { immediate: '自動入帳', deferred: '提前產生', reminder: '僅提醒' }

const GROUPS = [
  { type: 'cash', label: '現金' },
  { type: 'bank', label: '銀行' },
  { type: 'credit_card', label: '信用卡' },
  { type: 'securities', label: '證券' },
]

export default function SettingsPage() {
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])
  const txns = useLiveQuery(() => db.transactions.toArray(), [], [])
  const rules = useLiveQuery(() => db.recurringRules.toArray(), [], [])
  const brokers = useLiveQuery(() => db.brokers.toArray(), [], [])
  const stockTxns = useLiveQuery(() => db.stockTransactions.toArray(), [], [])

  // editing: undefined=關閉、null=新增、帳戶物件=編輯
  const [editing, setEditing] = useState(undefined)
  const [editingBroker, setEditingBroker] = useState(undefined)

  const balances = accountBalances(accounts, txns, todayStr())
  const sorted = [...accounts].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  return (
    <div className="px-4 pt-4 pb-4 lg:px-7 lg:pt-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">設定</h1>

      {/* 帳戶管理 */}
      <div className="flex items-center justify-between px-0.5 mb-2">
        <span className="text-[15px] font-semibold">帳戶管理</span>
        <button
          onClick={() => setEditing(null)}
          className="flex items-center gap-1.5 h-[34px] px-3 rounded-chip bg-brand text-white text-[13px] font-semibold"
        >
          <FontAwesomeIcon icon={faPlus} className="text-xs" /> 新增帳戶
        </button>
      </div>

      <div className="bg-surface border border-line rounded-card shadow-card px-3.5">
        {GROUPS.map((g, gi) => {
          const list = sorted.filter((a) => a.type === g.type)
          if (list.length === 0) return null
          return (
            <div key={g.type} className={gi > 0 ? 'border-t border-line-light' : ''}>
              <div className="text-[13px] font-semibold text-text-secondary pt-3 pb-1">{g.label}</div>
              {list.map((a) => {
                const isCard = a.type === 'credit_card'
                const bal = balances[a.id] ?? 0
                return (
                  <button
                    key={a.id}
                    onClick={() => setEditing(a)}
                    className={`flex items-center gap-3 w-full py-2.5 text-left ${a.isArchived ? 'opacity-50' : ''}`}
                  >
                    <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
                      <FontAwesomeIcon icon={accountIcon(a)} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[15px] font-medium truncate">{a.name}</span>
                        {a.isArchived && (
                          <span className="flex-none text-[11px] text-text-tertiary bg-surface-alt rounded-chip px-1.5 py-0.5">
                            已封存
                          </span>
                        )}
                      </div>
                      {isCard && a.creditLimit > 0 && (
                        <span className="text-xs text-text-tertiary tabular-nums">
                          額度 {formatAmount(a.creditLimit)} · 可用 {formatAmount(a.creditLimit + bal)}
                        </span>
                      )}
                    </div>
                    <span className="text-[13px] text-text-secondary tabular-nums">
                      {isCard ? `已用 ${formatAmount(-bal)}` : formatBalance(bal)}
                    </span>
                    <FontAwesomeIcon icon={faChevronRight} className="text-text-tertiary text-[11px]" />
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* 券商設定 */}
      <div className="flex items-center justify-between px-0.5 mt-6 mb-2">
        <span className="text-[15px] font-semibold">券商設定</span>
        <button
          onClick={() => setEditingBroker(null)}
          className="flex items-center gap-1.5 h-[34px] px-3 rounded-chip bg-brand text-white text-[13px] font-semibold"
        >
          <FontAwesomeIcon icon={faPlus} className="text-xs" /> 新增券商
        </button>
      </div>

      <div className="bg-surface border border-line rounded-card shadow-card px-3.5 divide-y divide-line-light">
        {brokers.length === 0 ? (
          <div className="py-6 text-center text-text-tertiary text-sm">尚未建立券商</div>
        ) : (
          brokers.map((b) => (
            <button
              key={b.id}
              onClick={() => setEditingBroker(b)}
              className="flex items-center gap-3 w-full py-3 text-left"
            >
              <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
                <FontAwesomeIcon icon={faPercent} className="text-sm" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium truncate">{b.name}</div>
                <div className="text-xs text-text-tertiary tabular-nums">
                  {b.feeDiscount < 1
                    ? `${+(b.feeDiscount * 10).toFixed(2)} 折`
                    : '不折'}
                  {' · '}最低 NT$ {b.minFee ?? 20}
                </div>
              </div>
              <FontAwesomeIcon icon={faChevronRight} className="text-text-tertiary text-[11px]" />
            </button>
          ))
        )}
      </div>

      {/* 週期性收支 */}
      {rules.length > 0 && (
        <>
          <div className="px-0.5 mt-6 mb-2 text-[15px] font-semibold">週期性收支</div>
          <div className="bg-surface border border-line rounded-card shadow-card px-3.5 divide-y divide-line-light">
            {rules
              .slice()
              .sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1))
              .map((r) => (
                <div key={r.id} className={`flex items-center gap-3 py-3 ${r.isActive ? '' : 'opacity-50'}`}>
                  <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
                    <FontAwesomeIcon icon={faRepeat} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium truncate">{r.name ?? '週期項目'}</div>
                    <div className="text-xs text-text-tertiary tabular-nums">
                      {FREQ_LABEL[r.frequency?.unit] ?? ''} · {MODE_LABEL[r.postingMode] ?? ''} · 下次 {formatMd(r.nextDate)}
                    </div>
                  </div>
                  <button
                    onClick={() => updateRecurringRule(r.id, { isActive: !r.isActive })}
                    className="text-[13px] font-medium text-text-secondary px-2"
                  >
                    {r.isActive ? '暫停' : '啟用'}
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('刪除此週期性規則？（已產生的交易不受影響）')) deleteRecurringRule(r.id)
                    }}
                    className="w-8 h-8 flex items-center justify-center text-text-tertiary"
                  >
                    <FontAwesomeIcon icon={faTrashCan} className="text-xs" />
                  </button>
                </div>
              ))}
          </div>
        </>
      )}

      <p className="text-text-tertiary text-xs mt-6 px-0.5">
        分類、標籤、備份同步、偏好等其餘設定將於後續階段實作。
      </p>

      <AccountEditSheet
        open={editing !== undefined}
        account={editing ?? null}
        accounts={accounts}
        brokers={brokers}
        onClose={() => setEditing(undefined)}
      />

      <BrokerEditSheet
        open={editingBroker !== undefined}
        broker={editingBroker ?? null}
        stockTxns={stockTxns}
        onClose={() => setEditingBroker(undefined)}
      />
    </div>
  )
}
