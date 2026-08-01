import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCollection } from '../db/DataProvider'
import { useHiddenAmount, EyeButton } from '../components/HiddenAmountProvider'
import EmptyState from '../components/EmptyState'
import FlowReport from '../components/report/FlowReport'
import AssetsReport from '../components/report/AssetsReport'
import InvestReport from '../components/report/InvestReport'

const TABS = [
  { id: 'flow', label: '收支' },
  { id: 'invest', label: '投資' },
  { id: 'assets', label: '資產' },
]

export default function ReportsPage() {
  const stockTxns = useCollection('stockTransactions')

  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('tab') || 'flow')
  // 切分頁寫回 URL：離開報表再返回能停在原分頁；預設 flow 不帶參數
  const changeTab = (id) => {
    setTab(id)
    setSearchParams(id === 'flow' ? {} : { tab: id }, { replace: true })
  }
  const { hidden } = useHiddenAmount()

  return (
    <div className="px-4 pt-4 pb-4 lg:px-7 lg:pt-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">報表</h1>
        <EyeButton />
      </header>

      {/* 分頁：收支｜投資（跨期分析）｜資產（淨資產趨勢） */}
      <div className="flex gap-1.5 p-1 mb-3 bg-surface-alt rounded-modal">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => changeTab(t.id)}
            className={`flex-1 py-2 rounded-btn text-[13px] font-semibold ${
              tab === t.id ? 'bg-surface text-text-primary shadow-segment' : 'text-text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'flow' ? (
        <FlowReport hidden={hidden} />
      ) : tab === 'assets' ? (
        <AssetsReport hidden={hidden} />
      ) : stockTxns.length === 0 ? (
        <EmptyState
          title="尚無投資資料"
          hint="於明細頁的股票分頁記錄第一筆買賣後，這裡會出現年度損益與資產佔比"
        />
      ) : (
        <InvestReport hidden={hidden} />
      )}
    </div>
  )
}
