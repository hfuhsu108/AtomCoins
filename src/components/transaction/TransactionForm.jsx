import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
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
import { db } from '../../db'
import {
  createTransaction,
  createLinkedTransactions,
  updateTransaction,
  deleteTransaction,
} from '../../db/repo'
import {
  FEE_CATEGORY_ID,
  UNCATEGORIZED_EXPENSE_ID,
  UNCATEGORIZED_INCOME_ID,
} from '../../db/seed'
import { newId } from '../../lib/id'
import { todayStr, formatMd } from '../../lib/date'
import { formatNumber } from '../../lib/format'
import { getIcon, ACCOUNT_TYPE_ICON } from '../../lib/icons'
import { toAmount, hasOperator, prettyExpr, applyKey } from '../../lib/calc'
import NumberPad from './NumberPad'
import CategoryPicker from './CategoryPicker'
import AccountPicker from './AccountPicker'
import CounterpartyPicker from './CounterpartyPicker'

const TYPES = [
  { id: 'expense', label: '支出', sign: '−', color: 'text-expense' },
  { id: 'income', label: '收入', sign: '+', color: 'text-income' },
  { id: 'transfer', label: '轉帳', sign: '', color: 'text-text-primary' },
  { id: 'receivable', label: '應收', sign: '+', color: 'text-income' },
  { id: 'payable', label: '應付', sign: '−', color: 'text-expense' },
]

const emptySplit = () => ({ key: newId(), categoryId: null, expr: '', advanceCounterpartyId: null })

// 從既有交易回填表單狀態（編輯用，階段4 接入）
function stateFromTx(tx) {
  const base = {
    type: tx.type,
    tradeDate: tx.tradeDate,
    note: tx.note ?? '',
    splits: [emptySplit()],
    activeSplit: 0,
    amountExpr: '',
    accountId: tx.accountId ?? null,
    fromAccountId: tx.fromAccountId ?? null,
    toAccountId: tx.toAccountId ?? null,
    feeExpr: tx.fee ? String(tx.fee) : '',
    counterpartyId: tx.counterpartyId ?? null,
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

export default function TransactionForm({ initialTx = null, onClose, onSaved, onDelete }) {
  const settings = useLiveQuery(() => db.settings.get('singleton'))
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const counterparties = useLiveQuery(() => db.counterparties.toArray(), [], [])

  const [state, setState] = useState(() =>
    initialTx
      ? stateFromTx(initialTx)
      : {
          type: 'expense',
          tradeDate: todayStr(),
          note: '',
          splits: [emptySplit()],
          activeSplit: 0,
          amountExpr: '',
          accountId: null,
          fromAccountId: null,
          toAccountId: null,
          feeExpr: '',
          counterpartyId: null,
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
    setState((s) => ({
      ...s,
      splits: [...s.splits, emptySplit()],
      activeSplit: s.splits.length,
    }))
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
  const canSave = (() => {
    if (total <= 0) return false
    // 代墊列在選定對象當下才會被標記，故無「已標記但缺對象」的中間狀態
    if (isExpenseLike) return true
    if (isTransfer) return fromAccountId && state.toAccountId && fromAccountId !== state.toAccountId
    if (isLoanLike) return !!state.counterpartyId
    return false
  })()

  const buildList = () => {
    const tradeDate = state.tradeDate
    const postingDate = tradeDate // 入帳日引擎為階段2，Stage 1 入帳日=記錄日
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
          isReconciled: false,
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
          isReconciled: false,
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
        isReconciled: false,
      },
    ]
  }

  const save = async () => {
    if (!canSave) return
    const list = buildList()
    if (list.length === 0) return
    if (initialTx) {
      // 編輯：單筆直接更新；若編輯中新增了代墊（變多筆）則刪原筆改寫整組
      if (list.length === 1) await updateTransaction(initialTx.id, list[0])
      else {
        await deleteTransaction(initialTx.id)
        await createLinkedTransactions(list)
      }
    } else if (list.length === 1) {
      await createTransaction(list[0])
    } else {
      await createLinkedTransactions(list)
    }
    onSaved?.()
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
        <span className="text-base font-semibold">{initialTx ? '編輯記錄' : '記帳'}</span>
        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              onClick={onDelete}
              className="w-[38px] h-[38px] rounded-chip bg-error-bg text-error flex items-center justify-center"
            >
              <FontAwesomeIcon icon={faTrash} className="text-sm" />
            </button>
          )}
          <button
            onClick={save}
            disabled={!canSave}
            className="flex items-center gap-1.5 h-[38px] px-4 rounded-btn bg-brand text-white text-[13px] font-semibold disabled:opacity-40"
          >
            <FontAwesomeIcon icon={faCheck} className="text-xs" /> 儲存
          </button>
        </div>
      </header>

      {/* type pills */}
      <div className="flex gap-2 px-3.5 py-3 bg-surface border-b border-line overflow-x-auto flex-none">
        {TYPES.map((t) => {
          const active = t.id === type
          return (
            <button
              key={t.id}
              onClick={() => set({ type: t.id })}
              className={`flex-none px-[18px] py-2 rounded-pill text-sm font-semibold whitespace-nowrap border ${
                active
                  ? 'bg-brand text-white border-brand'
                  : 'bg-surface text-text-secondary border-line'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* scroll body */}
      <div className="flex-1 overflow-y-auto flex flex-col">
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

            {advOpen && (
              <div className="mt-2.5 bg-surface border border-line rounded-modal p-3">
                <input
                  value={state.note}
                  onChange={(e) => set({ note: e.target.value })}
                  placeholder="新增備註…"
                  className="w-full text-sm outline-none bg-transparent placeholder:text-text-tertiary"
                />
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
            <NoteRow note={state.note} onChange={(v) => set({ note: v })} />
          </div>
        )}
      </div>

      {/* number pad */}
      <NumberPad onPress={onPress} />

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
        accounts={accounts}
        value={
          picker?.target === 'from'
            ? fromAccountId
            : picker?.target === 'to'
              ? state.toAccountId
              : accountId
        }
        disabledId={
          picker?.target === 'from'
            ? state.toAccountId
            : picker?.target === 'to'
              ? fromAccountId
              : null
        }
        title={picker?.target === 'from' ? '轉出帳戶' : picker?.target === 'to' ? '轉入帳戶' : '選擇帳戶'}
        onSelect={handlePick}
      />
      <CounterpartyPicker
        open={picker?.kind === 'counterparty'}
        onClose={() => setPicker(null)}
        counterparties={counterparties}
        value={picker?.target === 'main' ? state.counterpartyId : null}
        onSelect={handlePick}
      />
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
}) {
  return (
    <div className="bg-surface border border-line rounded-modal overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-line-light">
        <span className="text-[13px] font-semibold text-text-secondary">拆帳明細</span>
        <span className="text-[13px] text-text-tertiary tabular-nums">合計 NT$ {formatNumber(total)}</span>
      </div>
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
