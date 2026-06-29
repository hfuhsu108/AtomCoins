import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/fontawesome'
import './index.css'
import App from './App.jsx'
import { ensureSeeded } from './db/seed'

// 先種子再掛載，確保首屏就有主帳戶與分類樹可用
ensureSeeded().finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
