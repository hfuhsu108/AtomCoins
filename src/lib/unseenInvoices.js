// 新發票通知紅點的判定。純函式、無相依，可用 node 離線驗算。
//
// 「新發票」＝爬蟲在上次看過發票分頁之後才建立、而且仍待歸帳的發票。
// 手動新增的是自己剛加的，不算；已歸帳／已略過的已經處理過，也不算。
// 爬蟲只在發票第一次入匣時寫 createdAt，重抓時保留原值（atomcoins-scraper/firestore_upload.py），
// 所以同一張發票不會因為每日重抓而一再變成「新的」。

// 時間一律 Date.parse 後比數字、不直接比字串：字串比較只在兩端格式完全一致（同為 UTC、同精度）時才成立。
// 爬蟲目前已對齊 toISOString（firestore_upload.py 的 _now_iso），但這個判定不該依賴那個約定。
export function unseenInvoices(invoices, seenAt) {
  const since = seenAt ? Date.parse(seenAt) : -Infinity
  return (invoices ?? []).filter(
    (inv) => inv.status === 'inbox' && inv.source !== 'manual' && Date.parse(inv.createdAt) > since,
  )
}

// 標記已讀時要寫入的時間：取「現在」與未讀發票最晚的 createdAt 兩者較晚者。
// 只寫「現在」的話，裝置時鐘比跑爬蟲的電腦慢時，剛點開的發票仍晚於已讀時間，紅點永遠消不掉。
export function nextSeenAt(unseen, now = Date.now()) {
  let latest = now
  for (const inv of unseen) {
    const t = Date.parse(inv.createdAt)
    if (t > latest) latest = t
  }
  return new Date(latest).toISOString()
}
