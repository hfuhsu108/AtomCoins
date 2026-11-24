// 自動扣款的卡：繳款日到了就補記一筆「繳費」（等同手動按繳費）。
// 登入後由 DataProvider 的啟動鏈呼叫一次，與 processRecurringRules 同一套防重入。
import { collection, getDocs, query, where } from 'firebase/firestore'
import { firestore, auth } from './firebase'
import { payCreditCardStatement } from '../db/repo'
import { dueAutoPayPeriods } from './engine'
import { todayStr } from './date'

export async function processAutoPayments(asOf = todayStr()) {
  const user = auth.currentUser
  if (!user) return 0
  const col = (name) => collection(firestore, 'users', user.uid, name)
  const accounts = (await getDocs(col('accounts'))).docs.map((d) => d.data())
  const cards = accounts.filter((a) => a.type === 'credit_card' && !a.isArchived && a.autoPay)

  let created = 0
  for (const card of cards) {
    // 單張卡失敗不中斷其他卡；下次開 App 會再試
    try {
      if (dueAutoPayPeriods(card, null, [], asOf).length === 0) continue
      // 只讀這張卡的消費（accountId）與繳費轉帳（toAccountId）——後者是已繳快照的存在性檢查要用的
      const [own, incoming, stmts] = await Promise.all([
        getDocs(query(col('transactions'), where('accountId', '==', card.id))),
        getDocs(query(col('transactions'), where('toAccountId', '==', card.id))),
        getDocs(query(col('creditCardStatements'), where('accountId', '==', card.id))),
      ])
      const txns = [...own.docs, ...incoming.docs].map((d) => d.data())
      const statements = stmts.docs.map((d) => d.data())
      for (const period of dueAutoPayPeriods(card, txns, statements, asOf)) {
        await payCreditCardStatement({
          card,
          fundingAccountId: card.linkedDebitAccountId,
          amount: period.total,
          postingDate: period.dueDate,
          period,
          auto: true,
        })
        created++
      }
    } catch (e) {
      console.error(`信用卡 ${card.id} 自動扣款補記失敗，已跳過`, e)
    }
  }
  return created
}
