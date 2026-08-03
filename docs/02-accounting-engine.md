# 02 — 記帳規則與計算引擎

> 先讀「三大核心觀念」（見根目錄 `CLAUDE.md`）：記錄日 vs 入帳日、拆帳 splits、收支 vs 資產轉移。本檔是這三點的計算落地。

## 4.1 帳戶餘額

```
無錨點：餘額(account, D) = openingBalance + Σ postings(account, postingDate ≤ D)
有錨點：餘額(account, D) = targetBalance(最近錨點) + Σ postings(account, 錨點日 < postingDate ≤ D)
```

**錨點（`type='adjust'`，餘額調整）**＝使用者宣告「這個帳戶在這一天結束時實際上就是這麼多錢」，它**完全取代** `openingBalance` 成為新的累加起點（換起點，不是相加）。詳見 §4.1.2。

postings 來源（同一引擎讀兩種來源：Transaction 與 StockTransaction）：

| 來源 | 帳戶 | 金額 | 入帳日 |
|---|---|---|---|
| 支出 | accountId | −amount | postingDate |
| 收入 | accountId | +amount | postingDate |
| 轉帳 | fromAccountId / toAccountId | −amount / +amount；fromAccountId 另 −fee | postingDate |
| 應收(借出) | accountId | −amount；還款 +repayment | postingDate / 還款日 |
| 應付(借入) | accountId | +amount；還款 −repayment | postingDate / 還款日 |
| 股票買進 | settlementBankId | −(買進交割金額) | settlementDate |
| 股票賣出 | settlementBankId | +(賣出交割金額) | settlementDate |
| 股票配息 | settlementBankId | +(cashAmount−fee−tax) | settlementDate（發放日） |
| 餘額調整 | — | **不產生 posting**（改換累加起點，見 §4.1.2） | — |

> 信用卡用「帳戶」模型：刷卡=一筆 `expense`，accountId 指向信用卡帳戶（餘額為負＝未繳）；繳卡費=一筆 `transfer`（銀行→信用卡）。可用額度 = creditLimit + 餘額（餘額為負）。

### 4.1.1 信用卡帳單切期（`statementPeriods`）

依 `statementDay` 切期：期間 = 上月結帳日+1 ~ 本月結帳日；繳款日 `paymentDueDay` 在結帳日之後算同月，否則順延次月。

```
帳單(期) = Σ 卡帳消費（expense 加、income 減），其入帳日落在期間內
入帳日   = postingDate || tradeDate
```

**納入依據是入帳日、不是消費日。** 店家尚未向銀行請款時該筆不會出現在銀行帳單上，把入帳日往後挪就能讓 App 帳單與銀行帳單對齊；帳戶餘額本來就走 `postingDate`，因此帳單金額與「已用額度」永遠同口徑。轉帳（繳款）不算消費。

> 這條只約束帳單切期。**收支報表歸月仍一律用 `tradeDate`**，兩者是不同的東西，不要混用。

入帳日被挪到本期結帳日之後的消費不落在 `statementPeriods` 回傳的任何一期（光看帳單列表會像憑空消失），由 `deferredCharges(account, txns, afterDate)` 另行列出，卡片頁「已延後至下期」區塊顯示並可收回（入帳日設回 `tradeDate`）。

**期別旗標**：`future`（預設 0）額外往前產生幾期尚未開始的帳單，供卡片頁的期別導航翻到下一期；`periods[future]` 恆為「本期」。每期另回 `isFuture: asOf < periodStart`。

> `isOpen`（`asOf <= periodEnd`）對未來期**同樣為真**。要區分「累計中的本期」與「還沒開始的未來期」一律看 `isFuture`，不可只靠 `isOpen`，也不要用 `periods.find(p => p.isOpen)` 抓本期——有未來期時它會抓到下一期。

**繳款狀態**一律走 `paidStatementSet(statements, txns)`（回傳 `Set<accountId|periodEnd>`，卡片頁與推播共用）。它會檢查快照的 `paymentTransactionId` 指向的繳費轉帳是否還存在——**繳費記錄被刪掉的快照視為未繳**，否則該期會永遠顯示「已繳」、推播也不再提醒。沒有 `paymentTransactionId` 的舊快照不做此檢查。寫入端另有保護：`repo.deleteTransaction` 會連帶刪掉指向該交易的快照。

### 4.1.2 餘額調整＝錨定（`latestAnchors`）

一般記帳 App 的「餘額調整」是補一筆固定差額的交易；本專案**刻意不那樣做**，因為差額固定 → 之後在調整日之前補記或刪除任何一筆，總額就跟著漂，等於沒有校正。

錨定的作法是：調整交易存**目標餘額**而非差額，`accountBalances` 遇到錨點就換掉累加起點。

- **日終語義**：錨點日**當天**的所有 postings 一律被吸收（`p.date <= 錨點日` 直接跳過）。這是「≤ 錨點日的增刪不改變餘額」的充要條件。代價：當天稍後才補記的當日交易會被吃掉——表單有提示，請記在隔天。
- **多錨點**：取「≤ asOf 的最新一個」為起點。同日多筆以 `(date, createdAt, id)` 字典序決勝（date 定寬、createdAt 為 ISO，字串比較即正確；補 id 是為了多裝置同秒寫入仍有確定性）。
- **錨點之前的歷史餘額仍會隨增刪變動**——錨點只承諾「從錨點日起」。`netWorthSnapshots` 是已落地的 doc（docId=date，只寫不改），舊趨勢點不會回溯。
- **未來日期的錨點**由表單 `max=todayStr()` 擋下；引擎不加 today 判斷，保持純函式無時鐘相依。
- **入口只開放 `cash` / `bank`**：信用卡的 `statementPeriods` 不走 `accountBalances`，下錨點會讓卡片餘額與各期帳單、繳費推播永久分岔；證券帳戶被 `netWorth` 整個跳過（本金以持股市值另計），錨了對淨資產零效果。
- `pendingByAccount` 同樣跳過被錨點吸收的 postings——那是防未來日期錨點造成「未入帳」誤報的防禦，正常情況下兩者無交集。
- 受惠者自動生效、無需改動：`accountBalance`、`availableForSettlement`（試算變更準）、`netWorth`。
- **顯示用的差額走 `adjustDeltas(accounts, txns, stockTxns)`**（回傳 `{ txId: delta }`）：`targetBalance −`「若沒有這筆錨點時該日的餘額」。它是推導值，會隨基準日之前的增刪自動修正——存下來的 `snapshotDelta` 是建立當下的快照，顯示它會與帳面矛盾。排除自己但保留其他錨點（較早的仍是起點，較晚的被 asOf 濾掉）。

## 4.2 交割銀行可用餘額試算（買單前檢查）

新買單需求金額 = `shares×price + fee`，將於 settlementDate 扣款。

```
可用餘額 = 餘額(交割銀行, settlementDate)   // 已含所有「未交割」買賣的影響
```

若 需求 > 可用 → **跳警告但仍允許記錄**（含當筆與所有尚未交割者）。

## 4.3 淨資產

```
淨資產 = Σ 各帳戶餘額(現金/銀行/信用卡；信用卡為負)
       + Σ 持股市值(現價 × 持股)
       + Σ 應收未結清
       − Σ 應付未結清
```

### 4.3.1 借貸聚合

```
loanTotals(txns, asOf)              → { receivable, payable, net }
counterpartyLoanStats(txns, asOf)   → [{ counterpartyId, receivable, payable, net, count }]
netSettlementPlan(txns, cpId)       → { entries:[{txId,type,amount}], recvTotal, payTotal, net }
```

- 三者一律以 `outstandingAsOf(tx, asOf)` 為唯一口徑，**不得自行 reduce `repayments`**——這是它們與 `netWorth` 不會漂移的保證。首頁淨資產卡的「應收／應付」與借貸卡都吃 `loanTotals`。
- **不變式**：`Σ counterpartyLoanStats(...).receivable === loanTotals(...).receivable`（payable 同）。因此 `counterpartyId` 為 null 的那一桶不可丟掉，UI 顯示為「未指定對象」。
- **一次結清（淨額）**：對某對象所有未結清的應收應付各補一筆「全額還款」，全部指向同一帳戶同一天。應收還款 `+`、應付還款 `−` 在該帳戶相抵，淨變動剛好等於 `net`，**因此不需要也不該另記一筆轉帳**。

## 4.4 報表聚合範圍

- **收支統計**：只取 type∈{expense, income} 的拆帳列，依 類別/標籤/專案/對象/帳戶/時間 聚合。
- **不計入收支**：轉帳本金、借還款本金、股票買賣本金（資產轉移）、**股利**。
- **計入支出**：轉帳手續費（歸 feeCategoryId）。
- **投資報表（獨立）**：各標的未實現損益、已實現損益、報酬率、**年度股利**。

## 4.5 配息（`side='dividend'`）

現金流與持股各走一條，兩者互不相干：

```
現金：實入金額 = cashAmount − fee(匯費) − tax(補充保費)   // 於「發放日」入 settlementBankId
持股：shares += 配股股數 ；costBasis 不變 → avgCost 自動下降   // 於「除權息日」生效
```

- **現金股利不調整持股成本**，計為投資收益。台股個人記帳慣例，也讓「成本」始終等於實際投入的錢。
- **股票股利只加股數、不加成本**，均價因此下降——這是配股拉低成本的正確表達方式，不需另外調帳。
- 兩者**同屬一筆記錄**（一次除權息可同時配息又配股）；純配股時實入金額為 0，`stockPostings` 回空陣列。
- **不進收支統計**（同股票買賣本金），只影響帳戶餘額、淨資產與投資報表。年度歸屬用**發放日**，與已實現損益用賣出日同樣是「錢落地」的口徑。
- 發放日未到者，`netWorth` 的 `pendingStockNet` 會提前反映（等同應收股利），與 T+2 未交割買賣同一套機制。
- 配息淨額由 `engine.dividendNetAmount` 單一定義；它放在 `engine.js` 而非 `stock.js`，是因為 `stock.js` 不在 `functions/copy-shared.mjs` 的複製清單內，engine 不能反向依賴它。
