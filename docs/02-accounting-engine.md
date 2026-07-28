# 02 — 記帳規則與計算引擎

> 先讀「三大核心觀念」（見根目錄 `CLAUDE.md`）：記錄日 vs 入帳日、拆帳 splits、收支 vs 資產轉移。本檔是這三點的計算落地。

## 4.1 帳戶餘額

```
餘額(account, D) = openingBalance + Σ postings(account, postingDate ≤ D)
```

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
- **不計入收支**：轉帳本金、借還款本金、股票買賣本金（資產轉移）。
- **計入支出**：轉帳手續費（歸 feeCategoryId）。
- **投資報表（獨立）**：各標的未實現損益、已實現損益、報酬率（配息先留空）。
