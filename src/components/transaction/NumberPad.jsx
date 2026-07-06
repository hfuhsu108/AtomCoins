import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faDeleteLeft } from '@fortawesome/free-solid-svg-icons'

// 計算機鍵盤。純呈現，按鍵事件交給 onPress(key)；求值邏輯在 lib/calc.js。
const KEYS = [
  { k: 'AC', label: 'AC', kind: 'fn' },
  { k: '%', label: '%', kind: 'fn' },
  { k: '/', label: '÷', kind: 'op' },
  { k: 'back', label: '', kind: 'fn', back: true },
  { k: '7', label: '7', kind: 'digit' },
  { k: '8', label: '8', kind: 'digit' },
  { k: '9', label: '9', kind: 'digit' },
  { k: '*', label: '×', kind: 'op' },
  { k: '4', label: '4', kind: 'digit' },
  { k: '5', label: '5', kind: 'digit' },
  { k: '6', label: '6', kind: 'digit' },
  { k: '-', label: '−', kind: 'op' },
  { k: '1', label: '1', kind: 'digit' },
  { k: '2', label: '2', kind: 'digit' },
  { k: '3', label: '3', kind: 'digit' },
  { k: '+', label: '+', kind: 'op' },
  { k: '0', label: '0', kind: 'digit', span: true },
  { k: '.', label: '.', kind: 'digit' },
  { k: '=', label: '=', kind: 'eq' },
]

const KIND_CLASS = {
  digit: 'bg-app-bg text-text-primary',
  fn: 'bg-surface-alt text-text-secondary',
  op: 'bg-brand-light text-brand font-bold',
  eq: 'bg-brand text-white font-bold',
}

export default function NumberPad({ onPress }) {
  return (
    <div className="flex-none bg-surface border-t border-line px-3 pt-2.5 pb-[max(env(safe-area-inset-bottom),18px)]">
      <div className="grid grid-cols-4 gap-2">
        {KEYS.map((key) => (
          <button
            key={key.k}
            onClick={() => onPress(key.k)}
            className={`h-[52px] rounded-key text-xl font-semibold tabular-nums flex items-center justify-center ${
              KIND_CLASS[key.kind]
            } ${key.span ? 'col-span-2' : ''}`}
          >
            {key.back ? (
              <FontAwesomeIcon icon={faDeleteLeft} className="text-lg" />
            ) : (
              key.label
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
