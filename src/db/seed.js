// 內建種子：MOZE 風格分類樹、預設現金帳戶、Settings 單例。
// 系統資料用固定 id（'sys-…'），bulkPut 冪等、可重跑不重複；使用者自建才用 nanoid。
import { db } from './index'
import { todayStr } from '../lib/date'

export const SETTINGS_ID = 'singleton'
export const DEFAULT_CASH_ACCOUNT_ID = 'acc-cash-default'
export const DEFAULT_BROKER_ID = 'broker-default'

// 轉帳手續費預設分類（docs/01 §3.6：feeCategoryId 預設指向內建「金融手續費」）
export const FEE_CATEGORY_ID = 'sys-exp-finance-fee'
// 拆帳差額/找不到分類時的退路（docs/01 §3.6：差額自動歸「未分類」）
export const UNCATEGORIZED_EXPENSE_ID = 'sys-exp-uncategorized'
export const UNCATEGORIZED_INCOME_ID = 'sys-inc-uncategorized'

// [母id, 名稱, icon, [[子id, 名稱], …]]
const EXPENSE_TREE = [
  ['sys-exp-food', '餐飲', 'utensils', [
    ['sys-exp-food-breakfast', '早餐'],
    ['sys-exp-food-lunch', '午餐'],
    ['sys-exp-food-dinner', '晚餐'],
    ['sys-exp-food-drink', '飲料'],
    ['sys-exp-food-snack', '點心'],
  ]],
  ['sys-exp-transit', '交通', 'car', [
    ['sys-exp-transit-gas', '加油'],
    ['sys-exp-transit-parking', '停車'],
    ['sys-exp-transit-mrt', '捷運／公車'],
    ['sys-exp-transit-taxi', '計程車'],
  ]],
  ['sys-exp-shopping', '購物', 'bag-shopping', [
    ['sys-exp-shopping-daily', '日用品'],
    ['sys-exp-shopping-clothes', '服飾'],
    ['sys-exp-shopping-digital', '3C 數位'],
  ]],
  ['sys-exp-home', '居住', 'house-chimney', [
    ['sys-exp-home-rent', '房租'],
    ['sys-exp-home-water', '水費'],
    ['sys-exp-home-elec', '電費'],
    ['sys-exp-home-gas', '瓦斯'],
  ]],
  ['sys-exp-medical', '醫療', 'kit-medical', [
    ['sys-exp-medical-clinic', '門診'],
    ['sys-exp-medical-pharmacy', '藥品'],
  ]],
  ['sys-exp-fun', '娛樂', 'gamepad', [
    ['sys-exp-fun-game', '遊戲'],
    ['sys-exp-fun-movie', '電影'],
    ['sys-exp-fun-travel', '旅遊'],
  ]],
  ['sys-exp-comm', '通訊', 'wifi', [
    ['sys-exp-comm-phone', '手機費'],
    ['sys-exp-comm-net', '網路費'],
  ]],
  ['sys-exp-finance', '金融', 'money-bill-transfer', [
    [FEE_CATEGORY_ID, '金融手續費'],
    ['sys-exp-finance-interest', '利息支出'],
  ]],
  [UNCATEGORIZED_EXPENSE_ID, '未分類', 'circle-question', []],
]

const INCOME_TREE = [
  ['sys-inc-salary', '薪資', 'money-check-dollar', [
    ['sys-inc-salary-monthly', '月薪'],
    ['sys-inc-salary-ot', '加班費'],
  ]],
  ['sys-inc-bonus', '獎金', 'gift', [
    ['sys-inc-bonus-year', '年終'],
    ['sys-inc-bonus-perf', '績效'],
  ]],
  ['sys-inc-invest', '投資', 'chart-line', [
    ['sys-inc-invest-dividend', '股利'],
    ['sys-inc-invest-interest', '利息'],
  ]],
  [UNCATEGORIZED_INCOME_ID, '其他', 'circle-plus', []],
]

// 把樹攤平成 Category 列（母 parentId=null，子 parentId=母id）
function flattenTree(tree, kind, ts) {
  const rows = []
  tree.forEach(([pid, pname, picon, children], pIdx) => {
    rows.push({
      id: pid, kind, parentId: null, name: pname, icon: picon,
      color: null, sortOrder: pIdx, isSystem: true, isArchived: false,
      createdAt: ts, updatedAt: ts,
    })
    children.forEach(([cid, cname], cIdx) => {
      rows.push({
        id: cid, kind, parentId: pid, name: cname, icon: null,
        color: null, sortOrder: cIdx, isSystem: true, isArchived: false,
        createdAt: ts, updatedAt: ts,
      })
    })
  })
  return rows
}

// 啟動時呼叫一次。已種過（settings 存在）就跳過，避免覆蓋使用者改過的系統分類。
export async function ensureSeeded() {
  const existing = await db.settings.get(SETTINGS_ID)
  if (existing) return

  const ts = new Date().toISOString()
  const today = todayStr()

  const categories = [
    ...flattenTree(EXPENSE_TREE, 'expense', ts),
    ...flattenTree(INCOME_TREE, 'income', ts),
  ]

  const cashAccount = {
    id: DEFAULT_CASH_ACCOUNT_ID,
    name: '現金錢包',
    type: 'cash',
    currency: 'TWD',
    icon: 'wallet',
    color: null,
    openingBalance: 0,
    openingDate: today,
    isArchived: false,
    sortOrder: 0,
    note: null,
    createdAt: ts,
    updatedAt: ts,
  }

  const settings = {
    id: SETTINGS_ID,
    theme: 'light',
    defaultAccountId: DEFAULT_CASH_ACCOUNT_ID, // 主帳戶（全域唯一，docs/01 §3.1）
    hideAmountsDefault: false,
    autoBackup: false,
    lastBackupAt: null,
    driveFileId: null,
    gasStockProxyUrl: null,
    seededAt: ts,
  }

  await db.transaction('rw', db.categories, db.accounts, db.settings, async () => {
    await db.categories.bulkPut(categories)
    await db.accounts.put(cashAccount)
    await db.settings.put(settings)
  })
}

// 券商種子（階段3）。獨立於 ensureSeeded：既有使用者（settings 已存在）也需要一個預設券商。
// 僅在 brokers 表為空時塞入，冪等且不蓋使用者已建/已改的券商。
export async function ensureBrokerSeed() {
  const count = await db.brokers.count()
  if (count > 0) return
  const ts = new Date().toISOString()
  await db.brokers.put({
    id: DEFAULT_BROKER_ID,
    name: '預設券商',
    feeDiscount: 1, // 不折，0.1425%
    minFee: 20,
    rounding: 'floor',
    note: null,
    createdAt: ts,
    updatedAt: ts,
  })
}
