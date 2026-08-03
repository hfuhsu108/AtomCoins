# 01 — 資料模型 (Schema)

技術背景：Firestore（`users/{uid}/<entity>/{docId}`，2026-07-03 起取代 Dexie，見 `07-firebase-migration.md`），文件導向。每個 entity 對應一個 collection；巢狀結構（拆帳列、還款記錄、發票品項）直接存母 doc 內。

慣例：`id` 用字串（ULID/nanoid，離線可產生、不撞號）；金額整數（元），唯股票 `price` 小數、`shares` 整數；`date` 用 `YYYY-MM-DD`；型別記法 `?`=可空、`ref→X`=外鍵、`enum(...)`=列舉、`array<...>`=陣列。

## 3.1 Account 帳戶

共用：`id` / `name` / `type` enum(`cash` `bank` `credit_card` `securities`) / `currency`(預設`'TWD'`) / `icon` / `color` / `openingBalance` int / `openingDate` date / `isArchived` bool / `sortOrder` int / `note?` / `createdAt` / `updatedAt`。

信用卡專屬：`creditLimit` int / `statementDay` int(出帳日) / `paymentDueDay` int(繳費日) / `linkedDebitAccountId` ref→Account?(自動扣繳來源) / `sharedLimitGroupId` string?(額度共用群組)。

證券專屬：`defaultSettlementBankId` ref→Account(預設交割銀行，指向 bank 帳戶) / `defaultBrokerId` ref→Broker?。

> 「主帳戶（預設記帳帳戶）」放在 Settings.`defaultAccountId`，全域唯一。

## 3.2 Category 分類

`id` / `kind` enum(`expense` `income`)（**支出/收入兩套分開**） / `parentId` ref→Category?（null=母分類、有值=子分類，**只兩層**） / `name` / `icon`(FA6 名稱，子分類可為 null＝沿用母分類圖示) / `color`(hex，來自色盤 `CATEGORY_COLORS`，null=中性色) / `sortOrder` / `isSystem` bool(內建來自 MOZE 分類樹 / 自訂) / `isArchived` / `createdAt` / `updatedAt`。

> 內建分類樹採 **MOZE 結構**，初始化時種入。**分類管理**（docs/09 後續調整）：設定頁「分類管理」可新增/編輯/刪除/排序大小分類、選 `icon`（`CATEGORY_ICON_NAMES` 約 60 個 FA6）與 `color`。刪除走 `deleteCategoryReassign`（母分類連同子分類刪、引用的拆帳列 `categoryId` 與轉帳 `feeCategoryId` 改歸「未分類」）；系統退路分類（`未分類`／`金融手續費`）不可刪。`color` 套用於分類選擇器、帳本明細列 icon 底色與報表圓餅/排行。排序用上下箭頭與相鄰項交換 `sortOrder`（`setSortOrders`）。

## 3.3 Tag 標籤

`id` / `name` / `color?`（沿用 `CATEGORY_COLORS` 同一組色盤，`null`＝中性色） / `createdAt`。**專案／主題標籤**（例如 `#福岡自由行`），一筆可多個（docs/09 第五批）。

**唯一真值在 `splits[].tagIds`**：標籤掛在拆帳列上，未拆帳時就是唯一那一列（UI 呈現為「整筆的標籤」），交易層的 `tagIds` 平常留空。**唯一例外**：某個拆帳列同時標記代墊時，它會被拆成獨立的 `receivable`（沒有 splits），標籤只能存在交易層，否則使用者打的標籤會靜默消失；應收本金不進收支統計，所以不影響專案花費合計。讀取一律走「拆帳列有自己的就用它、沒有才繼承交易層」——`search.js` 的 `tagIdsOf`、`backup.js` 的 CSV 匯出、`TransactionRow.tagViews` 三處同一條口徑，任一處漂移就會讓畫面與匯出檔對不上。

僅 `expense`／`income` 可打標籤（轉帳、借還款、股票不做）。範本刻意不記標籤（長期範本帶著短期專案標籤只會誤記）；週期規則的 payload 是整份展開，會沿用建立時的標籤到每一期。

管理入口：設定 →「標籤管理」（新增／改名／換色／刪除，依 `Intl.Collator('zh-Hant')` 名稱序＋搜尋列），記帳表單的標籤選擇器（多選，點選不關閉、底部「完成」）也可直接新建與用鉛筆鈕改名，Picker 內不放刪除（同借貸對象的理由）。**刻意不加 `sortOrder`**——標籤沒有天然順序，名稱序足夠；**不做封存**，靠選擇器的搜尋列。

**刪除語義：清掉引用再刪**（`repo.deleteTagCleanup` 掃全部交易，濾掉 `splits[].tagIds` 與交易層 `tagIds`，每 450 筆一個 batch）。不仿對象的「有引用就擋下」——標籤只是標記，移除不動到任何金額；也不需要分類那種「改歸未分類」的退路。

篩選與合計：明細搜尋可多選標籤（**OR，任一命中**），合計**只加總掛該標籤的拆帳列**（一筆 1000 元裡只有 300 元那列掛了標籤，專案花費就是 300）。

## 3.4 Project 專案

`id` / `name` / `description?` / `color?` / `startDate?` / `endDate?` / `budgetAmount?` int(**保留，預算暫不實作**) / `isArchived` / `createdAt` / `updatedAt`。

**目前未實作**（`projects` collection 與 `repo.createProject` 存在但無 UI 與呼叫端）。「一個項目可以有多個標籤」的需求已由 §3.3 Tag 涵蓋，不再另做這個單值維度，避免兩套重疊的分群概念。

## 3.5 Counterparty 對象

`id` / `name` / `note?`（**保留，未實作**） / `sortOrder` int / `createdAt` / `updatedAt`。主要供借還款使用，並支援報表「依對象」多維統計。

管理入口：設定 →「借貸對象」（新增／改名／刪除／上下排序），記帳表單的對象選擇器也有鉛筆鈕可改名（Picker 內刻意不放刪除，記帳途中誤觸代價高）。`sortOrder` 決定選擇器與管理清單的順序。

**刪除語義：只要還有交易引用就擋下**（`repo.deleteCounterparty` 直接 throw，UI 另有同樣守衛顯示筆數）。不做 cascade——刪帳戶時那些交易本來就無處可歸，刪對象只是失去標籤，連同應收應付一起刪等於抹掉真實的債權債務；也不仿分類的「改歸未分類」，因為對象沒有 seed 保證的退路可歸。

## 3.6 Transaction 帳本記錄（核心）

共用欄位：
- `id` / `type` enum(`expense` `income` `transfer` `receivable` `payable` `adjust`)
- `amount` int（永遠正數，正負由 type 決定） / `currency`'TWD'
- `tradeDate` date / `postingDate` date（預設=tradeDate；信用卡消費可手動延後，見 `docs/02 §4.1.1`）
- `note?`（**明細寫這裡**） / `merchant?`（商家，交易層、不入拆帳列，僅 expense/income 適用，docs/09 批次 3） / `tagIds: array<ref→Tag>`（**平常留空**，真值在 `splits[].tagIds`；見 §3.3 的代墊例外） / `projectId` ref→Project?（未實作）
- `invoiceId` ref→Invoice?（自發票匣歸帳時帶入） / `templateId` ref→Template?
- `isReconciled` bool（對帳用）
- `linkGroupId` string?（已拍板採用；把同一筆消費拆出的「自己支出＋代墊應收」或「支出＋他人代墊應付」綁在一起，刪除時整組刪）
- `createdAt` / `updatedAt`

型別專屬：
- **expense / income**：`accountId` ref→Account；`splits: array<Split>`（拆帳列，單一類別時長度=1）。
  - `Split` = `{ categoryId ref→Category, amount int, tagIds?: array<ref→Tag>（**標籤的真值所在**，見 §3.3）, projectId?: ref→Project（未實作）, note?: string }`
  - Σ split.amount **理想**=amount；**不強制**，差額自動歸「未分類」列並跳警告。
- **transfer**：`fromAccountId` / `toAccountId` / `fee` int(預設0) / `feeCategoryId` ref→Category(預設=內建「金融手續費」類別，可改；**計入支出**)。本金無類別。
- **receivable（借出）/ payable（借入）**：`accountId`(資金進出帳戶) / `counterpartyId` ref→Counterparty / `repayments: array<{date, amount, accountId}>`(還款/收款記錄) / `interestRate?` decimal(**保留，先無息**)。
  - 未結清 = amount − Σ repayments.amount；狀態（未結清/部分/已結清）由此推導。
- **adjust（餘額調整，錨定型）**：`accountId` / `targetBalance` int(**有號，引擎唯一真值**＝該帳戶在基準日**日終**的實際餘額) / `snapshotDelta` int(建立當下的 `targetBalance − 當時餘額`，**純顯示**) / `note?`。無 `splits`／`categoryId`／`tagIds`／`merchant`。
  - `tradeDate === postingDate ===` 基準日，**兩者必須永遠相等**（引擎走 postingDate、`statementPeriods` 走 `postingDate || tradeDate`、CSV 兩欄都印，分歧會生出三套口徑）；編輯時三欄同一次 patch 寫入。
  - `amount` = `|snapshotDelta|`，僅為相容既有 UI（金額區間篩選讀 `amount`）。**引擎絕對不可讀 `amount` 或 `snapshotDelta`**——一讀就退化成固定差額，「之前增刪不影響餘額」的保證即失效。
  - **差額是推導值，不是資料**：`snapshotDelta` 只是建立當下的快照，在基準日之前補記或刪除交易後就過期了。明細列、預覽、CSV 一律顯示 `engine.adjustDeltas` 算出的**現值**（`targetBalance −`「若沒有這筆錨點時該日的餘額」），`snapshotDelta` 僅作為 lookups 缺值時的退路。呼叫端把 `adjustDeltas` 的結果放進 `lookups.adjustDelta` 一次算完，逐列各算一次會是 O(n²)。
  - 不進收支統計（`monthlySummary` 等皆為 expense/income 白名單，無需額外排除）。計算語義見 `docs/02 §4.1`。
  - **還款登錄**在首頁借貸卡 → 對象明細（逐筆登錄／刪除，或「一次結清」批次寫入）。**記帳表單不編輯 `repayments`**：編輯既有借還款時 `buildList()` 刻意不放這個 key，靠 `updateDoc` 的 patch 語義原樣保留（若讀回 state 再寫回，表單開著時他裝置新增的還款會被陳舊快照覆寫）。改變型別會清除還款，儲存前有確認框告知筆數。
  - **不得超額還款**（`Σ repayments.amount ≤ amount`）：`outstanding` 變負會讓淨資產算錯，UI 以未結清餘額為硬上限；多收的利息另記一筆 `income`。
  - 寫入一律先讀最新陣列再 append，**禁止 `arrayUnion`**（它會把「同日同額同帳戶還兩次」去重掉一筆）。

進階情境保留欄位（後續階段接邏輯，欄位先留）：`recurringRuleId` ref→RecurringRule? / `installmentPlanId` ref→InstallmentPlan? / `refundOfId` ref→Transaction?。

## 3.7 Invoice 發票（載具匣）

`id` / `invoiceNumber` / `invoiceDate` date / `merchant?` / `totalAmount` int / `carrierId?`(手機條碼載具) / `status` enum(`inbox` `recorded` `ignored`) / `transactionId` ref→Transaction?(**1 張發票→1 筆記錄**) / `lineItems?: array<{name, qty, unitPrice, amount}>`(**選配參考**，自載具帶入，僅供拆帳時對照) / `source` enum(`carrier_api` `manual`) / `createdAt` / `updatedAt`。

## 3.8 Broker 券商設定

`id` / `name` / `feeDiscount` decimal(手續費折數，如 0.6=6折、0.28=28折) / `minFee` int(最低手續費，**預設 20**) / `rounding` enum(`floor`)(無條件捨去到元) / `note?` / `createdAt` / `updatedAt`。

> 手續費 = `floor(成交金額 × 0.001425 × feeDiscount)`，再取與 `minFee` 的較大值；交易上可手動覆寫。

## 3.9 StockTransaction 股票交易

`id` / `securitiesAccountId` ref→Account / `symbol`(代號如 2330) / `name`(股名，自快取帶入) / `instrumentType` enum(`stock` `etf`)(決定證交稅率；**配息不寫此欄**，見下) / `side` enum(`buy` `sell` `dividend`) / `shares` int(含零股；配息時為**配股股數**) / `price` decimal(成交價；配息固定 `0`) / `fee` int(自動算可覆寫；配息時為**匯費**，純手填) / `tax` int(僅賣出，自動算；配息時為**二代健保補充保費**，純手填) / `brokerId` ref→Broker / `settlementBankId` ref→Account(交割銀行，預設=證券戶 defaultSettlementBankId，可改；配息時為**入帳銀行**) / `tradeDate` date(成交日；配息時為**除權息日**) / `settlementDate` date(交割日=成交日+2 交易日，**跳週末，可手動改**；配息時為**發放日**，與除息日無 T+2 關係故不自動推算) / `cashPerShare?` decimal(**僅配息**，每股現金股利，供表單回推總額，引擎不讀) / `cashAmount?` int(**僅配息**，現金股利總額，**引擎唯一真值**) / `isOpening?` bool(**期初持股**，docs/09 需求4：新增證券帳戶時填的已持有部位，`stockPostings` 對其回空、不扣交割銀行現金；仍以 `side='buy'`、`price`=平均成本計入持股市值與成本) / `realizedPnl?` int(僅賣出，**未實作**：已實現損益執行期重算不落地) / `note?` / `createdAt` / `updatedAt`。

衍生金額：
- 買進交割金額 = `shares×price + fee`（交割日從交割銀行扣）
- 賣出交割金額 = `shares×price − fee − tax`（交割日入交割銀行）
- 證交稅 = `floor(shares×price × (instrumentType==='etf' ? 0.001 : 0.003))`
- 賣出已實現損益 = 賣出交割金額 − `shares×`(當時移動加權平均成本/股)
- **配息實入金額 = `cashAmount − fee − tax`**（`engine.dividendNetAmount`，發放日入帳；純配股時為 0，不產生 posting）

> **配息（`side='dividend'`）三個要點**：① 現金股利**不調整持股成本**，計為投資收益（`docs/02 §4.5`）；② 股票股利只加 `shares`、`costBasis` 不變 → 均價自動下降，這是台股標準算法；③ `instrumentType` 刻意寫 `null`——`computeHoldings` 會以最新一筆的該欄覆寫持股類別，配息若寫死 `stock` 會把 ETF 的持股標錯類別（連帶影響證交稅率）。

## 3.10 持股 StockHolding（**不落地，執行期即時計算**）

由 StockTransaction 算出，不存 table。**多券商買同一支，依帳戶分開算**（鍵 = securitiesAccountId + symbol）。
- 移動加權平均：每次買進更新 avgCost；賣出只減 shares、不動 avgCost（賣出時用以算已實現損益）。
- 配息：現金股利只累計 `cashDividend`、不動成本；股票股利加 shares、成本不變 → avgCost 下降。
- 未實現損益 = (現價 − avgCost) × shares。
- 現價來自 StockPrice 快取。
- **同日處理順序＝買進 → 配息 → 賣出**（`stock.js` 的 `SIDE_ORDER`）。配息夾在中間，因為配股會拉低均價，同日賣出必須用「已含配股」的成本算已實現損益。
- `computeHoldings` 回傳 `{ holdings, realized, dividends }`；`dividends` 每列 `{ stxId, securitiesAccountId, symbol, name, exDate, date(發放日), cash, shares }`，供投資報表按年統計。

## 3.11 StockPrice 股價快取

`symbol`(主鍵) / `closePrice` decimal / `priceDate` date / `updatedAt`。由 GAS proxy 抓 TWSE 每日收盤回填。

## 3.12 保留 / 後續階段 entity（欄位先佔位）

- **RecurringRule 週期性收支**(階段2+)：`id` / `payload`(交易範本) / `frequency`(間隔) / `nextDate` / `postingMode` enum(`immediate` `reminder` `deferred`) / `isActive`。
- **InstallmentPlan 分期付款**(階段2)：`id` / `accountId`(信用卡) / `totalAmount` / `periods` / `startDate` / `perPeriodAmount`；產生子交易。
- **CreditCardStatement 信用卡帳單**(階段2)：`id` / `accountId` / `periodStart` / `periodEnd` / `statementDate` / `dueDate` / `totalAmount` / `isPaid` / `paymentTransactionId?`。可由區間交易動態算或存結算快照。
- **Template 範本**(docs/09 批次 2，已實作)：`id` / `name` / `payload`(交易欄位子集，見下) / `sortOrder`(建立時間序 `Date.now()`) / `createdAt` / `updatedAt`。
  - `payload` = 可還原表單的欄位子集，**不含** id／日期／戳記：`type`；expense/income 帶 `accountId?` + `splits:[{categoryId, amount}]`；transfer 帶 `fromAccountId?`/`toAccountId?`/`fee`；receivable/payable 帶 `accountId?`/`counterpartyId?`/`amount`；共同 `note?`。
  - 建立入口在 TransactionForm「存為範本」（股票／分期／週期／含代墊拆帳不可存）；套用時日期一律今天、金額空值不預填（`stateFromTemplate`）。`shortcut` 欄位取消（未實作）。
- **Budget 預算**(暫不實作)：`id` / `scope`(overall/category/project) / `period` / `amount`。
- **Settings 偏好**(單一文件)：`theme` / `defaultAccountId`(主帳戶) / `hideAmountsDefault` / `autoBackup` bool / `lastBackupAt` / `driveFileId` / `lastPriceSyncAt`(上次股價同步時間) / 通知設定…（GAS proxy 網址不在此存放，見 `00-overview.md`「環境／機密值」）

## 3.13 NetWorthSnapshot 淨資產每日快照（docs/09 批次 1/6a）

`id`（=`date`，docId 亦為此）/ `date` date（`YYYY-MM-DD`）/ `total` int（淨資產全口徑，同首頁，來自 `useNetWorth`）/ `holdingsValue` int（持股市值；現金部分由差值推得，不另存）/ `createdAt`。

> 由 `useDailySnapshot`（掛 AppLayout）於登入且 settings 就緒、當日無快照時 `setDoc` 寫入；docId=date 使同日冪等覆寫。趨勢圖（批次 6）資料源。歷史不回補（缺歷史股價，見 docs/09 批次 6）。

## 3.14 MerchantAlias 商家別名（docs/09 批次 3）

`id` / `match`（比對字串，`raw.includes(match)` 命中即套用）/ `alias`（顯示名稱）/ `createdAt` / `updatedAt`。

> 解析 `resolveMerchant(raw, aliases)`（`src/lib/merchant.js`）：raw 空回 null；命中者取 **match 最長**的一條回其 alias；無命中回 raw 原樣。contains 比對讓一條「統一超商股份有限公司」吃下所有分公司；要對特定分店給店名，設更長 match 自然勝出。**invoice.merchant 原始名永不改寫**，別名只影響顯示層與交易 `merchant` 欄位。商家統計 `merchantStats`（日期區間版）對 `tx.merchant ?? invoiceById[tx.invoiceId]?.merchant` 做 fallback，歷史歸帳交易免遷移即納入。

## 3.15 PushSubscription 推播訂閱（docs/09 批次 7）

`users/{uid}/pushSubscriptions/{id}`。`id`（=endpoint 的 djb2 雜湊 `sub_xxx`，同裝置同 endpoint 覆寫、天然去重）/ `endpoint`（推播服務 URL）/ `keys: { p256dh, auth }`（加密金鑰）/ `userAgent` / `createdAt` / `updatedAt`。

> 由 `src/lib/push.js` 的 `subscribeToPush()` 寫入（`repo.upsertPushSubscription`）、`unsubscribeFromPush()` 刪除。**刻意不進 `DataProvider` 即時訂閱、不進備份匯出**（含裝置憑證、與帳務無關）。後端 Cloud Functions 發送遇 410/404 判定訂閱失效即刪除該 doc。

## 3.16 pushLog／pushPrefs（docs/09 批次 7）

- **pushLog**：`users/{uid}/meta/pushLog` 單文件 map `{ [dedupeKey]: sentAtISO }`。發送前查、發送後 `set(merge)`。key 規則：信用卡 `card|{accountId}|{periodEnd}|{stage}`（stage∈d7/d1/overdue，一次性）；週期扣款 `recur|{ruleId}|{nextDate}`（一次性）；爬蟲健康 `scraper|health`（≥72h 才再發）。交割缺口／週期提醒每日掃一次天然去重、不記 log。
- **pushPrefs**：存於 `settings/singleton` 的 `pushPrefs` 欄位 `{ daily, invoice, card, settlement, recurring, scraperHealth }`（前五預設 true、scraperHealth 預設 false）。前端 `SettingsPage` 情境開關寫入，後端 Functions 發送前逐情境檢查。前後端各有一份 `DEFAULT_PREFS`（不同 bundle 無法共用，須同步）。

> **scraperStatus.newCount**（爬蟲寫入 `meta/scraperStatus`）：本次同步全新入匣（inbox）張數（=`created`）。Cloud Functions 的 `onScraperStatus` trigger 見 `newCount>0` 即推「N 張新發票待歸帳」（情境 B），並順帶補跑自動分類（見 3.17）。

## 3.17 InvoiceSuggestion 發票自動分類建議（2026-07-25）

`users/{uid}/invoiceSuggestions/{invoiceId}`。`id`（=對應發票的 docId）/ `invoiceId` ref→Invoice / `categoryId` ref→Category / `source` enum(`history` `ai`) / `confidence` enum(`high` `medium` `low`) / `model?`（`source='ai'` 時記錄使用的 model）/ `createdAt`。

> **為何獨立 collection 而非寫回 invoice**：爬蟲 `firestore_upload.py` 對 `status='inbox'` 的發票是整份 `set()` 覆寫（無 merge），任何掛在 invoice 文件上的欄位，隔天同步就會被洗掉。
>
> **產生方式**（`functions/index.js` `classifyInbox`）兩層：① 歷史比對——`suggestFromHistory`（`src/lib/autoCategory.js`，經 `copy-shared.mjs` 與前端共用同一份）依 `resolveMerchant` 後的商家找歷史 `expense` 交易，取最常用 `splits[].categoryId`，排除「未分類」；② 歷史沒命中的新商家才送 OpenAI（`gpt-5-nano` ＋ structured outputs `strict:true`，單次上限 30 張）。寫入前一律驗證 `categoryId` 仍存在於分類樹。
>
> **觸發**：爬蟲同步完（`onScraperStatus`，與推播偏好無關）自動跑；發票匣「分析」鈕呼叫 `suggestInvoiceCategories` callable 手動跑。已有建議的發票會被略過，重跑不重複計費。
>
> **消費端**：`InvoicePanel` 算出顯示用 view 傳給 `InvoiceRow`（未歸帳列顯示分類 chip 與來源標記）；歸帳時 `stateFromInvoice` 預填 `splits[0].categoryId`，**仍須使用者按儲存才成立**。`recordInvoice` 於同一 writeBatch 刪除該建議。**刻意不進 `COLLECTIONS`（改列 `DERIVED_COLLECTIONS`）**：需要即時訂閱但屬衍生資料，不應混入備份匯出。

## 列舉值總表

| 列舉 | 值 |
|---|---|
| Account.type | `cash` `bank` `credit_card` `securities` |
| Category.kind | `expense` `income` |
| Transaction.type | `expense` `income` `transfer` `receivable` `payable` `adjust` |
| Invoice.status | `inbox` `recorded` `ignored` |
| Invoice.source | `carrier_api` `manual` |
| StockTransaction.instrumentType | `stock` `etf` |
| StockTransaction.side | `buy` `sell` `dividend` |
| Broker.rounding | `floor` |
| RecurringRule.postingMode | `immediate` `reminder` `deferred` |
