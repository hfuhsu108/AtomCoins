// 台股現股計算（docs/01 §3.8-3.11、docs/02 §4.1-4.3、docs/03 §H）。皆為純函式。
//
// 三大重點落地：
//  - 交割＝延後入帳：交割金額於 settlementDate 影響「交割銀行」，複用 engine 的 postingDate 引擎
//  - 本金不進收支：股票買賣不是 expense/income，損益走獨立投資報表
//  - 移動加權平均成本，賣出只減股數、不動 avgCost；已實現損益執行期重算（不落地）
import { parseDate, todayStr } from './date'
import { dividendNetAmount } from './engine'

// 證券交易稅率與手續費費率（現股）
export const FEE_RATE = 0.001425 // 手續費率（未折）
export const TAX_RATE_STOCK = 0.003 // 一般股票證交稅
export const TAX_RATE_ETF = 0.001 // ETF 證交稅
export const DEFAULT_MIN_FEE = 20

// 手續費 = max(minFee, floor(成交金額 × 0.001425 × feeDiscount))。broker 缺省時不折、最低 20。
export function calcFee(gross, broker) {
  const discount = broker?.feeDiscount ?? 1
  const minFee = broker?.minFee ?? DEFAULT_MIN_FEE
  const raw = Math.floor(gross * FEE_RATE * discount)
  return Math.max(minFee, raw)
}

// 證交稅（僅賣出計，買進為 0）= floor(成交金額 × 稅率)。caller 自行判斷 side。
export function calcTax(gross, instrumentType) {
  const rate = instrumentType === 'etf' ? TAX_RATE_ETF : TAX_RATE_STOCK
  return Math.floor(gross * rate)
}

// 買進交割金額（交割日從交割銀行扣）= round(成交金額) + 手續費
export function buyCashAmount(gross, fee) {
  return Math.round(gross) + fee
}

// 賣出交割金額（交割日入交割銀行）= round(成交金額) − 手續費 − 證交稅
export function sellCashAmount(gross, fee, tax) {
  return Math.round(gross) - fee - tax
}

// 日期往後加 n 個營業日（跳週六日）。不含國定假日 —— 連假需手動改交割日。
export function addBusinessDays(dateStr, n) {
  let d = dateStr
  let added = 0
  while (added < n) {
    const next = parseDate(d)
    next.setDate(next.getDate() + 1)
    d = todayStr(next)
    const dow = next.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return d
}

// 交割日 = 成交日 + 2 個營業日（T+2）
export function settlementDate(tradeDate, n = 2) {
  return addBusinessDays(tradeDate, n)
}

// 由股價快取陣列建 symbol → 收盤價 map
function priceMap(prices) {
  const m = {}
  for (const p of prices ?? []) m[p.symbol] = p
  return m
}

// 同日處理順序：買進 → 配息 → 賣出。配息夾在中間，是因為配股會拉低均價，
// 同日賣出必須用「已含配股」的成本計算已實現損益。
const SIDE_ORDER = { buy: 0, dividend: 1, sell: 2 }

// 持股即時計算（docs/01 §3.10，不落地）。重播所有 stockTransactions：
//  - 鍵 = securitiesAccountId + symbol（多券商同股分開算）
//  - 移動加權平均：買進更新 avgCost（含買進手續費入成本）；賣出只減股數、不動 avgCost
//  - 配息：現金股利只累計不動成本；股票股利加股數、總成本不變 → 均價自動下降（台股口徑）
//  - 已實現損益於賣出當下用「當時 avgCost」算，故須依 tradeDate→side→createdAt 順序重播
// asOf（'YYYY-MM-DD'，預設今天）以 tradeDate ≤ asOf 過濾 —— 成交日基準（買賣當下即進/出持股，
// 配息則為除權息日當下即除權）。
// 回傳 { holdings, realized, dividends }。
export function computeHoldings(stockTxns, prices, { asOf = todayStr() } = {}) {
  const pm = priceMap(prices)
  const sorted = (stockTxns ?? [])
    .filter((s) => !asOf || s.tradeDate <= asOf)
    .slice()
    .sort((a, b) => {
      if (a.tradeDate !== b.tradeDate) return a.tradeDate < b.tradeDate ? -1 : 1
      // 同日依 SIDE_ORDER：補登交易 createdAt 反序時，避免賣出先於買進處理造成 avgCost=0、已實現損益全額錯算
      if (a.side !== b.side) return (SIDE_ORDER[a.side] ?? 0) - (SIDE_ORDER[b.side] ?? 0)
      return (a.createdAt ?? '') < (b.createdAt ?? '') ? -1 : 1
    })

  const lots = new Map() // key → { securitiesAccountId, symbol, name, instrumentType, shares, costBasis, cashDividend }
  const realized = []
  const dividends = []

  for (const s of sorted) {
    const key = `${s.securitiesAccountId}__${s.symbol}`
    let lot = lots.get(key)
    if (!lot) {
      lot = {
        securitiesAccountId: s.securitiesAccountId,
        symbol: s.symbol,
        name: s.name ?? s.symbol,
        instrumentType: s.instrumentType ?? 'stock',
        shares: 0,
        costBasis: 0,
        cashDividend: 0,
      }
      lots.set(key, lot)
    }
    // 名稱/類別以最新一筆為準（事後補股名時生效）
    if (s.name) lot.name = s.name
    if (s.instrumentType) lot.instrumentType = s.instrumentType

    if (s.side === 'dividend') {
      const cash = dividendNetAmount(s)
      const granted = s.shares ?? 0
      // 配股：股數增加、costBasis 不動 → 均價自動下降。現金股利不調整成本，另計為投資收益。
      lot.shares += granted
      lot.cashDividend += cash
      dividends.push({
        stxId: s.id,
        securitiesAccountId: s.securitiesAccountId,
        symbol: s.symbol,
        name: lot.name,
        exDate: s.tradeDate,
        date: s.settlementDate ?? s.tradeDate, // 發放日：年度歸屬與現金入帳同一天
        cash,
        shares: granted,
      })
      continue
    }

    const gross = s.shares * s.price
    if (s.side === 'buy') {
      lot.costBasis += Math.round(gross) + (s.fee ?? 0)
      lot.shares += s.shares
    } else {
      const avgCost = lot.shares > 0 ? lot.costBasis / lot.shares : 0
      const costOfSold = avgCost * s.shares
      const proceeds = Math.round(gross) - (s.fee ?? 0) - (s.tax ?? 0)
      realized.push({
        stxId: s.id,
        securitiesAccountId: s.securitiesAccountId,
        symbol: s.symbol,
        name: lot.name,
        date: s.tradeDate,
        shares: s.shares,
        proceeds,
        cost: Math.round(costOfSold),
        pnl: Math.round(proceeds - costOfSold),
      })
      lot.costBasis -= costOfSold // avgCost 不變
      lot.shares -= s.shares
    }
  }

  const holdings = []
  for (const lot of lots.values()) {
    if (lot.shares <= 0) continue
    const avgCost = lot.costBasis / lot.shares
    const rec = pm[lot.symbol]
    const hasPrice = !!rec && rec.closePrice != null
    const price = hasPrice ? rec.closePrice : null
    const marketValue = hasPrice ? Math.round(price * lot.shares) : Math.round(lot.costBasis)
    const unrealizedPnl = hasPrice ? Math.round(price * lot.shares - lot.costBasis) : null
    const returnPct =
      hasPrice && lot.costBasis > 0 ? ((price * lot.shares - lot.costBasis) / lot.costBasis) * 100 : null
    holdings.push({
      securitiesAccountId: lot.securitiesAccountId,
      symbol: lot.symbol,
      name: lot.name,
      instrumentType: lot.instrumentType,
      shares: lot.shares,
      avgCost,
      costBasis: Math.round(lot.costBasis),
      cashDividend: Math.round(lot.cashDividend),
      hasPrice,
      price,
      priceDate: hasPrice ? rec.priceDate : null,
      marketValue,
      unrealizedPnl,
      returnPct,
    })
  }
  holdings.sort((a, b) => (a.symbol < b.symbol ? -1 : 1))

  return { holdings, realized, dividends }
}

// 持股總市值（無現價者以成本價計），供 netWorth 與首頁投資組成
export function holdingsMarketValue(holdings) {
  return (holdings ?? []).reduce((s, h) => s + h.marketValue, 0)
}
