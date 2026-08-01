import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import { useSettings } from '../db/DataProvider'
import { updateSettings } from '../db/repo'

// 遮金額的全站單一狀態。過去首頁／明細／報表各有一份 useState，切頁就重置，
// 卡片頁與設定頁甚至沒有這顆按鈕——遮蔽是「旁邊有人」時用的，漏掉任一頁等於功能失效。
const HiddenAmountContext = createContext({
  hidden: false,
  toggle: () => {},
  opt: { hidden: false },
})

export function HiddenAmountProvider({ children }) {
  const settings = useSettings()
  const [hidden, setHidden] = useState(false)
  // 只在 settings 首次載入時吃一次偏好值，之後單向寫出。
  // 若持續跟著 settings 走，自己寫進 Firestore 的值會由 onSnapshot 回彈，
  // 把剛切換的狀態打回去（切一下又跳回原狀）。
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    if (synced || !settings) return
    setSynced(true)
    setHidden(!!settings.hideAmountsDefault)
  }, [settings, synced])

  const toggle = useCallback(() => {
    setHidden((prev) => {
      const next = !prev
      // 純顯示偏好，寫入失敗不該影響當下已經遮起來的畫面，故不走 useAsyncAction
      updateSettings({ hideAmountsDefault: next }).catch((e) =>
        console.error('遮金額偏好寫入失敗', e),
      )
      return next
    })
  }, [])

  const value = useMemo(() => ({ hidden, toggle, opt: { hidden } }), [hidden, toggle])

  return <HiddenAmountContext.Provider value={value}>{children}</HiddenAmountContext.Provider>
}

export function useHiddenAmount() {
  return useContext(HiddenAmountContext)
}

// 各頁 header 共用的眼睛鈕（原本三頁各複製一份 38px 按鈕）
export function EyeButton() {
  const { hidden, toggle } = useHiddenAmount()
  return (
    <button
      onClick={toggle}
      aria-label={hidden ? '顯示金額' : '隱藏金額'}
      className="w-[38px] h-[38px] rounded-chip bg-surface border border-line text-text-secondary flex items-center justify-center"
    >
      <FontAwesomeIcon icon={hidden ? faEyeSlash : faEye} />
    </button>
  )
}
