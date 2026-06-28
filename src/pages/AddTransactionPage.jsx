import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'

export default function AddTransactionPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-surface">
      <header className="flex items-center justify-between px-4 pt-4">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center text-text-secondary text-lg"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
        <h1 className="text-xl font-semibold">記帳</h1>
        <div className="w-10" />
      </header>
      <div className="px-4 pt-8 text-center">
        <p className="text-text-tertiary text-sm">記帳表單將在 Stage 1 實作</p>
      </div>
    </div>
  )
}
