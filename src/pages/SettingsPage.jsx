import { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faChevronRight, faChevronLeft, faTrashCan, faRepeat, faPercent, faCopy, faFileArrowDown, faBookmark, faStore, faWallet, faCloud, faTag, faBell } from '@fortawesome/free-solid-svg-icons'
import { faGoogle } from '@fortawesome/free-brands-svg-icons'
import { httpsCallable } from 'firebase/functions'
import { useCollection, useAllCollections, useSettings } from '../db/DataProvider'
import { buildJsonBackup, buildTransactionsCsv, downloadFile } from '../lib/backup'
import { getTheme, setTheme } from '../lib/theme'
import { usePwa } from '../components/PwaProvider'
import { signInWithGoogle, signOutUser, functions } from '../lib/firebase'
import { getSubscriptionState, subscribeToPush, unsubscribeFromPush, getPushEnv } from '../lib/push'
import { useAuth } from '../hooks/useAuth'
import { accountBalances } from '../lib/engine'
import { updateRecurringRule, deleteRecurringRule, updateTemplate, deleteTemplate, deleteMerchantAlias, setSortOrders, updateSettings } from '../db/repo'
import { useAsyncAction, settle } from '../hooks/useAsyncAction'
import { useConfirm } from '../components/ConfirmSheet'
import { formatBalance, formatAmount } from '../lib/format'
import { todayStr, formatMd } from '../lib/date'
import { accountIcon } from '../lib/icons'
import AccountEditSheet from '../components/settings/AccountEditSheet'
import BrokerEditSheet from '../components/settings/BrokerEditSheet'
import MerchantAliasSheet from '../components/settings/MerchantAliasSheet'
import CategoryManager, { ReorderBtns } from '../components/settings/CategoryManager'
import Sheet from '../components/Sheet'

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
const TX_TYPE_LABEL = { expense: '支出', income: '收入', transfer: '轉帳', receivable: '應收', payable: '應付' }

// 範本摘要行（docs/09 批次 2）：型別＋分類／帳戶／對象＋金額
function templateSummary(t, { catById, accById, cpById }) {
  const p = t.payload ?? {}
  const parts = [TX_TYPE_LABEL[p.type] ?? '']
  if (p.type === 'expense' || p.type === 'income') {
    const names = (p.splits ?? []).map((s) => catById[s.categoryId]?.name).filter(Boolean)
    if (names.length) parts.push(names.join('、'))
    const sum = (p.splits ?? []).reduce((a, s) => a + (s.amount ?? 0), 0)
    if (sum > 0) parts.push(formatAmount(sum))
  } else if (p.type === 'transfer') {
    parts.push(`${accById[p.fromAccountId]?.name ?? '?'} → ${accById[p.toAccountId]?.name ?? '?'}`)
  } else {
    if (p.counterpartyId) parts.push(cpById[p.counterpartyId]?.name ?? '')
    if (p.amount > 0) parts.push(formatAmount(p.amount))
  }
  return parts.filter(Boolean).join(' · ')
}

const GROUPS = [
  { type: 'cash', label: '現金' },
  { type: 'bank', label: '銀行' },
  { type: 'credit_card', label: '信用卡' },
  { type: 'securities', label: '證券' },
]

// 設定二層選單（docs/09 需求2，仿 CoTravel）：點列進入子區塊，避免主頁越加越長
const MENU = [
  { key: 'accounts', label: '帳戶管理', sub: '新增、編輯、刪除、排序帳戶', icon: faWallet },
  { key: 'categories', label: '分類管理', sub: '大/小分類、圖示、顏色、排序', icon: faTag },
  { key: 'brokers', label: '券商設定', sub: '手續費折數與最低手續費', icon: faPercent },
  { key: 'recurring', label: '週期性收支', sub: '自動記帳與提醒規則', icon: faRepeat },
  { key: 'templates', label: '範本', sub: '快速記帳範本', icon: faBookmark },
  { key: 'aliases', label: '商家別名', sub: '載具公司名對應店名', icon: faStore },
  { key: 'push', label: '推播通知', sub: '記帳提醒、卡費、交割、發票', icon: faBell },
  { key: 'cloud', label: '帳號與雲端同步', sub: '登入、多裝置同步', icon: faCloud },
  { key: 'backup', label: '備份匯出', sub: 'JSON／CSV 下載', icon: faFileArrowDown },
]
const TITLES = Object.fromEntries(MENU.map((m) => [m.key, m.label]))

export default function SettingsPage() {
  const accounts = useCollection('accounts')
  const txns = useCollection('transactions')
  const rules = useCollection('recurringRules')
  const brokers = useCollection('brokers')
  const stockTxns = useCollection('stockTransactions')
  const templates = useCollection('templates')
  const categories = useCollection('categories')
  const counterparties = useCollection('counterparties')
  const merchantAliases = useCollection('merchantAliases')

  // 二層導覽：'menu' 或某子區塊 key
  const [section, setSection] = useState('menu')
  // editing: undefined=關閉、null=新增、帳戶物件=編輯
  const [editing, setEditing] = useState(undefined)
  const [editingBroker, setEditingBroker] = useState(undefined)
  const [renamingTemplate, setRenamingTemplate] = useState(null)
  const [editingAlias, setEditingAlias] = useState(undefined)

  const user = useAuth()
  const allData = useAllCollections()
  const [theme, setThemeState] = useState(getTheme)
  const pwa = usePwa()
  const [authError, setAuthError] = useState(null)
  const [uidCopied, setUidCopied] = useState(false)
  const { run: runRule, error: ruleError } = useAsyncAction()
  const { run: runTemplate, error: templateError } = useAsyncAction()
  const { run: runAlias, error: aliasError } = useAsyncAction()
  const { run: runOrder } = useAsyncAction()
  const { confirm, confirmElement } = useConfirm()

  // 帳戶排序：同型別群組內與相鄰帳戶交換 sortOrder（docs/09 後續調整）
  const moveAccount = (list, index, dir) => {
    const j = index + dir
    if (j < 0 || j >= list.length) return
    const a = list[index]
    const b = list[j]
    const soA = a.sortOrder != null ? a.sortOrder : index
    const soB = b.sortOrder != null ? b.sortOrder : j
    runOrder(async () => {
      await settle(setSortOrders('accounts', [
        { id: a.id, sortOrder: soB },
        { id: b.id, sortOrder: soA },
      ]))
    })
  }

  const tplLookups = {
    catById: Object.fromEntries(categories.map((c) => [c.id, c])),
    accById: Object.fromEntries(accounts.map((a) => [a.id, a])),
    cpById: Object.fromEntries(counterparties.map((c) => [c.id, c])),
  }

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
      {section === 'menu' ? (
        <h1 className="text-xl font-semibold mb-4">設定</h1>
      ) : (
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setSection('menu')}
            aria-label="返回設定"
            className="w-9 h-9 flex-none rounded-chip bg-surface border border-line text-text-secondary flex items-center justify-center"
          >
            <FontAwesomeIcon icon={faChevronLeft} className="text-sm" />
          </button>
          <h1 className="text-xl font-semibold">{TITLES[section]}</h1>
        </div>
      )}

      {/* 選單（僅主頁） */}
      {section === 'menu' && (
        <div className="bg-surface border border-line rounded-card shadow-card px-3.5">
          {MENU.map((m, i) => (
            <button
              key={m.key}
              onClick={() => setSection(m.key)}
              className={`flex items-center gap-3 w-full py-3.5 text-left ${i > 0 ? 'border-t border-line-light' : ''}`}
            >
              <span className="w-10 h-10 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
                <FontAwesomeIcon icon={m.icon} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-medium">{m.label}</span>
                <span className="block text-xs text-text-tertiary">{m.sub}</span>
              </span>
              <FontAwesomeIcon icon={faChevronRight} className="text-text-tertiary text-[11px]" />
            </button>
          ))}
        </div>
      )}

      {/* 帳戶管理 */}
      {section === 'accounts' && (<>
      <div className="flex justify-end mb-2">
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
              {list.map((a, ai) => {
                const isCard = a.type === 'credit_card'
                const bal = balances[a.id] ?? 0
                return (
                  <div key={a.id} className={`flex items-center gap-2 py-2.5 ${a.isArchived ? 'opacity-50' : ''}`}>
                    <ReorderBtns
                      onUp={() => moveAccount(list, ai, -1)}
                      onDown={() => moveAccount(list, ai, 1)}
                      first={ai === 0}
                      last={ai === list.length - 1}
                    />
                    <button onClick={() => setEditing(a)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
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
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      </>)}

      {/* 分類管理（docs/09 後續調整） */}
      {section === 'categories' && <CategoryManager />}

      {/* 券商設定 */}
      {section === 'brokers' && (<>
      <div className="flex justify-end mb-2">
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
      </>)}

      {/* 週期性收支 */}
      {section === 'recurring' && (
        <>
          <div className="bg-surface border border-line rounded-card shadow-card px-3.5 divide-y divide-line-light">
            {rules.length === 0 && (
              <div className="py-6 text-center text-text-tertiary text-sm">
                尚無週期性收支（於記帳表單「進階 → 設為週期性」建立）
              </div>
            )}
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

      {/* 範本（docs/09 批次 2）：改名、刪除；建立入口在記帳表單 */}
      {section === 'templates' && (
        <>
          <div className="bg-surface border border-line rounded-card shadow-card px-3.5 divide-y divide-line-light">
            {templates.length === 0 && (
              <div className="py-6 text-center text-text-tertiary text-sm">
                尚無範本（於記帳表單「存為範本」建立）
              </div>
            )}
            {templates
              .slice()
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
              .map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-3">
                  <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
                    <FontAwesomeIcon icon={faBookmark} className="text-sm" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium truncate">{t.name}</div>
                    <div className="text-xs text-text-tertiary truncate">{templateSummary(t, tplLookups)}</div>
                  </div>
                  <button
                    onClick={() => setRenamingTemplate(t)}
                    className="text-[13px] font-medium text-text-secondary px-2"
                  >
                    改名
                  </button>
                  <button
                    onClick={async () => {
                      if (await confirm({ title: '刪除範本', message: `刪除範本「${t.name}」？`, danger: true }))
                        runTemplate(async () => { await settle(deleteTemplate(t.id)) })
                    }}
                    className="w-8 h-8 flex items-center justify-center text-text-tertiary"
                  >
                    <FontAwesomeIcon icon={faTrashCan} className="text-xs" />
                  </button>
                </div>
              ))}
            {templateError && <div className="py-2 text-[13px] text-error">{templateError}</div>}
          </div>
        </>
      )}

      {/* 商家別名（docs/09 批次 3）：把載具冗長公司名對應到店名，影響顯示與統計 */}
      {section === 'aliases' && (<>
      <div className="flex justify-end mb-2">
        <button
          onClick={() => setEditingAlias(null)}
          className="flex items-center gap-1.5 h-[34px] px-3 rounded-chip bg-brand text-white text-[13px] font-semibold"
        >
          <FontAwesomeIcon icon={faPlus} className="text-xs" /> 新增別名
        </button>
      </div>
      <div className="bg-surface border border-line rounded-card shadow-card px-3.5 divide-y divide-line-light">
        {merchantAliases.length === 0 ? (
          <div className="py-6 text-center text-text-tertiary text-sm">尚未建立別名</div>
        ) : (
          merchantAliases
            .slice()
            .sort((a, b) => (b.match?.length ?? 0) - (a.match?.length ?? 0))
            .map((a) => (
              <div key={a.id} className="flex items-center gap-3 py-3">
                <span className="w-9 h-9 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
                  <FontAwesomeIcon icon={faStore} className="text-sm" />
                </span>
                <button onClick={() => setEditingAlias(a)} className="flex-1 min-w-0 text-left">
                  <div className="text-[15px] font-medium truncate">{a.alias}</div>
                  <div className="text-xs text-text-tertiary truncate">比對：{a.match}</div>
                </button>
                <button
                  onClick={async () => {
                    if (await confirm({ title: '刪除別名', message: `刪除別名「${a.alias}」？（不影響已記錄交易）`, danger: true }))
                      runAlias(async () => { await settle(deleteMerchantAlias(a.id)) })
                  }}
                  className="w-8 h-8 flex items-center justify-center text-text-tertiary"
                >
                  <FontAwesomeIcon icon={faTrashCan} className="text-xs" />
                </button>
              </div>
            ))
        )}
        {aliasError && <div className="py-2 text-[13px] text-error">{aliasError}</div>}
      </div>
      </>)}

      {/* 帳號與雲端同步（docs/07 M0：登入＋rules 連線驗證；資料遷移為 M1–M3） */}
      {section === 'cloud' && (<>
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
      </>)}

      {/* 偏好（階段 7）：主題三段切換，localStorage per-device。留在主頁（小、常用） */}
      {section === 'menu' && (<>
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

      </>)}

      {/* 備份匯出（階段 7）：只匯出、不做還原——Firestore 即雲端源 */}
      {section === 'backup' && (<>
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
      </>)}

      {section === 'push' && <PushSettings />}

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

      <TemplateRenameSheet
        template={renamingTemplate}
        onClose={() => setRenamingTemplate(null)}
        onSave={(id, name) => runTemplate(async () => {
          await settle(updateTemplate(id, { name }))
          setRenamingTemplate(null)
        })}
      />

      <MerchantAliasSheet
        open={editingAlias !== undefined}
        alias={editingAlias ?? null}
        onClose={() => setEditingAlias(undefined)}
      />
      {confirmElement}
    </div>
  )
}

// 範本改名 Sheet
function TemplateRenameSheet({ template, onClose, onSave }) {
  const open = !!template
  const [name, setName] = useState('')
  // 每次開啟時以現有名稱預填
  useEffect(() => {
    if (open) setName(template?.name ?? '')
  }, [open, template])
  const trimmed = name.trim()
  return (
    <Sheet open={open} onClose={onClose} title="範本改名" bodyClassName="p-4">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="範本名稱"
        className="w-full h-[46px] px-3.5 bg-surface-alt rounded-modal text-[15px] outline-none placeholder:text-text-tertiary mb-3"
      />
      <button
        onClick={() => trimmed && onSave(template.id, trimmed)}
        disabled={!trimmed}
        className="w-full h-[46px] rounded-btn bg-brand text-white text-[15px] font-semibold disabled:opacity-40"
      >
        儲存
      </button>
    </Sheet>
  )
}

// 推播通知情境開關（批次 7）。前後端各存一份預設，須與 functions/index.js 的 DEFAULT_PREFS 一致。
const DEFAULT_PUSH_PREFS = {
  daily: true,
  invoice: true,
  card: true,
  settlement: true,
  recurring: true,
  scraperHealth: false,
}

const PUSH_SCENARIOS = [
  { key: 'daily', label: '每日記帳提醒', desc: '晚上 9 點，當天還沒記帳時提醒' },
  { key: 'invoice', label: '新發票待歸帳', desc: '載具同步到新發票時' },
  { key: 'card', label: '信用卡繳費', desc: '繳款日前 7 天、前 1 天、逾期' },
  { key: 'settlement', label: '交割款不足', desc: '股票交割日餘額不足時（每日）' },
  { key: 'recurring', label: '週期收支提醒', desc: '待確認提醒、明日自動扣款預告' },
  { key: 'scraperHealth', label: '發票同步異常', desc: '爬蟲逾 48 小時沒成功（預設關）' },
]

// 圓角開關（無既有共用元件，就地實作）
function Toggle({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-brand' : 'bg-surface-alt border border-line'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

function PushSettings() {
  const settings = useSettings()
  const [env] = useState(getPushEnv) // 平台資訊初始化一次
  const [state, setState] = useState('unknown') // unknown/on/off/blocked/ios-install/unsupported
  const [busy, setBusy] = useState(false)
  const [testMsg, setTestMsg] = useState(null)
  const { run: runPref, error: prefError } = useAsyncAction()

  useEffect(() => {
    getSubscriptionState()
      .then(setState)
      .catch(() => setState('unsupported'))
  }, [])

  const prefs = { ...DEFAULT_PUSH_PREFS, ...(settings?.pushPrefs ?? {}) }
  const isToggle = state === 'on' || state === 'off'

  const SUBTITLE = {
    unknown: '檢查中…',
    on: '本裝置已開啟，提醒到期時會推播',
    off: '開啟後 App 關閉也能收到提醒',
    blocked: '通知已被瀏覽器封鎖，請到網站設定開啟',
    'ios-install': 'iOS 需 16.4+ 並先「加入主畫面」才能訂閱',
    unsupported: '此裝置／瀏覽器不支援推播',
  }

  // 訂閱／退訂必須在點擊 handler 內呼叫（權限請求需 user gesture）
  async function toggleSubscription() {
    if (busy) return
    setBusy(true)
    setTestMsg(null)
    try {
      if (state === 'on') {
        await unsubscribeFromPush()
        setState('off')
      } else {
        const ok = await subscribeToPush()
        setState(ok ? 'on' : Notification.permission === 'denied' ? 'blocked' : 'off')
      }
    } catch (e) {
      setTestMsg(`訂閱失敗：${e.message ?? e}`)
    } finally {
      setBusy(false)
    }
  }

  function setPref(key, value) {
    runPref(async () => {
      await settle(updateSettings({ pushPrefs: { ...prefs, [key]: value } }))
    })
  }

  async function sendTest() {
    setTestMsg('sending')
    try {
      const res = await httpsCallable(functions, 'sendTestPush')()
      setTestMsg(`已發送到 ${res.data?.sent ?? 0} 個裝置，請留意通知`)
    } catch (e) {
      setTestMsg(`發送失敗：${e.message ?? e}`)
    }
  }

  return (
    <>
      {/* 總開關 */}
      <div className="bg-surface border border-line rounded-card shadow-card px-3.5 py-3">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 flex-none rounded-btn bg-surface-alt text-text-secondary flex items-center justify-center">
            <FontAwesomeIcon icon={faBell} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium">推播通知</div>
            <div className="text-xs text-text-tertiary mt-0.5">
              {busy ? '設定中…' : SUBTITLE[state]}
            </div>
          </div>
          {isToggle && (
            <Toggle
              checked={state === 'on'}
              disabled={busy}
              onChange={toggleSubscription}
              label="推播通知開關"
            />
          )}
        </div>
      </div>

      {/* 情境開關：訂閱後才顯示 */}
      {state === 'on' && (
        <div className="bg-surface border border-line rounded-card shadow-card px-3.5 mt-4 divide-y divide-line-light">
          {PUSH_SCENARIOS.map((s) => (
            <div key={s.key} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium">{s.label}</div>
                <div className="text-xs text-text-tertiary mt-0.5">{s.desc}</div>
              </div>
              <Toggle checked={!!prefs[s.key]} onChange={(v) => setPref(s.key, v)} label={s.label} />
            </div>
          ))}
        </div>
      )}

      {prefError && <p className="text-[13px] text-error mt-3">偏好儲存失敗，請重試</p>}

      {/* 測試通知：驗證全鏈路 */}
      {state === 'on' && (
        <div className="mt-4">
          <button
            onClick={sendTest}
            disabled={testMsg === 'sending'}
            className="w-full h-[42px] rounded-btn border border-line bg-surface-alt text-[14px] font-semibold disabled:opacity-40"
          >
            {testMsg === 'sending' ? '發送中…' : '發送測試通知'}
          </button>
          {testMsg && testMsg !== 'sending' && (
            <p className="text-xs text-text-tertiary mt-2 text-center">{testMsg}</p>
          )}
        </div>
      )}

      {/* iOS 提示（主力裝置 Android，iOS 完整引導列為選配） */}
      {env.isIOS && !env.isStandalone && (
        <p className="text-xs text-text-tertiary mt-4 leading-relaxed">
          iPhone／iPad：需 iOS 16.4 以上，並先用 Safari「加入主畫面」以 App 形式開啟，才能開啟推播。
        </p>
      )}
    </>
  )
}
