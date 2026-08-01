// 全站共用的圓角開關。原本記帳表單（Switch）與設定頁（Toggle）各有一份實作，
// 尺寸相同但未選態一個有邊框一個沒有，且只有設定頁那份帶無障礙語義——這裡採設定頁版本。
export default function Toggle({ checked, disabled = false, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-brand' : 'bg-surface-alt border border-line'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}
