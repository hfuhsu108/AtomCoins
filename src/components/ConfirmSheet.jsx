import { useState } from 'react'
import Sheet from './Sheet'

// App 內確認面板（取代 window.confirm/alert：PWA 全螢幕下原生對話框突兀、部分 iOS standalone 會被抑制）。
// alert=true 為純提示（僅一顆按鈕、無取消）；danger=true 確認鈕紅色。
export default function ConfirmSheet({
  open,
  title = '確認',
  message,
  confirmLabel = '確定',
  cancelLabel = '取消',
  danger = false,
  alert = false,
  onConfirm,
  onClose,
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="p-[18px] flex flex-col gap-4">
        {message && (
          <p className="text-[14px] text-text-secondary whitespace-pre-line leading-relaxed">{message}</p>
        )}
        <div className="flex items-center gap-2">
          {!alert && (
            <button
              onClick={onClose}
              className="flex-1 h-[42px] rounded-btn bg-surface border border-line text-[13px] font-semibold text-text-secondary"
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`flex-1 h-[42px] rounded-btn text-[13px] font-semibold ${
              danger ? 'bg-error-bg text-error' : 'bg-brand text-white'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

// Promise 化的確認：confirm(opts) 開面板並回傳 Promise<boolean>（確定 true／取消 false），
// 讓 window.confirm(x) 幾乎原樣改成 await confirm(x)。呼叫端把 confirmElement 一併 render。
// opts 可為字串（＝message）或 { title, message, confirmLabel, danger, alert }。
export function useConfirm() {
  const [state, setState] = useState(null) // { opts, resolve }
  const confirm = (opts) =>
    new Promise((resolve) => {
      setState({ opts: typeof opts === 'string' ? { message: opts } : opts, resolve })
    })
  const settle = (result) => {
    state?.resolve(result)
    setState(null)
  }
  const confirmElement = (
    <ConfirmSheet
      open={!!state}
      {...(state?.opts ?? {})}
      onConfirm={() => settle(true)}
      onClose={() => settle(false)}
    />
  )
  return { confirm, confirmElement }
}
