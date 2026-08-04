// 記帳計算引擎（docs/02）。皆為純函式，餘額一律用 postingDate 累計。
//
// 三大核心觀念落地：
//  - 帳戶餘額：openingBalance + Σ postings(postingDate ≤ D)
//  - 收支統計：只取 expense/income 的拆帳列；轉帳/借還/股票本金不計入
//  - 收支配色：支出 expense（琥珀）、收入 income（藍），由元件用語意 token 上色
import { todayStr, addMonth, dayOfMonth, addDays, parseDate } from './date'

// 把單筆交易攤成 postings：{ accountId, amount, date }
// amount 已帶正負；date 為實際入帳/還款日。
export function transactionPostings(tx) {
  const postings = []
  switch (tx.type) {
    case 'expense':
      postings.push({ accountId: tx.accountId, amount: -tx.amount, date: tx.postingDate })
      break
    case 'income':
      postings.push({ accountId: tx.accountId, amount: tx.amount, date: tx.postingDate })
      break
    case 'transfer':
      postings.push({ accountId: tx.fromAccountId, amount: -tx.amount, date: tx.postingDate })
      postings.push({ accountId: tx.toAccountId, amount: tx.amount, date: tx.postingDate })
      // 手續費另從轉出帳戶扣（本金不算支出，但手續費計入支出 — 報表端處理）
      if (tx.fee) {
        postings.push({ accountId: tx.fromAccountId, amount: -tx.fee, date: tx.postingDate })
      }
      break
    // 期初餘額（isOpening）：開始記帳前就存在的債權債務，本金那筆現金早就流動過了，
    // 再扣一次會讓帳戶餘額憑空短少。但**只跳過本金**——之後登錄的還款是真實的現金進出，
    // 必須照常入帳。這點與股票期初持股不同，那邊整筆回空（stockPostings）是因為期初持股
    // 沒有「後續還款」這種附加現金流。未結清金額與淨資產不受影響：兩者都走 outstandingAsOf，
    // 只看 amount 與 repayments，不看 postings。
    case 'receivable': // 借出：資金離開帳戶，還款再回來
      if (!tx.isOpening) postings.push({ accountId: tx.accountId, amount: -tx.amount, date: tx.postingDate })
      for (const r of tx.repayments ?? []) {
        postings.push({ accountId: r.accountId, amount: r.amount, date: r.date })
      }
      break
    case 'payable': // 借入：資金進入帳戶，還款再離開
      if (!tx.isOpening) postings.push({ accountId: tx.accountId, amount: tx.amount, date: tx.postingDate })
      for (const r of tx.repayments ?? []) {
        postings.push({ accountId: r.accountId, amount: -r.amount, date: r.date })
      }
      break
    case 'adjust':
      // 餘額調整不產生 posting：它不是「一筆金額」而是「一個基準點」，
      // 由 accountBalances 換掉累加起點來實現（見 latestAnchors）。明寫此 case 是為了
      // 不依賴「未知 type 落空」的隱性行為——那會讓日後新增型別時默默算錯。
      break
  }
  return postings
}

// 配息實入金額 = 現金股利總額 − 匯費 − 補充保費。
// 定義在此而非 stock.js，是因為 stock.js 不在 copy-shared 的複製清單內，engine 不能 import 它；
// 而 computeHoldings 的累計配息必須與這裡的入帳金額同口徑，故由 stock.js 反向 import 本函式。
export function dividendNetAmount(stx) {
  return (stx.cashAmount ?? 0) - (stx.fee ?? 0) - (stx.tax ?? 0)
}

// 把單筆股票交易攤成 postings：交割金額於 settlementDate 影響「交割銀行」（docs/02 §4.1）。
// 買進 −(round(gross)+fee)、賣出 +(round(gross)−fee−tax)。本金不進收支統計。
// 期初持股（isOpening）：追蹤前即已持有，只計入持股市值/成本，不影響交割銀行現金（docs/09 需求4）。
// 配息（dividend）：現金股利於「發放日」（沿用 settlementDate 欄位）入帳；股票股利只加股數，
// 不產生現金 posting。股利同樣不進收支統計，只影響資產與投資報表。
export function stockPostings(stx) {
  if (stx.isOpening) return []
  if (stx.side === 'dividend') {
    const net = dividendNetAmount(stx)
    if (!net) return []
    return [{ accountId: stx.settlementBankId, amount: net, date: stx.settlementDate }]
  }
  const gross = Math.round(stx.shares * stx.price)
  const amount =
    stx.side === 'buy'
      ? -(gross + (stx.fee ?? 0))
      : gross - (stx.fee ?? 0) - (stx.tax ?? 0)
  return [{ accountId: stx.settlementBankId, amount, date: stx.settlementDate }]
}

// 各帳戶「≤ asOf 的最新餘額錨點」（type='adjust'）。回傳 { accountId: { date, target } }。
//
// 錨點＝使用者宣告「這個帳戶在這一天結束時實際上就是這麼多錢」，它取代 openingBalance 成為
// 新的累加起點。這是「錨點日之前增刪任何記錄，都不改變該日起的餘額」的實作方式——
// 差額型（存一個固定金額的調整交易）做不到，因為前面一改，總額就跟著漂。
//
// 同日多筆以 (date, createdAt, id) 字典序取最大：date 定寬、createdAt 為 ISO，字串比較即正確；
// 補 id 是為了多裝置同秒寫入時仍有確定性的勝負。
function latestAnchors(txns, asOf) {
  const best = {}
  for (const tx of txns) {
    if (tx.type !== 'adjust') continue
    const d = tx.postingDate || tx.tradeDate
    if (!d || !tx.accountId || typeof tx.targetBalance !== 'number') continue
    if (asOf && d > asOf) continue
    const key = `${d}|${tx.createdAt ?? ''}|${tx.id ?? ''}`
    const cur = best[tx.accountId]
    if (!cur || key > cur.key) best[tx.accountId] = { date: d, key, target: tx.targetBalance }
  }
  return best
}

// 一次算出多帳戶餘額，回傳 { accountId: balance }。asOf 為 'YYYY-MM-DD'，null=全部。
// stockTxns 為股票交易（交割金額於 settlementDate 計入交割銀行）；未傳則行為與階段2 相同。
//
// 起點：有錨點用錨點的 targetBalance（完全取代 openingBalance，非相加），否則用 openingBalance。
// 錨點日「當天」的 postings 一律被吸收——錨點語義是該日**日終**餘額，這是「≤ 錨點日的增刪
// 不影響餘額」的充要條件。代價：錨點當天稍後才補記的當日交易會被吃掉（表單有提示）。
export function accountBalances(accounts, txns, asOf = null, stockTxns = []) {
  const anchors = latestAnchors(txns, asOf)
  const map = {}
  for (const a of accounts) map[a.id] = anchors[a.id] ? anchors[a.id].target : (a.openingBalance ?? 0)
  const add = (p) => {
    if (!(p.accountId in map)) return
    if (asOf && p.date > asOf) return
    const an = anchors[p.accountId]
    if (an && p.date <= an.date) return
    map[p.accountId] += p.amount
  }
  for (const tx of txns) for (const p of transactionPostings(tx)) add(p)
  for (const stx of stockTxns) for (const p of stockPostings(stx)) add(p)
  return map
}

// 單一帳戶餘額
export function accountBalance(account, txns, asOf = null, stockTxns = []) {
  return accountBalances([account], txns, asOf, stockTxns)[account.id]
}

// 各餘額調整的「現在的差額」：targetBalance − 若沒有這筆錨點時該日的餘額。回傳 { txId: delta }。
//
// 差額是推導值，不是資料。存下來的 snapshotDelta 只是建立當下的快照——之後在錨點日之前補記
// 或刪除交易，真正的差額就變了。列表若顯示過期的快照，會出現「差額 +500 但帳面對不上」的矛盾，
// 所以顯示端一律用這裡算的動態值（snapshotDelta 只當缺資料時的退路）。
//
// 錨點筆數通常個位數，對每筆各跑一次 accountBalances 的成本可以接受；呼叫端請包 useMemo。
export function adjustDeltas(accounts, txns, stockTxns = []) {
  const out = {}
  for (const tx of txns) {
    if (tx.type !== 'adjust') continue
    const d = tx.postingDate || tx.tradeDate
    if (!d) continue
    // 排除自己、保留其他錨點：較早的錨點仍應作為起點，較晚的會被 asOf 過濾掉
    const others = txns.filter((t) => t.id !== tx.id)
    const before = accountBalances(accounts, others, d, stockTxns)[tx.accountId] ?? 0
    out[tx.id] = (tx.targetBalance ?? 0) - before
  }
  return out
}

// 交割銀行於 settleDate 的可用餘額（docs/02 §4.2）。已含所有「未交割」買賣的影響，
// 供買單前檢查：新買單需求金額 > 可用 → 跳警告但仍允許。
export function availableForSettlement(bankId, accounts, txns, stockTxns, settleDate) {
  return accountBalances(accounts, txns, settleDate, stockTxns)[bankId] ?? 0
}

// 一筆交易是否「未入帳」：主入帳日尚未到（postingDate > asOf）。
// 信用卡分期未到期還款、deferred 週期性、未來股票交割皆屬此類。
export function isPending(tx, asOf = todayStr()) {
  return !!tx.postingDate && tx.postingDate > asOf
}

// 各帳戶「未入帳／未交割」金額：postingDate（股票為 settlementDate）在 asOf 之後的
// postings 加總（帶正負）。用於帳戶列在現餘額外另顯示「未入帳 ±X」。
// 回傳 { accountId: pendingAmount }。
export function pendingByAccount(accounts, txns, asOf = todayStr(), stockTxns = []) {
  // 被錨點吸收的 postings 不算「未入帳」——它們永遠不會再影響餘額。正常情況下錨點 ≤ asOf、
  // 與這裡的 date > asOf 無交集，此判斷是防未來日期的錨點（他裝置寫入或舊資料）造成誤報。
  const anchors = latestAnchors(txns, null)
  const map = {}
  for (const a of accounts) map[a.id] = 0
  const add = (p) => {
    if (!(p.accountId in map)) return
    if (p.date <= asOf) return
    const an = anchors[p.accountId]
    if (an && p.date <= an.date) return
    map[p.accountId] += p.amount
  }
  for (const tx of txns) for (const p of transactionPostings(tx)) add(p)
  for (const stx of stockTxns) for (const p of stockPostings(stx)) add(p)
  return map
}

// 信用卡帳單分期（docs/02 §4.1.1）。依 statementDay 切期，回傳近 months 期，
// 最新在前。每期：
//   { periodStart, periodEnd, statementDate, dueDate, total, charges, isOpen, isFuture }
// total＝該期內「卡帳消費」淨額（expense 加、income 減；轉帳/繳款不算消費）。
// 繳款狀態由呼叫端比對 creditCardStatements（periodEnd）另行判定。
//
// 納入依據是**入帳日**（postingDate，未設則等同 tradeDate）而非消費日：店家尚未向銀行
// 請款時該筆不會出現在銀行帳單上，把它的入帳日往後挪就能讓 App 帳單與銀行帳單對齊
// （卡片餘額本來就走 postingDate，兩者因此同口徑）。收支報表歸月仍一律用 tradeDate。
//
// future＝額外往前產生幾期尚未開始的帳單（卡片頁的期別導航要能翻到下一期，看見剛延後
// 的消費落在哪）。預設 0 → 既有呼叫端行為不變。注意 isOpen（asOf <= periodEnd）對未來期
// 同樣為真，要區分「累計中的本期」與「還沒開始的未來期」一律看 isFuture。
export function statementPeriods(account, txns, { months = 6, asOf = todayStr(), future = 0 } = {}) {
  const S = account.statementDay
  if (!S) return []
  const P = account.paymentDueDay ?? S

  // 找「本期」結帳年月：第一個 >= asOf 的結帳日（本期可能尚未出帳）
  const base = parseDate(asOf)
  let cur = { year: base.getFullYear(), month: base.getMonth() + 1 }
  if (asOf > dayOfMonth(cur.year, cur.month, S)) cur = addMonth(cur, 1)

  const periods = []
  for (let i = -future; i < months; i++) {
    const ym = addMonth(cur, -i)
    const periodEnd = dayOfMonth(ym.year, ym.month, S)
    const prev = addMonth(ym, -1)
    const periodStart = addDays(dayOfMonth(prev.year, prev.month, S), 1)
    // 繳費日在結帳日之後同月，否則順延次月
    const dueYm = P > S ? ym : addMonth(ym, 1)
    const dueDate = dayOfMonth(dueYm.year, dueYm.month, P)

    let total = 0
    const charges = []
    for (const tx of txns) {
      if (tx.accountId !== account.id) continue
      const postedOn = tx.postingDate || tx.tradeDate
      if (postedOn < periodStart || postedOn > periodEnd) continue
      if (tx.type === 'expense') {
        total += tx.amount
        charges.push(tx)
      } else if (tx.type === 'income') {
        total -= tx.amount
        charges.push(tx)
      }
    }
    periods.push({
      periodStart,
      periodEnd,
      statementDate: periodEnd,
      dueDate,
      total,
      charges,
      isOpen: asOf <= periodEnd,
      isFuture: asOf < periodStart,
    })
  }
  return periods
}

// 已延後至下期的卡帳消費：入帳日被挪到 afterDate（通常是本期結帳日）之後，
// 因此不落在 statementPeriods 回傳的任何一期裡，光看帳單列表會「消失」。
// 卡片頁另闢一區列出它們，讓使用者能反悔收回。依消費日新到舊。
export function deferredCharges(account, txns, afterDate) {
  if (!afterDate) return []
  return txns
    .filter(
      (tx) =>
        tx.accountId === account.id &&
        (tx.type === 'expense' || tx.type === 'income') &&
        (tx.postingDate || tx.tradeDate) > afterDate,
    )
    .sort((a, b) => (a.tradeDate < b.tradeDate ? 1 : -1))
}

// 已繳帳單索引，key = `${accountId}|${periodEnd}`（卡片頁與推播共用同一口徑）。
// paymentTransactionId 指向的繳費轉帳若已被刪除，該快照視為未繳：否則使用者刪掉繳費
// 記錄後，帳單會永遠顯示「已繳」、推播也不再提醒該期繳費。
export function paidStatementSet(statements, txns) {
  const txIds = new Set(txns.map((t) => t.id))
  const out = new Set()
  for (const s of statements) {
    if (!s.isPaid) continue
    // 沒有 paymentTransactionId 的快照（手動標記/舊資料）不做存在性檢查，維持原樣
    if (s.paymentTransactionId && !txIds.has(s.paymentTransactionId)) continue
    out.add(`${s.accountId}|${s.periodEnd}`)
  }
  return out
}

// 應收/應付未結清 = amount − Σ 還款
export function outstanding(tx) {
  const paid = (tx.repayments ?? []).reduce((s, r) => s + r.amount, 0)
  return tx.amount - paid
}

// 截至某日的未結清：尚未發生（postingDate > asOf）視為 0；只扣截止日前的還款。
// 用於歷史淨資產（如「較上月」），與帳戶餘額的 asOf 口徑一致。
export function outstandingAsOf(tx, asOf) {
  if (!asOf) return outstanding(tx)
  if (tx.postingDate > asOf) return 0
  const paid = (tx.repayments ?? [])
    .filter((r) => r.date <= asOf)
    .reduce((s, r) => s + r.amount, 0)
  return tx.amount - paid
}

// 結清狀態：unpaid / partial / settled
export function settlementStatus(tx) {
  const left = outstanding(tx)
  if (left >= tx.amount) return 'unpaid'
  if (left <= 0) return 'settled'
  return 'partial'
}

// ── 借貸聚合（docs/02 §4.4）───────────────────────────────────
// 以下三個函式一律以 outstandingAsOf 為唯一口徑，不得自行 reduce repayments，
// 這是它們與 netWorth 永遠不會漂移的保證。

const isLoan = (tx) => tx.type === 'receivable' || tx.type === 'payable'

// 全域未結清合計。net > 0 表示別人淨欠你。
export function loanTotals(txns, asOf = null) {
  let receivable = 0
  let payable = 0
  for (const tx of txns) {
    if (!isLoan(tx)) continue
    const left = outstandingAsOf(tx, asOf)
    if (left <= 0) continue
    if (tx.type === 'receivable') receivable += left
    else payable += left
  }
  return { receivable, payable, net: receivable - payable }
}

// 依對象彙總未結清借還款，依淨額絕對值由大到小排序。
// counterpartyId 可能為 null（未指定對象）——這一桶不可丟掉，否則各列合計會與
// loanTotals 對不起來（首頁借貸卡與淨資產卡就會出現兩個數字）。
export function counterpartyLoanStats(txns, asOf = null) {
  const map = new Map()
  for (const tx of txns) {
    if (!isLoan(tx)) continue
    const left = outstandingAsOf(tx, asOf)
    if (left <= 0) continue
    const key = tx.counterpartyId ?? null
    const row = map.get(key) ?? { counterpartyId: key, receivable: 0, payable: 0, net: 0, count: 0 }
    if (tx.type === 'receivable') row.receivable += left
    else row.payable += left
    row.count += 1
    map.set(key, row)
  }
  const rows = [...map.values()]
  for (const r of rows) r.net = r.receivable - r.payable
  return rows.sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
}

// 淨額結清方案（docs/03 §D）：對某對象未結清的借還款各補一筆「全額還款」，
// 全部指向同一帳戶同一天 → 應收 +、應付 − 相抵，帳戶淨變動剛好等於 net，
// 不需要另記一筆轉帳。asOf 固定用當下口徑（結清是此刻的動作）。
// txIds 為 null 時涵蓋該對象全部未結清；給定時只納入其中的交易（分批結清）。
export function netSettlementPlan(txns, counterpartyId, txIds = null) {
  const only = txIds ? new Set(txIds) : null
  const entries = []
  let recvTotal = 0
  let payTotal = 0
  for (const tx of txns) {
    if (!isLoan(tx)) continue
    if ((tx.counterpartyId ?? null) !== (counterpartyId ?? null)) continue
    if (only && !only.has(tx.id)) continue
    const left = outstanding(tx)
    if (left <= 0) continue
    entries.push({ txId: tx.id, type: tx.type, amount: left })
    if (tx.type === 'receivable') recvTotal += left
    else payTotal += left
  }
  return { entries, recvTotal, payTotal, net: recvTotal - payTotal }
}

// 淨資產（docs/02 §4.3）。holdingsValue=持股市值（成交日基準，由 computeHoldings 算）。
// stockTxns 讓銀行餘額反映「已交割」買賣；pendingStockNet 補上「未交割」買賣的未來現金影響，
// 抵銷成交日基準持股造成的雙算（T+2 期間：現金未動 + 持股已計 → 加未交割淨額還原）。
export function netWorth(accounts, txns, { holdingsValue = 0, asOf = null, stockTxns = [] } = {}) {
  const balances = accountBalances(accounts, txns, asOf, stockTxns)
  let sum = 0
  for (const a of accounts) {
    if (a.isArchived) continue
    // 證券帳戶本金以持股市值另計，避免重複
    if (a.type === 'securities') continue
    sum += balances[a.id]
  }
  // 帳戶餘額已反映借出/借入的資金進出，未結清部分補回才能讓淨資產不變
  for (const tx of txns) {
    if (tx.type === 'receivable') sum += outstandingAsOf(tx, asOf)
    else if (tx.type === 'payable') sum -= outstandingAsOf(tx, asOf)
  }
  // 未交割調整：settlementDate > asOf 的股票 postings（買 −、賣 +）尚未進銀行餘額，
  // 但持股已以成交日計入 holdingsValue，補上其未來現金影響才不雙算。
  let pendingStockNet = 0
  for (const stx of stockTxns) {
    for (const p of stockPostings(stx)) {
      if (asOf && p.date > asOf) pendingStockNet += p.amount
    }
  }
  return sum + holdingsValue + pendingStockNet
}

// 拆帳列金額加總（收入/支出的交易金額 = Σ split.amount）
function splitsTotal(tx) {
  return (tx.splits ?? []).reduce((s, sp) => s + sp.amount, 0)
}

// 本月收支（docs/02 §4.4）。依 tradeDate 歸月（見 docs/03 §J：刷卡日決定計入哪個月），
// 收入/支出金額對「拆帳列」聚合；另把轉帳手續費計入支出（本金為資產轉移，不計）。
export function monthlySummary(txns, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  let income = 0
  let expense = 0
  for (const tx of txns) {
    if (!tx.tradeDate?.startsWith(prefix)) continue
    if (tx.type === 'income') income += splitsTotal(tx)
    else if (tx.type === 'expense') expense += splitsTotal(tx)
    else if (tx.type === 'transfer' && tx.fee) expense += tx.fee
  }
  return { income, expense, balance: income - expense }
}

// 某區間某類（expense/income）的分類彙總，拆帳列 rollup 到母分類（docs/02 §4.4）。
// from/to 為 'YYYY-MM-DD'（含端點，比對 tradeDate）。expense 另納入轉帳手續費
// （歸該轉帳 feeCategoryId 之母分類，通常為「金融」）。
// 回傳 { total, count, rows }：rows 依金額由大到小，total 與 summary 對應值一致。
export function categoryStatsRange(txns, categories, kind, from, to) {
  const byId = new Map(categories.map((c) => [c.id, c]))
  // categoryId → 母分類（取 id/name/icon）；查無退回「未分類」防呆（seed 保證存在）
  const rollup = (categoryId) => {
    const cat = byId.get(categoryId)
    if (!cat) return { id: categoryId ?? '__uncat', name: '未分類', icon: 'circle-question', color: null }
    const parent = (cat.parentId ? byId.get(cat.parentId) : cat) ?? cat
    return { id: parent.id, name: parent.name, icon: parent.icon, color: parent.color ?? null }
  }

  const buckets = new Map() // 母分類id → { id, name, icon, amount }
  const add = (categoryId, amount) => {
    const g = rollup(categoryId)
    const cur = buckets.get(g.id)
    if (cur) cur.amount += amount
    else buckets.set(g.id, { ...g, amount })
  }

  let total = 0
  let count = 0
  for (const tx of txns) {
    const d = tx.tradeDate
    if (!d || (from && d < from) || (to && d > to)) continue
    if (tx.type === kind) {
      for (const sp of tx.splits ?? []) add(sp.categoryId, sp.amount)
      total += splitsTotal(tx)
      count += 1 // 筆數 = 該 kind 的交易數（transfer 不計入）
    } else if (kind === 'expense' && tx.type === 'transfer' && tx.fee) {
      add(tx.feeCategoryId, tx.fee)
      total += tx.fee
    }
  }

  const rows = [...buckets.values()].sort((a, b) => b.amount - a.amount)
  return { total, count, rows }
}

// 某月分類彙總（薄包裝 categoryStatsRange，保留原簽名，月視角呼叫端不動）
export function monthlyCategoryStats(txns, categories, kind, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return categoryStatsRange(txns, categories, kind, `${prefix}-01`, `${prefix}-31`)
}

// 某年收支彙總：12 個月 monthlySummary 加總（含轉帳手續費，同口徑）
export function yearlySummary(txns, year) {
  let income = 0
  let expense = 0
  for (let m = 1; m <= 12; m++) {
    const s = monthlySummary(txns, year, m)
    income += s.income
    expense += s.expense
  }
  return { income, expense, balance: income - expense }
}

// 全年每日支出合計（拆帳列口徑＋轉帳手續費，與 monthlySummary 同口徑），供年度消費熱力圖。
// 回傳 { 'YYYY-MM-DD': amount }（只含有支出的日）。
export function dailyExpenseTotals(txns, year) {
  const prefix = `${year}-`
  const map = {}
  for (const tx of txns) {
    const d = tx.tradeDate
    if (!d || !d.startsWith(prefix)) continue
    if (tx.type === 'expense') map[d] = (map[d] ?? 0) + splitsTotal(tx)
    else if (tx.type === 'transfer' && tx.fee) map[d] = (map[d] ?? 0) + tx.fee
  }
  return map
}

// 近 months 個月收支趨勢（預設 6），以 endYear/endMonth 為最新一月往回推。
// 回傳 oldest→newest：[{ year, month, label, income, expense }]（含手續費，與 monthlySummary 同口徑）。
export function monthlyTrend(txns, endYear, endMonth, months = 6) {
  const out = []
  for (let i = months - 1; i >= 0; i--) {
    const { year, month } = addMonth({ year: endYear, month: endMonth }, -i)
    const { income, expense } = monthlySummary(txns, year, month)
    out.push({ year, month, label: `${month}月`, income, expense })
  }
  return out
}
