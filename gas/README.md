# GAS 股價同步 Proxy 部署步驟

`stockPriceProxy.gs` 是 AtomCoins 用來查 TWSE 每日收盤價的 Google Apps Script web app。
它只做「查 TWSE OpenAPI → 依 symbols 篩選 → 回 JSON」，不接觸任何其他資料來源（不含 Notion）。

## 部署

1. 開 https://script.google.com/ → 新增專案。
2. 刪掉預設 `Code.gs` 內容，貼上本資料夾 `stockPriceProxy.gs` 全部內容。
3. 專案命名（例如「AtomCoins 股價 Proxy」）。
4. 右上「部署」→「新增部署作業」→ 類型選「網頁應用程式」：
   - 執行身分：**我**
   - 具有存取權的使用者：**任何人**
5. 部署完成後複製結尾為 `/exec` 的網址（`https://script.google.com/macros/s/xxx/exec`）。
6. 貼到 `src/lib/priceSync.js` 的 `GAS_STOCK_PROXY_URL` 常數，重新 build／部署 AtomCoins。
   （網址已寫死於原始碼，非機密，見 `CLAUDE.md`「環境／機密值」的例外說明。）

## 呼叫方式與回傳格式

```
GET {url}?symbols=2330,0050
```

```json
{ "prices": [{ "symbol": "2330", "name": "台積電", "closePrice": 950, "priceDate": "2026-07-01" }] }
```

失敗時回傳 `{ "error": "..." }`，常見情況：

| 情況 | error 訊息 |
|---|---|
| 未帶 `symbols` 或為空 | `缺少 symbols 參數` |
| `symbols` 超過 `MAX_SYMBOLS`（預設 50） | `一次最多查詢 50 檔` |
| 觸發頻率限制（預設每分鐘 20 次／每日 300 次） | `請求過於頻繁，稍後再試` |
| TWSE 上游回應非 200 | `TWSE 回應異常（HTTP xxx）` |

## 已知限制

- 資料源為 TWSE OpenAPI（`openapi.twse.com.tw`），只涵蓋**上市**證券；上櫃（TPEx）個股不在此範圍。
- 非交易日（假日）呼叫會回傳最近一個交易日的收盤價——這是 TWSE 資料本身的行為，非本腳本邏輯。
- 之後修改程式碼需回到 script.google.com 貼上新版本，並在「管理部署作業」建立新版本才會生效（`/exec` 網址本身不變，AtomCoins 端不用跟著改）。
- `MAX_SYMBOLS`／頻率限制數字寫在 `stockPriceProxy.gs` 頂部，可依需要調整。頻率限制用 `CacheService` 實作，是 best-effort（Google 不保證精確過期時間），足以擋掉迴圈式濫用，但不是嚴格保證。
- 網址已刻意寫死於 AtomCoins 原始碼、公開曝光（見上）。上述限制是「曝光後降低被濫用傷害」的防線，不是機密防護；若額度真的被打爆，重新部署一個新版本（新 `/exec` 網址）、更新 `GAS_STOCK_PROXY_URL` 常數即可恢復。
