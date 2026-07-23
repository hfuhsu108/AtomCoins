// Web Push 事件處理：由 VitePWA 產生的 Workbox SW 透過 workbox.importScripts 載入。
// 後端（Cloud Functions／web-push）送出的 payload 約定：{ title, body, url, tag }。
// 做法沿用 CoTravel public/push-handler.js，路徑改為本站子路徑 /AtomCoins/。

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(
    self.registration.showNotification(data.title || '原子記帳', {
      body: data.body || '',
      icon: '/AtomCoins/pwa-192x192.png',
      badge: '/AtomCoins/pwa-64x64.png',
      data: { url: data.url || '/AtomCoins/' },
      // 同 tag 覆蓋舊通知（同類提醒只保留最新一則）
      tag: data.tag || 'atomcoins',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url =
    event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : '/AtomCoins/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 已有本站視窗 → 導向深連結（含 hash 路由）並聚焦，避免重複開分頁
      for (const client of windowClients) {
        if (client.url.includes('/AtomCoins/') && 'focus' in client) {
          if ('navigate' in client) client.navigate(url).catch(() => {})
          return client.focus()
        }
      }
      return clients.openWindow(url)
    }),
  )
})
