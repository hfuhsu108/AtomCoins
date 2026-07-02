// AtomCoins 股價同步 Proxy（Google Apps Script Web App）
// 只做一件事：查 TWSE OpenAPI 當日收盤價，依 symbols 篩選後回傳 JSON。
// 不寫入、不讀取任何其他服務（含 Notion）；部署步驟見 gas/README.md。
//
// 網址已寫死於 AtomCoins 原始碼（公開曝光，見 CLAUDE.md「環境／機密值」），
// 以下兩道防線用來限制曝光後被外部濫用時能造成的傷害（額度濫用），非機密防護：
//  1. 不帶 symbols／超過 MAX_SYMBOLS 直接拒絕，不讓單次請求撈到全市場資料
//  2. CacheService 做的簡單頻率限制（best-effort，Google 不保證絕對準時過期，
//     但已足以擋掉迴圈式濫用）

var MAX_SYMBOLS = 50 // 個人持股不會超過此數，超過視為異常請求
var RATE_LIMIT_PER_MINUTE = 20
var RATE_LIMIT_PER_DAY = 300 // 遠低於 Google 個人帳號每日額度，留給正常使用足夠餘裕

function doGet(e) {
  try {
    if (!checkRateLimit()) {
      return respond({ error: '請求過於頻繁，稍後再試' })
    }

    var symbolsParam = ((e && e.parameter && e.parameter.symbols) || '').trim()
    var wanted = symbolsParam
      ? symbolsParam.split(',').map(function (s) { return s.trim() }).filter(Boolean)
      : []
    if (wanted.length === 0) {
      return respond({ error: '缺少 symbols 參數' })
    }
    if (wanted.length > MAX_SYMBOLS) {
      return respond({ error: '一次最多查詢 ' + MAX_SYMBOLS + ' 檔' })
    }

    var res = UrlFetchApp.fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', {
      muteHttpExceptions: true,
    })
    if (res.getResponseCode() !== 200) {
      return respond({ error: 'TWSE 回應異常（HTTP ' + res.getResponseCode() + '）' })
    }

    var all = JSON.parse(res.getContentText())
    var wantedSet = {}
    wanted.forEach(function (s) { wantedSet[s] = true })

    var prices = all
      .filter(function (row) { return wantedSet[row.Code] })
      .map(function (row) {
        return {
          symbol: row.Code,
          name: row.Name,
          closePrice: Number(row.ClosingPrice),
          priceDate: rocToIso(row.Date),
        }
      })
      .filter(function (p) { return Number.isFinite(p.closePrice) })

    return respond({ prices: prices })
  } catch (err) {
    return respond({ error: String(err) })
  }
}

// 簡單頻率限制：每分鐘／每日各一組計數器，任一超標即拒絕。
// CacheService 單次 put 上限 6 小時，故「每日」計數器靠每次呼叫時續期撐過一整天；
// 若中間有 6 小時以上無人呼叫，計數器會提早過期歸零 —— 對濫用防護而言是可接受的寬鬆邊界。
function checkRateLimit() {
  var cache = CacheService.getScriptCache()
  var now = new Date()
  var minuteKey = 'rl_min_' + Math.floor(now.getTime() / 60000)
  var dayKey = 'rl_day_' + Utilities.formatDate(now, 'Asia/Taipei', 'yyyyMMdd')

  var minuteCount = Number(cache.get(minuteKey) || '0') + 1
  var dayCount = Number(cache.get(dayKey) || '0') + 1

  cache.put(minuteKey, String(minuteCount), 120)
  cache.put(dayKey, String(dayCount), 21600)

  return minuteCount <= RATE_LIMIT_PER_MINUTE && dayCount <= RATE_LIMIT_PER_DAY
}

// 民國年日期字串（如 '1150701'）→ 西元 'YYYY-MM-DD'；年份位數不固定，故從尾端回推 MMDD。
function rocToIso(rocDate) {
  var s = String(rocDate)
  var y = Number(s.slice(0, s.length - 4)) + 1911
  var m = s.slice(-4, -2)
  var d = s.slice(-2)
  return y + '-' + m + '-' + d
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}
