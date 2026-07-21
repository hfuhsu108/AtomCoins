# 09 — 功能擴充計畫（2026-07-20）

> 來源：與 MOZE 功能比對後選定 7 個功能（2026-07-20 拍板）。本檔為**權威規格**，供後續（opus / sonnet 等級模型）逐批次實作。
> 每批次含：規格、涉及檔案、驗證方式、自包含開場 prompt。實作時**先讀本檔該批次全文＋列出的參考章節**，先列子步驟經確認再動手。
> 已拍板決策（AskUserQuestion，2026-07-20）：推播後端用 **Cloud Functions（升級 Blaze）**；主力手機 **Android**；每日記帳提醒採**「當日沒記帳才提醒」**；本計畫落檔 docs/09。

## 0. 進度追蹤表

| 批次 | 內容 | 規模 | 相依 | 狀態 |
|---|---|---|---|---|
| 1 | 搜尋篩選（＋6a 淨資產每日快照先行） | M | — | ✅ 完成（2026-07-21，待實測） |
| 2 | 範本（快速記帳） | M | — | ✅ 完成（2026-07-21，待實測） |
| 3 | 商家欄位＋別名＋商家排行 | M | — | ✅ 完成（2026-07-21，待實測） |
| 4 | 年度報表（月／年視角切換） | M | — | ✅ 完成（2026-07-21，待實測） |
| 5 | 日曆檢視＋年度消費熱力圖 | M | 批次 4（熱力圖掛年視角） | ✅ 完成（2026-07-21，待實測） |
| 6 | 淨資產趨勢圖 UI | S | 6a 快照已上線且累積數日 | ✅ 完成（2026-07-21，待實測；趨勢資料待快照累積） |
| 7 | Web Push 推播（Cloud Functions） | L | 批次 3（通知文案用商家別名，弱相依） | 未開始 |

**建議順序**：1 → 2 → 3 → 4 → 5 → 6 → 7。**6a（快照寫入）併入批次 1 先上線**——趨勢圖資料自快照啟用日起累積，越早上線批次 6 可看的資料越多。

## 1. 全批次共用注意事項

- **口徑鐵律**（docs/02、CLAUDE.md 三大核心觀念）：報表一律對**拆帳列**聚合；只有 expense/income 進收支統計＋轉帳手續費計入支出；餘額用 postingDate、收支歸月用 tradeDate。新增任何統計都不得偏離。
- **新增 collection 的固定動作**：`src/db/DataProvider.jsx` 的 `COLLECTIONS` 陣列加名稱（備份匯出 `useAllCollections` 由它驅動，加了即自動納入 JSON 備份）；`firestore.rules` 是 `users/{uid}/**` 全開，**免改**。
- **repo.js 慣例**：新 entity 一律走 `buildRecord`＋`createDoc`/`patchDoc`（自動 id、戳記、`stripUndefined`），元件不直接碰 Firestore 寫入 API。
- **UI 慣例**：Font Awesome 6（禁手寫 svg icon；**資料視覺化圖形例外**——熱力圖、折線圖可用 div grid / SVG）；金額千分位＋語意色 token；卡片樣式抄現有 `bg-surface border border-line rounded-card shadow-card`；深色模式靠既有 CSS token，不寫死色碼。
- **純函式進 `src/lib/`**（好測、供 Cloud Functions 複製共用），元件只做組裝。
- **每批次完成時**：更新本檔進度表；schema 有變動則回寫 docs/01；不自行 commit / bump 版號，交付驗證步驟後停下等使用者實測。
- **dev server**：起服務前先確認沒有舊的在跑（全域 CLAUDE.md §11）。

---

## 批次 1 — 搜尋篩選（＋6a 快照先行）

### 規格

明細頁（帳本 tab）加全域搜尋：**跨月、不受當前月份限制**，純 client-side filter（DataProvider 已整包在記憶體，個人資料量無壓力）。

- **入口**：明細頁 header 在遮金額按鈕旁加放大鏡按鈕（`faMagnifyingGlass`）。點擊進入搜尋模式：月份摘要卡與月導航隱藏，改顯示搜尋列＋篩選 chips＋結果列表；再點 ✕ 退出還原。
- **條件**（全部 AND 組合）：
  - 關鍵字：比對 `note`、`merchant`（批次 3 後才有此欄，先寫上不影響）、拆帳列分類名、counterparty 名；金額輸入純數字時額外比對交易金額（splits 合計或 amount）精確相等。
  - 類型 chips：支出／收入／轉帳／應收／應付（多選）。
  - 分類：沿用 `CategoryPicker`，選母分類含其子分類。
  - 帳戶：沿用 `AccountPicker`（比對 accountId／fromAccountId／toAccountId）。
  - 日期區間快捷 chips：本月／近 3 月／今年／全部（預設全部），另提供自訂起訖（兩個 `<input type="date">`，比對 tradeDate）。
  - 金額範圍：min／max 兩欄（比對交易總額）。
- **結果**：沿用現有「日期分組＋TransactionRow」列表（新到舊）；頂部顯示合計列：`N 筆・支出 $X・收入 $Y`。點列開編輯（同現有 `navigate('/add?id=')`）。結果超過 200 筆只渲染前 200＋「共 N 筆，請縮小條件」提示（防萬筆級卡頓）。
- **邏輯落點**：`src/lib/search.js` 純函式 `filterTransactions(txns, criteria, lookups)`；criteria 形狀 `{ keyword, types:[], categoryId, accountId, dateFrom, dateTo, amountMin, amountMax }`。UI 元件 `src/components/transaction/SearchPanel.jsx`，由 TransactionsPage 帳本 tab 條件渲染。

### 6a — 淨資產每日快照（併入本批次先上線）

- 新 collection `netWorthSnapshots`：docId＝`YYYY-MM-DD`，欄位 `{ date, total, holdingsValue, createdAt }`（total＝netWorth 全口徑，holdingsValue＝持股市值；現金部分可由差值推得，不另存）。
- 先把 HomePage 現有的 netWorth 計算（`computeHoldings`＋`netWorth`，含 stockTxns／pendingStockNet 口徑）抽成 `src/hooks/useNetWorth.js`，HomePage 改用之——**快照與首頁顯示必須同一口徑**，不得複製兩份算式。
- 新 hook `src/hooks/useDailySnapshot.js`，掛在 `AppLayout`：登入且資料就緒（判定：settings 單例已載入）且 `netWorthSnapshots` 無今日 doc → `setDoc` 寫入。模組級防重入（仿 DataProvider 的 `startupRanFor` 模式），同日重複寫入是冪等覆寫、無害但要避免每次 render 觸發。
- `COLLECTIONS` 加 `'netWorthSnapshots'`。UI 本批次不做（批次 6）。

### 驗證

- 搜尋：關鍵字、各條件單獨與組合、跨月結果正確；空結果提示；退出還原月視圖。
- 快照：登入後 Firestore 出現當日 doc，數值與首頁淨資產一致；重整不重複寫（doc updatedAt 不變）。

### 開場 prompt（自包含，可直接貼用）

```
請實作 AtomCoins 批次 1（搜尋篩選＋淨資產每日快照）。權威規格：docs/09-features-plan.md「批次 1」全節，先讀完。
參考：CLAUDE.md 三大核心觀念；src/pages/TransactionsPage.jsx（現有列表與日分組）；src/pages/HomePage.jsx（netWorth 計算，需抽成 useNetWorth hook）；src/db/DataProvider.jsx（COLLECTIONS 與資料就緒判定）；src/db/repo.js（寫入慣例）；src/lib/engine.js（netWorth／computeHoldings 口徑）。
注意：搜尋為純 client-side filter，邏輯放 src/lib/search.js 純函式；快照與首頁淨資產必須同一口徑（抽 hook 共用，不複製算式）；新 collection 記得加進 COLLECTIONS。
請先列出子步驟計畫等我確認再動手；完成後更新 docs/09 進度表、回寫 docs/01 schema（netWorthSnapshots），交付驗證步驟後停下。
```

---

## 批次 2 — 範本（快速記帳）

### 規格

- **Template entity**（docs/01 §3.12 已預留）：`{ id, name, payload, sortOrder, createdAt, updatedAt }`。`payload`＝可還原表單的交易欄位子集（type、accountId／fromAccountId／toAccountId、splits `[{categoryId, amount}]`、amount、fee、note、merchant、counterpartyId），**不含** id／日期／戳記。`sortOrder` 用建立時間序即可，不做拖曳。
- **建立入口**：TransactionForm 進階區加「存為範本」按鈕 → 彈輸入名稱（沿用 Sheet 慣例）→ 以目前表單狀態組 payload 存入。**限制**：股票、分期、週期、含代墊拆帳（advanceCounterpartyId 有值）的表單不可存範本，按鈕 disabled＋說明文字。
- **套用入口**：記帳頁（AddTransactionPage）在類型列下方顯示範本 chips 橫向捲動列（有範本才顯示）；點擊 → 以 payload 重建表單 state（新函式 `stateFromTemplate(template)`，寫法仿 `stateFromTx`：日期一律今天、金額空值代表不預填）。已進入編輯（initialTx）或歸帳（initialInvoice）模式不顯示。
- **payload 剝殼邏輯**沿用 `src/lib/recurring.js` 的 `occurrenceFromRule` 同款做法（剝 id／createdAt／updatedAt）。
- **管理**：SettingsPage 加「範本」區塊：清單（名稱＋摘要）、改名、刪除（刪除走 `useConfirm`）。
- **repo.js**：`createTemplate` / `updateTemplate` / `deleteTemplate`；`COLLECTIONS` 加 `'templates'`。

### 驗證

存範本（各類型）→ chips 出現 → 點擊帶入正確欄位（日期為今天）→ 正常送出；受限類型按鈕 disabled；改名／刪除生效；備份 JSON 含 templates。

### 開場 prompt

```
請實作 AtomCoins 批次 2（交易範本）。權威規格：docs/09-features-plan.md「批次 2」全節，先讀完。
參考：src/components/transaction/TransactionForm.jsx 的 stateFromTx／stateFromInvoice（59-111 行，範本重建 state 仿此）與 buildList；src/lib/recurring.js occurrenceFromRule（payload 剝殼先例）；src/pages/AddTransactionPage.jsx（chips 掛載點）；src/db/repo.js 寫入慣例；docs/01 §3.12（Template 預留欄位）。
注意：股票／分期／週期／代墊拆帳不可存範本；日期一律套用當天；COLLECTIONS 加 'templates'。
請先列出子步驟計畫等我確認再動手；完成後更新 docs/09 進度表、回寫 docs/01，交付驗證步驟後停下。
```

---

## 批次 3 — 商家欄位＋別名＋商家排行

### 規格

**目標**：交易帶「商家」維度；載具發票的冗長公司名（例：統一超商股份有限公司澎湖縣第xx分公司）可設別名（例：7-11 xx店）；報表出商家排行。

- **Transaction 加欄位** `merchant?: string`（交易層，不入拆帳列；expense／income 適用）。
- **TransactionForm**：進階區加「商家」列（RowButton → 文字輸入），輸入時下拉建議（來源：既有交易 merchant 去重＋全部別名 alias，前綴／包含比對，最多 8 筆）。
- **MerchantAlias entity**（新 collection `merchantAliases`）：`{ id, match, alias, createdAt, updatedAt }`。
  - 解析規則：`resolveMerchant(raw, aliases)`（放 `src/lib/merchant.js`）——raw 空回 null；取 `raw.includes(match)` 命中者中 **match 最長**的一條回其 alias；無命中回 raw。contains 比對讓「統一超商股份有限公司」一條規則吃下所有分公司；要對特定分公司給店名時，設更長的 match（如「澎湖縣第xx分公司」）自然勝出。
- **歸帳流程變更**：`stateFromInvoice` 改為 `merchant = resolveMerchant(invoice.merchant, aliases)`、`note` 不再帶商家名（原始名永遠保留在 invoice.merchant，別名只影響顯示與交易欄位）。發票列（InvoiceRow）與歸帳表單顯示別名後名稱。
- **別名設定入口**：① SettingsPage「商家別名」管理區（列表＋新增＋編輯＋刪除，兩欄：比對字串／顯示名稱）；② 歸帳表單商家列旁「設別名」快捷（開同一編輯 Sheet，match 預填發票原始商家名，使用者通常會手動刪短）。
- **商家排行報表**：FlowReport（月視角）加「商家排行」卡：對當月 `kind` 交易依商家聚合 top 10（金額＋筆數），無商家者不列。**舊資料相容**：聚合時商家取 `tx.merchant ?? invoiceById[tx.invoiceId]?.merchant`，再過 `resolveMerchant`——歷史歸帳交易免遷移即納入統計。聚合函式 `merchantStats(txns, invoices, aliases, kind, {from, to})` 放 `src/lib/merchant.js`（做成日期區間版，批次 4 年視角直接重用）。
- **backup.js**：交易 CSV 匯出加 `merchant` 欄；JSON 隨 COLLECTIONS 自動涵蓋 `merchantAliases`。
- **TransactionRow**：有 merchant 時副標顯示商家（實作前先讀該檔現有副標邏輯，商家優先於 note、二者並存時「商家・note」）。

### 驗證

設別名「統一超商股份有限公司→7-11」後：發票列顯示 7-11；歸帳帶入 merchant=7-11；商家排行聚合正確（含歷史歸帳交易 fallback）；更長 match 勝出；CSV 有 merchant 欄。

### 開場 prompt

```
請實作 AtomCoins 批次 3（商家欄位＋別名＋商家排行）。權威規格：docs/09-features-plan.md「批次 3」全節，先讀完。
參考：src/components/transaction/TransactionForm.jsx stateFromInvoice（92-111 行，歸帳帶入點）；src/components/invoice/InvoiceRow.jsx（顯示別名）；src/components/report/FlowReport.jsx（排行卡掛載）；src/lib/engine.js monthlyCategoryStats（聚合寫法先例）；src/lib/backup.js（CSV 欄位）；src/db/repo.js。
注意：invoice.merchant 原始名永不改寫，別名只影響顯示層與交易 merchant 欄位；商家統計要做 tx.merchant ?? 發票 merchant 的 fallback（舊資料免遷移）；聚合函式做成日期區間版供批次 4 重用；COLLECTIONS 加 'merchantAliases'。
請先列出子步驟計畫等我確認再動手；完成後更新 docs/09 進度表、回寫 docs/01（Transaction.merchant 與 MerchantAlias），交付驗證步驟後停下。
```

---

## 批次 4 — 年度報表（月／年視角）

### 規格

- **engine.js 泛化**（保持純函式、口徑不變）：
  - `categoryStatsRange(txns, categories, kind, from, to)`：把 `monthlyCategoryStats` 的月前綴比對泛化成 `from ≤ tradeDate ≤ to`；原函式改為呼叫 range 版的薄包裝（保留簽名，呼叫端不動）。
  - `yearlySummary(txns, year)`：12 個月 `monthlySummary` 加總（income／expense／balance）。
- **FlowReport 加視角切換**：月導航列旁加「月／年」segment（state `view: 'month' | 'year'`）。年視角：
  - 年份導航（◀ 2026 年 ▶，禁未來）。
  - 統計摘要卡：本年支出/收入總額＋較去年 chip（沿用 ChangeChip）＋月均／筆數／分類數。
  - 12 個月收支柱狀圖（`monthlyTrend(txns, year, 12, 12)` 該年 1-12 月；沿用現有 Bar 元件，label 1月…12月）。
  - 分類 donut＋排名：`categoryStatsRange` 全年（沿用現有 donut／RankRow，top 6＋其他規則不變）。
  - 商家排行卡：重用批次 3 的 `merchantStats` 帶全年區間。
- 月視角維持現狀零變動。自訂起訖區間報表**列為保留**（本批次不做，未來需要再議）。

### 驗證

年視角各卡與「該年 12 個月月視角手動加總」一致（抽 1-2 個月核對）；轉帳手續費計入年支出；跨年導航正確；月視角無回歸。

### 開場 prompt

```
請實作 AtomCoins 批次 4（年度報表）。權威規格：docs/09-features-plan.md「批次 4」全節，先讀完。
參考：src/components/report/FlowReport.jsx（全檔——年視角完全沿用其卡片、donut、RankRow、Bar、ChangeChip 元件）；src/lib/engine.js monthlyCategoryStats／monthlySummary／monthlyTrend（泛化對象，口徑鐵律：拆帳列聚合＋轉帳手續費計入支出＋tradeDate 歸期）。
注意：monthlyCategoryStats 泛化後保留原簽名做薄包裝，月視角呼叫端不動；禁止未來年導航；商家排行重用批次 3 的 merchantStats。
請先列出子步驟計畫等我確認再動手；完成後更新 docs/09 進度表，交付驗證步驟後停下。
```

---

## 批次 5 — 日曆檢視＋年度消費熱力圖

### 規格

**日曆檢視**（明細頁帳本 tab）：

- 月份摘要卡右側加「列表／日曆」切換按鈕（`faList` / `faCalendarDays`，state 記憶於當次瀏覽即可）。
- 月曆網格：7 欄（週日起始，表頭沿用 `date.js` 的 WEEKDAYS 日～六）、5-6 列；每格：日數字＋當日支出金額（有支出才顯示，`text-expense` 小字；有收入另加一顆 `bg-income` 小圓點）。金額 ≥ 10000 縮寫為 `x.x萬`，否則千分位整數（縮寫函式放 `src/lib/format.js`）。非當月格留空；今日格框線高亮。
- 點日期 → 該格高亮，網格下方列該日交易（沿用 TransactionRow，點列開編輯）；預設選今日（非當月則不選）。
- 日聚合直接重用 TransactionsPage 現有 `days` useMemo 的資料（依 tradeDate 分組＋dayIn/dayOut），不另寫聚合。

**年度消費熱力圖**（報表頁年視角，掛在批次 4 的年報表卡之後）：

- GitHub 風格：週為欄（該年約 53 欄）× 7 列（日～六），cell 約 10px 方格、圓角 2px；容器 `overflow-x-auto` 橫向捲動，頂部月份刻度（1月…12月對齊該月第一週欄）。
- 資料：全年每日支出合計（拆帳列口徑＋轉帳手續費，聚合函式 `dailyExpenseTotals(txns, year)` 放 `src/lib/engine.js`）。
- 色階 5 級：0＝`var(--color-surface-alt)`；非零日金額按該年非零值的四分位數分 4 級，用 `color-mix(in srgb, var(--color-expense) N%, transparent)`，N＝25／45／70／100（深色模式由 token 自動適配，不寫死色碼）。
- 點格 → 熱力圖下方 caption 顯示「M/D 週X・支出 $N」（手機無 hover，用點擊）。
- 未來日期格不上色（淡於 0 級或不渲染）。用 div CSS grid 實作（資料視覺化屬 svg 禁令的例外，但 div grid 更簡單）。

### 驗證

日曆各日金額與列表日合計一致；跨月切換、點日列表正確；熱力圖級距合理（抽 2-3 日核對金額）、橫捲順暢、深淺主題皆可讀；iPad／桌面 RWD 不破版。

### 開場 prompt

```
請實作 AtomCoins 批次 5（日曆檢視＋年度消費熱力圖）。權威規格：docs/09-features-plan.md「批次 5」全節，先讀完。
參考：src/pages/TransactionsPage.jsx（days 聚合直接重用；切換按鈕掛載點）；src/components/report/FlowReport.jsx 年視角（批次 4 產物，熱力圖掛此）；src/lib/date.js（WEEKDAYS／daysInMonth 等工具）；src/lib/engine.js（日聚合口徑：拆帳列＋轉帳手續費）。
注意：熱力圖與日曆均用 div grid，顏色一律 CSS token＋color-mix（不寫死色碼，深色模式才能自動適配）；金額縮寫函式放 format.js；未來日期不上色。
請先列出子步驟計畫等我確認再動手；完成後更新 docs/09 進度表，交付驗證步驟後停下。
```

---

## 批次 6 — 淨資產趨勢圖 UI

### 規格

前提：6a（批次 1）已上線並累積若干天快照。

- **ReportsPage TABS 加「資產」**（flow／invest／assets）。
- 內容：
  - 目前淨資產大字（重用 `useNetWorth`，即時值）＋所選區間變化額與 %（區間首筆快照 vs 即時值）。
  - 折線／面積圖：X＝日期、Y＝快照 total；區間 chips：30 天／90 天／1 年／全部。SVG polyline＋漸層面積（資料視覺化例外；viewBox 響應寬度），線色 `var(--color-brand)`。缺日（沒開 App 的天）不補值，點間直連。Y 軸取區間 min/max 加 8% padding，標 2-3 條水平刻度線＋金額標籤。
  - 點擊/拖曳圖面 → 顯示最近資料點的日期＋金額 caption（手機無 hover）。
  - 快照 < 2 筆：空狀態「淨資產快照自啟用日起每日累積，累積數日後可見趨勢」。
- **歷史不回補**：現金部分雖可用 `netWorth(asOf)` 回算，但持股市值缺歷史股價（stockPrices 只存最新，Stage 4 已知限制），回補會產生誤導性混合口徑——明確不做。

### 驗證

快照數 0／1／多筆三種狀態；區間切換；趨勢值與 Firestore 快照原始值抽查一致；深淺主題；桌面 RWD。

### 開場 prompt

```
請實作 AtomCoins 批次 6（淨資產趨勢圖）。權威規格：docs/09-features-plan.md「批次 6」全節，先讀完。
參考：src/pages/ReportsPage.jsx（TABS 結構與卡片樣式）；src/hooks/useNetWorth.js 與 netWorthSnapshots collection（批次 1 產物）；src/lib/format.js。
注意：SVG 折線屬資料視覺化例外可手寫；顏色用 CSS token；缺日不補值；不回補歷史（原因見規格）。
請先列出子步驟計畫等我確認再動手；完成後更新 docs/09 進度表，交付驗證步驟後停下。
```

---

## 批次 7 — Web Push 推播（Cloud Functions）

### 架構（沿用 CoTravel 驗證過的路線，後端換 Firebase 元件）

CoTravel 做法（已調查，2026-07-20）：自建 **VAPID Web Push**（`web-push` 套件＋`PushManager`，非 FCM）；SW 以 workbox `importScripts` 掛 `public/push-handler.js`（push→showNotification、notificationclick→openWindow）；訂閱存 DB；後端排程掃描到期項目發送。AtomCoins 對應替換：

| CoTravel | AtomCoins |
|---|---|
| Supabase pg_cron＋Edge Function | **Cloud Functions v2 scheduled**（`onSchedule`，需 Blaze 方案——已拍板） |
| Postgres `push_subscriptions` 表 | Firestore `users/{uid}/pushSubscriptions/{id}` |
| Edge Function 用 service_role key | firebase-admin（Functions 內建預設憑證，**不需下載 SA 金鑰**，不觸組織政策） |
| VAPID 私鑰放 Edge secret | `firebase functions:secrets:set VAPID_PRIVATE_KEY`（Secret Manager） |

VAPID 公鑰＝公開值，寫死前端（同 GAS proxy 先例，CLAUDE.md 機密分層）；私鑰只進 Secret Manager，**絕不進 repo**。金鑰產生：`npx web-push generate-vapid-keys`（產生與貼 Secret 的步驟指引使用者本人操作）。

### 推播情境總表（發送端邏輯全在 Functions）

| # | 情境 | 觸發 | 條件（重用 src/lib 純函式） | 去重 |
|---|---|---|---|---|
| A | 每日記帳提醒 | 排程 21:00 | 當日 tradeDate 無任何 transactions 才推「今天還沒記帳」 | 天然（日一次） |
| B | 新發票待歸帳 | Firestore trigger：`users/{uid}/meta/scraperStatus` 寫入 | 本次新增張數 > 0 → 推「N 張新發票待歸帳」 | 以 scraperStatus 寫入為準 |
| C | 信用卡繳費 | 排程 09:00 | `dueCardPayments` 口徑；**D-7、D-1、逾期日**各推一次，直到 isPaid | pushLog：`card|{accountId}|{periodEnd}|{stage}` |
| D | 交割缺口 | 排程 09:00 | `settlementShortfalls`；有缺口**每日推**直到補足（高嚴重度） | 天然（日一次掃描） |
| E | 週期 reminder 待確認 | 排程 09:00 | `dueReminders` 口徑（nextDate ≤ 今天的 reminder 規則），每日推直到處理 | 天然 |
| F | 週期自動扣款預告 | 排程 09:00 | immediate/deferred 規則 nextDate＝明天 → 「明天將自動入帳：{note} $N」 | pushLog：`recur|{ruleId}|{nextDate}` |
| G | 爬蟲停擺告警（選配） | 排程 09:00 | scraperStatus.lastRunAt（欄位名以爬蟲實寫為準）距今 > 48h | pushLog：3 天一次 |

- 排程兩支：`morningDigest`（`0 9 * * *`，Asia/Taipei；C＋D＋E＋F＋G 彙總，同類合併成一則、最多數則）、`eveningNudge`（`0 21 * * *`；A）。timeZone 參數必填 `'Asia/Taipei'`。
- 情境 B 前置：**爬蟲需在 scraperStatus 補寫「本次新增張數」欄位**（如 `newCount`）——scraper 在 repo 外 `CLAUDE工作區\atomcoins-scraper\`，實作時先讀該專案確認 scraperStatus 實際欄位，補欄位屬小改；若暫不改爬蟲，B 退為 morningDigest 掃 `invoices` 中 `status='inbox'` 且 createdAt 在 24h 內的張數（日一次、非即時）。
- 去重紀錄：`users/{uid}/meta/pushLog` 單文件 map `{ [dedupeKey]: sentAtISO }`，發送前查、發送後寫；key 規則見表。
- 每情境開關存 settings 文件 `pushPrefs: { daily, invoice, card, settlement, recurring, scraperHealth }`（預設前五 true、G false），Functions 發送前逐情境檢查。
- 通知 payload：`{ title, body, url, tag }`；url 深連結（hash 路由）：發票→`#/transactions?tab=invoice`、信用卡→`#/cards/{id}`（以實際路由為準，實作時查 App.jsx）、其他→`#/`。同 tag 覆蓋舊通知。
- 發送失敗 410/404 → 從 pushSubscriptions 刪除該失效訂閱（fail loud 記 log，不吞其他錯誤）。

### 工程結構

- `firebase init functions`（專案根尚無 firebase.json——會一併建立；語言 JavaScript、Node 20、ESM）。順帶把 `firestore.rules` 納入 firebase.json 的 rules 部署（今後 `firebase deploy --only firestore:rules`，取代手動貼 console——貼上未發布是 M0 已踩的坑）。
- `functions/` 相依：`firebase-admin`、`firebase-functions`、`web-push`。
- **共用純函式**：`functions/predeploy` script 把 `src/lib/{engine,date,notifications,recurring}.js` 複製到 `functions/shared/`（recurring 只用得到 `dueReminders`，其 import 有 firebase 相依——複製前確認：只搬純函式部分，必要時把 `dueReminders` 移到 notifications.js 再共用）。禁止手抄第二份口徑。
- Functions 掃描對象：`users` collection 下所有 uid（單人使用＝1 個，仍寫成通用迴圈）。
- 費用護欄：Blaze 升級後於 GCP 設**預算告警**（如 NT$100）；本用量（每日 2 排程＋1 trigger）遠低於免費額度。升級與預算設定指引使用者本人在 console 操作。

### 前端

- `public/push-handler.js`：照 CoTravel 模式——`push` 事件 `showNotification(title, { body, icon: 'pwa-192x192.png', data: { url }, tag })`；`notificationclick` → 已開視窗 focus＋導航，否則 `openWindow(url)`。
- `vite.config.js` VitePWA 加 `workbox: { importScripts: ['push-handler.js'] }`。
- `src/lib/push.js`：`isPushSupported()`／`getSubscriptionState()`／`subscribeToPush()`（`reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`，訂閱寫入 `pushSubscriptions`：`{ id, endpoint, keys: { p256dh, auth }, userAgent, createdAt }`，寫入前以 endpoint 查重 upsert）／`unsubscribe()`（退訂＋刪 doc）。SW registration 從 PwaProvider 的 regRef 取得（需把 reg 暴露進 context）。
- SettingsPage「推播通知」區塊：總開關（訂閱本裝置，**必須在點擊 handler 內呼叫**——權限請求需 user gesture）＋六情境開關（寫 settings.pushPrefs）＋「發送測試通知」按鈕（callable function `sendTestPush`，驗證全鏈路）。
- 主力裝置 Android（已拍板）：Chrome／已安裝 PWA 皆可訂閱，引導從簡。iOS 僅顯示提示行「iOS 需 16.4+ 並先加入主畫面」（PwaProvider 已有 isIOS／installed 判定），完整 iOS 引導 Sheet 列為選配。

### 驗證（真機限定——judgment.md §5：推播屬本機驗不準項目）

本機只能驗：訂閱寫入 Firestore、SW importScripts 無建置錯誤、`sendTestPush` callable 回 200。真機（Android、部署後）：測試通知收到、21:00／09:00 排程到達（可臨時把 cron 調近測試再改回）、點通知深連結正確、退訂後不再收到。**完成報告不得寫「測試通過」，寫「待真機驗證」交使用者驗收。**

### 開場 prompt

```
請實作 AtomCoins 批次 7（Web Push 推播）。權威規格：docs/09-features-plan.md「批次 7」全節（架構、情境總表、工程結構、前端、驗證），先讀完。
參考：CoTravel 專案（C:\Users\Hope\Desktop\CLAUDE工作區\CoTravel）的 public/push-handler.js、src/lib/pushSubscription.ts、src/components/PushSettingRow.tsx——架構直接移植、程式碼改寫為 Firebase 版；AtomCoins 的 src/lib/notifications.js＋recurring.js（情境判定純函式）、src/components/PwaProvider.jsx（SW registration）、vite.config.js（VitePWA 設定）；爬蟲專案 CLAUDE工作區\atomcoins-scraper（scraperStatus 欄位確認＋補 newCount）。
注意：VAPID 私鑰只進 functions:secrets，公鑰寫死前端；升級 Blaze、產金鑰、設預算告警等 console 操作指引使用者本人執行；訂閱動作必須綁使用者點擊；共用純函式用 predeploy 複製、禁止手抄second份；410/404 清失效訂閱；本批次為 L 規模，請先列子步驟並分段確認。
完成後更新 docs/09 進度表、回寫 docs/01（pushSubscriptions／pushLog／pushPrefs），交付真機驗證清單後停下——推播屬真機限定驗證，不得自行宣告測試通過。
```

---

## 後續調整（2026-07-21，批次 1–6 完成後使用者追加，已完成、待實測）

批次 1–6 上線後使用者提的 4 項改進，已實作（build 綠燈、lint 乾淨、空資料冒煙通過）：

1. **發票明細**（拍板：兩者都要）：① `InvoiceRow` 已歸帳的發票也可展開品項明細（原本只在未歸帳時可展開），展開區加「查看記帳 →」跳交易；② `stateFromInvoice` 歸帳時把品項摘要（`品名×數量、…`）帶入交易備註。**發票刪除**：`InvoiceEditSheet` 本就有刪除鈕，補「編輯」入口——`InvoiceRow` 對 `source==='manual'` 且未歸帳的發票顯示鉛筆鈕開 `InvoiceEditSheet`（誤加可刪；已歸帳需先取消歸帳）。
2. **設定頁二層級**（仿 CoTravel）：`SettingsPage` 改 `section` 狀態 menu→子區塊。選單列：帳戶／券商／週期／範本／商家別名／帳號與雲端／備份匯出（各 subsection，返回鈕帶標題）；主題與關於留主頁。
3. **帳戶刪除**（拍板：cascade）：`repo.deleteAccountCascade` 刪帳戶＋所有引用交易/股票/帳單/分期，清其他帳戶的 linkedDebit/settlementBank 參照；`AccountEditSheet` 加刪除鈕（與封存並列），確認框顯示關聯記錄數。
4. **證券帳戶期初持股**（拍板：不扣現金）：`engine.stockPostings` 對 `isOpening` 回空（不動交割銀行現金）；`AccountEditSheet` 新增證券帳戶時可填「已持有證券」（代號/股名/股數/平均成本）→ 建 `isOpening:true` buy 交易，只計持股市值與成本。docs/01 §3.9 加 `isOpening`。

## 保留／明確不做（本輪拍板）

- 自訂起訖區間報表：批次 4 只做年視角，自訂區間保留。
- iOS 完整推播引導 Sheet：主力裝置 Android，保留為選配。
- 淨資產歷史回補：缺歷史股價，混合口徑誤導，不做。
- 照片附件、多幣別、密碼鎖、系統 Widget：維持既有決策不做。
