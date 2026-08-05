import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../../db/DataProvider'
import { createCounterparty, updateCounterparty, deleteCounterparty, createTransaction, updateTransaction, deleteTransaction } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import { useConfirm } from '../ConfirmSheet'
import { newId } from '../../lib/id'
import { todayStr } from '../../lib/date'
import { formatAmount } from '../../lib/format'
import Sheet from '../Sheet'
import DateInput from '../DateInput'

const OPENING_DIRS = [
  { id: 'receivable', label: '他欠我' },
  { id: 'payable', label: '我欠他' },
]

// 借貸對象新增/編輯。counterparty=null 為新增。
// 刪除只在完全沒有借還款引用時開放——對象沒有「未分類」那種退路，連動刪交易等於抹掉
// 真實的債權債務，改歸又無處可歸，所以擋下並要求先處理那些記錄（repo 端另有同樣的守衛）。
// 交易自己訂閱而不靠 prop：這個 Sheet 也從記帳表單的對象選擇器開啟，那裡沒有交易清單。
export default function CounterpartyEditSheet({ open, counterparty = null, onClose }) {
  const txns = useCollection('transactions')
  const isNew = !counterparty
  const [name, setName] = useState(counterparty?.name ?? '')
  // 期初借貸餘額：開始用這個 App 之前就存在的債權債務。建立入口只有這裡，故最多一筆。
  const openingTx = counterparty
    ? txns.find((t) => t.counterpartyId === counterparty.id && t.isOpening) ?? null
    : null
  // 已登錄的還款總額：金額下限與方向鎖都看它
  const paid = (openingTx?.repayments ?? []).reduce((s, r) => s + (r.amount ?? 0), 0)

  const [openingDir, setOpeningDir] = useState(openingTx?.type ?? 'receivable')
  const [openingAmount, setOpeningAmount] = useState(openingTx ? String(openingTx.amount) : '')
  const [openingDate, setOpeningDate] = useState(openingTx?.tradeDate ?? todayStr())

  // 切換編輯對象時重置（仿 CategoryEditSheet）。key 帶上期初筆的 id：交易訂閱若比對象
  // 晚一步到齊，openingTx 會從 null 變成有值，這時要再預填一次，否則欄位停在空白。
  const key = `${counterparty?.id ?? '__new__'}:${openingTx?.id ?? ''}`
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setName(counterparty?.name ?? '')
    setOpeningDir(openingTx?.type ?? 'receivable')
    setOpeningAmount(openingTx ? String(openingTx.amount) : '')
    setOpeningDate(openingTx?.tradeDate ?? todayStr())
  }

  const { run, busy, error } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  const refCount = counterparty ? txns.filter((t) => t.counterpartyId === counterparty.id).length : 0
  const amountNum = Math.round(Number(openingAmount) || 0)
  // 期初金額不可低於已登錄的還款總額，否則未結清金額會變負（docs/01-schema §3.5 不變式）
  const amountBelowPaid = !!openingTx && amountNum > 0 && amountNum < paid
  // 有還款就鎖住方向：改方向等於把既有還款的現金流向整個反轉（engine 依 type 決定 posting 正負）
  const dirLocked = paid > 0
  const canSave = name.trim().length > 0 && !amountBelowPaid

  // 期初那筆的建立／更新。cpId 由呼叫端給——新增對象時 id 才剛產出來。
  const saveOpening = async (cpId) => {
    if (openingTx) {
      // 金額清空＝刪除，已由 save() 攔在前面處理（要先確認）
      if (amountNum <= 0) return
      // 只 patch 這四個欄位：repayments 與 isOpening 不寫，靠 updateDoc 的 patch 語義原樣保留，
      // 表單也就不會用陳舊快照覆寫掉別的裝置剛登錄的還款
      await settle(updateTransaction(openingTx.id, {
        type: openingDir,
        amount: amountNum,
        tradeDate: openingDate,
        postingDate: openingDate,
      }))
      return
    }
    if (amountNum > 0) {
      // isOpening 讓引擎跳過本金 posting：這筆錢是過去就流動過的，不能再動帳戶餘額。
      // accountId 給 null 是誠實的——本金不入任何帳戶，之後的還款各自指定收付帳戶。
      await settle(createTransaction({
        type: openingDir,
        accountId: null,
        counterpartyId: cpId,
        amount: amountNum,
        tradeDate: openingDate,
        postingDate: openingDate,
        note: '期初餘額',
        isOpening: true,
        repayments: [],
        tagIds: [],
        projectId: null,
        isReconciled: false,
      }))
    }
  }

  const save = async () => {
    if (!canSave) return
    // 既有期初被清空＝刪掉那筆，先確認；已有還款則擋下——本金沒了，還款會變成無所依附的孤兒
    if (openingTx && amountNum <= 0) {
      if (paid > 0) {
        await confirm({
          title: '無法刪除期初餘額',
          message: `這筆期初已登錄 ${formatAmount(paid)} 的還款。請先到借貸明細刪除那些還款記錄，再清空期初金額。`,
          alert: true,
          confirmLabel: '知道了',
        })
        return
      }
      if (!(await confirm({
        title: '刪除期初餘額',
        message: `清空金額會刪除「${counterparty.name}」的期初借貸餘額，確定嗎？`,
        danger: true,
      }))) return
    }
    run(async () => {
      if (!isNew) {
        await settle(updateCounterparty(counterparty.id, { name: name.trim() }))
        if (openingTx && amountNum <= 0) await settle(deleteTransaction(openingTx.id))
        else await saveOpening(counterparty.id)
        onClose()
        return
      }
      // 先產 id，期初那筆才綁得到這個對象（createCounterparty 支援指定 id，同 CounterpartyPicker）
      const id = newId()
      await settle(createCounterparty({ id, name: name.trim() }))
      await saveOpening(id)
      onClose()
    })
  }

  const handleDelete = async () => {
    if (!counterparty) return
    if (refCount > 0) {
      await confirm({
        title: '無法刪除',
        message: `「${counterparty.name}」仍有 ${refCount} 筆借還款記錄。請先刪除那些記錄或改指其他對象，再刪除這個對象。`,
        alert: true,
        confirmLabel: '知道了',
      })
      return
    }
    if (!(await confirm({ title: '刪除對象', message: `刪除「${counterparty.name}」？`, danger: true }))) return
    run(async () => {
      await settle(deleteCounterparty(counterparty.id))
      onClose()
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title={isNew ? '新增對象' : '編輯對象'} bodyClassName="overflow-y-auto">
      <div className="p-[18px] flex flex-col gap-4">
        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">名稱</div>
          <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="姓名或群組，例如：小明、日本旅行團"
              className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary"
            />
          </div>
          {refCount > 0 && (
            <div className="text-[11px] text-text-tertiary mt-1">
              有 {refCount} 筆借還款記錄使用這個對象，改名後全部一起更新
            </div>
          )}
        </div>

        {/* 期初餘額：新增時填，事後也能改——常常是對方還錢時才想起當初借了多少。
            編輯既有對象時直接改同一筆（openingTx），不會被重複建立成第二筆期初 */}
        <div>
          <div className="text-[13px] text-text-secondary mb-1.5">
            期初借貸餘額{isNew || !openingTx ? '（選填）' : ''}
          </div>
          <div className="bg-surface border border-line rounded-modal p-3 flex flex-col gap-3">
              <div className="flex gap-1.5 p-1 bg-surface-alt rounded-modal">
                {OPENING_DIRS.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setOpeningDir(d.id)}
                    disabled={dirLocked}
                    className={`flex-1 py-2 rounded-btn text-[13px] font-semibold disabled:opacity-40 ${
                      openingDir === d.id ? 'bg-surface text-text-primary shadow-segment' : 'text-text-secondary'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-text-secondary">金額</span>
                <span className="flex items-center gap-1.5 font-semibold">
                  NT$
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={openingAmount}
                    onChange={(e) => setOpeningAmount(e.target.value)}
                    placeholder="0"
                    className="w-28 h-8 px-2 text-right bg-surface-alt border border-line rounded-btn tabular-nums outline-none"
                  />
                </span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-text-secondary">起算日</span>
                <DateInput
                  value={openingDate}
                  onChange={(e) => e.target.value && setOpeningDate(e.target.value)}
                  className="h-8 px-2 bg-surface-alt border border-line rounded-btn text-[13px] font-semibold outline-none"
                />
              </div>
              {amountBelowPaid && (
                <p className="text-[11px] text-error">
                  這筆期初已登錄 {formatAmount(paid)} 的還款，金額不可低於這個數。
                </p>
              )}
              {dirLocked && !amountBelowPaid && (
                <p className="text-[11px] text-text-tertiary">
                  已登錄 {formatAmount(paid)} 還款，方向不可更改——要改請先到借貸明細刪除還款記錄。
                </p>
              )}
              <p className="text-[11px] text-text-tertiary">
                這筆錢是開始記帳前就借出／借入的，不會影響任何帳戶餘額，只計入借貸未結清金額與淨資產。
                之後在借貸明細登錄還款時，才會實際影響帳戶。
                {openingTx ? '金額清空並儲存即刪除這筆期初。' : '留空或填 0 就不建立。'}
              </p>
          </div>
        </div>

        {error && <div className="text-[13px] text-error px-1">{error}</div>}
        <div className="flex items-center gap-2 mt-1">
          {counterparty && (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="flex items-center justify-center h-[42px] w-[42px] flex-none rounded-btn bg-surface border border-line text-error disabled:opacity-40"
              title="刪除對象"
            >
              <FontAwesomeIcon icon={faTrashCan} className="text-sm" />
            </button>
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
    </Sheet>
  )
}
