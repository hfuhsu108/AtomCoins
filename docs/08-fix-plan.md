# 08 — 健檢修復計畫（2026-07-06）

> 依據：2026-07-06 全專案健檢（兩個獨立 fresh-context 審查 agent＋主對話逐一確認關鍵程式碼）。
> 讀者：**在新 session 執行修復的模型**。本檔自包含：問題背景、實作步驟、驗收標準都在各批次章節內。
> 行號為 2026-07-06 程式碼快照，執行時**以函式名與結構描述為準**；行號對不上是正常的，程式碼與描述根本對不上（函式不存在、結構已大改）才需要停下回報。

## 進度追蹤

| 批次 | 內容 | 狀態 | 完成日期 |
|---|---|---|---|
| 1 | 資料一致性：發票 ref 與群組編輯 | 完成 | 2026-07-18 |
| 2 | 寫入操作錯誤處理 | 完成 | 2026-07-18 |
| 3 | 拆帳明細顯示展開 | 完成 | 2026-07-18 |
| 4 | 資料層防呆 | 完成 | 2026-07-18 |
| 5 | UX 中嚴重度修正 | 完成 | 2026-07-18 |
| 6 | 破壞性確認 in-app 化 | 完成 | 2026-07-18 |
| 7 | 低嚴重度打磨 | 完成 | 2026-07-18 |

> 2026-07-18：批次 1–7 一次完成。`oxlint` 無 error、`vite build` 通過；preview 自動驗證未登入可測項（空報表防呆、側欄身分、備註常駐、分頁 URL、錯誤 banner、FAB aria-label、375px 版面），其餘由使用者在已登入真機逐條走驗收清單通過。

批次間有順序依賴的只有：批次 6 會替換批次 1-3 新增的 `window.confirm`（所以 6 排在 1 之後即可）。其餘批次理論上獨立，但**請照順序執行**——前面的批次風險最高、價值最大。

## 全域執行守則（每個批次都適用）

1. **一次只做一個批次**。批次完成後停下，交付驗證步驟清單給使用者，等確認後才可能開始下一批次（通常是開新 session）。
2. 動手前先讀該批次「涉及檔案」的**實際程式碼**，再列出子步驟清單給使用者確認，確認後才動手。
3. Surgical changes：只動計畫指定的範圍。不順手重構、不改鄰近格式、不加沒要求的功能。
4. **不 commit、不 push**——使用者明說才做。
5. 資料慣例（違反即 bug）：金額一律整數（元）、日期一律 `'YYYY-MM-DD'` 字串、id 用 nanoid 字串、Firestore 寫入一律經 `src/db/repo.js`（元件不直接呼叫 firestore 寫入 API）、寫入前 `stripUndefined`（repo 層已處理）。
6. 註解用繁體中文、只寫「為什麼」；UI 文案繁體中文。
7. 驗證用 Claude Preview MCP（`preview_start` 起 dev server，先確認沒有舊 server 在跑）。App 需 Google 登入才有資料，若 preview 環境無法登入（OAuth popup 在 preview 會卡死，見專案 memory），改交付「使用者手動驗證步驟」並明說未實測。
8. 測試用的暫時程式碼（如故意 throw）測完必須移除，交付前 `git diff` 自查。
9. 遇到本計畫沒涵蓋的問題：記下回報，不擅自擴大範圍修。

### 背景知識：發票歸帳的雙向 ref 機制（批次 1、2 必讀）

- 發票 `users/{uid}/invoices`，`status`：`inbox`（未歸帳）→ `recorded`（已歸帳）或 `ignored`（略過）。
- 歸帳（`repo.js` 的 `recordInvoice`）：由發票建立 1 筆（或拆代墊時多筆）交易，**主筆＝list[0] 掛 `invoiceId`**，多筆時整組綁同一 `linkGroupId`；同一 writeBatch 把 `invoice.status='recorded'`、`invoice.transactionId=主筆id` 回寫。
- 取消歸帳（`unrecordInvoice(invoice)`）：對稱刪除交易（主筆有 `linkGroupId` 則整組刪）＋發票還原 `inbox`，同 batch 原子。
- 一致性不變式：**`recorded` 發票的 `transactionId` 必須指向存在的交易；帶 `invoiceId` 的交易其發票必須存在且指回自己**。批次 1 修的就是三條會打破此不變式的路徑。

### 背景知識：群組交易（批次 1 必讀）

- 代墊／AA：同一筆消費拆出「自己的 expense＋對方的 receivable」多筆，綁同一 `linkGroupId`（`createLinkedTransactions`）。
- 分期：主 expense＋N 筆還款 transfer＋方案文件，綁同一 `installmentPlanId`（`createInstallmentPlan`）。
- 刪除已有整組保護（`AddTransactionPage.handleDelete` 會判斷整組刪）；**編輯沒有**——這是批次 1 要補的。

---

## 批次 1：資料一致性——發票 ref 與群組編輯

**目標**：修掉四條會打破資料不變式的操作路徑。全是「正常操作就會觸發」的高嚴重度問題。

**涉及檔案**：`src/db/repo.js`、`src/pages/AddTransactionPage.jsx`、`src/components/transaction/TransactionForm.jsx`（`save` 函式，約 393–471 行）、`src/components/invoice/InvoiceEditSheet.jsx`。

### 1-1 刪除已歸帳交易時，發票要退回未歸帳

- **問題**：`AddTransactionPage.handleDelete`（27–47 行）刪交易時完全不看 `editTx.invoiceId` → 發票停在 `recorded` 且 `transactionId` 指向已刪交易，之後無法重新歸帳。
- **步驟**：
  1. 頁面已有 `useCollection('invoices')`。在 `handleDelete` 的一般交易分支前加判斷：`editTx.invoiceId` 存在 → `const inv = invoices.find((i) => i.id === editTx.invoiceId)`。
  2. `inv` 存在 → confirm 訊息改為說明「將刪除交易（含關聯筆）並把發票退回未歸帳」→ `await unrecordInvoice(inv)`（repo 已有，原子處理刪單筆／整組＋還原發票）→ `close()`。
  3. `inv` 不存在（發票已被刪）→ 走原本刪除路徑。
  4. 若 `editTx` 同時有 `installmentPlanId` 與 `invoiceId`（理論上不可能，歸帳表單不支援分期）→ 停下回報，不要猜。

### 1-2 編輯變多筆時：原子重建群組＋發票 ref 跟著走

- **問題**：`TransactionForm.save` 編輯分支（約 444–450 行）當 `list.length > 1` 時走 `deleteTransaction(initialTx.id)` ＋ `createLinkedTransactions(list)`。三個 bug：① `invoiceId` 沒傳給新主筆，發票 ref 指向已刪交易；② 若 `initialTx` 本來就屬代墊群組，只刪主筆不刪舊關聯筆 → 舊應收變孤兒＋新群組重複；③ 兩段 await 非原子，中間失敗資料就丟了。
- **步驟**：
  1. `repo.js` 新增函式（放在 `createLinkedTransactions` 之後）：

     ```js
     // 編輯把單筆改寫成多筆（或重組群組）時原子替換：刪舊（含整組）→ 建新群組，
     // 發票 ref 跟著移到新主筆，避免 recorded 發票指向已刪交易
     export async function replaceTransactionGroup(oldTx, list) {
       const batch = writeBatch(firestore)
       if (oldTx.linkGroupId) {
         const group = await getDocs(query(col('transactions'), where('linkGroupId', '==', oldTx.linkGroupId)))
         group.docs.forEach((d) => batch.delete(d.ref))
       } else {
         batch.delete(ref('transactions', oldTx.id))
       }
       const groupId = newId()
       const records = list.map((d, i) =>
         buildRecord({
           ...d,
           linkGroupId: groupId,
           ...(i === 0 && oldTx.invoiceId ? { invoiceId: oldTx.invoiceId } : {}),
         }),
       )
       records.forEach((r) => batch.set(ref('transactions', r.id), stripUndefined(r)))
       if (oldTx.invoiceId) {
         const invSnap = await getDoc(ref('invoices', oldTx.invoiceId))
         if (invSnap.exists()) {
           batch.update(ref('invoices', oldTx.invoiceId), stripUndefined({ transactionId: records[0].id, updatedAt: now() }))
         }
       }
       await batch.commit()
       return records
     }
     ```

     注意：`batch.update` 對不存在的文件會讓整個 batch 失敗，所以發票要先 `getDoc` 確認存在才加入 update（交易照樣重建）。
  2. `TransactionForm.save` 編輯多筆分支改為 `await replaceTransactionGroup(initialTx, list)`，並在該分支開頭加保護：`initialTx.installmentPlanId` 存在 → 提示「分期交易不支援改為多筆，請刪除整組後重建」並 return（期款與方案的重算不在本批次範圍）。
  3. 多筆分支的儲存前加 confirm 警告（警告＋允許）：若 `initialTx.linkGroupId` 存在，提示「將重建整組關聯交易，關聯應收筆上已記錄的還款會被清除。繼續？」（重建本來就有此後果，讓使用者知情）。

### 1-3 編輯群組成員（存成單筆）時警告不連動

- **問題**：`save` 編輯單筆分支只 `updateTransaction` 主筆；若該筆屬代墊群組或分期，改金額／日期後群組其他筆不連動，帳目失衡。刪除有整組保護、編輯沒有。
- **步驟**：在 `list.length === 1` 的編輯分支前加：`initialTx.linkGroupId || initialTx.installmentPlanId` → `window.confirm('此筆屬於代墊／分期群組：儲存只會更新本筆，群組其他筆不會連動修改，金額或日期改動會造成兩邊不一致。建議刪除整組後重新建立。仍要儲存？')`，取消則 return。
- **為什麼不做全連動**：哪一列對應誰的語義複雜（代墊金額拆分、期款重排），單人 app 用「刪除重建」較安全；要做全連動需使用者另行規劃，不在本計畫。

### 1-4 已歸帳發票禁止直接刪除

- **問題**：`InvoiceEditSheet.handleDelete`（約 48–53 行）直接 `deleteInvoice`；若發票已歸帳，會留下交易帶著指向已刪發票的 `invoiceId`（批次 1-2 的 batch.update 也會因此踩空）。
- **步驟**：`handleDelete` 開頭加：`invoice.transactionId` 存在 → `window.alert('此發票已歸帳，請先到發票列表取消歸帳，再刪除。')` 並 return。這是少數硬擋的情境（破壞一致性），不走警告＋允許。

### 批次 1 驗收標準（逐條實測勾銷）

- [ ] 手動新增發票 → 歸帳 → 從明細點開該交易按刪除 → 發票回到「未歸帳」分頁、可再次歸帳；confirm 文案有提到發票會退回。
- [ ] 發票歸帳（單筆）→ 編輯該交易、加一列代墊存檔 → 「已處理」分頁該發票的「查看交易」能開啟新主筆；取消歸帳能把整組（expense＋receivable）刪掉並還原發票。
- [ ] 建一筆代墊（產生 2 筆群組）→ 編輯主筆再加一列代墊存檔 → 舊應收筆消失（不殘留孤兒）、新群組筆數正確。
- [ ] 編輯代墊群組任一筆、只改金額存檔 → 出現不連動警告；取消＝不寫入；確定＝只改該筆。
- [ ] 編輯分期主筆試圖加代墊列 → 被擋下提示。
- [ ] 已歸帳發票在編輯 sheet 按刪除 → 被擋下提示；未歸帳的手動發票仍可正常刪除。
- [ ] 回歸：新增單筆／拆帳／代墊／分期、刪除分期整組、正常取消歸帳，行為與改前一致。

---

## 批次 2：寫入操作錯誤處理

**目標**：所有 UI 觸發的 Firestore 寫入都有失敗回饋——目前全裸奔，失敗時畫面停住、使用者以為存成功。

**涉及檔案**：新增 `src/hooks/useAsyncAction.js`；套用到下方清單 10 個檔案。

### 前置：先實測離線寫入行為（決定方案）

Firestore 官方文件行為：離線時寫入先落本地快取（UI 立即更新），但 `await setDoc(...)` 的 promise **要等後端 ack 才 resolve**——意即離線存檔時表單可能永遠卡住。專案 6A 曾驗證「離線通過」，但可能只驗了讀取。**先實測**：dev server 起來 → DevTools Network 切 offline → 存一筆支出 → 觀察表單是否關閉。

- 表單正常關閉（promise 有 resolve）→ 採**方案 A**：單純 try/catch。
- 表單卡住 → 採**方案 B**：寫入用 `Promise.race([寫入, 4 秒 timeout])` 包裝；超時視為「已排入離線佇列」照常關閉（本地快取已生效，上線後自動同步）；真正 reject 才顯示錯誤。
- 把實測結果與採用方案**記回本檔此處**。

**實測與決策（2026-07-18）**：離線實測需登入才有資料，而 preview 的 OAuth popup 會卡死、無法在自動化環境完成該實測。改依 Firestore 官方語義判定：`persistentLocalCache` 下離線寫入會**立即更新本地快取**（onSnapshot listener 立刻反映），但 `await setDoc/writeBatch.commit()` 的 promise **要等重新連線 server ack 才 resolve**——即離線存檔會讓表單的 `await` 永久 pending（現行程式碼在離線時其實也已卡住）。故**採方案 B**：實作於 `src/hooks/useAsyncAction.js` 的 `settle(promise)`（`Promise.race([promise, 4 秒]）`＋對原 promise `.catch()` 防逾時後變 unhandledrejection），呼叫端一律 `await settle(repo寫入())`。方案 B 是方案 A 的安全超集（線上快速 resolve 時行為同 A）。**待真機補測**：離線存一筆 → 4 秒內表單關閉、恢復連線後資料有同步上去。

### 實作

1. 新增 `src/hooks/useAsyncAction.js`：

   ```js
   import { useState } from 'react'

   // 包住寫入動作：busy 防連點＋供按鈕 disabled，error 給行內顯示。
   // 成功後的收尾（關表單等）放進 fn 內部，失敗就不會執行。
   export function useAsyncAction() {
     const [busy, setBusy] = useState(false)
     const [error, setError] = useState(null)
     const run = async (fn) => {
       if (busy) return
       setBusy(true)
       setError(null)
       try {
         await fn()
       } catch (e) {
         setError(e?.message ?? '操作失敗，請再試一次')
       } finally {
         setBusy(false)
       }
     }
     return { run, busy, error }
   }
   ```

   （若前置實測採方案 B，timeout 包裝也收在這個 hook 裡，呼叫端不用管。）
2. 逐檔套用（**枚舉清單，做完逐一勾銷**）。統一模式：寫入動作包進 `run(async () => { await …; onSaved?.() })`；主要動作鈕 `disabled={busy}`；`error` 用行內紅字（`text-error` token）顯示在動作鈕上方，樣式參考 `SettingsPage` 既有的 authError 顯示。**不引入 toast 套件**。

   - [ ] `src/components/transaction/TransactionForm.jsx` — `save`（錯誤顯示在底部儲存鈕上方）
   - [ ] `src/pages/AddTransactionPage.jsx` — `handleDelete`
   - [ ] `src/pages/CardDetailPage.jsx` — 繳費（`payCreditCardStatement` 呼叫處，約 188 行）
   - [ ] `src/pages/SettingsPage.jsx` — `updateRecurringRule`／`deleteRecurringRule` 呼叫處
   - [ ] `src/components/invoice/InvoicePanel.jsx` — `onIgnore`／`onRestore`／`onUnrecord`（33–38 行，**目前連 await 都沒有**，一併補上）
   - [ ] `src/components/invoice/InvoiceEditSheet.jsx` — `save`／`handleDelete`
   - [ ] `src/components/settings/BrokerEditSheet.jsx` — 儲存／刪除
   - [ ] `src/components/settings/AccountEditSheet.jsx` — 儲存
   - [ ] `src/components/stock/StockPanel.jsx` — `PriceSheet` 的 `save`（約 314 行）
   - [ ] `src/components/transaction/CounterpartyPicker.jsx` — `createCounterparty` 呼叫處

### 批次 2 驗收標準

- [ ] 抽測至少 4 處（TransactionForm、handleDelete、InvoicePanel 取消歸帳、AccountEditSheet）：暫時在對應 repo 函式開頭 `throw new Error('測試錯誤')` → UI 顯示錯誤文字、按鈕恢復可按、表單不關閉、console 無 uncaught；**測完把 throw 移除並以 `git diff` 自查**。
- [ ] 連點儲存不會建出重複資料（busy 防連點生效）。
- [ ] 離線存一筆的行為符合前置實測選定的方案（A：正常；B：4 秒內關閉且上線後資料有同步上去）。
- [ ] 正常線上儲存／刪除全部不回歸。

---

## 批次 3：拆帳明細顯示展開（使用者明確需求）

**目標**：一筆拆帳在明細列表**每個拆帳列各自顯示一列**（各自的類別、金額），而不是現在收成一列只顯示總額＋badge。這是使用者的明確意圖，也符合 docs/04-ui.md「拆帳列標記『拆帳』」的原意。**資料層完全不動**——報表聚合、發票歸帳、餘額引擎都建立在單一 transaction＋splits 陣列上。

**涉及檔案**：只改 `src/components/transaction/TransactionRow.jsx`。兩個使用端（`TransactionsPage.jsx:145` 附近、`CardDetailPage.jsx:142` 附近）自動生效，不用改。

### 實作

1. `TransactionRow` 內：`tx.type` 為 expense/income 且 `tx.splits.length > 1` 時，改為對每個 split 渲染一個 `<button>`（回傳 fragment；父容器用 `divide-y` 分隔，多列會自然有分隔線，視覺上就是獨立兩筆——這正是要的效果）。單一 split 與其他型別（transfer／receivable／payable）**完全維持現狀**。
2. 每個 split 列的內容：
   - icon＝該列類別的母分類圖示；標題＝沿用現有單類別命名規則（子分類顯示 `母·子`）。
   - badge 改為「拆帳 i/N」（沿用現有 `faArrowsSplitUpAndLeft` icon 與樣式）。
   - 金額＝`split.amount`（同型別的顏色與正負號，**不是** `tx.amount`）。
   - 帳戶 chip、未入帳／已對帳／分期 badge：每列都顯示（資訊密度優先，重複可接受）。
   - 備註：`split.note` 有值優先，否則顯示 `tx.note`。
   - `onClick` 每列都是同一個 handler（點任一列開同一筆交易編輯）。
   - React key 用 `` `${tx.id}:${index}` ``。
3. 順手把 docs/04-ui.md 第 30 行「拆帳列標記『拆帳』」補註「（每個拆帳列各自成列顯示）」，固化這個決策。

### 批次 3 驗收標準

- [ ] 建一筆「餐飲 300＋購物 200」拆帳 → 明細顯示兩列，各自類別名與金額、badge 顯示「拆帳 1/2」「拆帳 2/2」；點任一列開啟同一筆交易，兩列的拆帳內容都在。
- [ ] 當日小計與月摘要維持 500 不變（本來就按 splits 加總，改壞才會變）。
- [ ] 用信用卡帳戶建同樣的拆帳 → CardDetailPage 帳單明細同樣展開兩列。
- [ ] 單一類別交易、轉帳、借貸、分期的顯示與改前完全一致。
- [ ] 報表頁分類統計數字不變（顯示層改動不該影響聚合）。

---

## 批次 4：資料層防呆

**目標**：堵住五個會產生髒資料或錯帳的邊界。

**涉及檔案**：`src/db/repo.js`、`src/lib/date.js`、`src/lib/recurring.js`、`src/lib/stock.js`、`src/components/settings/AccountEditSheet.jsx`、股票表單（`src/components/transaction/StockFields.jsx` 與 TransactionForm 的股票 canSave 邏輯）。

### 實作

1. **分期期數防呆**：`repo.js` `createInstallmentPlan` 開頭加 `if (!Number.isInteger(periods) || periods < 1) throw new Error('分期期數需為 1 以上的整數')`（periods=0 目前會除以零建出 Infinity 髒方案）。同時檢查表單層分期期數輸入有沒有擋 0／空值，沒有就補（min=1）。
2. **週期規則壞資料不擴散**：`date.js` `advanceDate`（約 74 行）對 `frequency.unit` 不在 `'day'|'week'|'month'|'year'` 時 throw（fail loud，勝過靜默產出 `'NaN-…'`）；`recurring.js` `processRecurringRules` 對**每條 rule** 包 try/catch——單條失敗 `console.error` 該 rule id 並跳過，不中斷其他 rule、不把壞 `nextDate` 寫回（目前壞資料會讓規則永久失效）。
3. **繳款日規則明文化**：不改 `engine.js:137` 的啟發式（對典型設定是正確的），改在 `AccountEditSheet` 信用卡「繳款日」欄位加提示文字：「繳款日小於等於結帳日時，視為次月繳款」。缺的是使用者可見的規則說明，不是引擎邏輯。
4. **同日股票交易排序**：`stock.js` `computeHoldings` 排序（約 76–79 行）次鍵改為「同 `tradeDate` 時 buy 排在 sell 前」，再 `createdAt`。註解寫明為什麼：補登交易 createdAt 反序時，避免賣出先於買進處理造成 avgCost=0、已實現損益全額錯算。
5. **股票表單數值校驗**：確認 shares 為 ≥1 整數、price > 0 才可儲存；已有就勾「已確認」，沒有就在 canSave 補。

### 批次 4 驗收標準

- [ ] 分期期數輸入 0 或空 → 表單擋下；直接呼叫 `createInstallmentPlan({..., periods: 0})` → throw。
- [ ] 手動在 Firestore 塞一條 `frequency: {}` 的週期規則 → 重整 app：console 有該規則的 error、`nextDate` 不被改寫、其他正常規則照常觸發。（測完刪掉測試規則。）
- [ ] 同一 tradeDate 先建賣出再建買進（模擬補登反序）→ 持股頁平均成本與已實現損益正確（手算對照）。
- [ ] 股票表單輸入 0 股或 0 價 → 儲存鈕 disabled。
- [ ] 信用卡設定頁看得到繳款日規則提示。

---

## 批次 5：UX 中嚴重度修正

**目標**：七個「體驗不順」修正，互相獨立，可在同一批次內逐項做。

### 實作（每項獨立勾銷）

1. **略過發票要有回饋**（`src/components/invoice/InvoicePanel.jsx`、`InvoiceRow.jsx`）：目前「略過」是單一 × icon、點了立即消失無提示。做法：ignore 成功後在列表頂顯示一條行內提示「已略過，可於『已處理』分頁復原」＋「復原」按鈕，3–5 秒自動消失（局部 state，不引入 toast 套件）。
2. **報表空資料防呆**（`src/components/report/FlowReport.jsx` 約 77 行）：`trend[trend.length - 1]` 改 `trend[trend.length - 1] ?? { income: 0, expense: 0 }`，避免無資料新帳號白畫面。
3. **側欄顯示登入身分**（`src/components/Sidebar.jsx` 約 70–79 行）：寫死的「本機帳戶」改讀 `useAuth()`（讀法參考 `SettingsPage`），顯示 displayName 或 email；未登入顯示「未登入」。
4. **隱藏金額時比例圖也要遮**：枚舉三處——① `HomePage.jsx` 信用卡使用率進度條（約 336 行）② `CardDetailPage.jsx` 進度條（約 74 行）③ `FlowReport.jsx` donut（約 145 行）與分類排名長條（約 248 行）。`hidden` 時進度條改固定等寬淡色、donut 改單色環、長條等寬——不再洩漏比例。
5. **備註欄常駐**（`src/components/transaction/TransactionForm.jsx`）：支出／收入型別把備註列從「進階」摺疊搬到常駐可見（位置與樣式參考轉帳／應收型別已有的備註列）；入帳日維持在進階。
6. **分頁狀態寫回 URL**（`TransactionsPage.jsx` 約 29 行、`ReportsPage.jsx` 約 30 行）：切分頁時 `setSearchParams({ tab }, { replace: true })`（預設分頁可不帶參數）；ReportsPage 目前是純 local state，比照補上讀＋寫。驗證情境：明細切到「發票載具」→ 點歸帳 → 存檔返回 → 應停在發票載具分頁。
7. **窄機大金額驗證**（驗證任務，可能不需改碼）：`preview_resize` 375×812 → 建一筆 8 位數金額＋長分類名的交易、讓淨資產顯示破千萬 → 檢查 TransactionRow 與 HomePage 大數字（約 130 行 `text-[34px]`）有無溢出。有 → 縮字級或 clamp 修掉；無 → 勾「驗證通過無需修改」。

### 批次 5 驗收標準

- [ ] 略過一張發票 → 出現提示與復原鈕，按復原回到未歸帳。
- [ ] 全新無交易帳號開報表頁 → 不白畫面。
- [ ] 登入後桌面側欄顯示 Google 帳號名。
- [ ] 按眼睛隱藏 → 首頁卡片進度條、卡片詳情進度條、報表 donut 與長條全部看不出比例。
- [ ] 支出表單不點進階就看得到備註欄；進階內不再有重複的備註欄。
- [ ] 發票載具分頁 → 歸帳 → 返回，停在發票載具；報表切「投資」→ 離開返回，停在投資。
- [ ] 375px 寬度下 8 位數金額不破版（或記錄「驗證通過無需修改」）。

---

## 批次 6：破壞性確認 in-app 化

**目標**：`window.confirm` 在 PWA 全螢幕模式下突兀、部分 iOS standalone 情境可能被抑制，且無法呈現「將一併刪除整組」的層級。統一改為 App 內確認 Sheet。

**涉及檔案**：新增 `src/components/ConfirmSheet.jsx`（基於既有 `src/components/Sheet.jsx`）；替換以下所有 `window.confirm`／`window.alert`。

### 實作

1. 新增 `ConfirmSheet` 共用元件：props 為 `open`、`title`、`message`（可多行）、`confirmLabel`（預設「確定」）、`danger`（true 時確認鈕紅色 `text-error`／error 底）、`onConfirm`、`onClose`。樣式沿用專案 Sheet 慣例。
2. 枚舉替換（**全部列出，逐一勾銷**；先 `grep -n "window.confirm\|window.alert" src/` 取得當下完整清單，批次 1 可能新增了幾處）：
   - [ ] `AddTransactionPage.jsx` — 刪股票交易、刪交易（含分期整組／代墊整組／發票退回三種文案）
   - [ ] `InvoicePanel.jsx` — 取消歸帳
   - [ ] `InvoiceEditSheet.jsx` — 刪發票、已歸帳擋刪提示（批次 1-4 加的 alert）
   - [ ] `SettingsPage.jsx` — 刪週期規則
   - [ ] `BrokerEditSheet.jsx` — 刪券商
   - [ ] `TransactionForm.jsx` — 批次 1-2／1-3 加的群組編輯警告
3. 替換後全站 `window.confirm`／`window.alert` 應為 0；若有刻意保留，在此列明理由。

### 批次 6 驗收標準

- [ ] `grep` 全站無 `window.confirm`／`window.alert`（或保留清單已列明）。
- [ ] 上列每一處實測：確認執行、取消不執行；刪整組類的文案講清楚會刪什麼。
- [ ] Sheet 在手機寬度與桌面寬度都正常顯示。

---

## 批次 7：低嚴重度打磨

**目標**：一次收掉六個小項。

### 實作（每項獨立勾銷）

1. **`formatNumber` NaN 防線**（`src/lib/format.js` 約 7 行）：開頭加 `if (!Number.isFinite(Number(n))) n = 0`——缺值欄位顯示 `NT$ 0` 勝過 `NT$ NaN`。
2. **移除 Firestore 連線測試按鈕**（`src/pages/SettingsPage.jsx` 約 253–265 行）：M0 驗證用的開發殘留，連同其專用 state 與 import 一起移除。
3. **CategoryPicker 長分類名截斷**（`src/components/transaction/CategoryPicker.jsx` 約 49–77 行）：母分類名加 `truncate`，避免長中文換行擠壓 icon 對齊。
4. **新增鈕 label 一致化**：桌面側欄「記帳」鈕不動；`src/components/BottomNav.jsx` 的 FAB 加 `aria-label="記帳"`（最小改動）。
5. **GAS 股價日期格式驗證**（`src/lib/priceSync.js` 約 28 行）：`priceDate` 不符 `/^\d{4}-\d{2}-\d{2}$/` 的那筆跳過不寫入（容錯，不 throw）。
6. **NumberPad 的 `%`／`=`**：明確決策——**維持現狀，不動**（進階功能、不會誤用到出事）。此項無程式碼變更。

### 批次 7 驗收標準

- [ ] 對 `formatNumber(undefined)` 手動驗證回 `'0'` 格式；正常金額顯示不變。
- [ ] 設定頁無連線測試按鈕，`git diff` 確認無殘留 dead code。
- [ ] 塞一個超長母分類名 → picker 不換行擠壓。
- [ ] 手機 FAB 有 aria-label。
- [ ] 其餘各項照描述抽測。

---

## 不在本計畫內（需使用者另行決策，勿擅自動工）

- **明細搜尋／篩選／月曆**：docs/04-ui.md:30 明列但未實作，規模大、需先出 UI 設計（可走 Claude Design 協作鏈），獨立成階段。
- **代墊／分期群組編輯全連動**：批次 1 以「警告＋允許」處理，全連動語義複雜，需求明確後再做。
- **CSV 匯入**（既有待辦，等財政部真實樣本）、**GitHub Pages 部署新版**（既有待辦）。

---

## 各批次開場 prompt（開新 session 直接貼用）

> 用法：每批次開一個新 session，貼上對應 prompt。執行模型第一件事是讀本檔對應章節，**先列子步驟等使用者確認再動手**。

### 批次 1

```
請執行 AtomCoins 修復計畫的批次 1（資料一致性：發票 ref 與群組編輯）。
先完整閱讀 docs/08-fix-plan.md 的「全域執行守則」「兩節背景知識」與「批次 1」章節，
再實際讀批次 1 涉及檔案的現有程式碼（行號是快照，以函式名為準），
然後列出你的子步驟清單給我確認，確認後才動手。
權威參考：docs/07-firebase-migration.md §6C（歸帳機制）、docs/03-scenarios.md §F（代墊）。
注意：不 commit；repo.js 的寫入都要 writeBatch 原子；完成後交付批次 1 驗收清單的實測步驟，不要接著做批次 2。
```

### 批次 2

```
請執行 AtomCoins 修復計畫的批次 2（寫入操作錯誤處理）。
先完整閱讀 docs/08-fix-plan.md 的「全域執行守則」與「批次 2」章節，特別是「前置：先實測離線寫入行為」——
必須先做這個實測、把結果記回 docs/08，才能決定實作方案。
然後列出你的子步驟清單給我確認，確認後才動手。
注意：套用清單有 10 個檔案，逐一勾銷不要漏；測試用的暫時 throw 必須移除並以 git diff 自查；不 commit；
完成後交付批次 2 驗收清單的實測步驟，不要接著做批次 3。
```

### 批次 3

```
請執行 AtomCoins 修復計畫的批次 3（拆帳明細顯示展開）。
先完整閱讀 docs/08-fix-plan.md 的「全域執行守則」與「批次 3」章節，
再讀 src/components/transaction/TransactionRow.jsx 全檔與兩個使用端（TransactionsPage、CardDetailPage）的列表容器結構，
然後列出你的子步驟清單給我確認，確認後才動手。
關鍵限制：只改顯示層，資料層（splits 結構、報表聚合、歸帳機制）一律不動；
單一類別交易與其他交易型別的顯示必須與改前完全一致。
不 commit；完成後交付批次 3 驗收清單的實測步驟（含 Claude Preview 實測），不要接著做批次 4。
```

### 批次 4

```
請執行 AtomCoins 修復計畫的批次 4（資料層防呆）。
先完整閱讀 docs/08-fix-plan.md 的「全域執行守則」與「批次 4」章節，
再實際讀涉及檔案（repo.js、date.js、recurring.js、stock.js、AccountEditSheet、股票表單）的現有程式碼，
然後列出你的子步驟清單給我確認，確認後才動手。
權威參考：docs/02-accounting-engine.md（引擎規則）、docs/03-scenarios.md §B（分期）。
注意：第 3 項（繳款日）只加 UI 提示文字、不改 engine.js 邏輯；第 5 項先確認現況、已有校驗就不要重複做。
不 commit；完成後交付批次 4 驗收清單的實測步驟，不要接著做批次 5。
```

### 批次 5

```
請執行 AtomCoins 修復計畫的批次 5（UX 中嚴重度修正，共 7 項）。
先完整閱讀 docs/08-fix-plan.md 的「全域執行守則」與「批次 5」章節，
再實際讀各項涉及檔案的現有程式碼，然後列出你的子步驟清單給我確認，確認後才動手。
注意：7 項互相獨立，逐項做完勾銷，不要漏項；第 4 項（隱藏金額遮比例）有枚舉三處，全部要處理；
第 7 項是驗證任務，用 Claude Preview 的 preview_resize 實測 375px，可能不需改碼。
不引入新套件；不 commit；完成後交付批次 5 驗收清單的實測步驟，不要接著做批次 6。
```

### 批次 6

```
請執行 AtomCoins 修復計畫的批次 6（破壞性確認 in-app 化）。
先完整閱讀 docs/08-fix-plan.md 的「全域執行守則」與「批次 6」章節，
先 grep 全站 window.confirm 與 window.alert 取得當下完整清單（批次 1 可能新增了幾處），
再讀 src/components/Sheet.jsx 的既有慣例，然後列出你的子步驟清單給我確認，確認後才動手。
注意：新元件 ConfirmSheet 沿用專案 Sheet 與 design token 慣例；替換要枚舉勾銷，最後 grep 驗證歸零。
不 commit；完成後交付批次 6 驗收清單的實測步驟，不要接著做批次 7。
```

### 批次 7

```
請執行 AtomCoins 修復計畫的批次 7（低嚴重度打磨，共 6 項，其中第 6 項無程式碼變更）。
先完整閱讀 docs/08-fix-plan.md 的「全域執行守則」與「批次 7」章節，
再實際讀各項涉及檔案的現有程式碼，然後列出你的子步驟清單給我確認，確認後才動手。
注意：逐項勾銷不要漏；移除連線測試按鈕時把專用 state 與 import 一併清乾淨。
不 commit；完成後交付批次 7 驗收清單的實測步驟。全部批次完成後提醒我更新 docs/08 進度追蹤表與 CLAUDE.md 現況。
```
