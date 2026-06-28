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
| **6** | 發票載具匣（載具匯入/手動新增、歸帳拆帳）＋ 範本 | Invoice、Template |
| **7** | Google 同步、備份/還原、CSV、PWA 安裝/捷徑、主題、通知 | Settings 擴充 |
| 保留 | 預算 | Budget |

**關鍵相依**：股票(階段3)依賴入帳日引擎(階段2)；信用卡與股票共用同一套 `postingDate` 引擎，務必先建立。代墊/AA 的 `linkGroupId` 在階段1 即會用到（見 `06-open-questions.md`）。
