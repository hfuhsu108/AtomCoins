import { HashRouter, Routes, Route } from 'react-router-dom'
import { DataProvider } from './db/DataProvider'
import { PwaProvider } from './components/PwaProvider'
import { HiddenAmountProvider } from './components/HiddenAmountProvider'
import PwaUpdateBanner from './components/PwaUpdateBanner'
import AppLayout from './layouts/AppLayout'
import HomePage from './pages/HomePage'
import AddTransactionPage from './pages/AddTransactionPage'
import TransactionsPage from './pages/TransactionsPage'
import ReportsPage from './pages/ReportsPage'
import SettingsPage from './pages/SettingsPage'
import CardDetailPage from './pages/CardDetailPage'

export default function App() {
  return (
    <HashRouter>
      <PwaProvider>
      <DataProvider>
      {/* 遮金額須涵蓋 add 與 card/:id——它們在 AppLayout 之外，掛在 AppLayout 會讓卡片頁取不到 */}
      <HiddenAmountProvider>
      <PwaUpdateBanner />
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="add" element={<AddTransactionPage />} />
        <Route path="card/:id" element={<CardDetailPage />} />
      </Routes>
      </HiddenAmountProvider>
      </DataProvider>
      </PwaProvider>
    </HashRouter>
  )
}
