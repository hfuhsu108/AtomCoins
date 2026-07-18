import { useState, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faXmark,
  faCheck,
  faChevronDown,
  faChevronUp,
  faScissors,
  faHandHoldingDollar,
  faSliders,
  faCalendarDays,
  faArrowDown,
  faTrashCan,
  faPlus,
  faTrash,
} from '@fortawesome/free-solid-svg-icons'
import { useCollection, useSettings } from '../../db/DataProvider'
import {
  createTransaction,
  createLinkedTransactions,
  updateTransaction,
  replaceTransactionGroup,
  createInstallmentPlan,
  createRecurringRule,
  createStockTransaction,
  updateStockTransaction,
  recordInvoice,
} from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { useConfirm } from '../ConfirmSheet'
import {
  FEE_CATEGORY_ID,
  UNCATEGORIZED_EXPENSE_ID,
  UNCATEGORIZED_INCOME_ID,
} from '../../db/seed'
import { newId } from '../../lib/id'
import { todayStr, formatMd, advanceDate } from '../../lib/date'
import { formatNumber } from '../../lib/format'
import { getIcon, ACCOUNT_TYPE_ICON } from '../../lib/icons'
import { toAmount, hasOperator, prettyExpr, applyKey } from '../../lib/calc'
import NumberPad from './NumberPad'
import CategoryPicker from './CategoryPicker'
import AccountPicker from './AccountPicker'
import CounterpartyPicker from './CounterpartyPicker'
import StockFields, { initStockState, stockCanSave, buildStockRecord } from './StockFields'

const TYPES = [
  { id: 'expense', label: '支出', sign: '−', color: 'text-expense' },
  { id: 'income', label: '收入', sign: '+', color: 'text-income' },
  { id: 'transfer', label: '轉帳', sign: '', color: 'text-text-primary' },
  { id: 'receivable', label: '應收', sign: '+', color: 'text-income' },
  { id: 'payable', label: '應付', sign: '−', color: 'text-expense' },
  { id: 'stock', label: '股票', sign: '', color: 'text-text-primary' },
]

const emptySplit = () => ({ key: newId(), categoryId: null, expr: '', advanceCounterpartyId: null })

// 從既有交易回填表單狀態（編輯用，階段4 接入）
function stateFromTx(tx) {
  const base = {
    type: tx.type,
    tradeDate: tx.tradeDate,
    // null = 入帳日跟隨記錄日；僅在實際延後（postingDate≠tradeDate）時保留明確值
    postingDate: tx.postingDate && tx.postingDate !== tx.tradeDate ? tx.postingDate : null,
    note: tx.note ?? '',
    splits: [emptySplit()],
    activeSplit: 0,
    amountExpr: '',
    accountId: tx.accountId ?? null,
    fromAccountId: tx.fromAccountId ?? null,
    toAccountId: tx.toAccountId ?? null,
    feeExpr: tx.fee ? String(tx.fee) : '',
    counterpartyId: tx.counterpartyId ?? null,
    reconciled: tx.isReconciled ?? false,
    installment: null, // 編輯既有交易不重新設定分期/週期
    recurring: null,
  }
  if (tx.type === 'expense' || tx.type === 'income') {
    base.splits = (tx.splits ?? []).map((s) => ({
      key: newId(),
      categoryId: s.categoryId,
      expr: String(s.amount),
      advanceCounterpartyId: null,
    }))
    if (base.splits.length === 0) base.splits = [emptySplit()]
  } else {
    base.amountExpr = tx.amount ? String(tx.amount) : ''
  }
  return base
}

// 從發票歸帳預填：一律支出、記錄日=發票日、備註=商家、單列拆帳帶入總額（分類待選）。
function stateFromInvoice(invoice) {
  return {
    type: 'expense',
    tradeDate: invoice.invoiceDate,
    postingDate: null,
    note: invoice.merchant ?? '',
    splits: [{ key: newId(), categoryId: null, expr: String(invoice.totalAmount ?? ''), advanceCounterpartyId: null }],
    activeSplit: 0,
    amountExpr: '',
    accountId: null,
    fromAccountId: null,
    toAccountId: null,
    feeExpr: '',
    counterpartyId: null,
    reconciled: false,
    installment: null,
    recurring: null,
  }
}

export default function TransactionForm({ initialTx = null, initialStock = null, initialInvoice = null, onClose, onSaved, onDelete, deleteBusy = false, deleteError = null }) {
  const settings = useSettings()
  const accounts = useCollection('accounts')
  const categories = useCollection('categories')
  const counterparties = useCollection('counterparties')
  const brokers = useCollection('brokers')

  const [stockState, setStockState] = useState(() => initStockState(initialStock, accounts))

  const [state, setState] = useState(() =>
    initialTx
      ? stateFromTx(initialTx)
      : initialInvoice
        ? stateFromInvoice(initialInvoice)
        : {
          type: initialStock ? 'stock' : 'expense',
          tradeDate: todayStr(),
          postingDate: null, // null = 跟隨記錄日
          note: '',
          splits: [emptySplit()],
          activeSplit: 0,
          amountExpr: '',
          accountId: null,
          fromAccountId: null,
          toAccountId: null,
          feeExpr: '',
          counterpartyId: null,
          reconciled: false,
          installment: null, // { periods, startDate, fundingAccountId }
          recurring: null, // { unit, interval, mode }
        },
  )
  // 開啟中的選擇器：{ kind:'category'|'account'|'counterparty', target }
  const [picker, setPicker] = useState(null)
  const [advOpen, setAdvOpen] = useState(false)

  const set = (patch) => setState((s) => ({ ...s, ...patch }))

  // 預設主帳戶尚未填入時，以 settings.defaultAccountId 補上
  const defaultAccountId = settings?.defaultAccountId ?? null
  const accountId = state.accountId ?? defaultAccountId
  const fromAccountId = state.fromAccountId ?? defaultAccountId

  const { type } = state
  const typeMeta = TYPES.find((t) => t.id === type)
  const isExpenseLike = type === 'expense' || type === 'income'
  const isTransfer = type === 'transfer'
  const isLoanLike = type === 'receivable' || type === 'payable'
  const isStock = type === 'stock'

  // 是否以多列拆帳呈現：有多列或任一列標記代墊
  const hasAdvance = state.splits.some((s) => s.advanceCounterpartyId)
  const multiRow = state.splits.length > 1 || hasAdvance

  // 目前鍵盤編輯的運算式
  const activeExpr = isExpenseLike ? state.splits[state.activeSplit]?.expr ?? '' : state.amountExpr

  // 金額總計
  const total = isExpenseLike
    ? state.splits.reduce((sum, s) => sum + (toAmount(s.expr) ?? 0), 0)
    : toAmount(state.amountExpr) ?? 0

  const lookups = useMemo(() => {
    const cat = {}
    for (const c of categories) cat[c.id] = c
    const acc = {}
    for (const a of accounts) acc[a.id] = a
    const cp = {}
    for (const c of counterparties) cp[c.id] = c
    return { cat, acc, cp }
  }, [categories, accounts, counterparties])

  const onPress = (key) => {
    if (isExpenseLike) {
      setState((s) => {
        const splits = s.splits.slice()
        const idx = s.activeSplit
        splits[idx] = { ...splits[idx], expr: applyKey(splits[idx].expr, key) }
        return { ...s, splits }
      })
    } else {
      set({ amountExpr: applyKey(activeExpr, key) })
    }
  }

  // ── 拆帳 / 代墊 操作 ───────────────────────────────────────
  const addSplit = () => {
    setState((s) => {
      // 歸帳時新列自動帶入剩餘未分配金額，讓拆帳合計自動湊回發票原金額（一般記帳無原金額，維持空白）
      const target = initialInvoice?.totalAmount ?? 0
      const assigned = s.splits.reduce((sum, sp) => sum + (toAmount(sp.expr) ?? 0), 0)
      const remaining = target - assigned
      const expr = target > 0 && remaining > 0 ? String(remaining) : ''
      return {
        ...s,
        splits: [...s.splits, { ...emptySplit(), expr }],
        activeSplit: s.splits.length,
      }
    })
  }
  const removeSplit = (idx) => {
    setState((s) => {
      if (s.splits.length <= 1) return s
      const splits = s.splits.filter((_, i) => i !== idx)
      return { ...s, splits, activeSplit: Math.min(s.activeSplit, splits.length - 1) }
    })
  }
  const markAdvance = (idx) => {
    // 標記某列代墊 → 開對象選擇器；選完才真正設定
    setPicker({ kind: 'counterparty', target: idx })
  }
  const clearAdvance = (idx) => {
    setState((s) => {
      const splits = s.splits.slice()
      splits[idx] = { ...splits[idx], advanceCounterpartyId: null }
      return { ...s, splits }
    })
  }

  // ── 分期 / 週期 切換 ───────────────────────────────────────
  const toggleInstallment = () => {
    setState((s) => {
      if (s.installment) return { ...s, installment: null }
      const card = lookups.acc[s.accountId ?? defaultAccountId]
      return {
        ...s,
        recurring: null, // 分期與週期互斥
        installment: {
          periods: 3,
          startDate: advanceDate(s.tradeDate, { unit: 'month', interval: 1 }),
          fundingAccountId: card?.linkedDebitAccountId ?? defaultAccountId,
        },
      }
    })
  }
  const setInstallment = (patch) =>
    setState((s) => ({ ...s, installment: { ...s.installment, ...patch } }))

  const toggleRecurring = () => {
    setState((s) => ({
      ...s,
      recurring: s.recurring ? null : { unit: 'month', interval: 1, mode: 'immediate' },
    }))
  }
  const setRecurring = (patch) =>
    setState((s) => ({ ...s, recurring: { ...s.recurring, ...patch } }))

  // ── 選擇器回填 ─────────────────────────────────────────────
  const handlePick = (id) => {
    const p = picker
    if (!p) return
    if (p.kind === 'category') {
      setState((s) => {
        const splits = s.splits.slice()
        splits[p.target] = { ...splits[p.target], categoryId: id }
        return { ...s, splits }
      })
    } else if (p.kind === 'account') {
      if (p.target === 'main') set({ accountId: id })
      else if (p.target === 'from') set({ fromAccountId: id })
      else if (p.target === 'to') set({ toAccountId: id })
      else if (p.target === 'funding')
        setState((s) => ({ ...s, installment: { ...s.installment, fundingAccountId: id } }))
    } else if (p.kind === 'counterparty') {
      if (p.target === 'main') {
        set({ counterpartyId: id })
      } else {
        // 代墊：把該拆帳列綁對象
        setState((s) => {
          const splits = s.splits.slice()
          splits[p.target] = { ...splits[p.target], advanceCounterpartyId: id }
          return { ...s, splits }
        })
      }
    }
  }

  // ── 儲存 ───────────────────────────────────────────────────
  const isCardAccount = lookups.acc[accountId]?.type === 'credit_card'

  const canSave = (() => {
    if (isStock) return stockCanSave(stockState)
    if (total <= 0) return false
    if (isExpenseLike) {
      if (state.installment) return !!state.installment.fundingAccountId && state.installment.periods >= 2
      return true
    }
    if (isTransfer) return fromAccountId && state.toAccountId && fromAccountId !== state.toAccountId
    if (isLoanLike) return !!state.counterpartyId
    return false
  })()

  const buildList = () => {
    const tradeDate = state.tradeDate
    const postingDate = state.postingDate || tradeDate // 未指定延後則入帳日=記錄日
    const note = state.note.trim() || null

    if (isExpenseLike) {
      const evaluated = state.splits
        .map((s) => ({
          categoryId: s.categoryId,
          amount: toAmount(s.expr) ?? 0,
          advance: s.advanceCounterpartyId,
        }))
        .filter((s) => s.amount > 0)
      const fallback = type === 'expense' ? UNCATEGORIZED_EXPENSE_ID : UNCATEGORIZED_INCOME_ID
      const normal = evaluated.filter((s) => !s.advance)
      const advances = type === 'expense' ? evaluated.filter((s) => s.advance) : []

      const list = []
      if (normal.length) {
        list.push({
          type,
          accountId,
          amount: normal.reduce((a, s) => a + s.amount, 0),
          tradeDate,
          postingDate,
          note,
          tagIds: [],
          projectId: null,
          isReconciled: state.reconciled,
          splits: normal.map((s) => ({
            categoryId: s.categoryId || fallback,
            amount: s.amount,
            note: null,
          })),
        })
      }
      for (const adv of advances) {
        list.push({
          type: 'receivable',
          accountId,
          amount: adv.amount,
          counterpartyId: adv.advance,
          tradeDate,
          postingDate,
          note,
          tagIds: [],
          projectId: null,
          repayments: [],
          isReconciled: false,
        })
      }
      return list
    }

    if (isTransfer) {
      return [
        {
          type: 'transfer',
          fromAccountId,
          toAccountId: state.toAccountId,
          amount: total,
          fee: toAmount(state.feeExpr) ?? 0,
          feeCategoryId: FEE_CATEGORY_ID,
          tradeDate,
          postingDate,
          note,
          tagIds: [],
          isReconciled: state.reconciled,
        },
      ]
    }

    // receivable / payable
    return [
      {
        type,
        accountId,
        amount: total,
        counterpartyId: state.counterpartyId,
        tradeDate,
        postingDate,
        note,
        tagIds: [],
        projectId: null,
        repayments: [],
        isReconciled: state.reconciled,
      },
    ]
  }

  const { run, busy, error } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  const save = () => {
    if (!canSave) return

    run(async () => {
      if (isStock) {
        const record = buildStockRecord(stockState, brokers)
        await settle(initialStock ? updateStockTransaction(initialStock.id, record) : createStockTransaction(record))
        onSaved?.()
        return
      }

      // 發票歸帳：buildList 產出交易，交由 recordInvoice 原子寫入並回寫雙向 ref（docs/07 §6C）。
      // 歸帳表單不顯示分期/週期，故此處不處理；切成 stock 已由上方 isStock 分支攔截（不綁發票）。
      if (initialInvoice && !initialTx) {
        const list = buildList()
        if (list.length === 0) return
        await settle(recordInvoice(initialInvoice.id, list))
        onSaved?.()
        return
      }

      // 分期付款（Model B）：刷卡全額 expense 記在卡 ＋ N 筆銀行→卡還款轉帳。
      // 僅新增、僅支出＋信用卡帳戶；忽略拆帳/代墊，以總額單一分類建立。
      if (!initialTx && isExpenseLike && type === 'expense' && state.installment) {
        const fallback = UNCATEGORIZED_EXPENSE_ID
        const categoryId = state.splits.find((s) => s.categoryId)?.categoryId || fallback
        const tradeDate = state.tradeDate
        const expense = {
          type: 'expense',
          accountId,
          amount: total,
          tradeDate,
          postingDate: tradeDate,
          note: state.note.trim() || null,
          tagIds: [],
          projectId: null,
          isReconciled: state.reconciled,
          splits: [{ categoryId, amount: total, note: null }],
        }
        await settle(createInstallmentPlan({
          expense,
          periods: state.installment.periods,
          startDate: state.installment.startDate,
          fundingAccountId: state.installment.fundingAccountId,
        }))
        onSaved?.()
        return
      }

      const list = buildList()
      if (list.length === 0) return
      if (initialTx) {
        // 編輯：單筆直接更新；變多筆則原子重建整組（發票 ref 跟著移到新主筆）。
        // 群組成員的編輯不做連動（語義複雜，單人 app 用刪除重建較安全，docs/08 批次 1-3），
        // 只警告＋允許讓使用者知情。
        if (list.length === 1) {
          if (
            (initialTx.linkGroupId || initialTx.installmentPlanId) &&
            !(await confirm({ title: '群組交易', message: '此筆屬於代墊／分期群組：儲存只會更新本筆，群組其他筆不會連動修改，金額或日期改動會造成兩邊不一致。建議刪除整組後重新建立。仍要儲存？' }))
          ) return
          await settle(updateTransaction(initialTx.id, list[0]))
        } else {
          if (initialTx.installmentPlanId) {
            await confirm({ title: '無法儲存', message: '分期交易不支援改為多筆，請刪除整組後重建', alert: true, confirmLabel: '知道了' })
            return
          }
          if (
            initialTx.linkGroupId &&
            !(await confirm({ title: '重建群組', message: '將重建整組關聯交易，關聯應收筆上已記錄的還款會被清除。繼續？', danger: true }))
          ) return
          await settle(replaceTransactionGroup(initialTx, list))
        }
      } else if (list.length === 1) {
        await settle(createTransaction(list[0]))
      } else {
        await settle(createLinkedTransactions(list))
      }

      // 週期性：記下本筆後另建規則，nextDate=本筆記錄日後推一個週期（payload 用主筆範本，
      // 不含 id/時間戳，tradeDate/postingDate 於觸發時以當期日期覆寫）
      if (!initialTx && state.recurring) {
        const freq = { unit: state.recurring.unit, interval: state.recurring.interval ?? 1 }
        await settle(createRecurringRule({
          name: list[0].note ?? typeMeta?.label ?? '週期',
          payload: { ...list[0] },
          frequency: freq,
          postingMode: state.recurring.mode,
          nextDate: advanceDate(state.tradeDate, freq),
        }))
      }

      onSaved?.()
    })
  }

  // ── 衍生顯示 ───────────────────────────────────────────────
  const amountStr = typeMeta.sign + 'NT$ ' + formatNumber(Math.abs(total))
  const accountObj = lookups.acc[accountId]
  const fromObj = lookups.acc[fromAccountId]
  const toObj = lookups.acc[state.toAccountId]
  const counterpartyObj = lookups.cp[state.counterpartyId]

  const chipBase =
    'flex items-center gap-2 h-[34px] px-3 rounded-chip bg-surface-alt text-[13px] font-medium text-text-primary'

  return (
    <div className="flex flex-col h-full bg-app-bg">
      {/* header */}
      <header className="flex items-center justify-between px-3.5 pt-4 pb-3 bg-surface border-b border-line flex-none">
        <button
          onClick={onClose}
          className="w-[38px] h-[38px] rounded-chip bg-surface-alt text-text-secondary flex items-center justify-center text-[17px]"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
        <span className="text-base font-semibold">{initialTx ? '編輯記錄' : initialInvoice ? '歸帳' : '記帳'}</span>
        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              onClick={onDelete}
              disabled={deleteBusy}
              className="w-[38px] h-[38px] rounded-chip bg-error-bg text-error flex items-center justify-center disabled:opacity-40"
            >
              <FontAwesomeIcon icon={faTrash} className="text-sm" />
            </button>
          )}
          <button
            onClick={save}
            disabled={!canSave || busy}
            className="flex items-center gap-1.5 h-[38px] px-4 rounded-btn bg-brand text-white text-[13px] font-semibold disabled:opacity-40"
          >
            <FontAwesomeIcon icon={faCheck} className="text-xs" /> 儲存
          </button>
        </div>
      </header>

      {/* 寫入失敗回饋（儲存或刪除），成功則表單已關閉 */}
      {(error || deleteError) && (
        <div className="px-3.5 py-2 bg-error-bg text-error text-[13px] flex-none">{error || deleteError}</div>
      )}

      {/* type pills */}
      <div className="flex gap-2 px-3.5 py-3 bg-surface border-b border-line overflow-x-auto flex-none">
        {TYPES
          .filter((t) => t.id !== 'stock' || isStock || !initialTx)
          .map((t) => {
            const active = t.id === type
            return (
              <button
                key={t.id}
                onClick={() => set({ type: t.id })}
                className={`flex-none px-[18px] py-2 rounded-pill text-sm font-semibold whitespace-nowrap border ${
                  active
                    ? t.id === 'stock'
                      ? 'bg-[var(--color-stock-buy)] text-white border-[var(--color-stock-buy)]'
                      : 'bg-brand text-white border-brand'
                    : 'bg-surface text-text-secondary border-line'
                }`}
              >
                {t.label}
              </button>
            )
          })}
      </div>

      {/* scroll body（min-h-0：flex item 預設 min-height:auto 會被長內容撐開，導致底部與 NumberPad 被擠出視窗）*/}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {/* stock type: dedicated body, no amount header or NumberPad */}
        {isStock ? (
          <StockFields state={stockState} setState={setStockState} />
        ) : (
        <>
        {/* amount */}
        <div className="px-[18px] pt-5 pb-4 bg-surface border-b border-line">
          <div className="text-[13px] text-text-secondary">{typeMeta.label} 金額</div>
          <div className={`text-4xl font-bold leading-tight tabular-nums mt-0.5 ${typeMeta.color}`}>
            {amountStr}
          </div>
          {hasOperator(activeExpr) && (
            <div className="text-[15px] text-text-tertiary tabular-nums mt-1">
              {prettyExpr(activeExpr)}
            </div>
          )}
          {/* account + date row（轉帳除外，轉帳自有轉出/入）*/}
          {!isTransfer && (
            <div className="flex gap-2 mt-3.5">
              <button className={chipBase} onClick={() => setPicker({ kind: 'account', target: 'main' })}>
                <FontAwesomeIcon
                  icon={getIcon(accountObj?.icon ?? ACCOUNT_TYPE_ICON[accountObj?.type] ?? 'wallet')}
                  className="text-text-secondary text-xs"
                />
                {accountObj?.name ?? '選擇帳戶'}
              </button>
              <label className={`${chipBase} relative cursor-pointer`}>
                <FontAwesomeIcon icon={faCalendarDays} className="text-text-secondary text-xs" />
                {state.tradeDate === todayStr() ? `今天 ${formatMd(state.tradeDate)}` : formatMd(state.tradeDate)}
                <input
                  type="date"
                  value={state.tradeDate}
                  onChange={(e) => e.target.value && set({ tradeDate: e.target.value })}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
            </div>
          )}
        </div>

        {/* type-specific body */}
        {isExpenseLike && (
          <div className="p-3.5">
            {/* 歸帳時列出發票明細，供手動拆帳對照（唯讀，docs/01：明細僅供參考）*/}
            {initialInvoice?.lineItems?.length > 0 && (
              <div className="mb-3 bg-surface border border-line rounded-modal overflow-hidden">
                <div className="px-3.5 py-2 text-[13px] font-semibold text-text-secondary bg-surface-alt">
                  發票明細 · 供拆帳對照
                </div>
                {initialInvoice.lineItems.map((it, i) => (
                  <div key={i} className="flex items-center justify-between px-3.5 py-2 text-[13px] border-t border-line-light">
                    <span className="truncate text-text-secondary">
                      {it.name || '（未命名）'}
                      {it.qty > 1 ? ` ×${it.qty}` : ''}
                    </span>
                    <span className="tabular-nums flex-none ml-2">{formatNumber(it.amount ?? 0)}</span>
                  </div>
                ))}
              </div>
            )}
            {!multiRow ? (
              // 單一分類：大 chip
              <SingleCategoryChip
                split={state.splits[0]}
                lookups={lookups}
                onOpen={() => setPicker({ kind: 'category', target: 0 })}
              />
            ) : (
              <SplitRows
                splits={state.splits}
                activeSplit={state.activeSplit}
                lookups={lookups}
                onActivate={(i) => set({ activeSplit: i })}
                onOpenCat={(i) => setPicker({ kind: 'category', target: i })}
                onClearAdvance={clearAdvance}
                onRemove={removeSplit}
                onMarkAdvance={markAdvance}
                onAddSplit={addSplit}
                total={total}
                targetTotal={initialInvoice?.totalAmount ?? 0}
              />
            )}

            {/* 動作列 */}
            <div className="flex gap-2 mt-3">
              <ActionBtn icon={faScissors} label="拆帳" onClick={addSplit} />
              {type === 'expense' && (
                <ActionBtn
                  icon={faHandHoldingDollar}
                  label="代墊"
                  onClick={() => markAdvance(state.activeSplit)}
                />
              )}
              <ActionBtn
                icon={faSliders}
                label="進階"
                trailing={advOpen ? faChevronUp : faChevronDown}
                onClick={() => setAdvOpen((v) => !v)}
              />
            </div>

            {/* 備註常駐可見（不再摺進進階），入帳日等其餘設定維持在進階 */}
            <div className="mt-2.5">
              <NoteRow note={state.note} onChange={(v) => set({ note: v })} />
            </div>

            {advOpen && (
              <div className="mt-2.5 flex flex-col gap-2.5">
                {!state.installment && (
                  <PostingDateRow
                    tradeDate={state.tradeDate}
                    postingDate={state.postingDate}
                    onChange={(v) => set({ postingDate: v })}
                  />
                )}
                <ToggleRow
                  label="已對帳"
                  on={state.reconciled}
                  onToggle={() => set({ reconciled: !state.reconciled })}
                />

                {/* 分期付款（僅支出＋信用卡帳戶；新增時可設定；歸帳不提供）*/}
                {type === 'expense' && !initialTx && !initialInvoice && (
                  <InstallmentBox
                    enabled={isCardAccount}
                    installment={state.installment}
                    total={total}
                    fundingObj={lookups.acc[state.installment?.fundingAccountId]}
                    onToggle={toggleInstallment}
                    onSet={setInstallment}
                    onPickFunding={() => setPicker({ kind: 'account', target: 'funding' })}
                  />
                )}

                {/* 週期性收支（新增、非分期時可設定；歸帳不提供）*/}
                {!initialTx && !initialInvoice && !state.installment && (
                  <RecurringBox recurring={state.recurring} onToggle={toggleRecurring} onSet={setRecurring} />
                )}
              </div>
            )}
          </div>
        )}

        {isTransfer && (
          <div className="p-3.5 flex flex-col gap-2.5">
            <RowButton label="轉出" value={fromObj?.name ?? '選擇帳戶'} onClick={() => setPicker({ kind: 'account', target: 'from' })} />
            <div className="flex justify-center -my-1">
              <FontAwesomeIcon icon={faArrowDown} className="text-text-tertiary text-[13px]" />
            </div>
            <RowButton label="轉入" value={toObj?.name ?? '選擇帳戶'} onClick={() => setPicker({ kind: 'account', target: 'to' })} />
            <FeeRow
              feeExpr={state.feeExpr}
              onChange={(v) => set({ feeExpr: v })}
            />
            {fromAccountId && state.toAccountId && fromAccountId === state.toAccountId && (
              <p className="text-xs text-warning-text px-1">轉出與轉入帳戶不可相同</p>
            )}
            <PostingDateRow
              tradeDate={state.tradeDate}
              postingDate={state.postingDate}
              onChange={(v) => set({ postingDate: v })}
            />
            <ToggleRow
              label="已對帳"
              on={state.reconciled}
              onToggle={() => set({ reconciled: !state.reconciled })}
            />
            <NoteRow note={state.note} onChange={(v) => set({ note: v })} />
          </div>
        )}

        {isLoanLike && (
          <div className="p-3.5 flex flex-col gap-2.5">
            <RowButton
              label="對象"
              value={counterpartyObj?.name ?? '選擇對象'}
              onClick={() => setPicker({ kind: 'counterparty', target: 'main' })}
            />
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs text-text-tertiary">狀態</span>
              <span className="text-xs font-semibold text-warning-text bg-warning-bg rounded-pill px-2.5 py-1">
                未結清
              </span>
            </div>
            <PostingDateRow
              tradeDate={state.tradeDate}
              postingDate={state.postingDate}
              onChange={(v) => set({ postingDate: v })}
            />
            <ToggleRow
              label="已對帳"
              on={state.reconciled}
              onToggle={() => set({ reconciled: !state.reconciled })}
            />
            <NoteRow note={state.note} onChange={(v) => set({ note: v })} />
          </div>
        )}
        </>
        )}
      </div>

      {/* number pad — stock mode 不需要 */}
      {!isStock && <NumberPad onPress={onPress} />}

      {/* pickers */}
      <CategoryPicker
        open={picker?.kind === 'category'}
        onClose={() => setPicker(null)}
        categories={categories.filter((c) => c.kind === type)}
        value={picker?.kind === 'category' ? state.splits[picker.target]?.categoryId : null}
        onSelect={handlePick}
      />
      <AccountPicker
        open={picker?.kind === 'account'}
        onClose={() => setPicker(null)}
        accounts={
          picker?.target === 'funding'
            ? accounts.filter((a) => a.type === 'cash' || a.type === 'bank')
            : accounts
        }
        value={
          picker?.target === 'from'
            ? fromAccountId
            : picker?.target === 'to'
              ? state.toAccountId
              : picker?.target === 'funding'
                ? state.installment?.fundingAccountId
                : accountId
        }
        disabledId={
          picker?.target === 'from'
            ? state.toAccountId
            : picker?.target === 'to'
              ? fromAccountId
              : null
        }
        title={
          picker?.target === 'from'
            ? '轉出帳戶'
            : picker?.target === 'to'
              ? '轉入帳戶'
              : picker?.target === 'funding'
                ? '扣款銀行'
                : '選擇帳戶'
        }
        onSelect={handlePick}
      />
      <CounterpartyPicker
        open={picker?.kind === 'counterparty'}
        onClose={() => setPicker(null)}
        counterparties={counterparties}
        value={picker?.target === 'main' ? state.counterpartyId : null}
        onSelect={handlePick}
      />
      {confirmElement}
    </div>
  )
}

// ── 子元件 ───────────────────────────────────────────────────
function SingleCategoryChip({ split, lookups, onOpen }) {
  const cat = lookups.cat[split.categoryId]
  const parent = cat?.parentId ? lookups.cat[cat.parentId] : cat
  const hasCat = !!cat
  return (
    <>
      <div className="text-[13px] font-semibold text-text-secondary mb-3 px-1">分類</div>
      <button
        onClick={onOpen}
        className="w-full flex items-center gap-3 p-3.5 bg-surface border border-line rounded-modal text-left"
      >
        <span
          className={`w-10 h-10 flex-none rounded-btn flex items-center justify-center text-base ${
            hasCat ? 'bg-brand text-white' : 'bg-surface-alt text-text-tertiary'
          }`}
        >
          <FontAwesomeIcon icon={getIcon(parent?.icon)} />
        </span>
        <span className="flex-1 min-w-0">
          <span className={`block text-[15px] font-semibold ${hasCat ? 'text-text-primary' : 'text-text-tertiary'}`}>
            {parent ? parent.name : '選擇分類'}
          </span>
          {cat && cat.parentId && (
            <span className="block text-xs text-text-tertiary mt-0.5">{cat.name}</span>
          )}
        </span>
        <FontAwesomeIcon icon={faChevronDown} className="text-text-tertiary text-[13px]" />
      </button>
    </>
  )
}

function SplitRows({
  splits,
  activeSplit,
  lookups,
  onActivate,
  onOpenCat,
  onClearAdvance,
  onRemove,
  onMarkAdvance,
  onAddSplit,
  total,
  targetTotal = 0,
}) {
  const diff = targetTotal - total
  return (
    <div className="bg-surface border border-line rounded-modal overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-line-light">
        <span className="text-[13px] font-semibold text-text-secondary">拆帳明細</span>
        <span className="text-[13px] text-text-tertiary tabular-nums">合計 NT$ {formatNumber(total)}</span>
      </div>
      {/* 歸帳拆帳時顯示與發票原金額的差額，協助湊平 */}
      {targetTotal > 0 && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-surface-alt border-b border-line-light text-[12px]">
          <span className="text-text-tertiary tabular-nums">發票金額 NT$ {formatNumber(targetTotal)}</span>
          {diff === 0 ? (
            <span className="text-income font-semibold">已湊平</span>
          ) : diff > 0 ? (
            <span className="text-warning-text font-semibold tabular-nums">剩餘 NT$ {formatNumber(diff)}</span>
          ) : (
            <span className="text-expense font-semibold tabular-nums">超出 NT$ {formatNumber(-diff)}</span>
          )}
        </div>
      )}
      {splits.map((s, i) => {
        const active = i === activeSplit
        const cat = lookups.cat[s.categoryId]
        const parent = cat?.parentId ? lookups.cat[cat.parentId] : cat
        const advance = s.advanceCounterpartyId
        const cp = lookups.cp[advance]
        const amount = toAmount(s.expr) ?? 0
        return (
          <div
            key={s.key}
            onClick={() => onActivate(i)}
            className={`flex items-center gap-2.5 px-3.5 py-3 border-b border-line-light cursor-pointer ${
              active ? 'bg-brand-light/50' : ''
            }`}
          >
            <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
              <FontAwesomeIcon icon={getIcon(advance ? 'money-bill-transfer' : parent?.icon)} />
            </span>
            <div className="flex-1 min-w-0">
              {advance ? (
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-medium">代墊</span>
                  <span className="text-xs font-semibold text-income bg-brand-light rounded-pill px-2 py-0.5">
                    {cp?.name ?? '未指定'}
                  </span>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenCat(i)
                  }}
                  className="text-[15px] font-medium text-left"
                >
                  {parent ? (cat.parentId ? `${parent.name}·${cat.name}` : parent.name) : '選擇分類'}
                  <FontAwesomeIcon icon={faChevronDown} className="text-text-tertiary text-[10px] ml-1.5" />
                </button>
              )}
              <div className="flex gap-2 mt-1">
                {advance ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onClearAdvance(i)
                    }}
                    className="text-[11px] text-text-tertiary"
                  >
                    取消代墊
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onMarkAdvance(i)
                    }}
                    className="text-[11px] text-text-tertiary"
                  >
                    標記代墊
                  </button>
                )}
              </div>
            </div>
            <span className={`text-[15px] font-semibold tabular-nums ${active ? 'text-brand' : ''}`}>
              {formatNumber(amount)}
            </span>
            {splits.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(i)
                }}
                className="w-7 h-7 flex items-center justify-center text-text-tertiary"
              >
                <FontAwesomeIcon icon={faTrashCan} className="text-xs" />
              </button>
            )}
          </div>
        )
      })}
      <button
        onClick={onAddSplit}
        className="flex items-center gap-2 w-full px-3.5 py-3 text-[13px] font-medium text-brand"
      >
        <FontAwesomeIcon icon={faPlus} className="text-xs" /> 新增拆帳列
      </button>
    </div>
  )
}

function ActionBtn({ icon, label, trailing, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 h-[42px] rounded-btn bg-surface border border-line text-[13px] font-medium"
    >
      <FontAwesomeIcon icon={icon} className="text-text-secondary text-xs" /> {label}
      {trailing && <FontAwesomeIcon icon={trailing} className="text-text-tertiary text-[9px]" />}
    </button>
  )
}

function RowButton({ label, value, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between px-4 py-3.5 bg-surface border border-line rounded-modal"
    >
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="flex items-center gap-2 text-[15px] font-semibold">
        {value}
        <FontAwesomeIcon icon={faChevronDown} className="text-text-tertiary text-[11px]" />
      </span>
    </button>
  )
}

function FeeRow({ feeExpr, onChange }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-surface border border-line rounded-modal">
      <span className="text-sm text-text-secondary">手續費</span>
      <div className="flex items-center gap-1 text-[15px] font-semibold tabular-nums">
        <span className="text-text-tertiary text-sm">NT$</span>
        <input
          inputMode="numeric"
          value={feeExpr}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="0"
          className="w-20 text-right outline-none bg-transparent"
        />
      </div>
    </div>
  )
}

function NoteRow({ note, onChange }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-surface border border-line rounded-modal">
      <input
        value={note}
        onChange={(e) => onChange(e.target.value)}
        placeholder="新增備註…"
        className="flex-1 text-sm outline-none bg-transparent placeholder:text-text-tertiary"
      />
    </div>
  )
}

// 入帳日（postingDate）：null=跟隨記錄日；設成晚於記錄日即為「延後入帳」。
// 選回記錄日當天則清回 null，避免存下無意義的明確值。
function PostingDateRow({ tradeDate, postingDate, onChange }) {
  const effective = postingDate || tradeDate
  const deferred = effective > tradeDate
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-surface border border-line rounded-modal">
      <span className="text-sm text-text-secondary">入帳日</span>
      <div className="flex items-center gap-2">
        {deferred && (
          <span className="text-[11px] font-semibold text-warning-text bg-warning-bg rounded-pill px-2 py-0.5">
            未入帳
          </span>
        )}
        <label className="relative flex items-center gap-1.5 text-[15px] font-semibold cursor-pointer">
          <FontAwesomeIcon icon={faCalendarDays} className="text-text-secondary text-xs" />
          {postingDate ? formatMd(effective) : '與記錄日相同'}
          <input
            type="date"
            value={effective}
            min={tradeDate}
            onChange={(e) =>
              e.target.value && onChange(e.target.value === tradeDate ? null : e.target.value)
            }
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
        {postingDate && (
          <button onClick={() => onChange(null)} className="text-[11px] text-text-tertiary">
            清除
          </button>
        )}
      </div>
    </div>
  )
}

function Switch({ on, disabled, onToggle }) {
  return (
    <button
      disabled={disabled}
      onClick={onToggle}
      className={`w-11 h-6 rounded-pill flex items-center px-0.5 flex-none transition-colors ${
        on ? 'bg-brand justify-end' : 'bg-surface-alt justify-start'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
    </button>
  )
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-1.5 rounded-btn text-[13px] font-semibold border ${
        active ? 'bg-brand text-white border-brand' : 'bg-surface text-text-secondary border-line'
      }`}
    >
      {children}
    </button>
  )
}

function ToggleRow({ label, on, onToggle }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-surface border border-line rounded-modal">
      <span className="text-sm text-text-secondary">{label}</span>
      <Switch on={on} onToggle={onToggle} />
    </div>
  )
}

function InstallmentBox({ enabled, installment, total, fundingObj, onToggle, onSet, onPickFunding }) {
  const on = !!installment
  const periods = installment?.periods ?? 0
  const per = on && periods ? Math.floor(total / periods) : 0
  const last = on && periods ? total - per * (periods - 1) : 0
  return (
    <div className="bg-surface border border-line rounded-modal p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-text-secondary">分期付款</span>
          {!enabled && <span className="block text-[11px] text-text-tertiary mt-0.5">僅信用卡帳戶可分期</span>}
        </div>
        <Switch on={on} disabled={!enabled} onToggle={enabled ? onToggle : undefined} />
      </div>
      {on && (
        <>
          <div className="flex gap-1.5">
            {[3, 6, 12, 24].map((n) => (
              <Chip key={n} active={periods === n} onClick={() => onSet({ periods: n })}>
                {n} 期
              </Chip>
            ))}
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-text-secondary">首期扣款日</span>
            <label className="relative font-semibold cursor-pointer flex items-center gap-1.5">
              <FontAwesomeIcon icon={faCalendarDays} className="text-text-secondary text-xs" />
              {formatMd(installment.startDate)}
              <input
                type="date"
                value={installment.startDate}
                onChange={(e) => e.target.value && onSet({ startDate: e.target.value })}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-text-secondary">扣款銀行</span>
            <button onClick={onPickFunding} className="font-semibold flex items-center gap-1.5">
              {fundingObj?.name ?? '選擇'}
              <FontAwesomeIcon icon={faChevronDown} className="text-text-tertiary text-[10px]" />
            </button>
          </div>
          <div className="text-[11px] text-text-tertiary tabular-nums border-t border-line-light pt-2">
            每期約 NT$ {formatNumber(per)}
            {last !== per ? `（末期 NT$ ${formatNumber(last)}）` : ''} · 全額 NT$ {formatNumber(total)} 記入卡帳
          </div>
        </>
      )}
    </div>
  )
}

const MODE_HINT = {
  immediate: '到期自動記一筆',
  deferred: '提前產生未入帳交易，到日自動入帳',
  reminder: '到期在通知區提醒，手動確認才記',
}

function RecurringBox({ recurring, onToggle, onSet }) {
  const on = !!recurring
  const UNITS = [
    ['week', '每週'],
    ['month', '每月'],
    ['year', '每年'],
  ]
  const MODES = [
    ['immediate', '自動入帳'],
    ['deferred', '提前產生'],
    ['reminder', '僅提醒'],
  ]
  return (
    <div className="bg-surface border border-line rounded-modal p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">設為週期性</span>
        <Switch on={on} onToggle={onToggle} />
      </div>
      {on && (
        <>
          <div>
            <div className="text-[11px] text-text-tertiary mb-1.5">頻率</div>
            <div className="flex gap-1.5">
              {UNITS.map(([u, l]) => (
                <Chip key={u} active={recurring.unit === u} onClick={() => onSet({ unit: u })}>
                  {l}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-text-tertiary mb-1.5">入帳方式</div>
            <div className="flex gap-1.5">
              {MODES.map(([m, l]) => (
                <Chip key={m} active={recurring.mode === m} onClick={() => onSet({ mode: m })}>
                  {l}
                </Chip>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-text-tertiary">{MODE_HINT[recurring.mode]}</p>
        </>
      )}
    </div>
  )
}
