import { useState, useEffect, useMemo, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons'
import { getIcon, ICON_KEYWORDS_ZH } from '../../lib/icons'
import Sheet from '../Sheet'

// 一次追加這麼多格；捲到底自動再加一頁，避免 1988 顆 SVG 一次進 DOM
const PAGE = 160

const STYLE_TABS = [
  { id: 'fas', label: '實心' },
  { id: 'fab', label: '品牌' },
]

// 目錄約 1.4 MB，只在使用者真的打開選圖器時載一次，之後同一 session 共用。
// 由 scripts/gen-icon-catalog.mjs 產生，不進 PWA 預快取，故離線時會失敗（有退路提示）。
let catalogPromise = null
function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch(`${import.meta.env.BASE_URL}fa-icons.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => d.icons ?? [])
      .catch((e) => {
        catalogPromise = null // 失敗不留快取，恢復連線後可再試
        throw e
      })
  }
  return catalogPromise
}

// 比對圖示英文名與其別名（FA7 的別名含 FA6 舊名，故舊名也查得到）
function hit(ic, term) {
  return ic.n.includes(term) || (ic.a?.some((x) => x.includes(term)) ?? false)
}

// 分類圖示選擇器：從完整 FA 目錄挑，選定後回傳 { n, w, h, p, s? } 向量資料存進分類。
// s 只有品牌圖示會帶（solid 省略，見產製腳本），存進資料後由 getIcon 還原成對的 prefix。
export default function IconPickerSheet({ open, onClose, onPick }) {
  const [icons, setIcons] = useState(null) // null＝尚未載入
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [style, setStyle] = useState('fas')
  const [visible, setVisible] = useState(PAGE)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!open || icons) return
    let alive = true
    setError(null)
    loadCatalog().then(
      (list) => alive && setIcons(list),
      () => alive && setError('載入圖示目錄失敗。離線時無法瀏覽完整圖示，內建的常用圖示仍可選。'),
    )
    return () => {
      alive = false
    }
  }, [open, icons])

  // 換分頁或改關鍵字都從第一頁重數，否則會停在上一輪捲到的深度
  useEffect(() => {
    setVisible(PAGE)
    scrollRef.current?.scrollTo({ top: 0 })
  }, [query, style])

  const results = useMemo(() => {
    if (!icons) return []
    const pool = icons.filter((ic) => (ic.s ?? 'fas') === style)
    const q = query.trim().toLowerCase()
    if (!q) return pool
    // 中文查詢先橋接成英文詞（例如「咖啡」→ coffee／mug）
    const extras = []
    for (const [zh, en] of Object.entries(ICON_KEYWORDS_ZH)) {
      if (zh.includes(q) || q.includes(zh)) extras.push(...en)
    }
    const starts = []
    const rest = []
    for (const ic of pool) {
      if (ic.n.startsWith(q)) starts.push(ic)
      else if (hit(ic, q) || extras.some((e) => hit(ic, e))) rest.push(ic)
    }
    return [...starts, ...rest]
  }, [icons, query, style])

  const shown = results.slice(0, visible)
  const hasMore = results.length > visible

  // 捲到接近底部就追加一頁。用 scroll 事件而非 IntersectionObserver：後者的回呼依賴頁面
  // 持續產生 frame，在背景分頁／未顯示的 webview 裡不會派送，這種清單反而會停在第一頁。
  // 已全部顯示時回傳同一個值，React 會跳過重渲染，不必額外 guard。
  const handleScroll = (e) => {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 240) return
    setVisible((v) => (v >= results.length ? v : v + PAGE))
  }

  return (
    <Sheet open={open} onClose={onClose} title="選擇圖示" bodyClassName="flex flex-col">
      <div className="p-[18px] pb-2 flex-none">
        <div className="flex gap-1.5 p-1 mb-2.5 bg-surface-alt rounded-modal">
          {STYLE_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setStyle(t.id)}
              className={`flex-1 py-2 rounded-btn text-[13px] font-semibold ${
                style === t.id ? 'bg-surface text-text-primary shadow-segment' : 'text-text-secondary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 h-[38px] px-3 bg-surface border border-line rounded-modal">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="text-text-tertiary text-sm" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={style === 'fab' ? '搜尋品牌，如 line、apple' : '搜尋圖示，可用中文如「咖啡」'}
            className="flex-1 min-w-0 bg-transparent text-[15px] outline-none placeholder:text-text-tertiary"
          />
          {query && (
            <button onClick={() => setQuery('')} className="flex-none text-text-tertiary">
              <FontAwesomeIcon icon={faXmark} className="text-sm" />
            </button>
          )}
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-[18px] pb-[18px]"
      >
        {error ? (
          <div className="py-8 text-center text-sm text-text-tertiary">{error}</div>
        ) : !icons ? (
          <div className="py-8 text-center text-sm text-text-tertiary">載入圖示中…</div>
        ) : results.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-tertiary">找不到符合的圖示</div>
        ) : (
          <>
            <div className="grid grid-cols-8 gap-1.5">
              {shown.map((ic) => (
                <button
                  key={`${ic.s ?? 'fas'}:${ic.n}`}
                  title={ic.n}
                  onClick={() => {
                    onPick({ n: ic.n, w: ic.w, h: ic.h, p: ic.p, ...(ic.s ? { s: ic.s } : {}) })
                    onClose()
                  }}
                  className="aspect-square rounded-btn flex items-center justify-center text-[15px] bg-surface-alt text-text-secondary"
                >
                  <FontAwesomeIcon icon={getIcon(ic)} />
                </button>
              ))}
            </div>
            {hasMore && (
              // 捲到底會自動追加，這顆是退路：螢幕夠高時一整頁可能填不滿捲動空間，
              // 捲不動就等於再也載不出剩下的，必須留一個不依賴捲動的入口。
              <button
                onClick={() => setVisible((v) => v + PAGE)}
                className="w-full pt-3 text-center text-xs text-text-tertiary"
              >
                載入更多（還有 {results.length - visible} 個）
              </button>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}
