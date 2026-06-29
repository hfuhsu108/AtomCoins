// Dexie CRUD 層：集中產生 id 與 createdAt/updatedAt 戳記，元件不直接碰 db.add/update。
import { db } from './index'
import { newId } from '../lib/id'
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

// ── Settings（單例）──────────────────────────────────────────
export function getSettings() {
  return db.settings.get(SETTINGS_ID)
}

export async function updateSettings(patch) {
  await db.settings.update(SETTINGS_ID, patch)
}
