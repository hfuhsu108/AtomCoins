import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBell, faEye } from '@fortawesome/free-solid-svg-icons'

export default function HomePage() {
  return (
    <div className="px-4 pt-4 lg:px-7 lg:pt-6">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">首頁</h1>
        <div className="flex items-center gap-4 text-text-secondary">
          <button className="text-lg"><FontAwesomeIcon icon={faEye} /></button>
          <button className="text-lg relative">
            <FontAwesomeIcon icon={faBell} />
            <span className="absolute -top-0.5 -right-0.5 w-[7px] h-[7px] bg-error rounded-full" />
          </button>
        </div>
      </header>
      <p className="text-text-tertiary text-sm">首頁內容將在 Stage 1 實作</p>
    </div>
  )
}
