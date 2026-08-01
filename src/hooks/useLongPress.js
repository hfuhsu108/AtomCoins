import { useCallback, useEffect, useRef } from 'react'

const DELAY = 500 // ms：短於此會與一般點擊混淆，長於此會讓人以為沒反應
const MOVE_TOLERANCE = 10 // px：手指位移超過這個距離視為捲動，取消長按

// 長按手勢。Pointer Events 一次涵蓋觸控與滑鼠，不必分別接 touch/mouse。
//
// 兩個必須做對的地方：
//  1. 長按觸發後要吞掉隨後那次 click——列本身的 onClick 會導向編輯頁，不吞的話
//     每次預覽完都會被丟進編輯表單（還可能誤存）。
//  2. 不設 touch-action: none，那會連頁面捲動一起殺掉；改以位移門檻區分捲動與長按。
//
// 回傳 { enabled, handlers }：enabled 供呼叫端決定要不要加上抑制文字選取的 class
// （選取反白與長按同時發生會很難看，但沒有長按的列不該被禁止選字）。
export default function useLongPress(onLongPress, { delay = DELAY } = {}) {
  const timer = useRef(null)
  const start = useRef(null)
  const fired = useRef(false)

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  // 卸載時仍在跑的 timer 會對著已卸載的元件開預覽
  useEffect(() => clear, [clear])

  const enabled = typeof onLongPress === 'function'
  if (!enabled) return { enabled: false, handlers: {} }

  return {
    enabled: true,
    handlers: {
      onPointerDown: (e) => {
        if (e.button != null && e.button !== 0) return // 只理會主鍵／單指
        fired.current = false
        start.current = { x: e.clientX, y: e.clientY }
        clear()
        timer.current = setTimeout(() => {
          fired.current = true
          timer.current = null
          onLongPress()
        }, delay)
      },
      onPointerMove: (e) => {
        if (!timer.current || !start.current) return
        if (
          Math.abs(e.clientX - start.current.x) > MOVE_TOLERANCE ||
          Math.abs(e.clientY - start.current.y) > MOVE_TOLERANCE
        ) clear()
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      // 捕獲階段攔下：預覽已經開了，這次 click 不該再觸發列本身的動作
      onClickCapture: (e) => {
        if (!fired.current) return
        e.preventDefault()
        e.stopPropagation()
        fired.current = false
      },
      // 抑制 Android 長按跳出的原生選單
      onContextMenu: (e) => e.preventDefault(),
    },
  }
}

// 有長按的列統一加這組 class：抑制文字選取與 iOS 的長按 callout
export const LONG_PRESS_CLASS = 'select-none [-webkit-touch-callout:none]'
