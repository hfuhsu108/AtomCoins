import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/fontawesome'
import './index.css'
import App from './App.jsx'
import { ensureSeeded, ensureBrokerSeed } from './db/seed'

// Dexie 種子暫保留（遷移工具的資料來源，M3 移除）；週期性收支 M2 起改於登入後觸發（DataProvider）
ensureSeeded()
  .then(() => ensureBrokerSeed())
  .catch((e) => console.error('啟動初始化失敗', e))
  .finally(() => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
