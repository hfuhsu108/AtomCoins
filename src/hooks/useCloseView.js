import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

// 關閉全屏覆蓋頁（記帳頁、卡片詳情）用的收尾動作。
//
// 這些頁在 AppLayout 之外（沒有底部導覽）且 fixed inset-0 蓋滿畫面，出口只有自己的關閉鈕。
// 單用 navigate(-1) 會在「本頁就是 session 的第一筆 history」時把使用者鎖死：
// history.go(-1) 超出範圍時是靜默 no-op（不導航、不報錯），按鈕看起來就像壞掉。
// PWA 捷徑（manifest shortcuts 直接指向 #/add）與推播深連結都是這種冷啟動。
//
// react-router 用 history.state.idx 記錄本 session 的 entry 序號（初始化時補 idx:0，
// 之後每次 push 遞增），idx > 0 才真的回得去。回不去就 replace 到 fallback——用 replace
// 是為了讓系統返回鍵直接離開 App，而不是又把使用者丟回剛關掉的那一頁。
//
// 邊界：從已開啟的視窗點推播是純 hash 導航、不經 router push，history.state 為 null，
// 於是走 fallback 回首頁而非上一頁。結果仍正確（不會鎖死）。
export default function useCloseView(fallback = '/') {
  const navigate = useNavigate()
  return useCallback(() => {
    const idx = window.history.state?.idx
    if (typeof idx === 'number' && idx > 0) navigate(-1)
    else navigate(fallback, { replace: true })
  }, [navigate, fallback])
}
