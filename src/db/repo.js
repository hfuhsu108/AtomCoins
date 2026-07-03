// Firestore CRUD 層（M3 起為唯一實作，原 Dexie 版已移除；遷移歷程見 docs/07）。
// 集中產生 id 與 createdAt/updatedAt 戳記，元件不直接碰 Firestore 寫入 API。
// 資料形狀慣例：ISO 字串戳記、整數金額（元）、nanoid 字串 id、日期 'YYYY-MM-DD'。
import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc,
  query, where, getDocs, writeBatch,
} from 'firebase/firestore'
import { firestore, auth } from '../lib/firebase'
import { newId } from '../lib/id'
import { advanceDate } from '../lib/date'
import { SETTINGS_ID } from './seed'

const now = () => new Date().toISOString()

// Firestore 拒收 undefined（含巢狀），寫入前一律深層剝除；null 合法、保留
function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)]),
    )
  }
  return value
}

// 未登入時直接 throw（fail loud）：呼叫端不該在未登入狀態寫資料
function uid() {
  const u = auth.currentUser
  if (!u) throw new Error('Firestore 寫入需要登入')
  return u.uid
}

const col = (name) => collection(firestore, 'users', uid(), name)
const ref = (name, id) => doc(firestore, 'users', uid(), name, id)

// currency 預設 TWD；id 未給才產生；戳記最後覆寫不被 data 蓋掉
function buildRecord(data) {
  const ts = now()
  return { currency: 'TWD', ...data, id: data.id ?? newId(), createdAt: ts, updatedAt: ts }
}

async function createDoc(name, record) {
  await setDoc(ref(name, record.id), stripUndefined(record))
  return record
}

async function patchDoc(name, id, patch) {
  await updateDoc(ref(name, id), stripUndefined({ ...patch, updatedAt: now() }))
}

// ── Transaction ──────────────────────────────────────────────
export async function createTransaction(data) {
  return createDoc('transactions', buildRecord(data))
}

export async function updateTransaction(id, patch) {
  await patchDoc('transactions', id, patch)
}

export async function deleteTransaction(id) {
  await deleteDoc(ref('transactions', id))
}

// 刪除整個代墊/AA 連動群組（同 linkGroupId），避免只刪一筆留下扭曲帳務的孤兒
export async function deleteTransactionGroup(linkGroupId) {
  const snap = await getDocs(query(col('transactions'), where('linkGroupId', '==', linkGroupId)))
  const batch = writeBatch(firestore)
  snap.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()
}

// 代墊/AA：同一筆消費拆出的多筆交易綁同一 linkGroupId 並一次原子寫入（docs/03 §F）
export async function createLinkedTransactions(list) {
  const groupId = newId()
  const records = list.map((d) => buildRecord({ ...d, linkGroupId: groupId }))
  const batch = writeBatch(firestore)
  records.forEach((r) => batch.set(ref('transactions', r.id), stripUndefined(r)))
  await batch.commit()
  return records
}

// ── Account ──────────────────────────────────────────────────
export async function createAccount(data) {
  return createDoc('accounts', buildRecord(data))
}

export async function updateAccount(id, patch) {
  await patchDoc('accounts', id, patch)
}

// ── Category ─────────────────────────────────────────────────
export async function createCategory(data) {
  return createDoc('categories', buildRecord({ isSystem: false, isArchived: false, ...data }))
}

export async function updateCategory(id, patch) {
  await patchDoc('categories', id, patch)
}

// ── Counterparty / Project / Tag（借還款與標記用，建立即用）────
export async function createCounterparty(data) {
  const record = { ...data, id: data.id ?? newId(), createdAt: now() }
  return createDoc('counterparties', record)
}

export async function createProject(data) {
  return createDoc('projects', buildRecord({ isArchived: false, ...data }))
}

export async function createTag(data) {
  const record = { ...data, id: data.id ?? newId(), createdAt: now() }
  return createDoc('tags', record)
}

// ── 信用卡繳費（docs/03 §B：繳款是 transfer，不是支出）────────────
// 「銀行→卡」轉帳＋帳單繳款快照以 writeBatch 原子綁定，避免轉帳成功但快照漏記
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
  const batch = writeBatch(firestore)
  batch.set(ref('transactions', payment.id), stripUndefined(payment))
  batch.set(ref('creditCardStatements', statement.id), stripUndefined(statement))
  await batch.commit()
  return payment
}

// ── 分期付款（docs/03 §B Model B）──────────────────────────────
// 主支出全額入卡帳＋N 筆還款轉帳＋方案，全部綁同一 installmentPlanId、writeBatch 原子寫入
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

  const batch = writeBatch(firestore)
  ;[mainExpense, ...repayments].forEach((t) => batch.set(ref('transactions', t.id), stripUndefined(t)))
  batch.set(ref('installmentPlans', planId), stripUndefined(plan))
  await batch.commit()
  return plan
}

// 刪除整個分期方案（主支出＋所有還款＋方案本體）
export async function deleteInstallmentPlan(planId) {
  const snap = await getDocs(query(col('transactions'), where('installmentPlanId', '==', planId)))
  const batch = writeBatch(firestore)
  snap.docs.forEach((d) => batch.delete(d.ref))
  batch.delete(ref('installmentPlans', planId))
  await batch.commit()
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
  return createDoc('recurringRules', record)
}

export async function updateRecurringRule(id, patch) {
  await patchDoc('recurringRules', id, patch)
}

export async function deleteRecurringRule(id) {
  await deleteDoc(ref('recurringRules', id))
}

// ── Broker 券商（docs/01 §3.8）──────────────────────────────────
export async function createBroker(data) {
  const ts = now()
  const record = { rounding: 'floor', minFee: 20, ...data, id: data.id ?? newId(), createdAt: ts, updatedAt: ts }
  return createDoc('brokers', record)
}

export async function updateBroker(id, patch) {
  await patchDoc('brokers', id, patch)
}

export async function deleteBroker(id) {
  await deleteDoc(ref('brokers', id))
}

// ── StockTransaction 股票交易（docs/01 §3.9）────────────────────
export async function createStockTransaction(data) {
  return createDoc('stockTransactions', buildRecord(data))
}

export async function updateStockTransaction(id, patch) {
  await patchDoc('stockTransactions', id, patch)
}

export async function deleteStockTransaction(id) {
  await deleteDoc(ref('stockTransactions', id))
}

// ── StockPrice 股價快取（docs/01 §3.11）──────────────────────────
// docId＝symbol（docs/07 §2-2），setDoc 覆寫語義（同步覆寫舊價）
export async function upsertStockPrice({ symbol, closePrice, priceDate }) {
  await setDoc(ref('stockPrices', symbol), stripUndefined({ symbol, closePrice, priceDate, updatedAt: now() }))
}

// ── Settings（單例，docId＝SETTINGS_ID）──────────────────────────
export async function getSettings() {
  const snap = await getDoc(ref('settings', SETTINGS_ID))
  return snap.exists() ? snap.data() : undefined
}

export async function updateSettings(patch) {
  await updateDoc(ref('settings', SETTINGS_ID), stripUndefined(patch))
}
