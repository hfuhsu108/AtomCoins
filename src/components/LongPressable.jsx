import useLongPress, { LONG_PRESS_CLASS } from '../hooks/useLongPress'

// 可長按的列。清單的列都在 map 裡產生，不能在迴圈中呼叫 hook，
// 因此把 hook 收進這個薄包裝，呼叫端只要把原本的 <button> 換成它。
// onLongPress 省略時行為與一般 button 完全相同（不加抑制選取的 class）。
export default function LongPressable({ onLongPress, onClick, className = '', children, ...rest }) {
  const { enabled, handlers } = useLongPress(onLongPress)
  return (
    <button
      onClick={onClick}
      {...handlers}
      {...rest}
      className={`${className} ${enabled ? LONG_PRESS_CLASS : ''}`}
    >
      {children}
    </button>
  )
}
