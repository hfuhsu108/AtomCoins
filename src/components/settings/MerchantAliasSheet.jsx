import { useState, useEffect } from 'react'
import { createMerchantAlias, updateMerchantAlias } from '../../db/repo'
import { useAsyncAction, settle } from '../../hooks/useAsyncAction'
import Sheet from '../Sheet'

// 商家別名編輯 Sheet（docs/09 批次 3）。兩欄：比對字串（match，contains 命中）／顯示名稱（alias）。
// alias 物件存在＝編輯；否則新增（presetMatch 供歸帳快捷預填發票原始商家名，使用者通常會手動刪短）。
// onSaved(aliasName) 供呼叫端在建立後同步更新表單商家欄位。
export default function MerchantAliasSheet({ open, alias = null, presetMatch = '', onClose, onSaved }) {
  const [match, setMatch] = useState('')
  const [display, setDisplay] = useState('')
  const { run, busy, error } = useAsyncAction()

  useEffect(() => {
    if (open) {
      setMatch(alias?.match ?? presetMatch ?? '')
      setDisplay(alias?.alias ?? '')
    }
  }, [open, alias, presetMatch])

  const m = match.trim()
  const d = display.trim()
  const canSave = m && d

  const save = () => {
    if (!canSave) return
    run(async () => {
      if (alias) await settle(updateMerchantAlias(alias.id, { match: m, alias: d }))
      else await settle(createMerchantAlias({ match: m, alias: d }))
      onSaved?.(d)
      onClose()
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title={alias ? '編輯別名' : '新增商家別名'} bodyClassName="p-4 flex flex-col gap-3">
      <div>
        <label className="block text-[13px] text-text-secondary mb-1.5">比對字串（發票商家名含此字串即套用）</label>
        <input
          value={match}
          onChange={(e) => setMatch(e.target.value)}
          placeholder="如：統一超商股份有限公司"
          className="w-full h-[46px] px-3.5 bg-surface-alt rounded-modal text-[15px] outline-none placeholder:text-text-tertiary"
        />
      </div>
      <div>
        <label className="block text-[13px] text-text-secondary mb-1.5">顯示名稱</label>
        <input
          value={display}
          onChange={(e) => setDisplay(e.target.value)}
          placeholder="如：7-11"
          className="w-full h-[46px] px-3.5 bg-surface-alt rounded-modal text-[15px] outline-none placeholder:text-text-tertiary"
        />
      </div>
      <p className="text-[11px] text-text-tertiary">
        contains 比對：一條「統一超商股份有限公司」可吃下所有分公司；要對特定分店給店名，設更長的比對字串即自動勝出。
      </p>
      {error && <div className="text-[13px] text-error">{error}</div>}
      <button
        onClick={save}
        disabled={!canSave || busy}
        className="w-full h-[46px] rounded-btn bg-brand text-white text-[15px] font-semibold disabled:opacity-40"
      >
        儲存
      </button>
    </Sheet>
  )
}
