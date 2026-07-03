import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/fontawesome'
import './index.css'
import App from './App.jsx'

// 種子與週期性收支皆於登入後由 DataProvider 觸發（Firestore 需要 auth），啟動期直接掛載
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
