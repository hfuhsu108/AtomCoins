// 分類/帳戶的 icon 以「FA6 名稱字串」存於資料（如 'utensils'），
// 此處集中 import 對應的 solid icon 物件並提供查表，避免散落各元件。
import {
  faUtensils,
  faCar,
  faBagShopping,
  faHouseChimney,
  faKitMedical,
  faGamepad,
  faWifi,
  faMoneyBillTransfer,
  faMoneyCheckDollar,
  faGift,
  faChartLine,
  faCirclePlus,
  faCircleQuestion,
  faWallet,
  faBuildingColumns,
  faCreditCard,
  faTag,
  faEllipsis,
} from '@fortawesome/free-solid-svg-icons'

const REGISTRY = {
  utensils: faUtensils,
  car: faCar,
  'bag-shopping': faBagShopping,
  'house-chimney': faHouseChimney,
  'kit-medical': faKitMedical,
  gamepad: faGamepad,
  wifi: faWifi,
  'money-bill-transfer': faMoneyBillTransfer,
  'money-check-dollar': faMoneyCheckDollar,
  gift: faGift,
  'chart-line': faChartLine,
  'circle-plus': faCirclePlus,
  'circle-question': faCircleQuestion,
  wallet: faWallet,
  'building-columns': faBuildingColumns,
  'credit-card': faCreditCard,
  tag: faTag,
  ellipsis: faEllipsis,
}

// 查無對應時退回 tag，避免渲染崩潰
export function getIcon(name) {
  return REGISTRY[name] ?? faTag
}

// 帳戶類型 → 預設 icon 名稱（docs/04 Font Awesome 對應）
export const ACCOUNT_TYPE_ICON = {
  cash: 'wallet',
  bank: 'building-columns',
  credit_card: 'credit-card',
  securities: 'chart-line',
}

// 帳戶圖示：自訂 icon 優先，否則退回類型預設
export function accountIcon(account) {
  return getIcon(account.icon ?? ACCOUNT_TYPE_ICON[account.type])
}
