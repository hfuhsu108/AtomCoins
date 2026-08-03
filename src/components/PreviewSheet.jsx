import Sheet from './Sheet'

// 單擊列開的預覽卡。唯讀——用途是「不離開清單就看清楚這一筆」，要編輯走左滑抽屜。
// 直接包 Sheet：點背景關閉、× 鈕、max-h-[80vh] 可捲都已具備，放手不關是它的天然行為。
export default function PreviewSheet({ open, title, onClose, children, footer }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} bodyClassName="overflow-y-auto">
      <div className="p-[18px] flex flex-col gap-2.5">{children}</div>
      {footer && <div className="px-[18px] pb-[18px]">{footer}</div>}
    </Sheet>
  )
}

// 預覽卡內的一列。value 為空就整列不顯示，免得預覽卡被一堆「—」佔滿
export function PreviewRow({ label, value, cls }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-baseline justify-between gap-4 text-[14px]">
      <span className="text-text-secondary flex-none">{label}</span>
      <span className={`text-right min-w-0 break-words ${cls ?? ''}`}>{value}</span>
    </div>
  )
}

// 區塊標題（拆帳明細、品項明細等）
export function PreviewSection({ title, children }) {
  return (
    <div className="pt-1">
      <div className="text-[13px] font-semibold text-text-secondary mb-1.5">{title}</div>
      <div className="bg-surface-alt rounded-modal divide-y divide-line-light">{children}</div>
    </div>
  )
}
