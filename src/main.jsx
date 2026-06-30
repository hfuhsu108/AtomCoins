import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/fontawesome'
import './index.css'
import App from './App.jsx'
import { ensureSeeded, ensureBrokerSeed } from './db/seed'
import { processRecurringRules } from './lib/recurring'

// 先種子（分類/帳戶/券商）、再跑週期性收支（補齊到期/預生未入帳），最後掛載，確保首屏資料齊全
ensureSeeded()
  .then(() => ensureBrokerSeed())
  .then(() => processRecurringRules())
  .catch((e) => console.error('啟動初始化失敗', e))
  .finally(() => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
