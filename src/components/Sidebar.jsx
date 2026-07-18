import { NavLink, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCoins,
  faHouse,
  faReceipt,
  faChartPie,
  faGear,
  faPlus,
  faUser,
} from '@fortawesome/free-solid-svg-icons'
import { useAuth } from '../hooks/useAuth'

const navItems = [
  { to: '/', icon: faHouse, label: '首頁' },
  { to: '/transactions', icon: faReceipt, label: '明細' },
  { to: '/reports', icon: faChartPie, label: '報表' },
  { to: '/settings', icon: faGear, label: '設定' },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const user = useAuth()
  // undefined＝登入狀態載入中、null＝未登入、物件＝已登入
  const userLabel = user === undefined ? '…' : user === null ? '未登入' : (user.displayName || user.email)

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[236px] bg-surface border-r border-line flex flex-col z-40">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <div className="w-[34px] h-[34px] bg-brand rounded-btn flex items-center justify-center">
          <FontAwesomeIcon icon={faCoins} className="text-white text-sm" />
        </div>
        <div>
          <div className="text-sm font-semibold text-text-primary leading-tight">
            原子記帳
          </div>
          <div className="text-xs text-text-tertiary">AtomCoins</div>
        </div>
      </div>

      {/* Add button */}
      <div className="px-4 mb-4">
        <button
          onClick={() => navigate('/add')}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-btn bg-brand-light text-brand font-medium text-sm cursor-pointer"
        >
          <FontAwesomeIcon icon={faPlus} />
          <span>記帳</span>
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-chip text-sm ${
                isActive
                  ? 'bg-brand-light text-brand font-semibold'
                  : 'text-text-secondary font-medium hover:bg-surface-alt'
              }`
            }
          >
            <FontAwesomeIcon icon={item.icon} className="w-5 text-center" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User info */}
      <div className="px-5 py-4 border-t border-line flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center">
          <FontAwesomeIcon
            icon={faUser}
            className="text-brand text-xs"
          />
        </div>
        <span className="text-sm text-text-secondary truncate">{userLabel}</span>
      </div>
    </aside>
  )
}
