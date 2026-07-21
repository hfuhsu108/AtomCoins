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
| 資料庫 | **Firestore**（`users/{uid}/…`，persistentLocalCache 離線快取）——2026-07-03 起取代 Dexie，遷移計畫見 `docs/07` |
| 圖示 | Font Awesome 6（全站統一） |
| 字體 | Noto Sans TC |
| 部署 | GitHub Pages（靜態，子路徑 `username.github.io/repo/`） |
| 股價來源 | TWSE 每日收盤，經 Google Apps Script web app 當 proxy 回避 CORS |
| 雲端同步 | Firestore 原生即時同步（原 Google Drive `appDataFolder` 方案作廢，未曾實作） |
| 登入 | Firebase Auth（Google 登入） |
| 發票來源 | 本機 Python 爬蟲（財政部平台，驗證碼用 OpenAI Vision 辨識）＋ `firebase-admin` 每日寫入；官方 CSV 匯入為備援 |
| 密碼鎖 | 不做 |
| 幣別 | 僅 TWD；保留 `currency` 欄位，不做匯率 |
| 投資範圍 | 僅台股、僅現股（無融資融券、當沖）；配息保留待後做 |

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
- 機密分層（詳見 `docs/07 §3`）：Firebase web config 屬**公開值**（防線在 security rules），與 GAS 股價 proxy 網址（`src/lib/priceSync.js` 的 `GAS_STOCK_PROXY_URL`，2026-07-02 決策）同樣刻意寫死於原始碼。**真機密**（service account JSON、財政部帳密、OpenAI key）只存 repo 外的爬蟲資料夾，絕不進 repo。

## 開發節奏（專案特定，與全域 CLAUDE.md 規則並行）

- 分階段開發（見 `docs/05-roadmap.md`），目前進度見下方「現況」。
- **關鍵相依**：信用卡（階段2）與股票（階段3）共用同一套 `postingDate` 入帳日引擎，務必先建立。代墊／AA 的 `linkGroupId` 在階段1 就會用到。
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

階段 5（基礎報表）完成（2026-07-03）。累計：階段 0 骨架 → 階段 1 核心記帳 MVP → 階段 2 入帳日引擎＋信用卡 → 階段 3 台股現股模組 → 階段 4 GAS 股價同步 → 階段 5 收支報表（月份導航、分類 Donut＋排名、近 6 個月趨勢；`monthlySummary` 同步納入轉帳手續費以維持與首頁口徑一致）。

**2026-07-03 重大轉向＋完成**：因發票自動抓取需求（財政部 API 個人無法申請），技術棧解鎖改用 **Firebase**（Auth＋Firestore 取代 Dexie 與未實作的 Drive 同步），完整決策與階段計畫見 `docs/07-firebase-migration.md`。**階段 6A（M0–M3）已於同日完成並驗證**：登入＋rules、資料遷移、全站讀寫切換、Dexie 移除、離線與雙裝置同步皆通過。

**階段 6B（發票爬蟲）已於 2026-07-04 完成**：本機 Python（Playwright＋ddddocr 辨識驗證碼）登入財政部整合服務平台，抓最近 7 天載具發票含品項明細，firebase-admin 走 **gcloud ADC（keyless；組織政策禁下載 service account 金鑰）** upsert 到 `users/{uid}/invoices`。scraper 在 repo 外 `CLAUDE工作區\atomcoins-scraper\`（`.env`／金鑰不進版控）。實測 API 合約與踩坑見 `docs/07 §6B 實作結果`。剩餘驗證（冪等、歸帳保護）待補。

**階段 6C（載具匣 UI）已於 2026-07-05 完成**：發票分頁（未歸帳／已處理切換、同步條顯示 `scraperStatus`）、歸帳（帶入 TransactionForm、`writeBatch` 雙向 ref、拆帳自動湊回發票原額）、取消歸帳、略過／復原、手動新增；順修記帳／歸帳表單長內容截斷（scroll body `min-h-0`＋桌面容器 `lg:h-[88vh]`）。爬蟲手動同步用 `atomcoins-scraper\同步發票.bat`、每日自動用 Windows 工作排程器（`Register-ScheduledTask`，僅登入時執行＋錯過補跑）。實作結果見 `docs/07 §6C 實作結果`。

**健檢修復計畫（docs/08）批次 1–7 已於 2026-07-18 全部完成並實測通過**：資料一致性（`replaceTransactionGroup` 原子重建、發票 ref 保護、`unrecordInvoice` 刪帳退票）、寫入錯誤處理（`useAsyncAction`＋`settle` 4 秒離線容忍，方案 B）、拆帳明細逐列展開、資料層防呆（分期期數／週期壞資料隔離／同日買先於賣）、UX 修正（略過回饋、空報表、側欄身分、遮比例、備註常駐、分頁 URL）、`ConfirmSheet`＋`useConfirm` 全面取代 `window.confirm/alert`、低嚴重度打磨。

**階段 7 已於 2026-07-19 完成並實測通過**：① 備份匯出（`lib/backup.js`：JSON 全量 14 collections＋交易 CSV 拆帳逐列展開、UTF-8 BOM、差額補列；只匯出不做還原）② 深淺主題（`index.css` 深色 token 覆蓋＋`lib/theme.js` 淺/深/跟隨系統三段、localStorage per-device、index.html 防閃爍 script、meta theme-color 連動）③ 通知擴充（`lib/notifications.js`：信用卡繳費提醒 `dueCardPayments`（7 天內／逾期、比對 `creditCardStatements.isPaid`）＋交割缺口 `settlementShortfalls`；首頁鈴鐺 `NotificationsSheet` 三節合併＋跳轉；不做系統推播）④ PWA（manifest `shortcuts` 記一筆／發票匣＋`useInstallPrompt` 安裝區塊）。

**功能擴充計畫（docs/09）批次 1–6 已於 2026-07-21 完成，程式碼冒煙測試通過（build×6 綠燈、lint 乾淨、全站空資料渲染無 console 錯誤），核心功能待登入實機驗收**：① 搜尋篩選（`lib/search.js` 純函式＋`SearchPanel`，跨月 client-side filter）＋淨資產每日快照 6a（`hooks/useNetWorth` 抽首頁口徑、`hooks/useDailySnapshot` 掛 AppLayout 寫 `netWorthSnapshots`）② 交易範本（`templates` collection、TransactionForm 存為範本／範本 chips／`stateFromTemplate`、SettingsPage 管理）③ 商家欄位＋別名（`lib/merchant.js` `resolveMerchant`／`merchantStats`、`merchantAliases` collection、TransactionForm 商家列、InvoiceRow／TransactionRow 顯示別名、FlowReport 商家排行、CSV 加商家欄）④ 年度報表（engine `categoryStatsRange`／`yearlySummary`、FlowReport 月/年 segment）⑤ 日曆檢視＋年度熱力圖（`CalendarView`、`YearHeatmap`、engine `dailyExpenseTotals`、format `formatWan`、date `WEEKDAYS` export）⑥ 淨資產趨勢圖（ReportsPage `assets` tab、`AssetsReport` SVG 折線）。**批次 7（Web Push／Cloud Functions）本輪未做，另開 session**（探勘結論存計畫檔）。

**2026-07-21 批次 1–6 後追加 4 項調整（已完成、build/lint/空資料冒煙通過，待實機驗收）**：① 發票明細（已歸帳可展開品項＋查看記帳、歸帳把品項摘要寫入交易備註）＋手動發票編輯/刪除入口（`InvoiceRow` 鉛筆鈕→`InvoiceEditSheet`）② 設定頁二層級（`SettingsPage` menu→subsection，仿 CoTravel）③ 帳戶刪除（`repo.deleteAccountCascade` 連同引用交易/股票/帳單/分期一起刪＋清參照，`AccountEditSheet` 刪除鈕）④ 證券帳戶期初持股（`engine.stockPostings` 對 `isOpening` 回空不扣現金，`AccountEditSheet` 新增證券時填已持有證券建 isOpening buy）。詳見 docs/09「後續調整」。

**待辦**：docs/09 批次 1–6 登入實機驗收（搜尋結果、範本存取、別名解析與排行、日曆/趨勢帶資料、快照寫入）＋批次 7 Web Push；CSV 發票匯入（延後待財政部真實 CSV 樣本）；**部署**——尚未部署過任何版本：GitHub 上無 AtomCoins repo、`hfuhsu108.github.io/AtomCoins/` 404（2026-07-19 查證；早期「線上為舊 Dexie build」的記載有誤），屆時建 public repo＋Pages，並補真機驗證 PWA 捷徑／iOS 安裝／通知列色。
