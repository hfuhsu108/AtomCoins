// Web Push 訂閱（批次 7）：VAPID + PushManager，訂閱寫入 Firestore pushSubscriptions。
// 後端 Cloud Functions（functions/index.js）以 web-push 發送。做法沿用 CoTravel lib/pushSubscription。
// VAPID 公鑰＝公開值（CLAUDE.md 機密分層，同 GAS proxy 先例），私鑰只進 Secret Manager。
import { upsertPushSubscription, deletePushSubscription } from '../db/repo'

// ⚠ 待使用者 `npx web-push generate-vapid-keys` 產生後填入，並同步 functions/index.js 的同名常數。
const VAPID_PUBLIC_KEY = 'BAbj7oqk3xprNUmk9kRYilYY6TFEFxcF6EK7V3HFgOsvCG7N3BetSsiNWhyuLkAwkMkX0WQ-4KSKiB3EwblZNwc'

function isKeyReady() {
  return !!VAPID_PUBLIC_KEY && VAPID_PUBLIC_KEY !== 'REPLACE_WITH_VAPID_PUBLIC_KEY'
}

// VAPID 公鑰（base64url）→ Uint8Array，供 applicationServerKey 使用。
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i)
  return arr
}

// 穩定 docId：同裝置同 endpoint → 同 id，天然去重覆寫（djb2 雜湊，單人少量、碰撞可忽略）。
function endpointId(endpoint) {
  let h = 5381
  for (let i = 0; i < endpoint.length; i += 1) h = ((h << 5) + h + endpoint.charCodeAt(i)) >>> 0
  return `sub_${h.toString(36)}`
}

// serviceWorker/PushManager/Notification 皆具備，且 VAPID 公鑰已填。
export function isPushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    isKeyReady()
  )
}

// 平台與啟動環境偵測，供設定頁決定顯示開關或哪種引導。
export function getPushEnv() {
  const ua = navigator.userAgent || ''
  // iPadOS 13+ 偽裝成 Macintosh，靠觸控點數輔助判斷
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  const isAndroid = /android/i.test(ua)
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    navigator.standalone === true
  const permission = 'Notification' in window ? Notification.permission : 'unsupported'
  return { supported: isPushSupported(), isIOS, isAndroid, isStandalone, permission }
}

// 目前訂閱狀態：on／off／blocked／ios-install／unsupported。用 getRegistration（不 hang）而非 ready。
export async function getSubscriptionState() {
  if (!isPushSupported()) {
    const { isIOS, isStandalone } = getPushEnv()
    if (isIOS && !isStandalone) return 'ios-install'
    return 'unsupported'
  }
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return 'off' // dev 模式無 SW
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

// 訂閱本裝置並寫入 Firestore。回傳 true=成功；權限被拒回 false（正常流程）；
// 其他技術性失敗往上拋（fail loud，由 UI 的 useAsyncAction 顯示）。
// 必須在使用者點擊 handler 內呼叫（權限請求需 user gesture）。
export async function subscribeToPush() {
  if (!isPushSupported()) return false
  const permission = await requestNotificationPermission()
  if (permission !== 'granted') return false

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }
  const json = sub.toJSON()
  if (!json.keys?.p256dh || !json.keys?.auth) return false

  await upsertPushSubscription({
    id: endpointId(sub.endpoint),
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: navigator.userAgent,
    createdAt: new Date().toISOString(),
  })
  return true
}

// 退訂本裝置：刪 Firestore doc 並取消瀏覽器訂閱。
export async function unsubscribeFromPush() {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await deletePushSubscription(endpointId(sub.endpoint))
  await sub.unsubscribe()
}
