import { useCallback, useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { ACTION_W, decideAxis, offsetFor, shouldLatchOpen } from '../lib/swipeGesture'

// 同時只開一列。存的是「該實例的 close 函式」而非 id——拆帳一筆會展開成 N 列、
// 共用同一個 tx.id，用 id 當識別會讓那 N 列一起打開。
let openRow = null

const TONE = {
  default: 'bg-surface-alt text-text-secondary',
  danger: 'bg-error-bg text-error',
  brand: 'bg-brand-light text-brand',
}

// 往左滑露出動作鈕的列（Gmail 式）。children 原樣渲染，可以是 <button>，也可以是
// 內含子按鈕的 <div>——本元件不是 button，不吃 children 的語義。
//
// 手勢數學全在 lib/swipeGesture.js（純函式，可離線驗證；它在真機上調校了五輪）。
// 這裡只負責事件接線，四個必須做對的地方：
//  1. touch-action: pan-y 下在內容層。寫成 arbitrary value 而非 Tailwind 的
//     touch-pan-y——後者編成 var(--tw-pan-x,) var(--tw-pan-y,) var(--tw-pinch-zoom,)
//     的組合值，多一層自訂屬性間接，這裡要的是字面宣告。
//  2. 判定為水平後要用**非 passive** 的原生 touchmove + preventDefault 擋下瀏覽器
//     接手捲動；pan-y 只是「允許」垂直捲，不保證它不搶。
//  3. 拖曳中完全不走 React：transform 與 transition 都直接寫 DOM，整趟手勢零 render。
//     關過場動畫若走 state，render 的非同步會讓第一段位移仍被 200ms 動畫追著跑。
//  4. 拖曳結束後那一次 click 要吞掉，不然放手就會觸發列本身的動作（開預覽）。
export default function SwipeRow({ actions = [], disabled = false, className = '', children }) {
  const list = actions.filter(Boolean)
  const rootRef = useRef(null)
  const contentRef = useRef(null)
  const [dx, setDx] = useState(0) // 只存「停下來之後」的位置，拖曳中不更新
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

  // 判定為水平拖曳後，擋下瀏覽器接手捲動。React 的 onTouchMove 掛在 root 且是
  // passive 的，在裡面 preventDefault 無效，必須自己掛原生非 passive 監聽。
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const block = (e) => {
      if (gesture.current?.axis === 'x' && e.cancelable) e.preventDefault()
    }
    el.addEventListener('touchmove', block, { passive: false })
    return () => el.removeEventListener('touchmove', block)
  }, [])

  // 只在開著時掛全域監聽：捲動或點到「這一列以外」就收起來。
  // 依賴用布林而非 dx，免得位置一變就重掛監聽
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

    if (!g.axis) {
      const verdict = decideAxis({
        moveX: e.clientX - g.x0,
        moveY: e.clientY - g.y0,
        base: g.base,
        startX: g.x0,
      })
      if (verdict === 'giveup') {
        gesture.current = null
        return
      }
      if (verdict === 'wait') return
      g.axis = 'x'
      // 記下鎖定點：位移以它為起點才不會一鎖定就跳一段（見 offsetFor 的補回邏輯）
      g.lockX = e.clientX
      e.currentTarget.setPointerCapture?.(e.pointerId)
      // 過場動畫必須「當下」就關掉，走 state 的話 render 非同步、擋不住那 200ms
      if (contentRef.current) contentRef.current.style.transition = 'none'
    }

    const dt = e.timeStamp - g.lastT
    if (dt > 0) g.v = (e.clientX - g.lastX) / dt
    g.lastX = e.clientX
    g.lastT = e.timeStamp

    g.cur = offsetFor({ base: g.base, clientX: e.clientX, x0: g.x0, lockX: g.lockX, width })
    // 直接寫 DOM：這一段每秒會跑 60–120 次，走 setState 會掉幀
    if (contentRef.current) {
      contentRef.current.style.transform = `translate3d(${g.cur}px, 0, 0)`
    }
  }

  const onPointerEnd = () => {
    const g = gesture.current
    gesture.current = null
    if (!g || g.axis !== 'x') return
    swallow.current = true
    const latchOpen = shouldLatchOpen({ base: g.base, cur: g.cur, v: g.v, width })
    const target = latchOpen ? -width : 0
    // 直接寫最終位置，不能只靠 setDx：拖一點點又放開時 dx 沒變（0→0），React 不會
    // 重新渲染，直接寫入的偏移就留在畫面上收不回來
    if (contentRef.current) {
      contentRef.current.style.transition = '' // 交還 class 的 200ms 過場
      contentRef.current.style.transform = `translate3d(${target}px, 0, 0)`
    }
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
        ref={contentRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
        onClickCapture={onClickCapture}
        className="relative bg-surface select-none [-webkit-touch-callout:none] [touch-action:pan-y] transition-transform duration-200"
        style={{ transform: `translate3d(${dx}px, 0, 0)` }}
      >
        {children}
      </div>
    </div>
  )
}
