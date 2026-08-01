import { formatAmount, formatBalance, formatSigned, formatNumber } from '../../lib/format'
import { formatMd } from '../../lib/date'
import PreviewSheet, { PreviewRow } from '../PreviewSheet'

// 損益上色：台股慣例，正=紅、負=綠
function pnlClass(n) {
  return n >= 0 ? 'text-[var(--color-stock-buy)]' : 'text-[var(--color-stock-sell)]'
}

const TITLE = { holding: '持股', txn: '股票交易', realized: '已實現損益' }

// 長按股票分頁任一列的預覽。三個子分頁的列各有不同欄位，用 kind 分流；
// 只有交易紀錄可以進編輯（持股與已實現都是算出來的，沒有可編輯的來源列）。
export default function StockPreview({ item, kind, accMap = {}, brokerMap = {}, hidden, onClose, onOpen }) {
  if (!item) return null
  const opt = { hidden }

  return (
    <PreviewSheet
      open={!!item}
      title={TITLE[kind] ?? '預覽'}
      onClose={onClose}
      footer={
        kind === 'txn' ? (
          <button
            onClick={onOpen}
            className="w-full h-[42px] rounded-btn bg-brand text-white text-[14px] font-semibold"
          >
            編輯這筆
          </button>
        ) : null
      }
    >
      <div className="text-center pb-1">
        <div className="text-[15px] font-semibold">{item.symbol}</div>
        <div className="text-[13px] text-text-secondary">{item.name}</div>
      </div>

      {kind === 'holding' && (
        <>
          <PreviewRow label="證券帳戶" value={accMap[item.securitiesAccountId]?.name} />
          <PreviewRow label="股數" value={`${formatNumber(item.shares)} 股`} />
          <PreviewRow label="平均成本" value={formatNumber(item.avgCost, 2)} />
          <PreviewRow label="總成本" value={formatBalance(item.costBasis, opt)} />
          <PreviewRow
            label="現價"
            value={item.hasPrice ? `${formatNumber(item.price, 2)}（${formatMd(item.priceDate)}）` : '未同步'}
          />
          <PreviewRow label="市值" value={formatBalance(item.marketValue, opt)} />
          {item.unrealizedPnl != null && (
            <PreviewRow
              label="未實現損益"
              value={`${formatSigned(item.unrealizedPnl, opt)}${
                item.returnPct != null && !hidden
                  ? `（${item.returnPct >= 0 ? '+' : ''}${item.returnPct.toFixed(2)}%）`
                  : ''
              }`}
              cls={`font-semibold ${pnlClass(item.unrealizedPnl)}`}
            />
          )}
        </>
      )}

      {kind === 'txn' && (
        <>
          <PreviewRow
            label="別"
            value={item.side === 'buy' ? '買進' : '賣出'}
            cls={`font-semibold ${item.side === 'buy' ? 'text-[var(--color-stock-buy)]' : 'text-[var(--color-stock-sell)]'}`}
          />
          <PreviewRow label="成交日" value={formatMd(item.tradeDate)} />
          <PreviewRow label="交割日" value={formatMd(item.settlementDate)} />
          <PreviewRow label="股數" value={`${formatNumber(item.shares)} 股`} />
          <PreviewRow label="成交價" value={formatNumber(item.price, 2)} />
          <PreviewRow label="價金" value={formatAmount(Math.round(item.shares * item.price), opt)} />
          <PreviewRow label="手續費" value={formatAmount(item.fee ?? 0, opt)} />
          {item.side === 'sell' && <PreviewRow label="證交稅" value={formatAmount(item.tax ?? 0, opt)} />}
          <PreviewRow label="證券帳戶" value={accMap[item.securitiesAccountId]?.name} />
          <PreviewRow label="交割銀行" value={accMap[item.settlementBankId]?.name} />
          <PreviewRow label="券商" value={brokerMap[item.brokerId]?.name} />
          {item.isOpening && <PreviewRow label="備註" value="期初持股（不影響交割現金）" />}
          <PreviewRow label="註記" value={item.note} />
        </>
      )}

      {kind === 'realized' && (
        <>
          <PreviewRow label="賣出日" value={formatMd(item.date)} />
          <PreviewRow label="股數" value={`${formatNumber(item.shares)} 股`} />
          <PreviewRow label="淨收入" value={formatBalance(item.proceeds, opt)} />
          <PreviewRow label="成本" value={formatBalance(item.cost, opt)} />
          <PreviewRow
            label="已實現損益"
            value={formatSigned(item.pnl, opt)}
            cls={`font-semibold ${pnlClass(item.pnl)}`}
          />
        </>
      )}
    </PreviewSheet>
  )
}
