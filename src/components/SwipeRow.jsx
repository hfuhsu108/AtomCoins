import { useCallback, useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

// 同時只開一列。存的是「該實例的 close 函式」而非 id——拆帳一筆會展開成 N 列、
// 共用同一個 tx.id，用 id 當識別會讓那 N 列一起打開。
let openRow = null

const ACTION_W = 72 // px：單顆動作鈕寬度
// 方向判定門檻。**不要再加大**：行動瀏覽器本身就有 8–15px 的觸控 slop，這個值是疊在
// 它上面的第二層死區。設 8 時手機上要走近 20px 才開始跟手，滑鼠沒有 slop 所以只有
// 手機覺得黏——「電腦順、手機不順」就是這麼來的。
const AXIS_LOCK = 4
// 判定方向時偏袒水平：手指的水平滑很少是純水平，要求 |dx| > |dy| 太嚴會讓略帶斜度的
// 滑動整趟被判給捲動。只有明顯偏垂直（下面的 V_GIVE_UP）才讓給瀏覽器，兩者之間繼續等。
const H_BIAS = 0.7
const V_GIVE_UP = 1.4
// px：要放棄整趟手勢（判定為捲動）所需的垂直位移。**必須明顯大於 AXIS_LOCK**——
// 兩者共用同一個小門檻的話，起手那幾 px 的垂直抖動就足以殺掉整趟手勢，
// 症狀是「慢慢滑完全沒反應」（快滑因為第一個取樣點水平量就很大而躲過）。
const VERT_GIVE_UP = 12
// 吸附開啟的位移門檻。**不可用「抽屜寬的一半」**：動作鈕愈多門檻愈高（3 顆要拖 108px），
// 慢速滑的末速趨近 0、過不了 FLICK_V，就會一律彈回，手感是「滑不開、只有用甩的才行」。
// 改成與鈕數無關的固定值，並取 40% 為上限以免抽屜很窄時反而過鬆。
const OPEN_PX = 32
const OPEN_RATIO = 0.4
const FLICK_V = 0.18 // px/ms：末段速度超過此值就算「甩開」，不必拖到門檻
const RUBBER = 0.3 // 超出兩端時的阻尼係數，給「到底了」的手感
// px：鎖定方向前被瀏覽器 slop 與 AXIS_LOCK 吞掉的那段距離，在這段行程內平滑補回。
// 不補的話列會永遠落後手指十幾 px——快滑看不出來，慢滑時那就是「不跟手」的來源。
const CATCH_PX = 48

const TONE = {
  default: 'bg-surface-alt text-text-secondary',
  danger: 'bg-error-bg text-error',
  brand: 'bg-brand-light text-brand',
}

// 往左滑露出動作鈕的列（Gmail 式）。children 原樣渲染，可以是 <button>，也可以是
// 內含子按鈕的 <div>——本元件不是 button，不吃 children 的語義。
//
// 四個必須做對的地方：
//  1. touch-action: pan-y 下在內容層（實際被觸控命中的那一層）。垂直交還瀏覽器、
//     水平留給自己，不設 none 是因為那會連頁面捲動一起殺掉。寫成 arbitrary value
//     而非 Tailwind 的 touch-pan-y——後者編成 var(--tw-pan-x,) var(--tw-pan-y,)
//     var(--tw-pinch-zoom,) 的組合值，多一層自訂屬性間接，這裡要的是字面宣告。
//  2. 方向判定要盡早、偏袒水平，且**先判「鎖水平」再判「放棄」**；放棄的垂直門檻
//     必須明顯大於鎖定門檻，否則起手抖動就會殺掉整趟手勢。見各常數的註解。
//  3. 拖曳中**完全不走 React**：transform 與 transition 都直接寫 DOM，整趟手勢零 render。
//     每秒 60–120 次 setState 會在中階手機上掉幀；更關鍵的是「關掉過場動畫」如果走
//     state，render 的非同步會讓第一段位移仍被 200ms 動畫追著跑（慢滑時全程如此）。
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
    const moveX = e.clientX - g.x0
    const moveY = e.clientY - g.y0

    if (!g.axis) {
      const ax = Math.abs(moveX)
      const ay = Math.abs(moveY)
      // 三段判定，順序不可調換：**先看能不能鎖水平，再看要不要放棄**。反過來的話，
      // 起手那幾 px 的垂直抖動就會先滿足放棄條件、把整趟手勢殺掉（慢滑完全沒反應）。
      if (ax >= AXIS_LOCK && ax >= ay * H_BIAS) {
        // 抽屜關著時只認左滑；右滑完全不攔（iOS 左緣往右是系統返回手勢）
        if (g.base === 0 && moveX > 0) {
          gesture.current = null
          return
        }
        g.axis = 'x'
        // 記下鎖定點：位移以它為起點才不會一鎖定就跳一段（見下方 CATCH_PX 的補回邏輯）
        g.lockX = e.clientX
        e.currentTarget.setPointerCapture?.(e.pointerId)
        // 過場動畫必須「當下」就關掉。用 state 關的話 render 是非同步的，緊接著的直接
        // 寫入還是會被那 200ms 動畫追著跑——快滑被後續位移蓋過，慢滑時它就是全部。
        if (contentRef.current) contentRef.current.style.transition = 'none'
      } else if (ay >= VERT_GIVE_UP && ay > ax * V_GIVE_UP) {
        // 已經明顯往垂直走（不是起手抖動）→ 整趟讓給瀏覽器捲動
        gesture.current = null
        return
      } else {
        return // 還在曖昧區：繼續等下一個取樣點，不提早定生死
      }
    }

    const dt = e.timeStamp - g.lastT
    if (dt > 0) g.v = (e.clientX - g.lastX) / dt
    g.lastX = e.clientX
    g.lastT = e.timeStamp

    // 鎖定當下不跳（sinceLock=0），之後在 CATCH_PX 的行程內把被吞掉的 dead 補回來，
    // 補完就是 base + 手指總位移＝真正的 1:1 跟手
    const sinceLock = e.clientX - g.lockX
    const dead = g.lockX - g.x0
    const caught = Math.min(1, Math.abs(sinceLock) / CATCH_PX)
    let next = g.base + sinceLock + dead * caught
    if (next > 0) next *= RUBBER
    else if (next < -width) next = -width + (next + width) * RUBBER
    g.cur = next
    // 直接寫 DOM：這一段每秒會跑 60–120 次，走 setState 會掉幀
    if (contentRef.current) {
      contentRef.current.style.transform = `translate3d(${next}px, 0, 0)`
    }
  }

  const onPointerEnd = () => {
    const g = gesture.current
    gesture.current = null
    if (!g || g.axis !== 'x') return
    swallow.current = true
    // 已經開著時往回拖：要拖回門檻以上才關，否則微幅晃動會誤關
    const threshold = Math.min(width * OPEN_RATIO, OPEN_PX)
    const latchOpen = g.base === 0
      ? g.cur < -threshold || g.v < -FLICK_V
      : g.cur < -width + threshold && g.v < FLICK_V
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
