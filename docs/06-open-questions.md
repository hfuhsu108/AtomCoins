# 06 — 待決事項 / 注意

1. **`linkGroupId` 加入 Transaction**（✅ 已拍板加入，2026-06-29）。用途：把同一筆消費拆出的「自己支出＋代墊應收」綁在一起，介面一起顯示（見 `03-scenarios.md` §F）。Stage 0 已於 Dexie schema 建立索引；代墊 UI 於階段 1 啟用。
2. ~~**配息（現金股利/除權息）** 保留，MVP 不做~~ → **✅ 已於 2026-08-03 實作**（`StockTransaction.side='dividend'`，見 `01-schema.md §3.9`、`02-accounting-engine.md §4.5`、`03-scenarios.md §I`）。最終做法與當初設想不同：**現金股利不回頭調整持股成本**（計為投資收益，與台股個人記帳慣例一致），只有股票股利透過「加股數、成本不變」間接拉低均價。股利不進收支統計。
3. **預算** 功能保留，暫不實作（欄位已預留）。
4. **發票 lineItems** 是否真的填入，視階段6 接的資料來源（財政部載具 API）而定；不影響主結構。
5. **iOS PWA 限制**：原生桌面 widget 無法用純 PWA 達成，改用 manifest `shortcuts`＋秒開記帳頁；推播在 iOS 有限制，通知功能於階段7 評估。
6. **Google OAuth client id** 等機密/環境值由開發者部署後填入（Settings 或環境變數），勿寫死於 repo。**例外**：GAS 股價 proxy 網址已刻意寫死於 `src/lib/priceSync.js`（2026-07-02 決策，見 `00-overview.md`「環境／機密值」——該端點僅回傳公開股價、非機密）。
