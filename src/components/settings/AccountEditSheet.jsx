import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faXmark, faChevronDown, faBoxArchive, faBoxOpen, faPercent, faPlus, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { createAccount, updateAccount, createStockTransaction, deleteAccountCascade } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { useCollection } from '../../db/DataProvider'
import { useConfirm } from '../ConfirmSheet'
import { newId } from '../../lib/id'
import { todayStr } from '../../lib/date'
import Sheet from '../Sheet'
import AccountPicker from '../transaction/AccountPicker'

const TYPES = [
  { id: 'cash', label: '現金' },
  { id: 'bank', label: '銀行' },
  { id: 'credit_card', label: '信用卡' },
  { id: 'securities', label: '證券' },
]

// 把輸入字串轉整數（元）；允許負號（信用卡期初可為負債）
function toInt(s) {
  const n = parseInt(String(s).replace(/[^0-9-]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

// 由既有帳戶回填表單；新增時給空白預設
function initState(account) {
  return {
    name: account?.name ?? '',
    type: account?.type ?? 'bank',
    openingBalance: account ? String(account.openingBalance ?? 0) : '0',
    openingDate: account?.openingDate ?? todayStr(),
    creditLimit: account?.creditLimit != null ? String(account.creditLimit) : '',
    statementDay: account?.statementDay != null ? String(account.statementDay) : '',
    paymentDueDay: account?.paymentDueDay != null ? String(account.paymentDueDay) : '',
    linkedDebitAccountId: account?.linkedDebitAccountId ?? null,
    defaultSettlementBankId: account?.defaultSettlementBankId ?? null,
    defaultBrokerId: account?.defaultBrokerId ?? null,
    // 期初持股（僅新增證券帳戶時填）：[{ symbol, name, shares, avgCost }]，成本不扣現金
    openingHoldings: [],
  }
}

// 帳戶新增/編輯。account=null 為新增、傳入帳戶為編輯。accounts 供自動扣繳帳戶選擇與排序。
export default function AccountEditSheet({ open, account, accounts, brokers = [], onClose }) {
  const [s, setS] = useState(() => initState(account))
  // 'debit' | 'settlementBank' | 'broker' | null
  const [pickerTarget, setPickerTarget] = useState(null)
  const set = (patch) => setS((prev) => ({ ...prev, ...patch }))

  // account 變更（切換編輯對象）時重置表單
  const key = account?.id ?? 'new'
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setS(initState(account))
  }

  const isCard = s.type === 'credit_card'
  const isSecurities = s.type === 'securities'
  const canSave = s.name.trim().length > 0
  const debitAccount = accounts.find((a) => a.id === s.linkedDebitAccountId)
  const settleBankObj = accounts.find((a) => a.id === s.defaultSettlementBankId)
  const brokerObj = brokers.find((b) => b.id === s.defaultBrokerId)

  const { run, busy, error } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  // 刪除時會一併清掉的關聯記錄數（交易／股票／帳單）
  const txns = useCollection('transactions')
  const stockTxns = useCollection('stockTransactions')
  const statements = useCollection('creditCardStatements')
  const refCount = account
    ? txns.filter((t) =>
        t.accountId === account.id || t.fromAccountId === account.id || t.toAccountId === account.id ||
        (t.repayments ?? []).some((r) => r.accountId === account.id),
      ).length +
      stockTxns.filter((t) => t.securitiesAccountId === account.id || t.settlementBankId === account.id).length +
      statements.filter((st) => st.accountId === account.id).length
    : 0

  const handleDelete = async () => {
    if (!account) return
    const msg = refCount > 0
      ? `此帳戶有 ${refCount} 筆關聯記錄（交易／股票／帳單），刪除會一併刪除它們，且無法復原。確定刪除？`
      : '確定刪除此帳戶？此動作無法復原。'
    if (!(await confirm({ title: '刪除帳戶', message: msg, danger: true }))) return
    run(async () => {
      await settle(deleteAccountCascade(account.id))
      onClose()
    })
  }

  const save = () => {
    if (!canSave) return
    const nextSort = accounts.length ? Math.max(...accounts.map((a) => a.sortOrder ?? 0)) + 1 : 0
    // 期初持股需在建帳戶前先取得 id（離線時 settle 回 undefined，不依賴回傳值）
    const acctId = account?.id ?? newId()
    const data = {
      ...(account ? {} : { id: acctId }),
      name: s.name.trim(),
      type: s.type,
      icon: account?.icon ?? null,
      color: account?.color ?? null,
      openingBalance: toInt(s.openingBalance),
      openingDate: s.openingDate,
      isArchived: account?.isArchived ?? false,
      sortOrder: account?.sortOrder ?? nextSort,
      note: account?.note ?? null,
      // 非信用卡一律清空專屬欄位，避免改型別後殘留
      creditLimit: isCard ? toInt(s.creditLimit) : null,
      statementDay: isCard && s.statementDay ? toInt(s.statementDay) : null,
      paymentDueDay: isCard && s.paymentDueDay ? toInt(s.paymentDueDay) : null,
      linkedDebitAccountId: isCard ? s.linkedDebitAccountId : null,
      // 非證券一律清空
      defaultSettlementBankId: isSecurities ? s.defaultSettlementBankId : null,
      defaultBrokerId: isSecurities ? s.defaultBrokerId : null,
    }
    run(async () => {
      await settle(account ? updateAccount(account.id, data) : createAccount(data))
      // 期初持股（僅新增證券帳戶）：建 isOpening buy 交易，只計持股不扣現金
      if (!account && isSecurities) {
        for (const h of s.openingHoldings) {
          const shares = toInt(h.shares)
          const price = parseFloat(h.avgCost) || 0
          if (!h.symbol.trim() || shares <= 0 || price <= 0) continue
          await settle(createStockTransaction({
            side: 'buy',
            isOpening: true,
            securitiesAccountId: acctId,
            symbol: h.symbol.trim(),
            name: h.name.trim() || h.symbol.trim(),
            instrumentType: 'stock',
            shares,
            price,
            fee: 0,
            tax: 0,
            brokerId: s.defaultBrokerId ?? null,
            settlementBankId: s.defaultSettlementBankId ?? null,
            tradeDate: s.openingDate,
            settlementDate: s.openingDate,
          }))
        }
      }
      onClose()
    })
  }

  // 期初持股列操作
  const addHolding = () =>
    set({ openingHoldings: [...s.openingHoldings, { symbol: '', name: '', shares: '', avgCost: '' }] })
  const setHolding = (i, patch) =>
    set({ openingHoldings: s.openingHoldings.map((h, j) => (j === i ? { ...h, ...patch } : h)) })
  const removeHolding = (i) => set({ openingHoldings: s.openingHoldings.filter((_, j) => j !== i) })

  const toggleArchive = () => {
    if (!account) return
    run(async () => {
      await settle(updateAccount(account.id, { isArchived: !account.isArchived }))
      onClose()
    })
  }

  // 自動扣繳來源只取現金/銀行帳戶
  const debitCandidates = accounts.filter((a) => a.type === 'cash' || a.type === 'bank')

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={account ? '編輯帳戶' : '新增帳戶'}
      bodyClassName="overflow-y-auto"
    >
      <div className="p-[18px] flex flex-col gap-3.5">
        {/* 名稱 */}
        <Field label="名稱">
          <input
            value={s.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="例如：玉山信用卡"
            className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary"
          />
        </Field>

        {/* 類型 */}
        <div>
          <div className="text-[13px] text-text-secondary mb-2">類型</div>
          <div className="flex gap-1.5 p-1 bg-surface-alt rounded-modal">
            {TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => set({ type: t.id })}
                className={`flex-1 py-2 rounded-btn text-[13px] font-semibold ${
                  s.type === t.id ? 'bg-surface text-text-primary shadow-segment' : 'text-text-secondary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 期初餘額 + 起始日 */}
        <div className="flex gap-3">
          <Field label={isCard ? '期初未繳（負數）' : '期初餘額'} className="flex-1">
            <div className="flex items-center gap-1 text-[15px] tabular-nums">
              <span className="text-text-tertiary text-sm">NT$</span>
              <input
                inputMode="numeric"
                value={s.openingBalance}
                onChange={(e) => set({ openingBalance: e.target.value.replace(/[^0-9-]/g, '') })}
                className="w-full outline-none bg-transparent"
              />
            </div>
          </Field>
          <Field label="起始日" className="flex-1">
            <input
              type="date"
              value={s.openingDate}
              onChange={(e) => e.target.value && set({ openingDate: e.target.value })}
              className="w-full text-[15px] outline-none bg-transparent"
            />
          </Field>
        </div>

        {/* 信用卡專屬 */}
        {isCard && (
          <>
            <Field label="信用額度">
              <div className="flex items-center gap-1 text-[15px] tabular-nums">
                <span className="text-text-tertiary text-sm">NT$</span>
                <input
                  inputMode="numeric"
                  value={s.creditLimit}
                  onChange={(e) => set({ creditLimit: e.target.value.replace(/[^0-9]/g, '') })}
                  placeholder="0"
                  className="w-full outline-none bg-transparent placeholder:text-text-tertiary"
                />
              </div>
            </Field>
            <div className="flex gap-3">
              <Field label="出帳日（每月）" className="flex-1">
                <input
                  inputMode="numeric"
                  value={s.statementDay}
                  onChange={(e) => set({ statementDay: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) })}
                  placeholder="例如 5"
                  className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary"
                />
              </Field>
              <Field label="繳費日（每月）" className="flex-1">
                <input
                  inputMode="numeric"
                  value={s.paymentDueDay}
                  onChange={(e) => set({ paymentDueDay: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) })}
                  placeholder="例如 23"
                  className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary"
                />
              </Field>
            </div>
            <p className="text-[11px] text-text-tertiary px-1 -mt-1.5">繳款日小於等於結帳日時，視為次月繳款</p>
            <Field label="自動扣繳帳戶（選填）">
              <button
                onClick={() => setPickerTarget('debit')}
                className="w-full flex items-center justify-between text-[15px]"
              >
                <span className={debitAccount ? '' : 'text-text-tertiary'}>
                  {debitAccount?.name ?? '未設定'}
                </span>
                <span className="flex items-center gap-2">
                  {s.linkedDebitAccountId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        set({ linkedDebitAccountId: null })
                      }}
                      className="text-text-tertiary"
                    >
                      <FontAwesomeIcon icon={faXmark} className="text-xs" />
                    </button>
                  )}
                  <FontAwesomeIcon icon={faChevronDown} className="text-text-tertiary text-[11px]" />
                </span>
              </button>
            </Field>
          </>
        )}

        {/* 證券帳戶專屬 */}
        {isSecurities && (
          <>
            <Field label="交割銀行">
              <button
                onClick={() => setPickerTarget('settlementBank')}
                className="w-full flex items-center justify-between text-[15px]"
              >
                <span className={settleBankObj ? '' : 'text-text-tertiary'}>
                  {settleBankObj?.name ?? '選擇銀行帳戶'}
                </span>
                <span className="flex items-center gap-2">
                  {s.defaultSettlementBankId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        set({ defaultSettlementBankId: null })
                      }}
                      className="text-text-tertiary"
                    >
                      <FontAwesomeIcon icon={faXmark} className="text-xs" />
                    </button>
                  )}
                  <FontAwesomeIcon icon={faChevronDown} className="text-text-tertiary text-[11px]" />
                </span>
              </button>
            </Field>
            <Field label="預設券商">
              <button
                onClick={() => setPickerTarget('broker')}
                className="w-full flex items-center justify-between text-[15px]"
              >
                <span className={brokerObj ? '' : 'text-text-tertiary'}>
                  {brokerObj?.name ?? '選擇券商'}
                </span>
                <span className="flex items-center gap-2">
                  {s.defaultBrokerId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        set({ defaultBrokerId: null })
                      }}
                      className="text-text-tertiary"
                    >
                      <FontAwesomeIcon icon={faXmark} className="text-xs" />
                    </button>
                  )}
                  <FontAwesomeIcon icon={faChevronDown} className="text-text-tertiary text-[11px]" />
                </span>
              </button>
            </Field>

            {/* 期初持股（僅新增證券帳戶）：追蹤前已持有，只建持股不扣交割銀行現金 */}
            {!account && (
              <div>
                <div className="text-[13px] text-text-secondary mb-1.5">已持有證券（選填）</div>
                <div className="flex flex-col gap-2">
                  {s.openingHoldings.map((h, i) => (
                    <div key={i} className="bg-surface border border-line rounded-modal p-2.5 flex flex-col gap-2">
                      <div className="flex gap-2">
                        <input
                          value={h.symbol}
                          onChange={(e) => setHolding(i, { symbol: e.target.value.replace(/\s/g, '') })}
                          placeholder="代號 2330"
                          className="w-[92px] flex-none text-[15px] tabular-nums outline-none bg-surface-alt rounded-btn px-2.5 h-9 placeholder:text-text-tertiary"
                        />
                        <input
                          value={h.name}
                          onChange={(e) => setHolding(i, { name: e.target.value })}
                          placeholder="股名（選填）"
                          className="flex-1 min-w-0 text-[15px] outline-none bg-surface-alt rounded-btn px-2.5 h-9 placeholder:text-text-tertiary"
                        />
                        <button
                          onClick={() => removeHolding(i)}
                          className="w-9 h-9 flex-none flex items-center justify-center text-text-tertiary"
                        >
                          <FontAwesomeIcon icon={faTrashCan} className="text-xs" />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          inputMode="numeric"
                          value={h.shares}
                          onChange={(e) => setHolding(i, { shares: e.target.value.replace(/[^0-9]/g, '') })}
                          placeholder="股數"
                          className="flex-1 min-w-0 text-[15px] tabular-nums outline-none bg-surface-alt rounded-btn px-2.5 h-9 placeholder:text-text-tertiary"
                        />
                        <input
                          inputMode="decimal"
                          value={h.avgCost}
                          onChange={(e) => setHolding(i, { avgCost: e.target.value.replace(/[^0-9.]/g, '') })}
                          placeholder="平均成本"
                          className="flex-1 min-w-0 text-[15px] tabular-nums outline-none bg-surface-alt rounded-btn px-2.5 h-9 placeholder:text-text-tertiary"
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addHolding}
                    className="flex items-center justify-center gap-1.5 h-10 rounded-btn border border-dashed border-line text-[13px] font-medium text-text-secondary"
                  >
                    <FontAwesomeIcon icon={faPlus} className="text-xs" /> 新增一檔
                  </button>
                </div>
                <p className="text-[11px] text-text-tertiary mt-1.5 px-1">
                  期初持股只計入持股市值與成本，不扣交割銀行現金（現金請填在期初餘額）。
                </p>
              </div>
            )}
          </>
        )}

        {/* 動作 */}
        {error && <div className="text-[13px] text-error px-1">{error}</div>}
        <div className="flex items-center gap-2 mt-1">
          {account && (
            <>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="flex items-center justify-center h-[42px] w-[42px] flex-none rounded-btn bg-surface border border-line text-error disabled:opacity-40"
                title="刪除帳戶"
              >
                <FontAwesomeIcon icon={faTrashCan} className="text-sm" />
              </button>
              <button
                onClick={toggleArchive}
                disabled={busy}
                className="flex items-center gap-1.5 h-[42px] px-3.5 rounded-btn bg-surface border border-line text-[13px] font-medium text-text-secondary disabled:opacity-40"
              >
                <FontAwesomeIcon icon={account.isArchived ? faBoxOpen : faBoxArchive} className="text-xs" />
                {account.isArchived ? '取消封存' : '封存'}
              </button>
            </>
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

      <AccountPicker
        open={pickerTarget === 'debit' || pickerTarget === 'settlementBank'}
        onClose={() => setPickerTarget(null)}
        accounts={debitCandidates}
        value={pickerTarget === 'settlementBank' ? s.defaultSettlementBankId : s.linkedDebitAccountId}
        title={pickerTarget === 'settlementBank' ? '交割銀行' : '自動扣繳帳戶'}
        onSelect={(id) => {
          if (pickerTarget === 'settlementBank') set({ defaultSettlementBankId: id })
          else set({ linkedDebitAccountId: id })
        }}
      />

      {pickerTarget === 'broker' && (
        <BrokerPicker
          brokers={brokers}
          value={s.defaultBrokerId}
          onSelect={(id) => set({ defaultBrokerId: id })}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </Sheet>
  )
}

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <div className="text-[13px] text-text-secondary mb-1.5">{label}</div>
      <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal">{children}</div>
    </div>
  )
}

function BrokerPicker({ brokers, value, onSelect, onClose }) {
  return (
    <Sheet open onClose={onClose} title="選擇券商" bodyClassName="overflow-y-auto p-2">
      {brokers.map((b) => {
        const active = b.id === value
        return (
          <button
            key={b.id}
            onClick={() => { onSelect(b.id); onClose() }}
            className={`flex items-center gap-3 w-full p-3 rounded-chip text-left ${active ? 'bg-brand-light' : ''}`}
          >
            <span className="w-9 h-9 flex-none rounded-chip bg-surface-alt text-text-secondary flex items-center justify-center text-[15px]">
              <FontAwesomeIcon icon={faPercent} />
            </span>
            <span className="flex-1 min-w-0">
              <span className={`block text-[15px] ${active ? 'font-semibold text-brand' : 'font-medium'}`}>
                {b.name}
              </span>
              <span className="block text-xs text-text-tertiary">
                {b.feeDiscount < 1 ? `${+(b.feeDiscount * 10).toFixed(2)} 折` : '不折'} · 最低 {b.minFee ?? 20}
              </span>
            </span>
            {active && <FontAwesomeIcon icon={faCheck} className="text-brand text-[13px]" />}
          </button>
        )
      })}
    </Sheet>
  )
}
