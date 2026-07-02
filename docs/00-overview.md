# 00 — 專案概述與技術決策

## 專案概述

- **產品**：原子記帳 AtomCoins，**個人自用**的理財記帳 PWA。
- **核心特色**：完整帳戶／收支記帳 ＋ 信用卡管理 ＋ **台股投資追蹤（買賣、持股、損益、T+2 交割）** ＋ 電子發票載具匣（載具匯入＋手動新增）。
- **設計哲學**：簡潔、直覺、資訊密度優先、不過度裝飾；mobile-first 並做 RWD 到桌面。
- **使用者**：開發者本人（澎湖國中理化老師，具資訊背景），單人單裝置為主、多裝置同步為輔。

## 技術棧與架構決策（皆已鎖定）

| 項目 | 決定 |
|---|---|
| 前端框架 | **React** |
| 樣式 | **Tailwind CSS** |
| 建置 | **Vite** 正式專案（非單檔 HTML），含 PWA service worker |
| 本地儲存 | **Dexie.js**（IndexedDB），local-first |
| 圖示 | **Font Awesome 6**（全站統一） |
| 字體 | **Noto Sans TC** |
| 部署 | **GitHub Pages**（靜態，子路徑 `username.github.io/repo/`） |
| 股價來源 | **TWSE 每日收盤**，經 **Google Apps Script (GAS) web app 當 proxy** 回避 CORS，回傳 JSON |
| 雲端同步 | **Google Drive `appDataFolder`**，存加密／JSON 快照，**手動備份／還原 ＋ 版本時間戳**（避免兩裝置互蓋） |
| 登入 | Google 登入（個人資料 ＋ Drive 同步授權） |
| 密碼鎖 | **不做** |
| 幣別 | **僅 TWD**；保留 `currency` 欄位，不做匯率 |
| 投資範圍 | **僅台股、僅現股**（無融資融券、當沖）；配息保留待後做 |

## 建議專案設定（可依實況調整）

- `vite.config.js` 設 `base: '/<repo-name>/'`（GitHub Pages 子路徑必要）。
- 路由建議 **HashRouter**，或用 GitHub Pages 的 `404.html` redirect 技巧解決 SPA deep-link。
- PWA：用 `vite-plugin-pwa`；`manifest.scope` 與 `start_url` 對齊子路徑；加 `shortcuts`（見 `04-ui.md` 桌面捷徑）。
- Font Awesome 6：用 `@fortawesome/fontawesome-svg-core` ＋ `@fortawesome/free-solid-svg-icons` ＋ `@fortawesome/react-fontawesome`（或 CDN）。分類圖示以 FA icon 名稱字串存在 `Category.icon`。
- 金額一律整數（元）；顯示時加千分位與 `NT$`。

## GitHub Pages 注意事項

- 純靜態 SPA：所有後端動作（股價、Drive）走前端 fetch / OAuth。
- 股價 proxy 為獨立部署的 GAS web app，前端以其 `/exec` URL 呼叫；GAS 端需回正確 CORS/JSON。GAS endpoint URL 由開發者部署後填入設定。

## 環境／機密值

- **Google OAuth client id** 等機密／環境值由開發者部署後填入（Settings 或環境變數），**勿寫死於 repo**。
- **例外**：GAS 股價 proxy 網址已刻意寫死於 `src/lib/priceSync.js`（`GAS_STOCK_PROXY_URL`）。個人自用單裝置為主，換取免填 Settings 的便利；該端點 `Access:Anyone`、僅回傳公開股價，非機密，唯一風險是額度可能被外部濫用（可重新部署換網址因應）。
