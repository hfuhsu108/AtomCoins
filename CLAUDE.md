# 原子記帳 AtomCoins — 專案主檔

> 個人自用記帳 PWA。本檔是**每次自動載入**的精簡導覽；完整規格在 `docs/`，需要細節時讀對應檔案，不要把全文搬進這裡。
> 文件語言為繁體中文；欄位名、技術名詞、CLI 旗標保留原文。本專案的單一事實來源是本檔 ＋ `docs/`。

## 專案一句話

完整帳戶／收支記帳 ＋ 信用卡管理 ＋ **台股投資追蹤（買賣、持股、損益、T+2 交割）** ＋ 電子發票載具匣（本機爬蟲每日自動抓＋手動新增）。mobile-first、RWD 到桌面，簡潔直覺、資訊密度優先、不過度裝飾。單人使用，多裝置即時同步。

## 技術棧（皆已鎖定，勿擅自更換）

| 項目 | 決定 |
|---|---|
| 前端框架 | React |
| 樣式 | Tailwind CSS |
| 建置 | Vite 正式專案（非單檔 HTML），含 PWA service worker |
| 資料庫 | **Firestore**（`users/{uid}/…`，persistentLocalCache 離線快取；架構決策見 `docs/07`） |
| 圖示 | Font Awesome 6（全站統一） |
| 字體 | Noto Sans TC |
| 部署 | GitHub Pages（靜態，子路徑 `username.github.io/repo/`） |
| 股價來源 | TWSE 每日收盤，經 Google Apps Script web app 當 proxy 回避 CORS |
| 雲端同步 | Firestore 原生即時同步 |
| 登入 | Firebase Auth（Google 登入） |
| 發票來源 | 本機 Python 爬蟲（財政部平台，Playwright 登入，驗證碼用 ddddocr 離線辨識）＋ `firebase-admin` 每日寫入 |
| 密碼鎖 | 不做 |
| 幣別 | 僅 TWD；保留 `currency` 欄位，不做匯率 |
| 投資範圍 | 僅台股、僅現股（無融資融券、當沖）；配息已實作（現金股利＋股票股利，2026-08-04） |

## 三大核心觀念（務必先讀，貫穿全域）

1. **記錄日 vs 入帳日**：每筆交易帶 `tradeDate`（發生日）與 `postingDate`（入帳日）。**帳戶餘額一律用 `postingDate` 累計**。信用卡延後入帳、股票 T+2 交割共用這一套引擎。「未入帳／未交割」＝ `postingDate`（股票為交割日）還沒到的記錄。
2. **拆帳 (splits)**：支出／收入的分類以「拆帳列」為單位。單一類別＝1 列、拆帳＝多列。**報表一律對拆帳列聚合**，而非交易層單一類別。
3. **收支 vs 資產轉移**：只有 `expense` / `income` 進收支統計。**轉帳本金、借還款本金、股票買賣本金都是資產轉移，不進收支統計**。股票損益走獨立投資報表。唯一例外：轉帳手續費計入支出。

## 關鍵慣例

- **金額一律整數（元）**；唯股票 `price` 為小數、`shares` 為整數。顯示時加千分位與 `NT$`、正負上色（支出琥珀 `#F08C00`、收入品牌藍 `#3B5BDB`；台股買紅 `#E03131`、賣綠 `#2F9E44`）。
- `id` 用字串（ULID／nanoid，離線可產生、不撞號）。
- 日期一律 `YYYY-MM-DD`。
- 僅 TWD；`currency` 欄位保留但不做匯率。
- GitHub Pages 子路徑：`vite.config.js` 設 `base: '/<repo-name>/'`；路由用 HashRouter（或 `404.html` redirect）。
- PWA 用 `vite-plugin-pwa`；`manifest.scope` 與 `start_url` 對齊子路徑。
- 機密分層（詳見 `docs/07 §3`）：Firebase web config 屬**公開值**（防線在 security rules），與 GAS 股價 proxy 網址（`src/lib/priceSync.js` 的 `GAS_STOCK_PROXY_URL`，2026-07-02 決策）同樣刻意寫死於原始碼。**真機密**絕不進 repo：爬蟲的財政部帳密放 repo 外爬蟲資料夾的 `.env`；OpenAI key 放 Firebase Secret Manager（`functions/index.js` 以 `defineSecret('OPENAI_API_KEY')` 讀取）；firebase-admin 走 gcloud ADC，不下載 service account 金鑰。

## 開發節奏（專案特定，與全域 CLAUDE.md 規則並行）

- 分階段開發（見 `docs/05-roadmap.md`），目前進度見下方「現況」。
- **關鍵相依**：信用卡與股票共用同一套 `postingDate` 入帳日引擎（核心觀念 1），Web Push 卡費提醒也共用 `statementPeriods`；改引擎時三者一起驗。代墊／AA 以 `linkGroupId` 成組。
- 外觀（HTML/CSS 風格）由 Claude Design 另行產出；`docs/04-ui.md` 是結構與內容規格，供與設計稿對齊。

## 文件地圖

| 檔案 | 內容 |
|---|---|
| [docs/00-overview.md](docs/00-overview.md) | 專案概述 ＋ 技術棧／架構決策細節（含 GitHub Pages、GAS proxy 注意事項） |
| [docs/01-schema.md](docs/01-schema.md) | 資料模型：所有 entity、欄位、列舉值總表 |
| [docs/02-accounting-engine.md](docs/02-accounting-engine.md) | 記帳規則與計算引擎：餘額、交割試算、淨資產、報表聚合 |
| [docs/03-scenarios.md](docs/03-scenarios.md) | 情境記帳手冊（記帳邏輯的權威參考，含代墊／AA） |
| [docs/04-ui.md](docs/04-ui.md) | 五頁 UI 設計 ＋ Font Awesome 6 icon 對應 |
| [docs/05-roadmap.md](docs/05-roadmap.md) | 分階段開發路線（0–7 ＋ 保留） |
| [docs/06-open-questions.md](docs/06-open-questions.md) | 待決事項／注意（linkGroupId、配息、預算等） |
| [docs/07-firebase-migration.md](docs/07-firebase-migration.md) | **Firebase 遷移計畫（Dexie→Firestore）＋發票爬蟲**：架構決策、金鑰邊界、階段 M0–M3／6B／6C 與各階段開場 prompt |
| [docs/design-brief.md](docs/design-brief.md) | **給 Claude Design 的介面設計 brief**（design tokens、元件、狀態、寫實範例資料；自我包含可整份貼上） |
| [docs/08-fix-plan.md](docs/08-fix-plan.md) | **2026-07-06 健檢修復計畫**：7 個批次（資料一致性／錯誤處理／拆帳顯示展開／防呆／UX／確認框／打磨）＋進度追蹤表＋各批次自包含開場 prompt |
| [docs/09-features-plan.md](docs/09-features-plan.md) | **2026-07-20 功能擴充計畫**（MOZE 比對後選定）：7 個批次（搜尋篩選＋快照先行／範本／商家別名／年報表／日曆＋熱力圖／淨資產趨勢／Web Push 推播）＋進度表＋各批次自包含開場 prompt |

## 現況

- 線上 **v1.9.0**（2026-09-16）：`https://hfuhsu108.github.io/AtomCoins/`，push master 由 GitHub Actions 自動部署。各版內容見 `CHANGELOG.md`；各批次的實作細節、拍板理由與驗收結果見 `docs/07`、`docs/08`、`docs/09`（含「後續調整」與「部署與真機驗收」）。
- 路線圖階段 0–7、健檢修復（docs/08 批次 1–7）、功能擴充（docs/09 批次 1–7 與「後續調整」至第十批）皆已完成。CSV 發票匯入已取消（見 docs/09）。
- **待辦**：第四批的線上驗收（含 AI 分類實際呼叫）。

## 跨批次不變式（改到相關檔案前先看）

- `functions/copy-shared.mjs` 把 `engine.js`、`date.js`、`notifications.js`、`merchant.js`、`autoCategory.js` 複製到 `functions/shared/`：改到這五檔，上線須一併 `firebase deploy --only functions`；這五檔不可 import 清單外的檔（例：`stock.js`），否則 Cloud Functions 報 `ERR_MODULE_NOT_FOUND`。推播的情境判定重用這些純函式，不另寫第二份口徑。
- 報表歸月用 `tradeDate`；帳戶餘額與信用卡 `statementPeriods` 用 `postingDate || tradeDate`（口徑見 `docs/02 §4.1.1`）。判「本期」看 `isFuture`，不可用 `periods.find(p => p.isOpen)`——未來期的 `isOpen` 也為真。
- 股票同日排序用 `SIDE_ORDER = {buy:0, dividend:1, sell:2}`：配息夾在買賣之間，同日賣出才會用含配股的均價。
- 借還款與期初借貸的編輯走 patch 語義：不寫 `repayments`／`isOpening` key，以免陳舊快照覆寫其他裝置剛登錄的還款。
- 發票分類建議寫獨立 collection `invoiceSuggestions`，不寫回 invoice（爬蟲對 inbox 發票整份覆寫）。`pushSubscriptions` 刻意不進 `COLLECTIONS`、不進備份匯出。
- 左滑手勢（`SwipeRow`）：方向判定與 `preventDefault` 在同一個原生 `touchmove` handler 內完成；`touch-action: pan-y` 下在實際被觸控命中的內容層（細節見 memory `swipe-row-interaction.md` 與 pitfalls-frontend §13）。
- 改了 `package.json`／lock 等依賴就當場 commit，repo 才對得上線上實際版本。
