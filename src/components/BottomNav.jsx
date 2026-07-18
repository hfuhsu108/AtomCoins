import { NavLink, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faHouse,
  faReceipt,
  faPlus,
  faChartPie,
  faGear,
} from '@fortawesome/free-solid-svg-icons'

const tabs = [
  { to: '/', icon: faHouse, label: '首頁' },
  { to: '/transactions', icon: faReceipt, label: '明細' },
  null,
  { to: '/reports', icon: faChartPie, label: '報表' },
  { to: '/settings', icon: faGear, label: '設定' },
]

export default function BottomNav() {
  const navigate = useNavigate()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-line pb-[env(safe-area-inset-bottom,22px)]">
      <div className="flex items-end justify-around h-14">
        {tabs.map((tab, i) =>
          tab ? (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 pt-2 text-[11px] font-medium ${
                  isActive ? 'text-brand' : 'text-text-tertiary'
                }`
              }
            >
              <FontAwesomeIcon icon={tab.icon} className="text-lg" />
              <span>{tab.label}</span>
            </NavLink>
          ) : (
            <button
              key="fab"
              onClick={() => navigate('/add')}
              aria-label="記帳"
              className="flex items-center justify-center w-14 h-14 -translate-y-4 rounded-full bg-brand shadow-fab"
            >
              <FontAwesomeIcon icon={faPlus} className="text-white text-xl" />
            </button>
          ),
        )}
      </div>
    </nav>
  )
}
