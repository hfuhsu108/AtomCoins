import { HashRouter, Routes, Route } from 'react-router-dom'
import { DataProvider } from './db/DataProvider'
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
      <DataProvider>
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
      </DataProvider>
    </HashRouter>
  )
}
