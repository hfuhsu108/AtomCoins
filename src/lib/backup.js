// 備份匯出（階段 7）：JSON 全量＋CSV 交易明細。只匯出、不做還原——
// Firestore 本身即雲端源，匯出目的是資料自主權與離線留存。
import { COLLECTIONS } from '../db/DataProvider'

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function buildJsonBackup(data, uid) {
  const collections = {}
  for (const name of COLLECTIONS) collections[name] = data[name] ?? []
  return JSON.stringify(
    { app: 'AtomCoins', version: 1, exportedAt: new Date().toISOString(), uid, collections },
    null,
    2,
  )
}

// —— CSV 交易明細 ——
// 拆帳展開：每個拆帳列各自成列（沿用「報表對拆帳列聚合」口徑）；
// 轉帳手續費、應收/應付的還款記錄也各自成列，讓 Excel 加總能對上帳。

const TYPE_LABEL = { expense: '支出', income: '收入', transfer: '轉帳', receivable: '應收', payable: '應付' }

const HEADER = ['交易ID', '類型', '記錄日', '入帳日', '帳戶', '轉入帳戶', '母分類', '子分類', '金額', '備註', '標籤', '專案', '對象']

function esc(v) {
  const s = v == null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

function byId(list) {
  const m = {}
  for (const x of list) m[x.id] = x
  return m
}

export function buildTransactionsCsv({ transactions, accounts, categories, tags, projects, counterparties }) {
  const accs = byId(accounts)
  const cats = byId(categories)
  const tagM = byId(tags)
  const projM = byId(projects)
  const cpM = byId(counterparties)

  const accName = (id) => accs[id]?.name ?? ''
  const tagNames = (ids) => (ids ?? []).map((id) => tagM[id]?.name ?? '').filter(Boolean).join('、')
  const projName = (id) => (id ? (projM[id]?.name ?? '') : '')
  // 分類只兩層：有 parentId 者為子分類，否則本身即母分類
  const catPair = (id) => {
    const c = cats[id]
    if (!c) return ['未分類', '']
    return c.parentId ? [cats[c.parentId]?.name ?? '', c.name] : [c.name, '']
  }

  const rows = []
  const sorted = [...transactions].sort((a, b) =>
    a.tradeDate === b.tradeDate ? (a.createdAt ?? '') < (b.createdAt ?? '') ? -1 : 1 : a.tradeDate < b.tradeDate ? -1 : 1,
  )

  for (const tx of sorted) {
    const label = TYPE_LABEL[tx.type] ?? tx.type
    if (tx.type === 'expense' || tx.type === 'income') {
      const splits = tx.splits ?? []
      let sum = 0
      for (const sp of splits) {
        sum += sp.amount
        const [parent, child] = catPair(sp.categoryId)
        rows.push([
          tx.id, label, tx.tradeDate, tx.postingDate, accName(tx.accountId), '',
          parent, child, sp.amount, sp.note ?? tx.note ?? '',
          tagNames(sp.tagIds?.length ? sp.tagIds : tx.tagIds), projName(sp.projectId ?? tx.projectId), '',
        ])
      }
      // Σsplit 與 amount 有差額時補「未分類」列，維持與帳戶餘額口徑一致（docs/01 §3.6）
      const diff = tx.amount - sum
      if (diff !== 0) {
        rows.push([
          tx.id, label, tx.tradeDate, tx.postingDate, accName(tx.accountId), '',
          '未分類', '', diff, splits.length ? '拆帳差額' : (tx.note ?? ''),
          tagNames(tx.tagIds), projName(tx.projectId), '',
        ])
      }
    } else if (tx.type === 'transfer') {
      rows.push([
        tx.id, label, tx.tradeDate, tx.postingDate, accName(tx.fromAccountId), accName(tx.toAccountId),
        '', '', tx.amount, tx.note ?? '', tagNames(tx.tagIds), projName(tx.projectId), '',
      ])
      if (tx.fee > 0) {
        const [parent, child] = catPair(tx.feeCategoryId)
        rows.push([
          tx.id, '轉帳手續費', tx.tradeDate, tx.postingDate, accName(tx.fromAccountId), '',
          parent, child, tx.fee, tx.note ?? '', '', '', '',
        ])
      }
    } else if (tx.type === 'receivable' || tx.type === 'payable') {
      const cp = cpM[tx.counterpartyId]?.name ?? ''
      rows.push([
        tx.id, label, tx.tradeDate, tx.postingDate, accName(tx.accountId), '',
        '', '', tx.amount, tx.note ?? '', tagNames(tx.tagIds), projName(tx.projectId), cp,
      ])
      for (const rp of tx.repayments ?? []) {
        rows.push([
          tx.id, tx.type === 'receivable' ? '收款' : '還款', rp.date, rp.date, accName(rp.accountId), '',
          '', '', rp.amount, '', '', '', cp,
        ])
      }
    }
  }

  // UTF-8 BOM＋CRLF：Excel 直接開啟中文不亂碼
  return '﻿' + [HEADER, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
}
