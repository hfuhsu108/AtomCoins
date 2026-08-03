// 左滑動作列的手勢數學。抽成純函式是因為它在真機上調校了五輪——沒有事件、沒有 DOM
// 的版本才驗得動（見 scripts 目錄外的驗證腳本用法，或直接以序列餵 decideAxis）。
// UI 與事件處理在 components/SwipeRow.jsx。

export const ACTION_W = 72 // px：單顆動作鈕寬度
// 方向判定門檻。**不要再加大**：行動瀏覽器本身就有 8–15px 的觸控 slop，這個值是疊在
// 它上面的第二層死區。設 8 時手機上要走近 20px 才開始跟手，滑鼠沒有 slop 所以只有
// 手機覺得黏。
export const AXIS_LOCK = 4
// 判定方向時偏袒水平：手指的水平滑很少是純水平，要求 |dx| > |dy| 太嚴會讓略帶斜度的
// 滑動整趟被判給捲動。
export const H_BIAS = 0.7
export const V_GIVE_UP = 1.4
// px：要放棄整趟手勢（判定為捲動）所需的垂直位移。**必須明顯大於 AXIS_LOCK**——
// 兩者共用同一個小門檻的話，起手那幾 px 的垂直抖動就足以殺掉整趟手勢。
export const VERT_GIVE_UP = 12
// px：螢幕左緣多寬算「系統返回手勢的地盤」。只有在這個範圍內起手且往右，才把手勢
// 讓給瀏覽器；其餘位置的右滑一律照常接手（見 decideAxis 的註解）。
export const EDGE_BACK_PX = 24
// 吸附開啟的位移門檻。**不可用「抽屜寬的一半」**：動作鈕愈多門檻愈高（3 顆要拖 108px），
// 慢速滑的末速趨近 0、過不了 FLICK_V，就會一律彈回。
export const OPEN_PX = 32
export const OPEN_RATIO = 0.4
export const FLICK_V = 0.18 // px/ms：末段速度超過此值就算「甩開」，不必拖到門檻
export const RUBBER = 0.3 // 超出兩端時的阻尼係數，給「到底了」的手感
// px：鎖定方向前被瀏覽器 slop 與 AXIS_LOCK 吞掉的那段距離，在這段行程內平滑補回。
// 不補的話列會永遠落後手指十幾 px——快滑看不出來，慢滑時那就是「不跟手」的來源。
export const CATCH_PX = 48

// 這一趟手勢屬於誰：'lock'＝水平拖曳歸我、'giveup'＝整趟讓給瀏覽器、'wait'＝還看不出來。
//
// 順序不可調換：**先看能不能鎖水平，再看要不要放棄**。反過來的話，起手那幾 px 的
// 垂直抖動就會先滿足放棄條件、把整趟手勢殺掉（症狀是慢滑完全沒反應）。
export function decideAxis({ moveX, moveY, base, startX }) {
  const ax = Math.abs(moveX)
  const ay = Math.abs(moveY)

  if (ax >= AXIS_LOCK && ax >= ay * H_BIAS) {
    // 右滑**只有在螢幕左緣起手時**才讓開（那是 iOS 的系統返回手勢）。
    // 其他位置的右滑不能放棄手勢：慢滑時手指按下後會有幾 px 的隨機微偏移，
    // 只要那一刻剛好偏右就會整趟報銷，之後同一根手指往左滑也全無反應。
    if (base === 0 && moveX > 0 && startX <= EDGE_BACK_PX) return 'giveup'
    return 'lock'
  }
  if (ay >= VERT_GIVE_UP && ay > ax * V_GIVE_UP) return 'giveup'
  return 'wait'
}

// 內容層當下該位移多少。鎖定當下不跳（sinceLock=0），之後在 CATCH_PX 的行程內把
// 鎖定前被吞掉的 dead 補回來，補完即 base + 手指總位移＝真正的 1:1 跟手。
export function offsetFor({ base, clientX, x0, lockX, width }) {
  const sinceLock = clientX - lockX
  const dead = lockX - x0
  const caught = Math.min(1, Math.abs(sinceLock) / CATCH_PX)
  let next = base + sinceLock + dead * caught
  if (next > 0) next *= RUBBER
  else if (next < -width) next = -width + (next + width) * RUBBER
  return next
}

// 放手後要停在開還是關。已經開著時往回拖：要拖回門檻以上才關，否則微幅晃動會誤關。
export function shouldLatchOpen({ base, cur, v, width }) {
  const threshold = Math.min(width * OPEN_RATIO, OPEN_PX)
  return base === 0
    ? cur < -threshold || v < -FLICK_V
    : cur < -width + threshold && v < FLICK_V
}
