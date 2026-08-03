import { useCallback, useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

// 同時只開一列。存的是「該實例的 close 函式」而非 id——拆帳一筆會展開成 N 列、
// 共用同一個 tx.id，用 id 當識別會讓那 N 列一起打開。
let openRow = null

const AXIS_LOCK = 8 // px：位移超過此值才判定這一趟屬於哪個方向，之前不攔任何事
const ACTION_W = 72 // px：單顆動作鈕寬度
// 吸附開啟的位移門檻。**不可用「抽屜寬的一半」**：動作鈕愈多門檻愈高（3 顆要拖 108px），
// 慢速滑的末速趨近 0、過不了 FLICK_V，就會一律彈回，手感是「滑不開、只有用甩的才行」。
// 改成與鈕數無關的固定值，並取 40% 為上限以免抽屜很窄時反而過鬆。
const OPEN_PX = 44
const OPEN_RATIO = 0.4
const FLICK_V = 0.25 // px/ms：末段速度超過此值就算「甩開」，不必拖到門檻
const RUBBER = 0.3 // 超出兩端時的阻尼係數，給「到底了」的手感

const TONE = {
  default: 'bg-surface-alt text-text-secondary',
  danger: 'bg-error-bg text-error',
  brand: 'bg-brand-light text-brand',
}

// 往左滑露出動作鈕的列（Gmail 式）。children 原樣渲染，可以是 <button>，也可以是
// 內含子按鈕的 <div>——本元件不是 button，不吃 children 的語義。
//
// 三個必須做對的地方：
//  1. touch-action: pan-y 要下在「實際被觸控命中的那一層」（內容層），不是最外框——
//     瀏覽器取的是命中元素往上到捲動容器的交集，只寫在外框對內容層無效。
//  2. 方向判定要一次定生死：先動的方向若是垂直就整趟放手，讓瀏覽器自己捲，
//     否則清單捲動會有肉眼可見的延遲。
//  3. 拖曳結束後那一次 click 要吞掉，不然放手就會觸發列本身的動作（開預覽）。
export default function SwipeRow({ actions = [], disabled = false, className = '', children }) {
  const list = actions.filter(Boolean)
  const rootRef = useRef(null)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const gesture = useRef(null) // 拖曳中的暫存；null＝沒有進行中的手勢
  const swallow = useRef(false) // 這一趟拖過，隨後那次 click 不算數
  const openRef = useRef(false) // handler 內要讀當下狀態，用 ref 免得閉包讀到舊值

  const width = list.length * ACTION_W

  const close = useCallback(function closeSelf() {
    if (openRow === closeSelf) openRow = null
    openRef.current = false
    setDx(0)
  }, [])

  const open = useCallback(() => {
    if (openRow && openRow !== close) openRow()
    openRow = close
    openRef.current = true
    setDx(-width)
  }, [close, width])

  // 卸載時若正開著，registry 會留著指向已卸載元件的 close（此處不動 state）
  useEffect(() => () => {
    if (openRow === close) openRow = null
  }, [close])

  // 只在位移中／開著時掛全域監聽：捲動或點到「這一列以外」就收起來。
  // 依賴用布林而非 dx——用 dx 會讓拖曳中每一次位移都重掛一次監聽
  const shifted = dx !== 0
  useEffect(() => {
    if (!shifted) return
    const onScroll = () => close()
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) close()
    }
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true })
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [shifted, close])

  if (list.length === 0 || disabled) return children

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return // 只理會主鍵／單指
    gesture.current = {
      x0: e.clientX,
      y0: e.clientY,
      base: openRef.current ? -width : 0,
      axis: null,
      cur: openRef.current ? -width : 0,
      lastX: e.clientX,
      lastT: e.timeStamp,
      v: 0,
    }
  }

  const onPointerMove = (e) => {
    const g = gesture.current
    if (!g) return
    const moveX = e.clientX - g.x0
    const moveY = e.clientY - g.y0

    if (!g.axis) {
      if (Math.abs(moveX) < AXIS_LOCK && Math.abs(moveY) < AXIS_LOCK) return
      // 先動的方向決定歸屬：判給垂直就整趟放手，捲動零延遲
      if (Math.abs(moveX) <= Math.abs(moveY)) {
        gesture.current = null
        return
      }
      // 抽屜關著時只認左滑；右滑完全不攔（iOS 左緣往右是系統返回手勢）
      if (g.base === 0 && moveX > 0) {
        gesture.current = null
        return
      }
      g.axis = 'x'
      // 從「鎖定方向的那一點」起算，而不是從按下點——用按下點的話，前 AXIS_LOCK 個 px
      // 完全不動、一鎖定就瞬間跳那麼多，摸起來像卡一下再彈出去
      g.lockX = e.clientX
      e.currentTarget.setPointerCapture?.(e.pointerId)
      setDragging(true)
    }

    const dt = e.timeStamp - g.lastT
    if (dt > 0) g.v = (e.clientX - g.lastX) / dt
    g.lastX = e.clientX
    g.lastT = e.timeStamp

    let next = g.base + (e.clientX - g.lockX)
    if (next > 0) next *= RUBBER
    else if (next < -width) next = -width + (next + width) * RUBBER
    g.cur = next
    setDx(next)
  }

  const onPointerEnd = () => {
    const g = gesture.current
    gesture.current = null
    if (!g || g.axis !== 'x') return
    setDragging(false)
    swallow.current = true
    // 已經開著時往回拖：要拖回門檻以上才關，否則微幅晃動會誤關
    const threshold = Math.min(width * OPEN_RATIO, OPEN_PX)
    const latchOpen = g.base === 0
      ? g.cur < -threshold || g.v < -FLICK_V
      : g.cur < -width + threshold && g.v < FLICK_V
    if (latchOpen) open()
    else close()
  }

  // 掛在內容層（不是最外框）：抽屜裡的動作鈕是它的兄弟節點，不會被這裡攔到
  const onClickCapture = (e) => {
    if (swallow.current) {
      swallow.current = false
      e.preventDefault()
      e.stopPropagation()
      return
    }
    // 抽屜開著時，點列本身只是收起來
    if (openRef.current) {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  return (
    <div ref={rootRef} className={`relative overflow-hidden ${className}`}>
      <div className="absolute inset-y-0 right-0 flex" style={{ width }}>
        {list.map((a) => (
          <button
            key={a.key}
            onClick={() => {
              close()
              a.onClick()
            }}
            disabled={a.disabled}
            className={`flex flex-col items-center justify-center gap-1 h-full text-[11px] font-semibold disabled:opacity-40 ${
              TONE[a.tone] ?? TONE.default
            }`}
            style={{ width: ACTION_W }}
          >
            <FontAwesomeIcon icon={a.icon} className="text-[15px]" />
            {a.label}
          </button>
        ))}
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
        onClickCapture={onClickCapture}
        className={`relative bg-surface select-none [-webkit-touch-callout:none] [touch-action:pan-y] ${
          dragging ? '' : 'transition-transform duration-200'
        }`}
        style={{ transform: `translate3d(${dx}px, 0, 0)` }}
      >
        {children}
      </div>
    </div>
  )
}
