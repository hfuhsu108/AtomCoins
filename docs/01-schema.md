# 01 — 資料模型 (Schema)

技術背景：IndexedDB（Dexie.js），文件導向。每個 entity 對應一個 Dexie table；巢狀結構（拆帳列、還款記錄、發票品項）直接存母物件內。

慣例：`id` 用字串（ULID/nanoid，離線可產生、不撞號）；金額整數（元），唯股票 `price` 小數、`shares` 整數；`date` 用 `YYYY-MM-DD`；型別記法 `?`=可空、`ref→X`=外鍵、`enum(...)`=列舉、`array<...>`=陣列。

## 3.1 Account 帳戶

共用：`id` / `name` / `type` enum(`cash` `bank` `credit_card` `securities`) / `currency`(預設`'TWD'`) / `icon` / `color` / `openingBalance` int / `openingDate` date / `isArchived` bool / `sortOrder` int / `note?` / `createdAt` / `updatedAt`。

信用卡專屬：`creditLimit` int / `statementDay` int(出帳日) / `paymentDueDay` int(繳費日) / `linkedDebitAccountId` ref→Account?(自動扣繳來源) / `sharedLimitGroupId` string?(額度共用群組)。

證券專屬：`defaultSettlementBankId` ref→Account(預設交割銀行，指向 bank 帳戶) / `defaultBrokerId` ref→Broker?。

> 「主帳戶（預設記帳帳戶）」放在 Settings.`defaultAccountId`，全域唯一。

## 3.2 Category 分類

`id` / `kind` enum(`expense` `income`)（**支出/收入兩套分開**） / `parentId` ref→Category?（null=母分類、有值=子分類，**只兩層**） / `name` / `icon`(FA6 名稱) / `color` / `sortOrder` / `isSystem` bool(內建來自 MOZE 分類樹 / 自訂) / `isArchived` / `createdAt` / `updatedAt`。

> 內建分類樹採 **MOZE 結構**，初始化時種入。智慧建議類別用歷史於執行期算，無需欄位（後續階段）。

## 3.3 Tag 標籤

`id` / `name` / `color?` / `createdAt`。多對多：交易與拆帳列各帶 `tagIds: array<ref→Tag>`。

## 3.4 Project 專案

`id` / `name` / `description?` / `color?` / `startDate?` / `endDate?` / `budgetAmount?` int(**保留，預算暫不實作**) / `isArchived` / `createdAt` / `updatedAt`。

## 3.5 Counterparty 對象

`id` / `name` / `note?` / `createdAt`。主要供借還款使用，並支援報表「依對象」多維統計。

## 3.6 Transaction 帳本記錄（核心）

共用欄位：
- `id` / `type` enum(`expense` `income` `transfer` `receivable` `payable`)
- `amount` int（永遠正數，正負由 type 決定） / `currency`'TWD'
- `tradeDate` date / `postingDate` date（預設=tradeDate）
- `note?`（**明細寫這裡**） / `tagIds: array<ref→Tag>` / `projectId` ref→Project?
- `invoiceId` ref→Invoice?（自發票匣歸帳時帶入） / `templateId` ref→Template?
- `isReconciled` bool（對帳用）
- `linkGroupId` string?（**待決定，見 `06-open-questions.md`**；用於把同一筆消費拆出的「自己支出＋代墊應收」綁在一起）
- `createdAt` / `updatedAt`

型別專屬：
- **expense / income**：`accountId` ref→Account；`splits: array<Split>`（拆帳列，單一類別時長度=1）。
  - `Split` = `{ categoryId ref→Category, amount int, tagIds?: array<ref→Tag>, projectId?: ref→Project, note?: string }`
  - Σ split.amount **理想**=amount；**不強制**，差額自動歸「未分類」列並跳警告。
- **transfer**：`fromAccountId` / `toAccountId` / `fee` int(預設0) / `feeCategoryId` ref→Category(預設=內建「金融手續費」類別，可改；**計入支出**)。本金無類別。
- **receivable（借出）/ payable（借入）**：`accountId`(資金進出帳戶) / `counterpartyId` ref→Counterparty / `repayments: array<{date, amount, accountId}>`(還款/收款記錄) / `interestRate?` decimal(**保留，先無息**)。
  - 未結清 = amount − Σ repayments.amount；狀態（未結清/部分/已結清）由此推導。

進階情境保留欄位（後續階段接邏輯，欄位先留）：`recurringRuleId` ref→RecurringRule? / `installmentPlanId` ref→InstallmentPlan? / `refundOfId` ref→Transaction?。

## 3.7 Invoice 發票（載具匣）

`id` / `invoiceNumber` / `invoiceDate` date / `merchant?` / `totalAmount` int / `carrierId?`(手機條碼載具) / `status` enum(`inbox` `recorded` `ignored`) / `transactionId` ref→Transaction?(**1 張發票→1 筆記錄**) / `lineItems?: array<{name, qty, unitPrice, amount}>`(**選配參考**，自載具帶入，僅供拆帳時對照) / `source` enum(`carrier_api` `manual`) / `createdAt` / `updatedAt`。

## 3.8 Broker 券商設定

`id` / `name` / `feeDiscount` decimal(手續費折數，如 0.6=6折、0.28=28折) / `minFee` int(最低手續費，**預設 20**) / `rounding` enum(`floor`)(無條件捨去到元) / `note?` / `createdAt` / `updatedAt`。

> 手續費 = `floor(成交金額 × 0.001425 × feeDiscount)`，再取與 `minFee` 的較大值；交易上可手動覆寫。

## 3.9 StockTransaction 股票交易

`id` / `securitiesAccountId` ref→Account / `symbol`(代號如 2330) / `name`(股名，自快取帶入) / `instrumentType` enum(`stock` `etf`)(決定證交稅率) / `side` enum(`buy` `sell`) / `shares` int(含零股) / `price` decimal(成交價) / `fee` int(自動算可覆寫) / `tax` int(僅賣出，自動算) / `brokerId` ref→Broker / `settlementBankId` ref→Account(交割銀行，預設=證券戶 defaultSettlementBankId，可改) / `tradeDate` date(成交日) / `settlementDate` date(交割日=成交日+2 交易日，**跳週末，可手動改**) / `realizedPnl?` int(僅賣出) / `note?` / `createdAt` / `updatedAt`。

衍生金額：
- 買進交割金額 = `shares×price + fee`（交割日從交割銀行扣）
- 賣出交割金額 = `shares×price − fee − tax`（交割日入交割銀行）
- 證交稅 = `floor(shares×price × (instrumentType==='etf' ? 0.001 : 0.003))`
- 賣出已實現損益 = 賣出交割金額 − `shares×`(當時移動加權平均成本/股)

## 3.10 持股 StockHolding（**不落地，執行期即時計算**）

由 StockTransaction 算出，不存 table。**多券商買同一支，依帳戶分開算**（鍵 = securitiesAccountId + symbol）。
- 移動加權平均：每次買進更新 avgCost；賣出只減 shares、不動 avgCost（賣出時用以算已實現損益）。
- 未實現損益 = (現價 − avgCost) × shares。
- 現價來自 StockPrice 快取。

## 3.11 StockPrice 股價快取

`symbol`(主鍵) / `closePrice` decimal / `priceDate` date / `updatedAt`。由 GAS proxy 抓 TWSE 每日收盤回填。

## 3.12 保留 / 後續階段 entity（欄位先佔位）

- **RecurringRule 週期性收支**(階段2+)：`id` / `payload`(交易範本) / `frequency`(間隔) / `nextDate` / `postingMode` enum(`immediate` `reminder` `deferred`) / `isActive`。
- **InstallmentPlan 分期付款**(階段2)：`id` / `accountId`(信用卡) / `totalAmount` / `periods` / `startDate` / `perPeriodAmount`；產生子交易。
- **CreditCardStatement 信用卡帳單**(階段2)：`id` / `accountId` / `periodStart` / `periodEnd` / `statementDate` / `dueDate` / `totalAmount` / `isPaid` / `paymentTransactionId?`。可由區間交易動態算或存結算快照。
- **Template 範本**(階段6)：`id` / `name` / `payload`(預填交易) / `shortcut?` / `sortOrder`。
- **Budget 預算**(暫不實作)：`id` / `scope`(overall/category/project) / `period` / `amount`。
- **Settings 偏好**(單一文件)：`theme` / `defaultAccountId`(主帳戶) / `hideAmountsDefault` / `autoBackup` bool / `lastBackupAt` / `driveFileId` / `gasStockProxyUrl` / 通知設定…

## 列舉值總表

| 列舉 | 值 |
|---|---|
| Account.type | `cash` `bank` `credit_card` `securities` |
| Category.kind | `expense` `income` |
| Transaction.type | `expense` `income` `transfer` `receivable` `payable` |
| Invoice.status | `inbox` `recorded` `ignored` |
| Invoice.source | `carrier_api` `manual` |
| StockTransaction.instrumentType | `stock` `etf` |
| StockTransaction.side | `buy` `sell` |
| Broker.rounding | `floor` |
| RecurringRule.postingMode | `immediate` `reminder` `deferred` |
