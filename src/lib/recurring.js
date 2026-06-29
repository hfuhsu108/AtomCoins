// 週期性收支（docs/01 §3.12）。本地 PWA 無背景排程，於 App 啟動時掃描 nextDate 觸發。
// 三模式：
//   immediate — nextDate ≤ 今天即自動入帳（落後多期會逐期補齊）
//   deferred  — 提前產生未來占位交易（postingDate 未到 → 未入帳），到日自動入帳
//   reminder  — 不自動建立，列入通知待確認，使用者點「記一筆」才入帳
import { db } from '../db'
import { createTransaction, updateRecurringRule } from '../db/repo'
import { todayStr, advanceDate, addDays } from './date'

const MAX_CATCHUP = 24 // 單一規則單次最多補齊期數，防呆避免落後過久時暴衝
const DEFERRED_LEAD_DAYS = 35 // deferred 提前產生的視窗（涵蓋下一期）

// 由規則的 payload 範本建一筆交易（剝除識別/時間戳，補上本期日期與來源）。
// 必須去掉 id：createTransaction 的 buildRecord 遇到既有 id 會沿用而撞號。
function occurrenceFromRule(rule, date) {
  const payload = { ...(rule.payload ?? {}) }
  delete payload.id
  delete payload.createdAt
  delete payload.updatedAt
  return { ...payload, tradeDate: date, postingDate: date, recurringRuleId: rule.id }
}

// 啟動時呼叫一次。處理 immediate / deferred；reminder 交給通知區。回傳本次建立筆數。
export async function processRecurringRules(asOf = todayStr()) {
  const rules = await db.recurringRules.toArray()
  let created = 0
  for (const rule of rules) {
    if (!rule.isActive) continue
    if (rule.postingMode === 'reminder') continue

    const limit = rule.postingMode === 'deferred' ? addDays(asOf, DEFERRED_LEAD_DAYS) : asOf
    let nextDate = rule.nextDate
    let runs = 0
    let dirty = false
    while (nextDate && nextDate <= limit && runs < MAX_CATCHUP) {
      if (rule.endDate && nextDate > rule.endDate) break
      await createTransaction(occurrenceFromRule(rule, nextDate))
      created++
      nextDate = advanceDate(nextDate, rule.frequency)
      runs++
      dirty = true
    }
    if (dirty) {
      const patch = { nextDate, lastRunAt: asOf }
      if (rule.endDate && nextDate > rule.endDate) patch.isActive = false
      await updateRecurringRule(rule.id, patch)
    }
  }
  return created
}

// 到期的提醒（reminder 模式且 nextDate ≤ 今天）。供通知區列出。
export function dueReminders(rules, asOf = todayStr()) {
  return (rules ?? []).filter(
    (r) => r.isActive && r.postingMode === 'reminder' && r.nextDate && r.nextDate <= asOf,
  )
}

// 使用者確認某提醒 → 建立該期交易並推進 nextDate（落後多期僅補當前一期）
export async function fireReminder(rule, asOf = todayStr()) {
  await createTransaction(occurrenceFromRule(rule, rule.nextDate))
  const nextDate = advanceDate(rule.nextDate, rule.frequency)
  const patch = { nextDate, lastRunAt: asOf }
  if (rule.endDate && nextDate > rule.endDate) patch.isActive = false
  await updateRecurringRule(rule.id, patch)
}
