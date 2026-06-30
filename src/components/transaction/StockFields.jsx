import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronDown,
  faCalendarDays,
  faTriangleExclamation,
  faPercent,
  faCheck,
} from '@fortawesome/free-solid-svg-icons'
import { db } from '../../db'
import { calcFee, calcTax, buyCashAmount, sellCashAmount, settlementDate as calcSettlementDate } from '../../lib/stock'
import { availableForSettlement } from '../../lib/engine'
import { formatNumber } from '../../lib/format'
import { todayStr, formatMd } from '../../lib/date'
import AccountPicker from './AccountPicker'
import Sheet from '../Sheet'

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
      feeOverride: '',
      taxOverride: '',
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
    feeOverride: '',
    taxOverride: '',
    note: '',
  }
}

export default function StockFields({ state, setState, accounts: parentAccounts }) {
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], parentAccounts ?? [])
  const brokers = useLiveQuery(() => db.brokers.toArray(), [], [])
  const allTxns = useLiveQuery(() => db.transactions.toArray(), [], [])
  const stockTxns = useLiveQuery(() => db.stockTransactions.toArray(), [], [])

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
      // 改成交日自動重算交割日
      if (patch.tradeDate && patch.tradeDate !== s.tradeDate) {
        next.settlementDate = calcSettlementDate(patch.tradeDate)
      }
      return next
    })
  }

  const s = state
  const broker = brokers.find((b) => b.id === s.brokerId)
  const secAcct = accounts.find((a) => a.id === s.securitiesAccountId)
  const bankAcct = accounts.find((a) => a.id === s.settlementBankId)

  const sharesNum = parseInt(s.shares, 10) || 0
  const priceNum = parseFloat(s.price) || 0
  const gross = sharesNum * priceNum

  const fee = s.feeOverride !== '' ? parseInt(s.feeOverride, 10) || 0 : calcFee(gross, broker)
  const tax = s.side === 'sell'
    ? (s.taxOverride !== '' ? parseInt(s.taxOverride, 10) || 0 : calcTax(gross, s.instrumentType))
    : 0
  const cashAmount = s.side === 'buy' ? buyCashAmount(gross, fee) : sellCashAmount(gross, fee, tax)

  const available = useMemo(() => {
    if (!s.settlementBankId || !s.settlementDate || s.side !== 'buy') return null
    return availableForSettlement(s.settlementBankId, accounts, allTxns, stockTxns, s.settlementDate)
  }, [s.settlementBankId, s.settlementDate, s.side, accounts, allTxns, stockTxns])

  const insufficient = available != null && s.side === 'buy' && cashAmount > 0 && cashAmount > available

  const secCandidates = accounts.filter((a) => a.type === 'securities' && !a.isArchived)
  const bankCandidates = accounts.filter((a) => (a.type === 'cash' || a.type === 'bank') && !a.isArchived)

  return (
    <div className="p-3.5 flex flex-col gap-3">
      {/* 買/賣 toggle */}
      <div className="flex gap-1.5 p-1 bg-surface-alt rounded-modal">
        {['buy', 'sell'].map((side) => (
          <button
            key={side}
            onClick={() => set({ side })}
            className={`flex-1 py-2 rounded-btn text-[13px] font-semibold ${
              s.side === side
                ? side === 'buy'
                  ? 'bg-[var(--color-stock-buy)] text-white'
                  : 'bg-[var(--color-stock-sell)] text-white'
                : 'text-text-secondary'
            }`}
          >
            {side === 'buy' ? '買進' : '賣出'}
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

      {/* 股/ETF toggle */}
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

      {/* 交割銀行 */}
      <RowButton
        label="交割銀行"
        value={bankAcct?.name ?? '選擇帳戶'}
        onClick={() => setPicker('bank')}
      />

      {/* 成交日 + 交割日 */}
      <div className="flex gap-3">
        <div className="flex-1">
          <div className="text-[13px] text-text-secondary mb-1.5">成交日</div>
          <label className="relative px-3.5 py-2.5 bg-surface border border-line rounded-modal flex items-center gap-1.5 cursor-pointer">
            <FontAwesomeIcon icon={faCalendarDays} className="text-text-secondary text-xs" />
            <span className="text-[15px]">{formatMd(s.tradeDate)}</span>
            <input
              type="date"
              value={s.tradeDate}
              onChange={(e) => e.target.value && set({ tradeDate: e.target.value })}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>
        <div className="flex-1">
          <div className="text-[13px] text-text-secondary mb-1.5">交割日（T+2）</div>
          <label className="relative px-3.5 py-2.5 bg-surface border border-line rounded-modal flex items-center gap-1.5 cursor-pointer">
            <FontAwesomeIcon icon={faCalendarDays} className="text-text-secondary text-xs" />
            <span className="text-[15px]">{s.settlementDate ? formatMd(s.settlementDate) : '—'}</span>
            <input
              type="date"
              value={s.settlementDate}
              onChange={(e) => e.target.value && set({ settlementDate: e.target.value })}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* 手續費 / 證交稅 覆寫 */}
      <div className="flex gap-3">
        <div className="flex-1">
          <div className="text-[13px] text-text-secondary mb-1.5">手續費</div>
          <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal flex items-center gap-1 text-[15px] tabular-nums">
            <span className="text-text-tertiary text-sm">NT$</span>
            <input
              inputMode="numeric"
              value={s.feeOverride}
              onChange={(e) => set({ feeOverride: e.target.value.replace(/[^0-9]/g, '') })}
              placeholder={String(calcFee(gross, broker))}
              className="w-full outline-none bg-transparent placeholder:text-text-tertiary"
            />
          </div>
        </div>
        {s.side === 'sell' && (
          <div className="flex-1">
            <div className="text-[13px] text-text-secondary mb-1.5">證交稅</div>
            <div className="px-3.5 py-2.5 bg-surface border border-line rounded-modal flex items-center gap-1 text-[15px] tabular-nums">
              <span className="text-text-tertiary text-sm">NT$</span>
              <input
                inputMode="numeric"
                value={s.taxOverride}
                onChange={(e) => set({ taxOverride: e.target.value.replace(/[^0-9]/g, '') })}
                placeholder={String(calcTax(gross, s.instrumentType))}
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

      {/* 交割金額預覽 */}
      {gross > 0 && (
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
