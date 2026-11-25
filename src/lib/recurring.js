// 週期性收支（docs/01 §3.12）。本地 PWA 無背景排程，於 App 啟動時掃描 nextDate 觸發。
// 三模式：
//   immediate — nextDate ≤ 今天即自動入帳（落後多期會逐期補齊）
//   deferred  — 提前產生未來占位交易（postingDate 未到 → 未入帳），到日自動入帳
//   reminder  — 不自動建立，列入通知待確認，使用者點「記一筆」才入帳
import { collection, getDocs, query, where } from 'firebase/firestore'
import { firestore, auth } from './firebase'
import { commitRecurringRun, commitReminderOccurrence, recurringOccurrenceId } from '../db/repo'
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

// M2 起改於「登入後」呼叫一次（DataProvider 觸發），未登入直接跳過——
// Firestore 讀寫都需要 auth，且規則資料本來就存在 users/{uid} 底下。
export async function processRecurringRules(asOf = todayStr()) {
  const user = auth.currentUser
  if (!user) return 0
  const col = (name) => collection(firestore, 'users', user.uid, name)
  const snap = await getDocs(col('recurringRules'))
  const rules = snap.docs.map((d) => d.data())
  let created = 0
  for (const rule of rules) {
    if (!rule.isActive) continue
    if (rule.postingMode === 'reminder') continue

    // 單條 rule 壞資料（如 frequency 非法）不得中斷其他 rule，也不把壞 nextDate 寫回
    try {
      // 先驗證 frequency（丟棄結果）：壞的話在建任何交易前就拋，避免「建了交易才在推進時失敗」每次啟動重複建
      if (rule.nextDate) advanceDate(rule.nextDate, rule.frequency)
      const limit = rule.postingMode === 'deferred' ? addDays(asOf, DEFERRED_LEAD_DAYS) : asOf
      let nextDate = rule.nextDate
      if (!nextDate || nextDate > limit) continue

      // 已存在的期數跳過不重建：固定 id 只擋得住改版後建的；改版前的舊交易是隨機 id，
      // 改用日期比對。若不跳過，這次的 set 會蓋掉使用者對該期做過的修改。
      const existing = await getDocs(query(col('transactions'), where('recurringRuleId', '==', rule.id)))
      const existingIds = new Set(existing.docs.map((d) => d.id))
      const existingDates = new Set(existing.docs.map((d) => d.data().tradeDate))

      const occurrences = []
      let runs = 0
      while (nextDate && nextDate <= limit && runs < MAX_CATCHUP) {
        if (rule.endDate && nextDate > rule.endDate) break
        if (!existingIds.has(recurringOccurrenceId(rule.id, nextDate)) && !existingDates.has(nextDate)) {
          occurrences.push(occurrenceFromRule(rule, nextDate))
        }
        nextDate = advanceDate(nextDate, rule.frequency)
        runs++
      }
      if (runs > 0) {
        const patch = { nextDate, lastRunAt: asOf }
        if (rule.endDate && nextDate > rule.endDate) patch.isActive = false
        await commitRecurringRun(rule.id, occurrences, patch)
        created += occurrences.length
      }
    } catch (e) {
      console.error(`週期規則 ${rule.id} 處理失敗，已跳過`, e)
    }
  }
  return created
}

// dueReminders 已移至 notifications.js（純檔，供 Cloud Functions 推播共用），此處 re-export 保持相容。
export { dueReminders } from './notifications'

// 使用者在記帳表單確認某提醒（可先改金額、日期）→ 建立該期交易並推進 nextDate（落後多期僅補當前一期）。
// 連點或兩台裝置各存一次：固定 id 讓兩次寫到同一份文件，nextDate 也推到同一個值
export async function fireReminder(rule, list, asOf = todayStr()) {
  const nextDate = advanceDate(rule.nextDate, rule.frequency)
  const patch = { nextDate, lastRunAt: asOf }
  if (rule.endDate && nextDate > rule.endDate) patch.isActive = false
  await commitReminderOccurrence(rule.id, rule.nextDate, list, patch)
}
