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

// 選圖器選定的非內建圖示，存進分類的是 { n, w, h, p } 向量資料（見 scripts/gen-icon-catalog.mjs）。
// 這裡把它組回 FA 的 icon definition 形狀交給 FontAwesomeIcon 渲染——因此 getIcon 維持同步，
// 所有呼叫端（含在資料整形階段就取 icon 物件的 TransactionRow／FlowReport）都不必改。
const customCache = new Map()

function toDefinition(v) {
  const hit = customCache.get(v.n)
  if (hit) return hit
  const def = { prefix: 'fas', iconName: v.n, icon: [v.w, v.h, [], '', v.p] }
  customCache.set(v.n, def)
  return def
}

// 吃內建名稱字串或自訂圖示物件；查無對應時退回 tag，避免渲染崩潰
export function getIcon(value) {
  if (value && typeof value === 'object') {
    return typeof value.p === 'string' && value.n ? toDefinition(value) : faTag
  }
  return REGISTRY[value] ?? faTag
}

// 分類 icon 選擇器的常用捷徑（依 REGISTRY 順序）；完整 FA 目錄由 IconPickerSheet 另行載入
export const CATEGORY_ICON_NAMES = Object.keys(REGISTRY)

// 選圖器的中文搜尋橋接：FA 圖示只有英文名，這裡讓常見中文詞也查得到。
// 只收記帳情境高頻詞，不追求完整；查不到時使用者仍可直接打英文。
export const ICON_KEYWORDS_ZH = {
  餐: ['utensils', 'burger', 'bowl'], 吃: ['utensils', 'burger'], 飯: ['bowl', 'utensils'],
  咖啡: ['mug', 'coffee'], 飲料: ['mug', 'bottle', 'glass'], 酒: ['wine', 'beer', 'martini'],
  蛋糕: ['cake'], 麵包: ['bread'], 冰: ['ice-cream', 'snowflake'], 水果: ['apple', 'lemon'],
  購物: ['cart', 'bag'], 買: ['cart', 'bag'], 衣服: ['shirt'], 鞋: ['shoe'], 禮物: ['gift'],
  交通: ['car', 'bus', 'train'], 車: ['car', 'taxi'], 加油: ['gas-pump', 'charging'],
  公車: ['bus'], 火車: ['train'], 捷運: ['train-subway'], 飛機: ['plane'], 船: ['ship'],
  機車: ['motorcycle'], 腳踏車: ['bicycle'], 停車: ['square-parking'],
  居住: ['house'], 家: ['house'], 房: ['house', 'building'], 電: ['bolt', 'plug'],
  水: ['droplet', 'faucet'], 瓦斯: ['fire'], 網路: ['wifi'], 電話: ['phone', 'mobile'],
  醫療: ['kit-medical', 'stethoscope'], 藥: ['pills', 'prescription'], 醫院: ['hospital'],
  牙: ['tooth'], 眼: ['eye', 'glasses'], 健康: ['heart-pulse', 'heart'],
  娛樂: ['gamepad', 'film'], 遊戲: ['gamepad', 'dice'], 電影: ['film', 'ticket'],
  音樂: ['music', 'headphones'], 運動: ['dumbbell', 'person-running'], 旅遊: ['plane', 'suitcase'],
  書: ['book'], 教育: ['graduation-cap', 'school'], 學: ['graduation-cap', 'pen'],
  寵物: ['paw', 'dog', 'cat'], 小孩: ['baby', 'child'], 美容: ['spa', 'scissors'],
  金融: ['building-columns', 'money-check'], 銀行: ['building-columns'], 錢: ['money', 'coins', 'sack-dollar'],
  現金: ['money-bill', 'wallet'], 信用卡: ['credit-card'], 投資: ['chart-line', 'arrow-trend-up'],
  存: ['piggy-bank', 'vault'], 薪水: ['money-bill-trend-up', 'sack-dollar'], 保險: ['shield', 'umbrella'],
  稅: ['file-invoice-dollar', 'receipt'], 發票: ['receipt', 'file-invoice'],
  工作: ['briefcase'], 捐: ['hand-holding-heart'], 修: ['screwdriver-wrench', 'hammer'],
  植物: ['seedling', 'tree'], 清潔: ['broom', 'soap'], 洗衣: ['shirt', 'soap'],
}

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
