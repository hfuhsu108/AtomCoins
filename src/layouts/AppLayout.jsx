import { Outlet } from 'react-router-dom'
import useMediaQuery from '../hooks/useMediaQuery'
import useDailyPriceSync from '../hooks/useDailyPriceSync'
import BottomNav from '../components/BottomNav'
import Sidebar from '../components/Sidebar'

export default function AppLayout() {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  useDailyPriceSync() // 每日開啟自動同步股價一次（全頁只掛一次）

  return (
    <div className="min-h-screen bg-app-bg">
      {isDesktop ? <Sidebar /> : <BottomNav />}
      <main
        className={
          isDesktop
            ? 'ml-[236px] min-h-screen'
            : 'pb-24'
        }
      >
        <Outlet />
      </main>
    </div>
  )
}
