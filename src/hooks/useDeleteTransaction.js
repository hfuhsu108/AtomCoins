import { useCollection } from '../db/DataProvider'
import {
  deleteTransaction,
  deleteTransactionGroup,
  deleteInstallmentPlan,
  deleteStockTransaction,
  unrecordInvoice,
} from '../db/repo'
import { useAsyncAction, settle } from './useAsyncAction'
import { useConfirm } from '../components/ConfirmSheet'

// 刪除一筆記錄的完整流程（確認框＋分支判定＋寫入）。編輯頁與清單的左滑刪除共用同一份：
// 這裡有 5 個分支，抄第二份遲早會漂移（例如漏掉發票要走 unrecordInvoice）。
//
// requestDelete(item, kind) 回傳「真的刪掉了嗎」：使用者取消、或寫入失敗都是 false，
// 呼叫端據此決定要不要關表單／收起抽屜。錯誤訊息走 error（useAsyncAction 已吞例外）。
//
// 呼叫端務必把 confirmElement 一併 render，且同一頁只 render 一份。
export default function useDeleteTransaction() {
  const invoices = useCollection('invoices')
  const { run, busy, error } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  const requestDelete = async (item, kind = 'tx') => {
    if (!item) return false
    let done = false

    if (kind === 'stock') {
      if (!(await confirm({ title: '刪除股票交易', message: '確定刪除這筆股票交易？', danger: true }))) return false
      await run(async () => {
        await settle(deleteStockTransaction(item.id))
        done = true
      })
      return done
    }

    // 拆帳一筆會展開成多列，從任一列刪都是刪整筆——先把後果講明白
    const splitCount = item.splits?.length ?? 0
    const splitNote = splitCount > 1 ? `這筆含 ${splitCount} 列拆帳，將整筆刪除。` : ''

    // 歸帳產生的交易：改走取消歸帳（原子刪交易含整組＋發票退回 inbox），
    // 直接刪會讓 recorded 發票指向已刪交易、之後無法重新歸帳
    if (item.invoiceId) {
      const inv = invoices.find((i) => i.id === item.invoiceId)
      if (inv) {
        const msg = `${splitNote}這筆交易由發票歸帳產生：將刪除交易（含關聯筆）並把發票退回未歸帳。確定刪除？`
        if (!(await confirm({ title: '刪除交易', message: msg, danger: true }))) return false
        await run(async () => {
          await settle(unrecordInvoice(inv))
          done = true
        })
        return done
      }
      // 發票已被刪 → 落回一般刪除路徑
    }

    const planId = item.installmentPlanId
    const linked = !!item.linkGroupId
    const msg =
      splitNote +
      (planId
        ? '這筆屬於分期方案，將一併刪除全額消費與所有期款。確定刪除？'
        : linked
          ? '這筆與代墊／分帳的另一筆相連，將一併刪除整組。確定刪除？'
          : '確定刪除這筆記錄？')
    if (!(await confirm({ title: '刪除記錄', message: msg, danger: true }))) return false
    await run(async () => {
      if (planId) await settle(deleteInstallmentPlan(planId))
      else if (linked) await settle(deleteTransactionGroup(item.linkGroupId))
      else await settle(deleteTransaction(item.id))
      done = true
    })
    return done
  }

  return { requestDelete, confirmElement, busy, error }
}
