import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faChevronRight, faTrashCan, faRepeat, faPercent, faCopy, faFileArrowDown } from '@fortawesome/free-solid-svg-icons'
import { faGoogle } from '@fortawesome/free-brands-svg-icons'
import { useCollection, useAllCollections } from '../db/DataProvider'
import { buildJsonBackup, buildTransactionsCsv, downloadFile } from '../lib/backup'
import { getTheme, setTheme } from '../lib/theme'
import { usePwa } from '../components/PwaProvider'
import { signInWithGoogle, signOutUser } from '../lib/firebase'
import { useAuth } from '../hooks/useAuth'
import { accountBalances } from '../lib/engine'
import { updateRecurringRule, deleteRecurringRule } from '../db/repo'
import { useAsyncAction, settle } from '../hooks/useAsyncAction'
import { useConfirm } from '../components/ConfirmSheet'
import { formatBalance, formatAmount } from '../lib/format'
import { todayStr, formatMd } from '../lib/date'
import { accountIcon } from '../lib/icons'
import AccountEditSheet from '../components/settings/AccountEditSheet'
import BrokerEditSheet from '../components/settings/BrokerEditSheet'

// build 時間以 ISO（UTC）注入，顯示時轉本地時區
function formatBuiltAt(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const THEME_OPTIONS = [
  { value: 'light', label: '淺色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟隨系統' },
]

const FREQ_LABEL = { week: '每週', month: '每月', year: '每年' }
const MODE_LABEL = { immediate: '自動入帳', deferred: '提前產生', reminder: '僅提醒' }

const GROUPS = [
  { type: 'cash', label: '現金' },
  { type: 'bank', label: '銀行' },
  { type: 'credit_card', label: '信用卡' },
  { type: 'securities', label: '證券' },
]

export default function SettingsPage() {
  const accounts = useCollection('accounts')
  const txns = useCollection('transactions')
  const rules = useCollection('recurringRules')
  const brokers = useCollection('brokers')
  const stockTxns = useCollection('stockTransactions')

  // editing: undefined=關閉、null=新增、帳戶物件=編輯
  const [editing, setEditing] = useState(undefined)
  const [editingBroker, setEditingBroker] = useState(undefined)

  const user = useAuth()
  const allData = useAllCollections()
  const [theme, setThemeState] = useState(getTheme)
  const pwa = usePwa()
  const [authError, setAuthError] = useState(null)
  const [uidCopied, setUidCopied] = useState(false)
  const { run: runRule, error: ruleError } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  async function handleSignIn() {
    setAuthError(null)
    try {
      await signInWithGoogle()
    } catch (e) {
      // 使用者自行關閉 popup 不算錯誤，不顯示訊息
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request')
        setAuthError(e.code ?? e.message)
    }
  }

  async function copyUid() {
    await navigator.clipboard.writeText(user.uid)
    setUidCopied(true)
    setTimeout(() => setUidCopied(false), 2000)
  }

  const balances = accountBalances(accounts, txns, todayStr())
  const sorted = [...accounts].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  function exportJson() {
    downloadFile(
      `原子記帳備份-${todayStr()}.json`,
      buildJsonBackup(allData, user.uid),
      'application/json;charset=utf-8',
    )
  }

  function exportCsv() {
    downloadFile(
      `原子記帳交易明細-${todayStr()}.csv`,
      buildTransactionsCsv({
        transactions: allData.transactions,
        accounts: allData.accounts,
        categories: allData.categories,
        tags: allData.tags,
        projects: allData.projects,
        counterparties: allData.counterparties,
      }),
      'text/csv;charset=utf-8',
    )
  }

  return (
    <div className="px-4 pt-4 pb-4 lg:px-7 lg:pt-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">設定</h1>

      {/* 帳戶管理 */}
      <div className="flex items-center justify-between px-0.5 mb-2">
        <span className="text-[15px] font-semibold">帳戶管理</span>
        <button
          onClick={() => setEditing(null)}
          className="flex items-center gap-1.5 h-[34px] px-3 rounded-chip bg-brand text-white text-[13px] font-semibold"
        >
          <FontAwesomeIcon icon={faPlus} className="text-xs" /> 新增帳戶
        </button>
      </div>

      <div className="bg-surface border border-line rounded-card shadow-card px-3.5">
        {GROUPS.map((g, gi) => {
          const list = sorted.filter((a) => a.type === g.type)
          if (list.length === 0) return null
          return (
            <div key={g.type} className={gi > 0 ? 'border-t border-line-light' : ''}>
              <div className="text-[13px] font-semibold text-text-secondary pt-3 pb-1">{g.label}</div>
              {list.map((a) => {
                const isCard = a.type === 'credit_card'
                const bal = balances[a.id] ?? 0
                return (
                  <button
                    key={a.id}
                    onClick={() => setEditing(a)}
                    className={`flex items-center gap-3 w-full py-2.5 text-left ${a.isArchived ? 'opacity-50' : ''}`}
                  >
                    <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
                      <FontAwesomeIcon icon={accountIcon(a)} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[15px] font-medium truncate">{a.name}</span>
                        {a.isArchived && (
                          <span className="flex-none text-[11px] text-text-tertiary bg-surface-alt rounded-chip px-1.5 py-0.5">
                            已封存
                          </span>
                        )}
                      </div>
                      {isCard && a.creditLimit > 0 && (
                        <span className="text-xs text-text-tertiary tabular-nums">
                          額度 {formatAmount(a.creditLimit)} · 可用 {formatAmount(a.creditLimit + bal)}
                        </span>
                      )}
                    </div>
                    <span className="text-[13px] text-text-secondary tabular-nums">
                      {isCard ? `已用 ${formatAmount(-bal)}` : formatBalance(bal)}
                    </span>
                    <FontAwesomeIcon icon={faChevronRight} className="text-text-tertiary text-[11px]" />
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* 券商設定 */}
      <div className="flex items-center justify-between px-0.5 mt-6 mb-2">
        <span className="text-[15px] font-semibold">券商設定</span>
        <button
          onClick={() => setEditingBroker(null)}
          className="flex items-center gap-1.5 h-[34px] px-3 rounded-chip bg-brand text-white text-[13px] font-semibold"
        >
          <FontAwesomeIcon icon={faPlus} className="text-xs" /> 新增券商
        </button>
      </div>

      <div className="bg-surface border border-line rounded-card shadow-card px-3.5 divide-y divide-line-light">
        {brokers.length === 0 ? (
          <div className="py-6 text-center text-text-tertiary text-sm">尚未建立券商</div>
        ) : (
          brokers.map((b) => (
            <button
              key={b.id}
              onClick={() => setEditingBroker(b)}
              className="flex items-center gap-3 w-full py-3 text-left"
            >
              <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
                <FontAwesomeIcon icon={faPercent} className="text-sm" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium truncate">{b.name}</div>
                <div className="text-xs text-text-tertiary tabular-nums">
                  {b.feeDiscount < 1
                    ? `${+(b.feeDiscount * 10).toFixed(2)} 折`
                    : '不折'}
                  {' · '}最低 NT$ {b.minFee ?? 20}
                </div>
              </div>
              <FontAwesomeIcon icon={faChevronRight} className="text-text-tertiary text-[11px]" />
            </button>
          ))
        )}
      </div>

      {/* 週期性收支 */}
      {rules.length > 0 && (
        <>
          <div className="px-0.5 mt-6 mb-2 text-[15px] font-semibold">週期性收支</div>
          <div className="bg-surface border border-line rounded-card shadow-card px-3.5 divide-y divide-line-light">
            {rules
              .slice()
              .sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1))
              .map((r) => (
                <div key={r.id} className={`flex items-center gap-3 py-3 ${r.isActive ? '' : 'opacity-50'}`}>
                  <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
                    <FontAwesomeIcon icon={faRepeat} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium truncate">{r.name ?? '週期項目'}</div>
                    <div className="text-xs text-text-tertiary tabular-nums">
                      {FREQ_LABEL[r.frequency?.unit] ?? ''} · {MODE_LABEL[r.postingMode] ?? ''} · 下次 {formatMd(r.nextDate)}
                    </div>
                  </div>
                  <button
                    onClick={() => runRule(async () => { await settle(updateRecurringRule(r.id, { isActive: !r.isActive })) })}
                    className="text-[13px] font-medium text-text-secondary px-2"
                  >
                    {r.isActive ? '暫停' : '啟用'}
                  </button>
                  <button
                    onClick={async () => {
                      if (await confirm({ title: '刪除週期規則', message: '刪除此週期性規則？（已產生的交易不受影響）', danger: true }))
                        runRule(async () => { await settle(deleteRecurringRule(r.id)) })
                    }}
                    className="w-8 h-8 flex items-center justify-center text-text-tertiary"
                  >
                    <FontAwesomeIcon icon={faTrashCan} className="text-xs" />
                  </button>
                </div>
              ))}
            {ruleError && <div className="py-2 text-[13px] text-error">{ruleError}</div>}
          </div>
        </>
      )}

      {/* 帳號與雲端同步（docs/07 M0：登入＋rules 連線驗證；資料遷移為 M1–M3） */}
      <div className="px-0.5 mt-6 mb-2 text-[15px] font-semibold">帳號與雲端同步</div>
      <div className="bg-surface border border-line rounded-card shadow-card px-3.5 py-3">
        {user === undefined ? (
          <div className="text-sm text-text-tertiary py-1">確認登入狀態中…</div>
        ) : user === null ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-secondary">登入後啟用多裝置同步與發票匣</span>
            <button
              onClick={handleSignIn}
              className="flex items-center gap-1.5 h-[34px] px-3 rounded-chip bg-brand text-white text-[13px] font-semibold flex-none"
            >
              <FontAwesomeIcon icon={faGoogle} className="text-xs" /> Google 登入
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[15px] font-medium truncate">{user.displayName}</div>
                <div className="text-xs text-text-tertiary truncate">{user.email}</div>
              </div>
              <button
                onClick={() => signOutUser()}
                className="text-[13px] font-medium text-text-secondary px-2 flex-none"
              >
                登出
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-text-tertiary">
              <span className="flex-none">uid</span>
              <code className="truncate">{user.uid}</code>
              <button onClick={copyUid} className="w-7 h-7 flex-none flex items-center justify-center">
                <FontAwesomeIcon icon={faCopy} />
              </button>
              {uidCopied && <span className="text-success flex-none">已複製</span>}
            </div>
          </div>
        )}
        {authError && <div className="text-xs text-error mt-2">登入失敗：{authError}</div>}
      </div>

      {/* 偏好（階段 7）：主題三段切換，localStorage per-device */}
      <div className="px-0.5 mt-6 mb-2 text-[15px] font-semibold">偏好</div>
      <div className="bg-surface border border-line rounded-card shadow-card px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-text-secondary">主題</span>
          <div className="flex bg-surface-alt rounded-btn p-0.5">
            {THEME_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => { setTheme(o.value); setThemeState(o.value) }}
                className={`h-[30px] px-3 rounded-[8px] text-[13px] font-medium ${
                  theme === o.value ? 'bg-surface shadow-segment font-semibold' : 'text-text-secondary'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 關於與更新：版本顯示、檢查更新（prompt 模式手動套用）、安裝 App（沿用 CoTravel 機制） */}
      <div className="px-0.5 mt-6 mb-2 text-[15px] font-semibold">關於與更新</div>
      <div className="bg-surface border border-line rounded-card shadow-card px-3.5 divide-y divide-line-light">
        <div className="py-3">
          <div className="text-[15px] font-medium">原子記帳 AtomCoins</div>
          <div className="text-xs text-text-tertiary tabular-nums mt-0.5">
            版本 {pwa.version} · {formatBuiltAt(pwa.builtAt)}
          </div>
        </div>
        <button
          onClick={
            pwa.checkResult === 'available'
              ? pwa.applyUpdate
              : pwa.checkResult === 'checking'
                ? undefined
                : pwa.checkForUpdate
          }
          className="flex items-center justify-between gap-3 w-full py-3 text-left"
        >
          <div className="min-w-0">
            <div className={`text-[15px] font-medium ${pwa.checkResult === 'available' ? 'text-brand' : ''}`}>
              {pwa.checkResult === 'available' ? '有新版本可用' : '檢查更新'}
            </div>
            <div className="text-xs text-text-tertiary mt-0.5">
              {pwa.checkResult === 'checking'
                ? '檢查中…'
                : pwa.checkResult === 'available'
                  ? '點此立即更新並重新載入'
                  : pwa.checkResult === 'latest'
                    ? '已是最新版本'
                    : pwa.checkResult === 'error'
                      ? '暫時無法檢查，請稍後再試'
                      : '看看有沒有新版本'}
            </div>
          </div>
          <FontAwesomeIcon icon={faChevronRight} className="text-text-tertiary text-[11px] flex-none" />
        </button>
        <div className="py-3">
          {pwa.installed ? (
            <div className="text-sm text-text-secondary">已安裝為 App，長按圖示可使用「記一筆」「發票匣」捷徑。</div>
          ) : pwa.canInstall ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-secondary">安裝到主畫面，離線也能記帳</span>
              <button
                onClick={pwa.promptInstall}
                className="h-[34px] px-3 rounded-chip bg-brand text-white text-[13px] font-semibold flex-none"
              >
                安裝
              </button>
            </div>
          ) : pwa.isIOS ? (
            <div className="text-sm text-text-secondary">
              iPhone／iPad：用 Safari 開啟本頁 → 點「分享」→「加入主畫面」即可安裝。
            </div>
          ) : (
            <div className="text-sm text-text-tertiary">
              可從瀏覽器選單選「安裝／加入主畫面」。
            </div>
          )}
        </div>
      </div>

      {/* 備份匯出（階段 7）：只匯出、不做還原——Firestore 即雲端源 */}
      <div className="px-0.5 mt-6 mb-2 text-[15px] font-semibold">備份匯出</div>
      <div className="bg-surface border border-line rounded-card shadow-card px-3.5 py-3">
        <div className="text-xs text-text-tertiary mb-2.5">
          交易 {allData.transactions.length} 筆・股票 {allData.stockTransactions.length} 筆・發票 {allData.invoices.length} 張
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportJson}
            disabled={!user}
            className="flex-1 flex items-center justify-center gap-1.5 h-[38px] rounded-btn border border-line bg-surface-alt text-[13px] font-semibold disabled:opacity-40"
          >
            <FontAwesomeIcon icon={faFileArrowDown} className="text-xs" /> JSON 完整備份
          </button>
          <button
            onClick={exportCsv}
            disabled={!user}
            className="flex-1 flex items-center justify-center gap-1.5 h-[38px] rounded-btn border border-line bg-surface-alt text-[13px] font-semibold disabled:opacity-40"
          >
            <FontAwesomeIcon icon={faFileArrowDown} className="text-xs" /> 交易明細 CSV
          </button>
        </div>
        <p className="text-[11px] text-text-tertiary mt-2">
          JSON 為全部資料的完整備份；CSV 為交易明細（拆帳逐列展開），可用 Excel 開啟。
        </p>
      </div>

      <p className="text-text-tertiary text-xs mt-6 px-0.5">
        分類、標籤、偏好等其餘設定將於後續階段實作。
      </p>

      <AccountEditSheet
        open={editing !== undefined}
        account={editing ?? null}
        accounts={accounts}
        brokers={brokers}
        onClose={() => setEditing(undefined)}
      />

      <BrokerEditSheet
        open={editingBroker !== undefined}
        broker={editingBroker ?? null}
        stockTxns={stockTxns}
        onClose={() => setEditingBroker(undefined)}
      />
      {confirmElement}
    </div>
  )
}
