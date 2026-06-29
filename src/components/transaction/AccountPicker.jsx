import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck } from '@fortawesome/free-solid-svg-icons'
import { getIcon, ACCOUNT_TYPE_ICON } from '../../lib/icons'
import Sheet from '../Sheet'

const TYPE_LABEL = {
  cash: '現金',
  bank: '銀行',
  credit_card: '信用卡',
  securities: '證券',
}

// 帳戶選擇器。disabledId 用於轉帳時排除已選的對向帳戶。
export default function AccountPicker({
  open,
  onClose,
  accounts,
  value,
  onSelect,
  title = '選擇帳戶',
  disabledId = null,
}) {
  const list = accounts
    .filter((a) => !a.isArchived)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <Sheet open={open} onClose={onClose} title={title} bodyClassName="overflow-y-auto p-2">
      {list.map((a) => {
        const active = a.id === value
        const disabled = a.id === disabledId
        return (
          <button
            key={a.id}
            disabled={disabled}
            onClick={() => {
              onSelect(a.id)
              onClose()
            }}
            className={`flex items-center gap-3 w-full p-3 rounded-chip text-left ${
              active ? 'bg-brand-light' : ''
            } ${disabled ? 'opacity-40' : ''}`}
          >
            <span className="w-9 h-9 flex-none rounded-chip bg-surface-alt text-text-secondary flex items-center justify-center text-[15px]">
              <FontAwesomeIcon icon={getIcon(a.icon ?? ACCOUNT_TYPE_ICON[a.type])} />
            </span>
            <span className="flex-1 min-w-0">
              <span className={`block text-[15px] ${active ? 'font-semibold text-brand' : 'font-medium'}`}>
                {a.name}
              </span>
              <span className="block text-xs text-text-tertiary">{TYPE_LABEL[a.type]}</span>
            </span>
            {active && <FontAwesomeIcon icon={faCheck} className="text-brand text-[13px]" />}
          </button>
        )
      })}
    </Sheet>
  )
}
