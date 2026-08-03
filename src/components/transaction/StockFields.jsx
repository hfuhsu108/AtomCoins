import { useState, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronDown,
  faCalendarDays,
  faTriangleExclamation,
  faPercent,
  faCheck,
} from '@fortawesome/free-solid-svg-icons'
import { useCollection } from '../../db/DataProvider'
import { calcFee, calcTax, buyCashAmount, sellCashAmount, settlementDate as calcSettlementDate, computeHoldings } from '../../lib/stock'
import { availableForSettlement } from '../../lib/engine'
import { formatNumber } from '../../lib/format'
import { todayStr, formatMd } from '../../lib/date'
import AccountPicker from './AccountPicker'
import Sheet from '../Sheet'
import DateInput from '../DateInput'

// 配息（side='dividend'）沿用同一組欄位，語義平移：
//   tradeDate=除權息日、settlementDate=發放日、shares=配股股數、fee=匯費、tax=補充保費。
// price 固定 0（配股成本為 0，正是台股「股數增加、總成本不變」的算法）。
export function initStockState(stx, accounts) {
  if (stx) {
    return {
      side: stx.side ?? 'buy',
      securitiesAccountId: stx.securitiesAccountId ?? null,
      symbol: stx.symbol ?? '',
      name: stx.name ?? '',
      instrumentType: stx.instrumentType ?? 'stock',
      shares: stx.shares != null ? String(stx.shares) : '',
      price: stx.price != null ? String(stx.price) : '',
      brokerId: stx.brokerId ?? null,
      settlementBankId: stx.settlementBankId ?? null,
      tradeDate: stx.tradeDate ?? todayStr(),
      settlementDate: stx.settlementDate ?? '',
      cashPerShare: stx.cashPerShare != null ? String(stx.cashPerShare) : '',
      cashAmount: stx.cashAmount != null ? String(stx.cashAmount) : '',
      // 配息的匯費/補充保費就存在 fee/tax，編輯時要回填成覆寫值才不會被當成「未填→自動算」
      feeOverride: stx.side === 'dividend' && stx.fee != null ? String(stx.fee) : '',
      taxOverride: stx.side === 'dividend' && stx.tax != null ? String(stx.tax) : '',
      note: stx.note ?? '',
    }
  }
  const secAcct = accounts.find((a) => a.type === 'securities' && !a.isArchived)
  return {
    side: 'buy',
    securitiesAccountId: secAcct?.id ?? null,
    symbol: '',
    name: '',
    instrumentType: 'stock',
    shares: '',
    price: '',
    brokerId: secAcct?.defaultBrokerId ?? null,
    settlementBankId: secAcct?.defaultSettlementBankId ?? null,
    tradeDate: todayStr(),
    settlementDate: calcSettlementDate(todayStr()),
    cashPerShare: '',
    cashAmount: '',
    feeOverride: '',
    taxOverride: '',
    note: '',
  }
}

// 呼叫端仍傳 accounts prop，但已與 store 同源、此處不再解構使用；M3 收尾時連呼叫端一併清
export default function StockFields({ state, setState }) {
  const accounts = useCollection('accounts')
  const brokers = useCollection('brokers')
  const allTxns = useCollection('transactions')
  const stockTxns = useCollection('stockTransactions')

  const [picker, setPicker] = useState(null) // 'securities' | 'bank' | 'broker'

  const set = (patch) => {
    setState((s) => {
      const next = { ...s, ...patch }
      // 換證券戶時帶入預設值
      if (patch.securitiesAccountId && patch.securitiesAccountId !== s.securitiesAccountId) {
        const acct = accounts.find((a) => a.id === patch.securitiesAccountId)
        if (acct) {
          if (acct.defaultBrokerId) next.brokerId = acct.defaultBrokerId
          if (acct.defaultSettlementBankId) next.settlementBankId = acct.defaultSettlementBankId
        }
      }
      // 改成交日自動重算交割日。配息的「發放日」與除息日沒有 T+2 關係，不可自動推算。
      if (patch.tradeDate && patch.tradeDate !== s.tradeDate && next.side !== 'dividend') {
        next.settlementDate = calcSettlementDate(patch.tradeDate)
      }
      // 切換買賣/配息：買賣的交割日回到 T+2，配息的發放日清空要求自填
      if (patch.side && patch.side !== s.side) {
        next.settlementDate = patch.side === 'dividend' ? '' : calcSettlementDate(next.tradeDate)
      }
      // 配息：每股股利／標的／除息日任一改變時，就地回推現金股利總額與股名。
      // 就地算而非用 render 期的 heldShares——後者慢一個 render，剛改完標的會用到上一檔的持股數。
      // 使用者直接改總額（patch 帶 cashAmount）時不覆蓋，手動值優先。
      if (
        next.side === 'dividend' &&
        !('cashAmount' in patch) &&
        ['cashPerShare', 'symbol', 'securitiesAccountId', 'tradeDate', 'side'].some((k) => k in patch)
      ) {
        const held = computeHoldings(stockTxns, [], { asOf: next.tradeDate }).holdings.find(
          (h) => h.securitiesAccountId === next.securitiesAccountId && h.symbol === next.symbol,
        )
        const per = parseFloat(next.cashPerShare) || 0
        if (per > 0 && held?.shares > 0) next.cashAmount = String(Math.round(per * held.shares))
        if (!next.name && held?.name) next.name = held.name
      }
      return next
    })
  }

  const s = state
  const isDividend = s.side === 'dividend'
  const broker = brokers.find((b) => b.id === s.brokerId)
  const secAcct = accounts.find((a) => a.id === s.securitiesAccountId)
  const bankAcct = accounts.find((a) => a.id === s.settlementBankId)

  const sharesNum = parseInt(s.shares, 10) || 0
  const priceNum = parseFloat(s.price) || 0
  const gross = sharesNum * priceNum

  // 配息：fee=匯費、tax=補充保費，兩者都純手填（沒有可自動計算的費率）
  const fee = isDividend
    ? (s.feeOverride !== '' ? parseInt(s.feeOverride, 10) || 0 : 0)
    : (s.feeOverride !== '' ? parseInt(s.feeOverride, 10) || 0 : calcFee(gross, broker))
  const tax = isDividend || s.side === 'sell'
    ? (s.taxOverride !== '' ? parseInt(s.taxOverride, 10) || 0 : (isDividend ? 0 : calcTax(gross, s.instrumentType)))
    : 0
  const cashAmount = s.side === 'buy' ? buyCashAmount(gross, fee) : sellCashAmount(gross, fee, tax)

  // 配息：用除息日當下的持股股數回推現金股利總額，省去手算（可覆寫）
  const heldShares = useMemo(() => {
    if (!isDividend || !s.symbol || !s.securitiesAccountId) return 0
    const { holdings } = computeHoldings(stockTxns, [], { asOf: s.tradeDate })
    return holdings.find(
      (h) => h.securitiesAccountId === s.securitiesAccountId && h.symbol === s.symbol,
    )?.shares ?? 0
  }, [isDividend, s.symbol, s.securitiesAccountId, s.tradeDate, stockTxns])

  const perShare = parseFloat(s.cashPerShare) || 0
  const divCash = parseInt(s.cashAmount, 10) || 0
  const divNet = divCash - fee - tax

  const available = useMemo(() => {
    if (!s.settlementBankId || !s.settlementDate || s.side !== 'buy') return null
    return availableForSettlement(s.settlementBankId, accounts, allTxns, stockTxns, s.settlementDate)
  }, [s.settlementBankId, s.settlementDate, s.side, accounts, allTxns, stockTxns])

  const insufficient = available != null && s.side === 'buy' && cashAmount > 0 && cashAmount > available

  const secCandidates = accounts.filter((a) => a.type === 'securities' && !a.isArchived)
  const bankCandidates = accounts.filter((a) => (a.type === 'cash' || a.type === 'bank') && !a.isArchived)

  return (
    <div className="p-3.5 flex flex-col gap-3">
      {/* 買/賣/股利 toggle。股利用品牌藍——它既不是買也不是賣，套紅綠會誤讀成交易方向 */}
      <div className="flex gap-1.5 p-1 bg-surface-alt rounded-modal">
        {[
          { id: 'buy', label: '買進', active: 'bg-[var(--color-stock-buy)] text-white' },
          { id: 'sell', label: '賣出', active: 'bg-[var(--color-stock-sell)] text-white' },
          { id: 'dividend', label: '股利', active: 'bg-brand text-white' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => set({ side: t.id })}
            className={`flex-1 py-2 rounded-btn text-[13px] font-semibold ${
              s.side === t.id ? t.active : 'text-text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 證券帳戶 */}
      <RowButton
        label="證券帳戶"
        value={secAcct?.name ?? '選擇帳戶'}
        onClick={() => setPicker('securities')}
      />

      {/* 代號 + 名稱 */}
      <div className="flex gap-3">
        <div className="flex-1">
          <div className="text-[13px] text-text-secondary mb-1.5">股票代號</div>
          <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal">
            <input
              value={s.symbol}
              onChange={(e) => set({ symbol: e.target.value.trim() })}
              placeholder="例如 2330"
              className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary"
            />
          </div>
        </div>
        <div className="flex-1">
          <div className="text-[13px] text-text-secondary mb-1.5">股名（選填）</div>
          <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal">
            <input
              value={s.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="例如 台積電"
              className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary"
            />
          </div>
        </div>
      </div>

      {/* 股/ETF toggle（僅買賣；配息不寫 instrumentType，免得把 ETF 的持股類別覆寫成股票） */}
      {!isDividend && (
        <div className="flex gap-1.5 p-1 bg-surface-alt rounded-modal">
          {[
            { id: 'stock', label: '股票' },
            { id: 'etf', label: 'ETF' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => set({ instrumentType: t.id })}
              className={`flex-1 py-2 rounded-btn text-[13px] font-semibold ${
                s.instrumentType === t.id ? 'bg-surface text-text-primary shadow-segment' : 'text-text-secondary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {isDividend ? (
        <>
          {/* 每股現金股利 + 配股股數 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="text-[13px] text-text-secondary mb-1.5">每股現金股利</div>
              <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal">
                <input
                  inputMode="decimal"
                  value={s.cashPerShare}
                  onChange={(e) => set({ cashPerShare: e.target.value.replace(/[^0-9.]/g, '') })}
                  placeholder="例如 3.5"
                  className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary tabular-nums"
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[13px] text-text-secondary mb-1.5">配股股數（選填）</div>
              <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal">
                <input
                  inputMode="numeric"
                  value={s.shares}
                  onChange={(e) => set({ shares: e.target.value.replace(/[^0-9]/g, '') })}
                  placeholder="0"
                  className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* 現金股利總額：預設由「每股 × 除息日持股」回推，可覆寫 */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[13px] text-text-secondary">現金股利總額</span>
              {heldShares > 0 && (
                <span className="text-[11px] text-text-tertiary tabular-nums">
                  除息日持股 {formatNumber(heldShares)} 股
                </span>
              )}
            </div>
            <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal flex items-center gap-1 text-[15px] tabular-nums">
              <span className="text-text-tertiary text-sm">NT$</span>
              <input
                inputMode="numeric"
                value={s.cashAmount}
                onChange={(e) => set({ cashAmount: e.target.value.replace(/[^0-9]/g, '') })}
                placeholder="0"
                className="w-full outline-none bg-transparent placeholder:text-text-tertiary"
              />
            </div>
            {perShare > 0 && heldShares > 0 && (
              <p className="text-[11px] text-text-tertiary mt-1 px-1">
                已依 {formatNumber(perShare, 2)} × {formatNumber(heldShares)} 股帶入，與券商通知不符時可直接改。
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          {/* 股數 + 成交價 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="text-[13px] text-text-secondary mb-1.5">股數</div>
              <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal">
                <input
                  inputMode="numeric"
                  value={s.shares}
                  onChange={(e) => set({ shares: e.target.value.replace(/[^0-9]/g, '') })}
                  placeholder="1000"
                  className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary tabular-nums"
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[13px] text-text-secondary mb-1.5">成交價</div>
              <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal">
                <input
                  inputMode="decimal"
                  value={s.price}
                  onChange={(e) => set({ price: e.target.value.replace(/[^0-9.]/g, '') })}
                  placeholder="600"
                  className="w-full text-[15px] outline-none bg-transparent placeholder:text-text-tertiary tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* 券商 */}
          <RowButton
            label="券商"
            value={broker ? `${broker.name}（${broker.feeDiscount < 1 ? `${+(broker.feeDiscount * 10).toFixed(2)} 折` : '不折'}）` : '選擇券商'}
            onClick={() => setPicker('broker')}
          />
        </>
      )}

      {/* 交割銀行 / 股利入帳銀行 */}
      <RowButton
        label={isDividend ? '入帳銀行' : '交割銀行'}
        value={bankAcct?.name ?? '選擇帳戶'}
        onClick={() => setPicker('bank')}
      />

      {/* 成交日 + 交割日（配息：除息日 + 發放日） */}
      <div className="flex gap-3">
        <div className="flex-1">
          <div className="text-[13px] text-text-secondary mb-1.5">{isDividend ? '除權息日' : '成交日'}</div>
          <label className="relative px-3.5 py-2.5 bg-surface border border-line rounded-modal flex items-center gap-1.5 cursor-pointer">
            <FontAwesomeIcon icon={faCalendarDays} className="text-text-secondary text-xs" />
            <span className="text-[15px]">{formatMd(s.tradeDate)}</span>
            <DateInput
              value={s.tradeDate}
              onChange={(e) => e.target.value && set({ tradeDate: e.target.value })}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>
        <div className="flex-1">
          <div className="text-[13px] text-text-secondary mb-1.5">{isDividend ? '發放日' : '交割日（T+2）'}</div>
          <label className="relative px-3.5 py-2.5 bg-surface border border-line rounded-modal flex items-center gap-1.5 cursor-pointer">
            <FontAwesomeIcon icon={faCalendarDays} className="text-text-secondary text-xs" />
            <span className="text-[15px]">{s.settlementDate ? formatMd(s.settlementDate) : '—'}</span>
            <DateInput
              value={s.settlementDate}
              onChange={(e) => e.target.value && set({ settlementDate: e.target.value })}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* 手續費 / 證交稅 覆寫（配息：匯費 / 二代健保補充保費，兩者皆手填） */}
      <div className="flex gap-3">
        <div className="flex-1">
          <div className="text-[13px] text-text-secondary mb-1.5">{isDividend ? '匯費' : '手續費'}</div>
          <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal flex items-center gap-1 text-[15px] tabular-nums">
            <span className="text-text-tertiary text-sm">NT$</span>
            <input
              inputMode="numeric"
              value={s.feeOverride}
              onChange={(e) => set({ feeOverride: e.target.value.replace(/[^0-9]/g, '') })}
              placeholder={isDividend ? '10' : String(calcFee(gross, broker))}
              className="w-full outline-none bg-transparent placeholder:text-text-tertiary"
            />
          </div>
        </div>
        {(isDividend || s.side === 'sell') && (
          <div className="flex-1">
            <div className="text-[13px] text-text-secondary mb-1.5">{isDividend ? '補充保費' : '證交稅'}</div>
            <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal flex items-center gap-1 text-[15px] tabular-nums">
              <span className="text-text-tertiary text-sm">NT$</span>
              <input
                inputMode="numeric"
                value={s.taxOverride}
                onChange={(e) => set({ taxOverride: e.target.value.replace(/[^0-9]/g, '') })}
                placeholder={isDividend ? '0' : String(calcTax(gross, s.instrumentType))}
                className="w-full outline-none bg-transparent placeholder:text-text-tertiary"
              />
            </div>
          </div>
        )}
      </div>

      {/* 備註 */}
      <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal">
        <input
          value={s.note}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="備註（選填）"
          className="w-full text-sm outline-none bg-transparent placeholder:text-text-tertiary"
        />
      </div>

      {/* 配息預覽：現金入帳金額與配股 */}
      {isDividend && (divCash > 0 || sharesNum > 0) && (
        <div className="p-3.5 rounded-modal border border-line bg-surface-alt">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text-secondary">現金入帳</span>
            <span className="text-lg font-bold tabular-nums text-brand">
              NT$ {formatNumber(divNet)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1 text-xs text-text-tertiary tabular-nums">
            <span>
              股利 {formatNumber(divCash)}
              {fee > 0 && ` − 匯費 ${formatNumber(fee)}`}
              {tax > 0 && ` − 補充保費 ${formatNumber(tax)}`}
            </span>
          </div>
          {sharesNum > 0 && (
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-line-light">
              <span className="text-[13px] text-text-secondary">配股</span>
              <span className="text-[13px] font-semibold tabular-nums">
                +{formatNumber(sharesNum)} 股
              </span>
            </div>
          )}
          <p className="text-[11px] text-text-tertiary mt-2 leading-relaxed">
            配股只增加股數、不增加成本，均價會隨之下降。股利不計入收支報表，只影響資產與投資報表。
          </p>
        </div>
      )}

      {/* 交割金額預覽 */}
      {!isDividend && gross > 0 && (
        <div className={`p-3.5 rounded-modal border ${insufficient ? 'border-warning-text bg-warning-bg/30' : 'border-line bg-surface-alt'}`}>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text-secondary">
              {s.side === 'buy' ? '交割扣款' : '交割入帳'}
            </span>
            <span className={`text-lg font-bold tabular-nums ${s.side === 'buy' ? 'text-[var(--color-stock-buy)]' : 'text-[var(--color-stock-sell)]'}`}>
              NT$ {formatNumber(cashAmount)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1 text-xs text-text-tertiary tabular-nums">
            <span>成交金額 {formatNumber(Math.round(gross))} + 手續費 {formatNumber(fee)}{s.side === 'sell' ? ` + 稅 ${formatNumber(tax)}` : ''}</span>
          </div>
          {s.side === 'buy' && available != null && (
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-line-light">
              <span className="text-[13px] text-text-secondary">交割日可用餘額</span>
              <span className={`text-[13px] font-semibold tabular-nums ${insufficient ? 'text-warning-text' : ''}`}>
                NT$ {formatNumber(available)}
              </span>
            </div>
          )}
          {insufficient && (
            <div className="flex items-center gap-1.5 mt-2 text-[12px] text-warning-text font-medium">
              <FontAwesomeIcon icon={faTriangleExclamation} className="text-[11px]" />
              交割銀行餘額不足，交割日前請確保足額
            </div>
          )}
        </div>
      )}

      {/* Pickers */}
      <AccountPicker
        open={picker === 'securities'}
        onClose={() => setPicker(null)}
        accounts={secCandidates}
        value={s.securitiesAccountId}
        title="選擇證券帳戶"
        onSelect={(id) => set({ securitiesAccountId: id })}
      />
      <AccountPicker
        open={picker === 'bank'}
        onClose={() => setPicker(null)}
        accounts={bankCandidates}
        value={s.settlementBankId}
        title="交割銀行"
        onSelect={(id) => set({ settlementBankId: id })}
      />
      {picker === 'broker' && (
        <BrokerPickerSheet
          brokers={brokers}
          value={s.brokerId}
          onSelect={(id) => set({ brokerId: id })}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}

export function stockCanSave(s) {
  const sharesNum = parseInt(s.shares, 10) || 0
  const priceNum = parseFloat(s.price) || 0
  // 配息：不需券商與成交價；現金股利與配股至少要有一項，否則這筆什麼也沒發生
  if (s.side === 'dividend') {
    return !!(
      s.securitiesAccountId &&
      s.symbol.trim() &&
      s.settlementBankId &&
      s.settlementDate &&
      ((parseInt(s.cashAmount, 10) || 0) > 0 || sharesNum > 0)
    )
  }
  return !!(
    s.securitiesAccountId &&
    s.symbol.trim() &&
    sharesNum > 0 &&
    priceNum > 0 &&
    s.brokerId &&
    s.settlementBankId &&
    s.settlementDate
  )
}

export function buildStockRecord(s, brokers) {
  const broker = brokers.find((b) => b.id === s.brokerId)
  const sharesNum = parseInt(s.shares, 10)
  const priceNum = parseFloat(s.price)

  // 配息：shares=配股股數（可 0）、price 固定 0（配股不增加成本）、fee=匯費、tax=補充保費。
  // instrumentType 刻意不寫——computeHoldings 會用它覆寫持股類別，配息寫死 stock 會把 ETF 標錯。
  if (s.side === 'dividend') {
    return {
      side: 'dividend',
      securitiesAccountId: s.securitiesAccountId,
      symbol: s.symbol.trim(),
      name: s.name.trim() || null,
      instrumentType: null,
      shares: sharesNum || 0,
      price: 0,
      cashPerShare: parseFloat(s.cashPerShare) || null,
      cashAmount: parseInt(s.cashAmount, 10) || 0,
      fee: s.feeOverride !== '' ? parseInt(s.feeOverride, 10) || 0 : 0,
      tax: s.taxOverride !== '' ? parseInt(s.taxOverride, 10) || 0 : 0,
      brokerId: s.brokerId ?? null,
      settlementBankId: s.settlementBankId,
      tradeDate: s.tradeDate,
      settlementDate: s.settlementDate,
      note: s.note.trim() || null,
    }
  }

  const gross = sharesNum * priceNum
  const fee = s.feeOverride !== '' ? parseInt(s.feeOverride, 10) || 0 : calcFee(gross, broker)
  const tax = s.side === 'sell'
    ? (s.taxOverride !== '' ? parseInt(s.taxOverride, 10) || 0 : calcTax(gross, s.instrumentType))
    : 0
  return {
    side: s.side,
    securitiesAccountId: s.securitiesAccountId,
    symbol: s.symbol.trim(),
    name: s.name.trim() || null,
    instrumentType: s.instrumentType,
    shares: sharesNum,
    price: priceNum,
    fee,
    tax,
    brokerId: s.brokerId,
    settlementBankId: s.settlementBankId,
    tradeDate: s.tradeDate,
    settlementDate: s.settlementDate,
    note: s.note.trim() || null,
  }
}

function RowButton({ label, value, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between px-4 py-3.5 bg-surface border border-line rounded-modal"
    >
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="flex items-center gap-2 text-[15px] font-semibold">
        {value}
        <FontAwesomeIcon icon={faChevronDown} className="text-text-tertiary text-[11px]" />
      </span>
    </button>
  )
}

function BrokerPickerSheet({ brokers, value, onSelect, onClose }) {
  return (
    <Sheet open onClose={onClose} title="選擇券商" bodyClassName="overflow-y-auto p-2">
      {brokers.map((b) => {
        const active = b.id === value
        return (
          <button
            key={b.id}
            onClick={() => { onSelect(b.id); onClose() }}
            className={`flex items-center gap-3 w-full p-3 rounded-chip text-left ${active ? 'bg-brand-light' : ''}`}
          >
            <span className="w-9 h-9 flex-none rounded-chip bg-surface-alt text-text-secondary flex items-center justify-center text-[15px]">
              <FontAwesomeIcon icon={faPercent} />
            </span>
            <span className="flex-1 min-w-0">
              <span className={`block text-[15px] ${active ? 'font-semibold text-brand' : 'font-medium'}`}>
                {b.name}
              </span>
              <span className="block text-xs text-text-tertiary">
                {b.feeDiscount < 1 ? `${+(b.feeDiscount * 10).toFixed(2)} 折` : '不折'} · 最低 {b.minFee ?? 20}
              </span>
            </span>
            {active && <FontAwesomeIcon icon={faCheck} className="text-brand text-[13px]" />}
          </button>
        )
      })}
    </Sheet>
  )
}
