import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/fontawesome'
import './index.css'
import { initTheme } from './lib/theme'
import App from './App.jsx'

// 主題須在首次 render 前套好（防閃爍 script 已先套過一次，這裡接手 system 模式的跟隨）
initTheme()

// 種子與週期性收支皆於登入後由 DataProvider 觸發（Firestore 需要 auth），啟動期直接掛載
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
