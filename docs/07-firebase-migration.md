# 07 — Firebase 遷移計畫（Dexie → Firestore）＋ 發票自動抓取

> 2026-07-03 定案。本檔是遷移與發票爬蟲的**權威計畫文件**：架構決策、階段拆解、每階段自包含開場 prompt。
> 遷移完成前，`docs/00`／`docs/01` 中 Dexie 相關描述以本檔為準。

## 1. 決策記錄（為什麼換）

- **動機**：Stage 6 需要「每天自動抓財政部載具發票」。財政部 API 自 2023-03-31 起個人無法申請 `appID`（需 ISO 27001 認證），只能走本機爬蟲；爬到的資料需要一個雲端落地點讓 PWA 讀取。
- **順勢升級**：原規劃的「Google Drive `appDataFolder` 手動備份／還原」**尚未實作**（package.json 無任何 Drive 依賴）。與其自己刻 OAuth＋衝突處理，改用 Firebase 一次解決 **登入＋多裝置即時同步＋雲端 DB＋爬蟲寫入** 四件事。
- **已知代價（使用者知情同意）**：完整帳務與消費明細從純本機改存 Google 雲端（Firestore security rules 保護，僅本人可讀寫）；Firestore 聚合查詢能力弱於 SQL（以「整包訂閱＋記憶體計算」規避，見 §2）；供應商鎖定。
- **時機**：Stage 5 完成、Stage 6 尚未動工，是查詢呼叫點最少的時間點；愈晚遷移愈痛。

## 2. 核心架構決策

1. **讀取層＝整個 collection 訂閱進記憶體，不逐條翻譯查詢。**
   `DataProvider`（React context）在登入後對每個 collection 開 `onSnapshot`，把陣列放進 context，提供 `useCollection(name)` hook。全站 57 處 `useLiveQuery` 變成「拿陣列＋沿用既有 JS filter/聚合」的機械式替換；`lib/engine.js`、`lib/calc.js` 完全不動。個人資料量（萬筆級）在記憶體毫無壓力，且避開 Firestore 複合索引與雙欄位範圍查詢限制。
2. **Collection 結構：`users/{uid}/<原 table 名>/{docId}`。**
   docId 沿用既有 nanoid（`buildRecord` 不變）；例外：`stockPrices` 的 docId＝`symbol`、`settings` 的 docId＝`SETTINGS_ID`（沿用 `db/seed.js`）、`invoices` 的 docId＝`invoiceNumber`（天然唯一，讓爬蟲 upsert 冪等）。
3. **多表原子交易 → `writeBatch`。**
   `repo.js` 現有 3 處 `db.transaction('rw', …)`（繳卡費、建分期、刪分期）改 `writeBatch`（單批上限 500 筆，遠夠用）。
4. **離線能力：`persistentLocalCache` ＋ `persistentMultipleTabManager`。**
   底層仍是 IndexedDB，離線可讀寫、復網自動同步；PWA local-first 體驗大致保留（首次載入需連線）。
5. **爬蟲留本機、只有 DB 上雲。**
   本機 Python script 用 `firebase-admin`（service account）直寫 `users/{uid}/invoices`，繞過 security rules；PWA 靠 onSnapshot 即時看到。Windows 工作排程器每日觸發＋勾「錯過排程的開始時間後盡快啟動」解決非 24 小時開機；每次抓**最近 7 天區間**＋invoiceNumber upsert 解決漏抓與去重。

### Collection 清單（14 張，對齊 `src/db/index.js` v2）

`accounts`、`categories`、`tags`、`projects`、`counterparties`、`transactions`、`invoices`、`brokers`、`stockTransactions`、`stockPrices`、`settings`、`creditCardStatements`、`installmentPlans`、`recurringRules`

### Security rules（唯一防線，M0 部署）

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## 3. 金鑰與安全邊界

| 項目 | 性質 | 放哪 |
|---|---|---|
| Firebase web config（apiKey 等） | **公開值**，防線在 rules | 寫死於 `src/lib/firebase.js`（沿用 GAS URL 寫死先例，2026-07-03 決策） |
| Firestore security rules | 唯一存取防線 | Firebase console 部署，副本存 repo（`firestore.rules`） |
| Firestore Admin 認證 | **實際採 gcloud ADC（keyless）**；service account JSON（若可用）為備援、最高機密可繞過 rules | ADC 存本機 gcloud 設定；金鑰 JSON（若有）只存爬蟲資料夾，**repo 外**。組織政策 `iam.disableServiceAccountKeyCreation` 禁下載金鑰，故走 ADC（見 §6B 實作結果） |
| 財政部手機條碼＋驗證碼 | 機密 | 爬蟲資料夾 `.env`，repo 外 |
| OpenAI API key（驗證碼辨識） | 機密 | 爬蟲資料夾 `.env`，repo 外 |

> **爬蟲資料夾放 repo 外**（建議 `C:\Users\Hope\Desktop\CLAUDE工作區\atomcoins-scraper\`）：AtomCoins repo 要部署 GitHub Pages，金鑰檔連 `.gitignore` 都不要賭。

## 4. 已知坑（動手前必讀）

- **Firestore 拒收 `undefined`**：Dexie 記錄常帶 undefined 欄位，寫入前一律剝除（共用一個 `stripUndefined()`，遷移工具與 repo 寫入層都要過）。
- **`writeBatch` 上限 500 筆**：遷移工具按 500 分批。
- **遷移工具要冪等**：用 `setDoc`（覆寫語意），跑兩次結果相同。
- **GitHub Pages 網域要加入 Auth authorized domains**（`hfuhsu108.github.io` 與 `localhost`），否則登入被拒。
- **登入先用 `signInWithPopup`**；若 PWA standalone 模式擋 popup 再 fallback `signInWithRedirect`。
- **bundle 變大**：一律用 modular SDK（`firebase/app`、`firebase/auth`、`firebase/firestore`）named import，讓 tree-shaking 生效。
- **onSnapshot 首次觸發含全量、之後增量**；離線寫入有 latency compensation（本地立即反映，不用等網路）。
- **Firestore region 選 `asia-east1`（彰化）**，建案時決定、不可改。

## 5. 非目標（本計畫不碰）

- GAS 股價 proxy 照舊（只是 `upsertStockPrice` 改寫進 Firestore）。
- 不做多人共帳（rules 結構已預留擴充空間）、不做配息、不做預算。
- 不把爬蟲搬上 Cloud Functions（登入 session／驗證碼在本機處理最簡單）。

## 6. 階段總覽

| 階段 | 內容 | 完成判準 |
|---|---|---|
| **M0** | Firebase 專案建置＋SDK＋Google 登入＋rules | 能登入；未登入寫入被 rules 擋 |
| **M1** | 資料層基礎（DataProvider／repo Firestore 版／遷移工具），App 仍跑 Dexie | Firestore 筆數＝Dexie 筆數；App 行為不變 |
| **M2** | 讀寫切換（repo 切換＋57 處 useLiveQuery 分兩批換） | 報表口徑與切換前一致；CRUD 即時反映 |
| **M3** | 去 Dexie 收尾＋離線／多裝置驗證＋docs 更新 | 斷網可記帳復網同步；兩裝置即時互通 |
| **6B** | 發票爬蟲（本機 Python＋Admin SDK＋工作排程器） | 隔天開機自動補跑、Firestore 出現新發票 |
| **6C** | 載具匣 UI（歸帳／略過／手動新增／CSV 匯入備援） | 爬到的發票能一鍵轉交易、報表口徑正確 |

---

## M0 — Firebase 建置＋登入

**工作項**
1. 【使用者在 console 操作】建 Firebase 專案 → 開 Authentication（Google provider）→ 開 Firestore（production mode、region `asia-east1`）→ Authentication > Settings > Authorized domains 加 `hfuhsu108.github.io` → 取得 web app config。
2. `npm install firebase`（用 Git Bash，避免 PowerShell ExecutionPolicy 問題）。
3. `src/lib/firebase.js`：`initializeApp` ＋ `initializeFirestore`（persistentLocalCache ＋ persistentMultipleTabManager）＋ auth 匯出；config 直接寫死。
4. SettingsPage 加 Google 登入／登出區塊；`useAuth` hook（`onAuthStateChanged`）。
5. 部署 security rules（console 貼上），副本存 repo 根目錄 `firestore.rules`。

**驗證**：登入後 Settings 顯示帳號與 uid（uid 之後爬蟲要用，要可複製）；登入狀態下寫一筆測試 doc 成功、登出後被拒；重新整理後登入狀態保持。

**開場 prompt**

```
AtomCoins 專案，執行 Firebase 遷移階段 M0（Firebase 建置＋登入）。
先讀 CLAUDE.md 與 docs/07-firebase-migration.md 的 §2、§3、§4、§M0。

目標：Firebase SDK 接上 App——初始化（persistentLocalCache）、Google 登入（SettingsPage）、
security rules 部署與驗證。我已在 Firebase console 完成專案建置（Auth Google provider、
Firestore asia-east1、authorized domains），web config 如下：〔貼上 config〕

注意：npm install 用 Git Bash；config 寫死於 src/lib/firebase.js（docs/07 §3 有決策依據）；
modular SDK named import；登入用 signInWithPopup；rules 副本存 repo 根目錄 firestore.rules；
Settings 要顯示可複製的 uid（爬蟲階段要用）。

先列子步驟給我確認再動手。完成後給我完整驗證步驟清單。
```

## M1 — 資料層基礎（App 仍跑 Dexie，行為零改變）

**工作項**
1. `src/db/firestore-repo.js`：對照 `repo.js` 全部函式的 Firestore 版（函式簽名一致；`stripUndefined`；3 處多表交易用 `writeBatch`）。
2. `src/db/DataProvider.jsx`：登入後對 14 個 collection 開 `onSnapshot` → context；`useCollection(name)` hook；未登入回空陣列。
3. 一次性遷移工具：Settings 開發區塊按鈕「遷移到 Firestore」——讀 Dexie 全量 → `stripUndefined` → 按 500 分批 `setDoc` 寫入（docId 規則見 docs/07 §2-2）→ 回報各表筆數。
4. 本階段**不改任何頁面**，App 照常跑 Dexie。

**驗證**：跑遷移工具 → Firebase console 各 collection 筆數與 Dexie 一致（DevTools `db.transactions.count()` 比對）；重跑一次筆數不變（冪等）；App 所有頁面行為與遷移前完全相同。

**開場 prompt**

```
AtomCoins 專案，執行 Firebase 遷移階段 M1（資料層基礎）。M0 已完成（登入可用、rules 已部署）。
先讀 CLAUDE.md 與 docs/07-firebase-migration.md §2（含 collection 清單與 docId 規則）、§4、§M1，
以及 src/db/repo.js、src/db/index.js、src/db/seed.js。

目標：三件套——(1) src/db/firestore-repo.js（repo.js 的 Firestore 版，函式簽名一致、
writeBatch 處理 3 處多表交易）(2) DataProvider + useCollection（onSnapshot 整包訂閱）
(3) Dexie→Firestore 一次性遷移工具（Settings 開發區塊、500 筆分批、setDoc 冪等）。

紅線：本階段不改任何頁面，App 必須照常跑 Dexie、行為零改變。
注意：Firestore 拒收 undefined，寫入前一律 stripUndefined；
docId 例外——stockPrices=symbol、settings=SETTINGS_ID、invoices=invoiceNumber。

先列子步驟給我確認再動手。完成後給我含筆數比對的驗證步驟清單。
```

## M2 — 讀寫切換（最大的一段，分兩批）

**工作項**
- **切換前先留存基準**：記下首頁淨資產、當月收支、報表各數字（截圖），作為口徑比對基準。
- **批 1（核心流）**：`repo.js` 的呼叫端全部指向 firestore-repo（或直接替換 repo.js 內容）；HomePage、TransactionsPage、AddTransactionPage、TransactionForm 及其 picker 元件改用 `useCollection`。
- **批 2（其餘）**：ReportsPage、FlowReport、CardDetailPage、StockPanel、StockFields、SettingsPage、useDailyPriceSync、useSyncPrices。
- 替換模式：`useLiveQuery(() => db.x.where(...).toArray())` → `useCollection('x')` ＋ `useMemo` 沿用同語義 filter；**不改任何過濾／聚合語義**。
- 批間空檔未切頁面顯示凍結的 Dexie 舊資料，屬預期（全程在 branch 作業）。
- 收尾重跑一次遷移工具，校正切換期間寫入 Dexie 的殘餘資料。

**驗證**：每批切完——新增／編輯／刪除交易即時反映；批 2 完成後與基準截圖逐項比對（淨資產、月收支、分類排名、趨勢、卡帳單、持股損益）；股價同步照常寫入。

**開場 prompt**

```
AtomCoins 專案，執行 Firebase 遷移階段 M2（讀寫切換）。M0、M1 已完成
（登入、DataProvider/useCollection、firestore-repo、遷移工具都已就緒，App 目前仍跑 Dexie）。
先讀 CLAUDE.md 與 docs/07-firebase-migration.md §2、§M2。
用 grep 找出全部 useLiveQuery 呼叫點（約 57 處、12 檔）列成清單。

目標：分兩批把讀寫都切到 Firestore。批 1＝repo 切換＋核心流
（HomePage/TransactionsPage/AddTransactionPage/TransactionForm＋pickers）；
批 2＝Reports/FlowReport/CardDetail/Stock 相關/Settings/兩個 price sync hooks。
每批之間停下讓我驗證。

紅線：只做機械式替換（useCollection＋useMemo 沿用原 filter 語義），
不改 engine.js/calc.js、不「順手優化」任何聚合邏輯。
動手前先提醒我記錄切換前基準數字（淨資產、月收支、報表各值）；
批 2 完成後重跑遷移工具校正，再帶我做基準比對。

先列子步驟（含兩批的檔案分配）給我確認再動手。
```

## M3 — 去 Dexie 收尾＋驗證

**工作項**
1. `seed.js` 改寫：偵測 `users/{uid}/settings/{SETTINGS_ID}` 不存在時對 Firestore 做初始 seed（新裝置／新帳號初始化路徑）。
2. 移除 `dexie`、`dexie-react-hooks` 依賴；刪 `src/db/index.js`；grep 確認無殘留 import；遷移工具轉為註解保留或移除。
3. 離線驗證：DevTools offline → 讀資料、記一筆帳 → 復網 → 確認同步上雲。
4. 多裝置驗證：手機＋電腦同時登入，一邊記帳另一邊即時出現。
5. docs 收尾：`docs/00`、`docs/01` 的 Dexie 描述改為 Firestore（`CLAUDE.md` 已於計畫定案時更新）。

**驗證**：`npm run build` 過；PWA 斷網可用；雙裝置即時同步；全站無 dexie 字樣（grep）。

**開場 prompt**

```
AtomCoins 專案，執行 Firebase 遷移階段 M3（去 Dexie 收尾）。M0–M2 已完成，
App 讀寫已全部走 Firestore，Dexie 只剩依賴與遷移工具殘留。
先讀 CLAUDE.md 與 docs/07-firebase-migration.md §M3。

目標：(1) seed.js 改為 Firestore 初始化（settings doc 不存在時 seed）
(2) 移除 dexie/dexie-react-hooks、刪 src/db/index.js、grep 確認零殘留
(3) 陪我完成離線驗證與雙裝置同步驗證 (4) 更新 docs/00、docs/01 的 Dexie 描述。

注意：移除依賴用 Git Bash npm uninstall；改完跑 npm run build 健康檢查。
先列子步驟給我確認再動手。完成後給我離線＋雙裝置的驗證步驟清單。
```

## 6B — 發票爬蟲（本機 Python）

**工作項**
1. **探勘（本階段第一步，估時前提）**：手動走一遍財政部整合服務平台登入（手機條碼＋驗證碼），DevTools 記錄請求流程；確認圖形驗證碼型態；優先找可直接重放的 JSON endpoint，退而求其次才解析 HTML。
2. 建 `atomcoins-scraper/`（**repo 外**）：Python venv；`.env`（手機條碼、驗證碼密碼、`OPENAI_API_KEY`、service account 路徑、Firebase `uid`——從 App Settings 頁複製）。
3. 登入自動化：requests session 為主，必要時 Playwright；圖形驗證碼截圖 → OpenAI Vision API 辨識（使用者已有 key；備援方案 ddddocr）；辨識失敗重試 3 次。
4. 抓最近 7 天發票（表頭＋品項），欄位對齊 `docs/01 §3.7`（`source='carrier_api'`、`status='inbox'`、`lineItems` 帶入）。
5. `firebase-admin` upsert 到 `users/{uid}/invoices`，docId＝`invoiceNumber`（冪等；**已存在且 status≠inbox 的發票不覆寫 status**，避免蓋掉歸帳狀態）。
6. 每次執行更新 `users/{uid}/meta/scraperStatus`（lastRunAt、抓到幾張、成功／失敗），PWA 之後可顯示同步健康度；本機留 log 檔。
7. Windows 工作排程器：每日固定時間＋勾「如果錯過排程的開始時間，盡快啟動工作」。

**驗證**：手動跑 script → Firestore 出現當週發票、PWA（6C 前先用 console）看得到；重跑不重複；改系統時間或關機隔日開機，排程補跑成功；log 與 scraperStatus 正確。

### 6B 探勘結果（2026-07-04，Claude in Chrome 實測）

平台為 SPA（Vue），登入採 **Ory Hydra OAuth2**（登入頁帶 `login_challenge`）；API 主機為 `service-mc.einvoice.nat.gov.tw`。認證**不是 cookie session**：登入後 access token（JWT，約 1185 字元）存於 `sessionStorage`，每個 API 請求帶兩個 header——`Authorization: Bearer <JWT>` 與自訂的 `x-cds-btc`（另一個 JWT，含登入狀態旗標）。`localStorage` 有 `last-login-time`／`last-refresh-time`／`group-type`（OAuth token refresh 機制）。

**架構決策：爬蟲用 Playwright 跑完整登入，登入後在頁面 context 內用 `page.evaluate` 直接呼叫 API。** 原因：token 機制複雜（Bearer＋x-cds-btc＋refresh），純 `requests` 重放要自己維護三種憑證與刷新；改在已登入的瀏覽器分頁內呼叫 API，axios interceptor 會自動帶好所有 header，最穩健、最不易壞。登入表單自動化即可，毋須逆向登入 POST endpoint。

**圖形驗證碼**：`GET service-mc…/act/login/api/act002i/captcha` → 回 JSON `{token, image}`，`image` 為 **base64 PNG**（免截圖，直接解碼丟 OpenAI Vision 辨識）；`token` 於登入提交時帶回綁定該張驗證碼。

**發票查詢＝兩段式 JWT**（都是 POST `…/btc/cloud/api/btc502w/`）：
1. `getSearchCarrierInvoiceListJWT`，body `{cardCode:"", carrierId2:"", searchStartDate, searchEndDate, invoiceStatus:"all", isSearchAll:"true"}`（日期為 **ISO 8601 UTC**，如 `2026-07-01T03:09:37.161Z`；空 `cardCode`＋`isSearchAll:"true"` ＝ 查全部歸戶載具）→ 回一個 JWT 字串。
2. `searchCarrierInvoice`，body `{token:<步驟1的JWT>}` → 回**分頁**結果 `{totalElements, totalPages, size:10, content:[…]}`。`content[]` 每筆（發票 header）：`invoiceNumber`、`invoiceDate`（ISO）、`sellerName`（商家）、`totalAmount`（數字）、`carrierName`、`donateMark`、`extStatus`，外加該筆自己的 `token`（查單張明細用）。**分頁 size=10，超過要翻頁**（page 參數待實作時確認；個人單週發票量通常 <10）。

**單張發票明細**（都是 POST `…/btc/cloud/api/common/`，body ＝該筆發票的 `token` 字串本身）：
- `getCarrierInvoiceData` → 發票 header 詳情：`sellerName`、`sellerId`（統編）、`sellerAddress`、`invoiceDate`（`YYYYMMDD`）、`invoiceTime`、`totalAmount`、`randomNumber`（隨機碼）、`buyerId`。
- `getCarrierInvoiceDetail` → **品項明細（lineItems）** `{content:[{sequenceNumber, item, quantity, unitPrice, amount}]}`。對應 `docs/01 §3.7`：`item→name`、`quantity→qty`、`unitPrice→unitPrice`、`amount→amount`。

**抓取流程**：登入 → `getSearchCarrierInvoiceListJWT` + `searchCarrierInvoice` 拿近 7 天發票 header（一次涵蓋全部載具）→ 對每筆用其 `token` 呼叫 `getCarrierInvoiceDetail` 補 lineItems（選配，可延後）→ `stripUndefined` 後 `firebase-admin` upsert（docId=`invoiceNumber`）。

**輔助 API**（記錄備查，爬蟲不必用）：`btc502w/getCarrierList`（回歸戶載具清單，非發票）、`btcCloudPublicCarrierCheck/checkBlack`（黑名單檢查）。

**驗證**：手動跑 script → Firestore 出現當週發票、PWA（6C 前先用 console）看得到；重跑不重複；改系統時間或關機隔日開機，排程補跑成功；log 與 scraperStatus 正確。

**開場 prompt**

```
AtomCoins 發票爬蟲，階段 6B。背景：財政部 API 個人無法申請，走本機爬蟲；
App 已完成 Firestore 遷移（M0–M3），發票要寫入 users/{uid}/invoices。
先讀 AtomCoins repo 的 CLAUDE.md、docs/07-firebase-migration.md §3、§5、§6B，
與 docs/01-schema.md §3.7（Invoice 欄位）。

目標：repo 外建 atomcoins-scraper/（Python），每日自動登入財政部整合服務平台
抓最近 7 天載具發票，firebase-admin upsert（docId=invoiceNumber）。
驗證碼用 OpenAI Vision API 辨識（我有 key）。排程用 Windows 工作排程器＋錯過補跑。

第一步是探勘：先陪我手動走一遍平台登入、用 DevTools 記錄請求，
確認驗證碼型態與可用 endpoint，探勘結果回填 docs/07 §6B 再實作。
紅線：service account JSON、.env 機密全在 repo 外；
upsert 不得覆寫已歸帳發票的 status；頻率溫和（每日一次、區間 7 天）。

先列子步驟給我確認再動手。
```

### 6B 實作結果（2026-07-04 完成）

**已打通並實際寫入**：Playwright 登入 → 抓近 7 天發票（55 張）含品項明細 → firebase-admin upsert 到 `users/{uid}/invoices`。scraper 在 repo 外 `C:\Users\Hope\Desktop\CLAUDE工作區\atomcoins-scraper\`（`config/captcha/scraper/firestore_upload/main.py`，`main.py --dry-run` 免金鑰測前半段）。

實測校正掉的合約（修正上方探勘記錄的猜測項）：

- **登入憑證**：登入頁 `https://www.einvoice.nat.gov.tw/portal/btc/mobile`；「手機條碼」分頁實際填的是**手機號碼**（`#mobile_phone`）＋密碼（`#password`）＋圖形驗證碼（`#captcha`，無 name）＋登入鈕 `#submitBtn`，**非** `/` 開頭條碼。驗證碼欄要逐字鍵入（`press_sequentially`）。
- **驗證碼辨識**：OpenAI gpt-4o-mini 對驗證碼會**拒答**（回 `1234567890` 佔位）→ 改用 **ddddocr**（離線、免金鑰）；透明背景 PNG 必須 `classification(img, png_fix=True)`。
- **查詢區間不可跨月**（跨月回 400「query interval abnormal」）；平台預設「當月 1 號→今天」。scraper 按台灣時區把查詢窗切成不跨月區間、各段從 1 號起、沿用 now 時刻（避免 UTC 表示回退上月）。
- **分頁走 query string** `searchCarrierInvoice?page=N&size=10`，body 只有 `{token: listJWT}`（非 body 帶 page）。
- **明細** `getCarrierInvoiceDetail` body ＝該筆 `token` 的 **JSON 字串**（`JSON.stringify(token)`，帶引號），非原始 token 字串。列表已含商家/金額，故 `getCarrierInvoiceData` 不需呼叫。
- **`invoiceDate` 是 UTC**（`…T16:00:00Z` ＝台灣隔日），要 **+8 轉台灣**再取日期，否則差一天。
- **Firestore 認證改 gcloud ADC（keyless）**：組織政策 `iam.disableServiceAccountKeyCreation` 禁止下載 service account 金鑰 → `gcloud auth application-default login` ＋ `gcloud auth application-default set-quota-project <projectId>`；`init_admin` 用 `initialize_app(options={"projectId": …})`。§3 表格「service account JSON」一列因此改為「ADC 或金鑰擇一」。

剩餘驗證（使用者待補）：冪等重跑（created=0）、歸帳保護（status≠inbox 不覆寫）、Windows 工作排程器補跑。踩坑細節見專案 memory `stage6b-pitfalls`。

## 6C — 載具匣 UI（原 Stage 6 主體）

**工作項**
1. TransactionsPage 第三分頁「發票載具」（`docs/04` 畫面 3）：未歸帳（inbox）列表——商家／金額／日期；切換 未歸帳／已歸帳（recorded＋ignored）。
2. 歸帳流程：點發票 → 帶入 TransactionForm（金額=totalAmount、tradeDate=invoiceDate、商家、lineItems 對照供拆帳）→ 建立 expense 後回寫 `invoice.status='recorded'`、`invoice.transactionId`、`transaction.invoiceId`（雙向 ref，writeBatch 原子寫入）。
3. 略過：左滑「略過」→ `status='ignored'`（可在已歸帳頁復原）。
4. 手動新增發票（`source='manual'`）。
5. CSV 匯入備援：解析官方平台匯出的載具明細 CSV → 同一套 upsert（docId=invoiceNumber），爬蟲壞掉時的降級路徑。
6. Settings 或載具匣頁顯示 `scraperStatus`（上次同步時間）。

**驗證**：完整走「爬到發票 → 歸帳 → 交易出現在帳本、報表口徑正確 → 發票移到已歸帳」；略過與復原；手動新增；匯入一份真實 CSV 不產生重複。

**開場 prompt**

```
AtomCoins 專案，階段 6C（發票載具匣 UI）。背景：Firestore 遷移完成，
爬蟲（6B）已每日把發票寫入 users/{uid}/invoices（status='inbox'、docId=invoiceNumber）。
先讀 CLAUDE.md、docs/07-firebase-migration.md §6C、docs/01-schema.md §3.7、
docs/04-ui.md 畫面 3、docs/02（收支口徑）。

目標：TransactionsPage 第三分頁「發票載具」——inbox 列表、左滑歸帳/略過、
未歸帳/已歸帳切換、歸帳帶入 TransactionForm（金額/日期/商家/lineItems 對照）、
建立後雙向 ref（writeBatch）、手動新增、官方 CSV 匯入備援、顯示 scraperStatus。

注意：1 張發票→1 筆交易（docs/01）；歸帳生成的 expense 走正常收支口徑；
CSV 匯入與爬蟲共用 upsert 語義（不得覆寫已歸帳 status）；UI 沿用現有元件風格（Sheet、TransactionRow）。

先列子步驟給我確認再動手。
```
