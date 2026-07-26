import { useState, useEffect, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons'
import { getIcon, ICON_KEYWORDS_ZH } from '../../lib/icons'
import Sheet from '../Sheet'

// 一次最多畫這麼多格；其餘要求使用者用搜尋縮小範圍（1400 多個全畫會卡頓）
const LIMIT = 120

// 目錄約 800KB，只在使用者真的打開選圖器時載一次，之後同一 session 共用。
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

// 分類圖示選擇器：從完整 FA solid 目錄挑，選定後回傳 { n, w, h, p } 向量資料存進分類。
export default function IconPickerSheet({ open, onClose, onPick }) {
  const [icons, setIcons] = useState(null) // null＝尚未載入
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')

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

  const results = useMemo(() => {
    if (!icons) return []
    const q = query.trim().toLowerCase()
    if (!q) return icons.slice(0, LIMIT)
    // 中文查詢先橋接成英文詞（例如「咖啡」→ coffee／mug）
    const extras = []
    for (const [zh, en] of Object.entries(ICON_KEYWORDS_ZH)) {
      if (zh.includes(q) || q.includes(zh)) extras.push(...en)
    }
    const starts = []
    const rest = []
    for (const ic of icons) {
      if (ic.n.startsWith(q)) starts.push(ic)
      else if (hit(ic, q) || extras.some((e) => hit(ic, e))) rest.push(ic)
      if (starts.length >= LIMIT) break
    }
    return [...starts, ...rest].slice(0, LIMIT)
  }, [icons, query])

  return (
    <Sheet open={open} onClose={onClose} title="選擇圖示" bodyClassName="flex flex-col">
      <div className="p-[18px] pb-2 flex-none">
        <div className="flex items-center gap-2 h-[38px] px-3 bg-surface border border-line rounded-modal">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="text-text-tertiary text-sm" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋圖示，可用中文如「咖啡」"
            className="flex-1 min-w-0 bg-transparent text-[15px] outline-none placeholder:text-text-tertiary"
          />
          {query && (
            <button onClick={() => setQuery('')} className="flex-none text-text-tertiary">
              <FontAwesomeIcon icon={faXmark} className="text-sm" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-[18px] pb-[18px]">
        {error ? (
          <div className="py-8 text-center text-sm text-text-tertiary">{error}</div>
        ) : !icons ? (
          <div className="py-8 text-center text-sm text-text-tertiary">載入圖示中…</div>
        ) : results.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-tertiary">找不到符合的圖示</div>
        ) : (
          <>
            <div className="grid grid-cols-8 gap-1.5">
              {results.map((ic) => (
                <button
                  key={ic.n}
                  title={ic.n}
                  onClick={() => {
                    onPick({ n: ic.n, w: ic.w, h: ic.h, p: ic.p })
                    onClose()
                  }}
                  className="aspect-square rounded-btn flex items-center justify-center text-[15px] bg-surface-alt text-text-secondary"
                >
                  <FontAwesomeIcon icon={getIcon(ic)} />
                </button>
              ))}
            </div>
            {results.length >= LIMIT && (
              <div className="pt-3 text-center text-xs text-text-tertiary">
                只顯示前 {LIMIT} 個，請用搜尋縮小範圍
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}
