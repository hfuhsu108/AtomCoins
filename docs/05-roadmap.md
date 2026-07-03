# 05 — 分階段開發路線

| 階段 | 內容 | 用到的 entity |
|---|---|---|
| **0** | 資料模型定稿 ＋ PWA/RWD 骨架（Vite＋React＋Tailwind＋Dexie＋service worker＋路由＋底部導覽） | — |
| **1** | 核心記帳 MVP（帳戶、5 型交易、分類、轉帳、拆帳、餘額、明細列表/編輯、首頁） | Account、Category、Tag、Project、Counterparty、Transaction、Settings |
| **2** | 入帳日引擎 ＋ 信用卡（延後入帳、對帳、帳單、分期、週期性收支） | CreditCardStatement、InstallmentPlan、RecurringRule |
| **3** | 股票模組（交易、持股即時計算、T+2 交割、交割銀行檢查） | Broker、StockTransaction |
| **4** | 股價同步（GAS proxy）＋ 淨資產/投資報表 | StockPrice |
| **5** | 基礎報表（月收支統計/分類圓餅/趨勢柱狀） | （純查詢） |
| **5+** | **保留**：進階報表（多維度/投資專屬/淨資產趨勢/自訂報表） | （純查詢） |
| **6A** | **雲端化遷移**（Firebase Auth＋Firestore 取代 Dexie 與原 Drive 同步方案；細分 M0–M3，見 `07-firebase-migration.md`） | 全 entity |
| **6B** | 發票爬蟲（repo 外本機 Python＋firebase-admin，每日自動抓載具發票；見 `07 §6B`） | Invoice |
| **6C** | 發票載具匣 UI（歸帳/略過/手動新增/CSV 匯入備援、歸帳拆帳）＋ 範本（見 `07 §6C`） | Invoice、Template |
| **7** | 備份匯出（CSV/JSON）、PWA 安裝/捷徑、主題、通知（原 Google Drive 同步已由 6A Firestore 取代） | Settings 擴充 |
| 保留 | 預算 | Budget |

**關鍵相依**：股票(階段3)依賴入帳日引擎(階段2)；信用卡與股票共用同一套 `postingDate` 引擎，務必先建立。代墊/AA 的 `linkGroupId` 在階段1 即會用到（見 `06-open-questions.md`）。
