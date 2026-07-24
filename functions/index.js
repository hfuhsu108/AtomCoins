// AtomCoins Web Push 推播後端（Cloud Functions v2，VAPID web-push，非 FCM）。docs/09 批次 7。
//
// 三支進入點：
//   morningDigest  排程 09:00 Asia/Taipei — 情境 C 信用卡繳費、D 交割缺口、E 週期提醒、
//                  F 週期扣款預告、G 爬蟲停擺（選配）
//   eveningNudge   排程 21:00 Asia/Taipei — 情境 A「今天還沒記帳」
//   onScraperStatus Firestore trigger — 情境 B「N 張新發票待歸帳」（爬蟲寫入 newCount>0 即時推）
//   sendTestPush   callable — 設定頁「發送測試通知」，驗證全鏈路
//
// 情境判定一律重用 shared/ 的純函式（predeploy 由 copy-shared.mjs 從 src/lib 複製，禁止手抄第二份），
// 與 App 首頁鈴鐺完全同口徑。
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2'
import { defineSecret } from 'firebase-functions/params'
import * as logger from 'firebase-functions/logger'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import webpush from 'web-push'

import {
  dueCardPayments,
  settlementShortfalls,
  dueReminders,
  dueRecurringPostings,
} from './shared/notifications.js'
import { addDays } from './shared/date.js'

// VAPID 公鑰＝公開值，同前端 src/lib/push.js 寫死（CLAUDE.md 機密分層，同 GAS proxy 先例）。
// ⚠ 待使用者以 `npx web-push generate-vapid-keys` 產生後，把 Public Key 同步填到這裡與 src/lib/push.js。
// 私鑰只進 Secret Manager（下方 defineSecret），絕不寫進原始碼。
const VAPID_PUBLIC_KEY = 'BAbj7oqk3xprNUmk9kRYilYY6TFEFxcF6EK7V3HFgOsvCG7N3BetSsiNWhyuLkAwkMkX0WQ-4KSKiB3EwblZNwc'
const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY')
const VAPID_SUBJECT = 'mailto:hfuhsu108@gmail.com'

initializeApp()
const db = getFirestore()
// 台灣就近區域；單人用量極低，限制併發降成本
setGlobalOptions({ region: 'asia-east1', maxInstances: 3 })

// 各情境預設開關（settings.pushPrefs 缺欄時的 fallback）：前五開、爬蟲健康預設關。
const DEFAULT_PREFS = {
  daily: true,
  invoice: true,
  card: true,
  settlement: true,
  recurring: true,
  scraperHealth: false,
}

// ── 共用工具 ────────────────────────────────────────────────

// Cloud Functions runtime 時區為 UTC；純函式的 todayStr() 會取到 UTC 日期而非台灣日期，
// 故一律用此函式明確取 Asia/Taipei 當日 'YYYY-MM-DD' 餵給 asOf，避免跨日錯位。
function taipeiToday() {
  // en-CA locale 的日期格式即 YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function fmt(n) {
  return Math.round(n).toLocaleString('en-US')
}

function userCol(uid, name) {
  return db.collection('users').doc(uid).collection(name)
}

async function readCol(uid, name) {
  const snap = await userCol(uid, name).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// 列出所有 users/{uid}（單人使用＝1 個，仍寫成通用迴圈）。users 文件多半只有 subcollection、
// 本身無欄位，故用 listDocuments()（get() 會漏掉沒有欄位的 parent doc）。
async function listUserIds() {
  const docs = await db.collection('users').listDocuments()
  return docs.map((d) => d.id)
}

async function getPrefs(uid) {
  const snap = await userCol(uid, 'settings').doc('singleton').get()
  const prefs = snap.exists ? (snap.data().pushPrefs ?? {}) : {}
  return { ...DEFAULT_PREFS, ...prefs }
}

async function getScraperStatus(uid) {
  const snap = await userCol(uid, 'meta').doc('scraperStatus').get()
  return snap.exists ? snap.data() : null
}

// 去重紀錄：meta/pushLog 單文件 map { dedupeKey: sentAtISO }。
async function getPushLog(uid) {
  const snap = await userCol(uid, 'meta').doc('pushLog').get()
  return snap.exists ? (snap.data() ?? {}) : {}
}

// minGapHours=null → 一次性（已發過就不再發）；給數字 → 間隔滿才可再發（情境 G 3 天一次）。
function canSend(log, key, minGapHours = null) {
  const last = log[key]
  if (!last) return true
  if (minGapHours == null) return false
  return (Date.now() - Date.parse(last)) / 3.6e6 >= minGapHours
}

function configureWebpush() {
  if (VAPID_PUBLIC_KEY === 'REPLACE_WITH_VAPID_PUBLIC_KEY') {
    // fail loud：金鑰未填就發送必然 401，明確報錯而非靜默失敗
    throw new Error('VAPID_PUBLIC_KEY 尚未填入（見 functions/index.js 與 src/lib/push.js）')
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.value())
}

// 對某 uid 的所有推播訂閱發送同一則 payload。410/404＝訂閱失效 → 刪除該 doc；
// 其他錯誤記 error log（不吞），但不 rethrow，避免單一壞訂閱擋掉整批發送。
async function sendToUser(uid, payload) {
  const subs = await readCol(uid, 'pushSubscriptions')
  if (subs.length === 0) return 0
  const body = JSON.stringify(payload)
  let ok = 0
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body)
        ok += 1
      } catch (err) {
        const code = err?.statusCode
        if (code === 404 || code === 410) {
          await userCol(uid, 'pushSubscriptions').doc(sub.id).delete()
          logger.info(`[push] 清除失效訂閱 ${uid}/${sub.id}（${code}）`)
        } else {
          logger.error(`[push] 發送失敗 ${uid}/${sub.id}`, err)
        }
      }
    }),
  )
  return ok
}

// ── 排程 A：晚間記帳提醒（21:00）────────────────────────────
export const eveningNudge = onSchedule(
  { schedule: '0 21 * * *', timeZone: 'Asia/Taipei', secrets: [VAPID_PRIVATE_KEY] },
  async () => {
    configureWebpush()
    const today = taipeiToday()
    for (const uid of await listUserIds()) {
      const prefs = await getPrefs(uid)
      if (!prefs.daily) continue
      const txns = await readCol(uid, 'transactions')
      // 當日 tradeDate 有任何交易就不打擾
      if (txns.some((t) => t.tradeDate === today)) continue
      await sendToUser(uid, {
        title: '今天還沒記帳',
        body: '花一分鐘記錄今天的收支吧',
        url: '#/add',
        tag: 'daily-nudge',
      })
    }
  },
)

// ── 排程 C+D+E+F+G：晨間彙總（09:00）───────────────────────
export const morningDigest = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'Asia/Taipei', secrets: [VAPID_PRIVATE_KEY] },
  async () => {
    configureWebpush()
    const today = taipeiToday()
    for (const uid of await listUserIds()) {
      await runMorning(uid, today)
    }
  },
)

async function runMorning(uid, today) {
  const prefs = await getPrefs(uid)
  const [accounts, txns, statements, stockTxns, rules] = await Promise.all([
    readCol(uid, 'accounts'),
    readCol(uid, 'transactions'),
    readCol(uid, 'creditCardStatements'),
    readCol(uid, 'stockTransactions'),
    readCol(uid, 'recurringRules'),
  ])
  const log = await getPushLog(uid)
  const sentKeys = {} // 本次發出的去重 key → sentAtISO
  const nowIso = new Date().toISOString()

  // 每則通知彙總後逐則發送；有 dedupeKey 者先查 pushLog、發後回寫，無 key 者天然日一次不記錄。
  const queue = [] // { payload, key?, minGapHours? }

  // C 信用卡繳費：D-7 / D-1 / 逾期日各一次（dedup card|acct|periodEnd|stage）
  if (prefs.card) {
    const d7 = addDays(today, 7)
    const d1 = addDays(today, 1)
    for (const due of dueCardPayments(accounts, txns, statements, today)) {
      let stage = null
      if (due.dueDate === d7) stage = 'd7'
      else if (due.dueDate === d1) stage = 'd1'
      else if (due.dueDate < today) stage = 'overdue'
      if (!stage) continue
      queue.push({
        key: `card|${due.account.id}|${due.periodEnd}|${stage}`,
        payload: {
          title: '信用卡繳費提醒',
          body:
            stage === 'overdue'
              ? `${due.account.name} 已逾期，應繳 NT$${fmt(due.amount)}`
              : `${due.account.name} ${due.dueDate} 到期，應繳 NT$${fmt(due.amount)}`,
          url: `#/card/${due.account.id}`,
          tag: `card-${due.account.id}-${due.periodEnd}`,
        },
      })
    }
  }

  // D 交割缺口：有缺口每日推（天然日一次，不記 pushLog）。高嚴重度。
  if (prefs.settlement) {
    for (const s of settlementShortfalls(accounts, txns, stockTxns, today)) {
      queue.push({
        payload: {
          title: '⚠ 交割款不足',
          body: `${s.bank.name} ${s.date} 交割還差 NT$${fmt(s.shortfall)}`,
          url: '#/',
          tag: `settle-${s.bank.id}-${s.date}`,
        },
      })
    }
  }

  // E 週期提醒待確認：合併成一則（天然日一次）
  if (prefs.recurring) {
    const reminders = dueReminders(rules, today)
    if (reminders.length > 0) {
      const first = reminders[0].payload?.note ?? '週期項目'
      queue.push({
        payload: {
          title: '週期提醒待確認',
          body:
            reminders.length === 1
              ? `「${first}」待確認記帳`
              : `「${first}」等 ${reminders.length} 筆週期提醒待確認`,
          url: '#/',
          tag: 'due-reminders',
        },
      })
    }
    // F 週期自動扣款預告：明天入帳（dedup recur|ruleId|nextDate）
    for (const r of dueRecurringPostings(rules, today)) {
      const note = r.payload?.note ?? '週期項目'
      const amt = r.payload?.amount
      queue.push({
        key: `recur|${r.id}|${r.nextDate}`,
        payload: {
          title: '明天將自動入帳',
          body: amt != null ? `明天自動記一筆「${note}」NT$${fmt(amt)}` : `明天將自動入帳「${note}」`,
          url: '#/',
          tag: `recur-${r.id}`,
        },
      })
    }
  }

  // G 爬蟲停擺告警（選配）：lastRunAt 距今 >48h，最多 3 天推一次
  if (prefs.scraperHealth) {
    const status = await getScraperStatus(uid)
    if (status?.lastRunAt) {
      const hours = (Date.now() - Date.parse(status.lastRunAt)) / 3.6e6
      if (hours > 48) {
        queue.push({
          key: 'scraper|health',
          minGapHours: 72,
          payload: {
            title: '發票同步停擺',
            body: `爬蟲已 ${Math.floor(hours / 24)} 天沒有成功同步，請檢查排程`,
            url: '#/settings',
            tag: 'scraper-health',
          },
        })
      }
    }
  }

  // 逐則發送（套去重）
  for (const item of queue) {
    if (item.key && !canSend(log, item.key, item.minGapHours ?? null)) continue
    await sendToUser(uid, item.payload)
    if (item.key) sentKeys[item.key] = nowIso
  }

  if (Object.keys(sentKeys).length > 0) {
    await userCol(uid, 'meta').doc('pushLog').set(sentKeys, { merge: true })
  }
}

// ── 情境 B：新發票待歸帳（Firestore trigger）──────────────
// 爬蟲每次同步都完整覆寫 scraperStatus；本次 newCount>0 即代表有全新入匣發票 → 即時推。
// 以「每次寫入」為去重基準（爬蟲日一次跑），不另記 pushLog。
export const onScraperStatus = onDocumentWritten(
  { document: 'users/{uid}/meta/scraperStatus', secrets: [VAPID_PRIVATE_KEY] },
  async (event) => {
    const after = event.data?.after?.data()
    if (!after) return // 刪除事件，忽略
    const newCount = after.newCount ?? 0
    if (newCount <= 0) return
    const uid = event.params.uid
    const prefs = await getPrefs(uid)
    if (!prefs.invoice) return
    configureWebpush()
    await sendToUser(uid, {
      title: '新發票待歸帳',
      body: `同步到 ${newCount} 張新發票，點此歸帳`,
      url: '#/transactions?tab=invoice',
      tag: 'new-invoices',
    })
  },
)

// ── 測試推播（callable）：設定頁「發送測試通知」按鈕呼叫 ────
export const sendTestPush = onCall(
  { secrets: [VAPID_PRIVATE_KEY] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', '需登入才能發送測試通知')
    const uid = request.auth.uid
    const subs = await readCol(uid, 'pushSubscriptions')
    if (subs.length === 0) {
      throw new HttpsError('failed-precondition', '這個裝置尚未訂閱推播')
    }
    configureWebpush()
    const ok = await sendToUser(uid, {
      title: '測試通知 ✓',
      body: '推播全鏈路正常，提醒到期時你會在這裡收到通知',
      url: '#/',
      tag: 'test-push',
    })
    return { sent: ok }
  },
)
