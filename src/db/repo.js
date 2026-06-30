// Dexie CRUD 層：集中產生 id 與 createdAt/updatedAt 戳記，元件不直接碰 db.add/update。
import { db } from './index'
import { newId } from '../lib/id'
import { advanceDate } from '../lib/date'
import { SETTINGS_ID } from './seed'

const now = () => new Date().toISOString()

// 通用建立：currency 預設 TWD；id 未給才產生；戳記最後覆寫不被 data 蓋掉。
function buildRecord(data) {
  const ts = now()
  return { currency: 'TWD', ...data, id: data.id ?? newId(), createdAt: ts, updatedAt: ts }
}

// ── Transaction ──────────────────────────────────────────────
export async function createTransaction(data) {
  const record = buildRecord(data)
  await db.transactions.add(record)
  return record
}

export async function updateTransaction(id, patch) {
  await db.transactions.update(id, { ...patch, updatedAt: now() })
}

export async function deleteTransaction(id) {
  await db.transactions.delete(id)
}

// 刪除整個代墊/AA 連動群組（同 linkGroupId），避免只刪一筆留下扭曲帳務的孤兒
export async function deleteTransactionGroup(linkGroupId) {
  await db.transactions.where('linkGroupId').equals(linkGroupId).delete()
}

// 代墊/AA：把同一筆消費拆出的多筆交易（自己 expense + 代墊 receivable）
// 綁同一 linkGroupId 並一次寫入（docs/03 §F）。回傳寫入的記錄陣列。
export async function createLinkedTransactions(list) {
  const groupId = newId()
  const records = list.map((d) => buildRecord({ ...d, linkGroupId: groupId }))
  await db.transactions.bulkAdd(records)
  return records
}

// ── Account ──────────────────────────────────────────────────
export async function createAccount(data) {
  const record = buildRecord(data)
  await db.accounts.add(record)
  return record
}

export async function updateAccount(id, patch) {
  await db.accounts.update(id, { ...patch, updatedAt: now() })
}

// ── Category ─────────────────────────────────────────────────
export async function createCategory(data) {
  const record = buildRecord({ isSystem: false, isArchived: false, ...data })
  await db.categories.add(record)
  return record
}

export async function updateCategory(id, patch) {
  await db.categories.update(id, { ...patch, updatedAt: now() })
}

// ── Counterparty / Project / Tag（借還款與標記用，建立即用）────
export async function createCounterparty(data) {
  const record = { ...data, id: data.id ?? newId(), createdAt: now() }
  await db.counterparties.add(record)
  return record
}

export async function createProject(data) {
  const record = buildRecord({ isArchived: false, ...data })
  await db.projects.add(record)
  return record
}

export async function createTag(data) {
  const record = { ...data, id: data.id ?? newId(), createdAt: now() }
  await db.tags.add(record)
  return record
}

// ── 信用卡繳費（docs/03 §B：繳款是 transfer，不是支出）────────────
// 一次寫入「銀行→卡」轉帳 ＋ 帳單繳款快照（記 isPaid/paymentTransactionId），
// 兩者原子綁定，避免轉帳成功但快照漏記。回傳建立的轉帳記錄。
export async function payCreditCardStatement({ card, fundingAccountId, amount, postingDate, period }) {
  const ts = now()
  const payment = {
    id: newId(),
    type: 'transfer',
    currency: 'TWD',
    fromAccountId: fundingAccountId,
    toAccountId: card.id,
    amount,
    fee: 0,
    tradeDate: postingDate,
    postingDate,
    note: '信用卡繳費',
    tagIds: [],
    isReconciled: false,
    createdAt: ts,
    updatedAt: ts,
  }
  const statement = {
    id: newId(),
    accountId: card.id,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    statementDate: period.statementDate,
    dueDate: period.dueDate,
    totalAmount: period.total,
    isPaid: true,
    paymentTransactionId: payment.id,
    paidAmount: amount,
    createdAt: ts,
    updatedAt: ts,
  }
  await db.transaction('rw', db.transactions, db.creditCardStatements, async () => {
    await db.transactions.add(payment)
    await db.creditCardStatements.put(statement) // put：同期重繳覆蓋舊快照
  })
  return payment
}

// ── 分期付款（docs/03 §B Model B）──────────────────────────────
// 刷卡當下記一筆全額 expense（記在卡），再產生 N 筆「扣款銀行→卡」還款轉帳，
// postingDate 自首期日起逐月（未到期者為未入帳）。全部綁同一 installmentPlanId。
export async function createInstallmentPlan({ expense, periods, startDate, fundingAccountId }) {
  const planId = newId()
  const ts = now()
  const total = expense.amount
  const per = Math.floor(total / periods)
  const purchaseDate = expense.tradeDate

  const mainExpense = {
    ...expense,
    id: newId(),
    currency: 'TWD',
    postingDate: purchaseDate, // 全額於刷卡日入卡帳
    installmentPlanId: planId,
    note: expense.note ?? `分期 ${periods} 期`,
    isReconciled: false,
    createdAt: ts,
    updatedAt: ts,
  }

  const repayments = []
  for (let k = 0; k < periods; k++) {
    const date = advanceDate(startDate, { unit: 'month', interval: k })
    const amount = k < periods - 1 ? per : total - per * (periods - 1) // 末期吸收餘數
    repayments.push({
      id: newId(),
      type: 'transfer',
      currency: 'TWD',
      fromAccountId: fundingAccountId,
      toAccountId: expense.accountId,
      amount,
      fee: 0,
      tradeDate: date,
      postingDate: date,
      note: `分期 ${k + 1}/${periods}`,
      tagIds: [],
      isReconciled: false,
      installmentPlanId: planId,
      createdAt: ts,
      updatedAt: ts,
    })
  }

  const plan = {
    id: planId,
    accountId: expense.accountId,
    totalAmount: total,
    periods,
    startDate,
    perPeriodAmount: per,
    fundingAccountId,
    createdAt: ts,
    updatedAt: ts,
  }

  await db.transaction('rw', db.transactions, db.installmentPlans, async () => {
    await db.transactions.bulkAdd([mainExpense, ...repayments])
    await db.installmentPlans.add(plan)
  })
  return plan
}

// 刪除整個分期方案（主支出＋所有還款）
export async function deleteInstallmentPlan(planId) {
  await db.transaction('rw', db.transactions, db.installmentPlans, async () => {
    await db.transactions.where('installmentPlanId').equals(planId).delete()
    await db.installmentPlans.delete(planId)
  })
}

// ── 週期性收支（RecurringRule）─────────────────────────────────
export async function createRecurringRule(data) {
  const ts = now()
  const record = {
    isActive: true,
    lastRunAt: null,
    ...data,
    id: data.id ?? newId(),
    createdAt: ts,
    updatedAt: ts,
  }
  await db.recurringRules.add(record)
  return record
}

export async function updateRecurringRule(id, patch) {
  await db.recurringRules.update(id, { ...patch, updatedAt: now() })
}

export async function deleteRecurringRule(id) {
  await db.recurringRules.delete(id)
}

// ── Broker 券商（docs/01 §3.8）──────────────────────────────────
export async function createBroker(data) {
  const ts = now()
  const record = { rounding: 'floor', minFee: 20, ...data, id: data.id ?? newId(), createdAt: ts, updatedAt: ts }
  await db.brokers.add(record)
  return record
}

export async function updateBroker(id, patch) {
  await db.brokers.update(id, { ...patch, updatedAt: now() })
}

export async function deleteBroker(id) {
  await db.brokers.delete(id)
}

// ── StockTransaction 股票交易（docs/01 §3.9）────────────────────
// fee/tax/settlementDate 由表單以 lib/stock 算好傳入（可覆寫）；本層只補 id/戳記。
export async function createStockTransaction(data) {
  const record = buildRecord(data)
  await db.stockTransactions.add(record)
  return record
}

export async function updateStockTransaction(id, patch) {
  await db.stockTransactions.update(id, { ...patch, updatedAt: now() })
}

export async function deleteStockTransaction(id) {
  await db.stockTransactions.delete(id)
}

// ── StockPrice 股價快取（docs/01 §3.11）──────────────────────────
// 本階段手動輸入現價；階段4 GAS 抓 TWSE 收盤覆寫同一張表。symbol 為主鍵。
export async function upsertStockPrice({ symbol, closePrice, priceDate }) {
  await db.stockPrices.put({ symbol, closePrice, priceDate, updatedAt: now() })
}

// ── Settings（單例）──────────────────────────────────────────
export function getSettings() {
  return db.settings.get(SETTINGS_ID)
}

export async function updateSettings(patch) {
  await db.settings.update(SETTINGS_ID, patch)
}
