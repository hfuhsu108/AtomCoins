// 分類/帳戶的 icon 以「FA6 名稱字串」存於資料（如 'utensils'），
// 此處集中 import 對應的 solid icon 物件並提供查表，避免散落各元件。
import {
  faUtensils, faMugSaucer, faBurger, faBowlFood, faCartShopping, faBagShopping,
  faShirt, faGift, faCar, faGasPump, faBus, faTrain, faPlane, faTaxi,
  faHouse, faHouseChimney, faBolt, faDroplet, faFire, faWifi, faMobileScreen,
  faTv, faGamepad, faFilm, faMusic, faBook, faGraduationCap, faDumbbell, faSpa,
  faKitMedical, faPills, faStethoscope, faHeart, faPaw, faBaby, faBriefcase,
  faBuildingColumns, faCreditCard, faWallet, faMoneyBillTransfer, faMoneyCheckDollar,
  faCoins, faChartLine, faPiggyBank, faSackDollar, faHandHoldingDollar, faReceipt,
  faTag, faEllipsis, faCircleQuestion, faCirclePlus, faStar, faCakeCandles,
  faTree, faUmbrella, faScissors, faScrewdriverWrench, faPlug, faCat, faDog, faSeedling,
} from '@fortawesome/free-solid-svg-icons'

const REGISTRY = {
  utensils: faUtensils, 'mug-saucer': faMugSaucer, burger: faBurger, 'bowl-food': faBowlFood,
  'cart-shopping': faCartShopping, 'bag-shopping': faBagShopping, shirt: faShirt, gift: faGift,
  car: faCar, 'gas-pump': faGasPump, bus: faBus, train: faTrain, plane: faPlane, taxi: faTaxi,
  house: faHouse, 'house-chimney': faHouseChimney, bolt: faBolt, droplet: faDroplet, fire: faFire,
  wifi: faWifi, 'mobile-screen': faMobileScreen, tv: faTv, gamepad: faGamepad, film: faFilm,
  music: faMusic, book: faBook, 'graduation-cap': faGraduationCap, dumbbell: faDumbbell, spa: faSpa,
  'kit-medical': faKitMedical, pills: faPills, stethoscope: faStethoscope, heart: faHeart,
  paw: faPaw, baby: faBaby, briefcase: faBriefcase, 'building-columns': faBuildingColumns,
  'credit-card': faCreditCard, wallet: faWallet, 'money-bill-transfer': faMoneyBillTransfer,
  'money-check-dollar': faMoneyCheckDollar, coins: faCoins, 'chart-line': faChartLine,
  'piggy-bank': faPiggyBank, 'sack-dollar': faSackDollar, 'hand-holding-dollar': faHandHoldingDollar,
  receipt: faReceipt, tag: faTag, ellipsis: faEllipsis, 'circle-question': faCircleQuestion,
  'circle-plus': faCirclePlus, star: faStar, 'cake-candles': faCakeCandles, tree: faTree,
  umbrella: faUmbrella, scissors: faScissors, 'screwdriver-wrench': faScrewdriverWrench,
  plug: faPlug, cat: faCat, dog: faDog, seedling: faSeedling,
}

// 查無對應時退回 tag，避免渲染崩潰
export function getIcon(name) {
  return REGISTRY[name] ?? faTag
}

// 分類 icon 選擇器可挑的圖示名稱（依 REGISTRY 順序）
export const CATEGORY_ICON_NAMES = Object.keys(REGISTRY)

// 分類顏色色盤（docs/09 後續調整）：中間色調，深淺主題皆可讀；null=不上色（用中性底）
export const CATEGORY_COLORS = [
  '#E03131', '#F76707', '#F08C00', '#F59F00', '#74B816', '#2F9E44',
  '#0CA678', '#1098AD', '#1971C2', '#3B5BDB', '#6741D9', '#9C36B5',
  '#C2255C', '#E64980', '#868E96',
]

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
