// Dexie → Firestore 一次性遷移工具（docs/07 M1）。setDoc 覆寫語義＝冪等，可重跑校正。
// M3 去 Dexie 時整檔移除。
import { writeBatch, doc, collection, getCountFromServer } from 'firebase/firestore'
import { firestore } from '../lib/firebase'
import { db } from './index'
import { stripUndefined } from './firestore-repo'

// docId 例外表（docs/07 §2-2）；其餘 table 一律用 record.id
const DOC_ID_OF = {
  stockPrices: (r) => r.symbol,
  invoices: (r) => r.invoiceNumber ?? r.id,
}

const BATCH_LIMIT = 450 // writeBatch 上限 500，留餘裕

export async function migrateDexieToFirestore(uid) {
  const results = []
  for (const table of db.tables) {
    const name = table.name
    const rows = await table.toArray()
    const docIdOf = DOC_ID_OF[name] ?? ((r) => r.id)

    for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
      const batch = writeBatch(firestore)
      for (const row of rows.slice(i, i + BATCH_LIMIT)) {
        batch.set(doc(firestore, 'users', uid, name, String(docIdOf(row))), stripUndefined(row))
      }
      await batch.commit()
    }

    // 寫完立即用 count 聚合查詢回讀雲端筆數，取代人工到 console 對數（console 不顯示筆數）
    const snap = await getCountFromServer(collection(firestore, 'users', uid, name))
    results.push({ name, dexie: rows.length, cloud: snap.data().count })
  }
  return results
}
