import { useMemo, useRef, useState } from 'react'
import { useCollection } from '../../db/DataProvider'
import useNetWorth from '../../hooks/useNetWorth'
import { formatBalance, formatSigned } from '../../lib/format'
import { todayStr, addDays, formatMd, weekday } from '../../lib/date'

// 淨資產趨勢（docs/09 批次 6）。SVG 折線＋漸層面積（資料視覺化例外可手寫）；
// 缺日不補值、點間直連；線色 CSS token；歷史不回補（缺歷史股價，見規格）。

const RANGES = [
  { id: 30, label: '30 天' },
  { id: 90, label: '90 天' },
  { id: 365, label: '1 年' },
  { id: 0, label: '全部' },
]

const W = 700
const H = 220
const PAD_X = 12
const PAD_TOP = 16
const PAD_BOTTOM = 24

export default function AssetsReport({ hidden }) {
  const snapshots = useCollection('netWorthSnapshots')
  const { total: liveTotal } = useNetWorth()
  const [rangeDays, setRangeDays] = useState(90)
  const svgRef = useRef(null)
  const [selIdx, setSelIdx] = useState(null)

  const opt = { hidden }

  // 依日期升序、落在區間內的快照
  const series = useMemo(() => {
    const cutoff = rangeDays > 0 ? addDays(todayStr(), -rangeDays) : ''
    return snapshots
      .filter((s) => s.date && (!cutoff || s.date >= cutoff))
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
  }, [snapshots, rangeDays])

  const first = series[0]
  const change = first ? liveTotal - first.total : 0
  const changePct = first && first.total ? (change / first.total) * 100 : null

  const geom = useMemo(() => {
    if (series.length < 2) return null
    const innerW = W - PAD_X * 2
    const innerH = H - PAD_TOP - PAD_BOTTOM
    const totals = series.map((s) => s.total)
    let min = Math.min(...totals)
    let max = Math.max(...totals)
    if (min === max) {
      min -= 1
      max += 1
    }
    const pad = (max - min) * 0.08
    min -= pad
    max += pad
    const x = (i) => PAD_X + (i / (series.length - 1)) * innerW
    const y = (v) => PAD_TOP + (1 - (v - min) / (max - min)) * innerH
    const linePts = series.map((s, i) => `${x(i).toFixed(1)},${y(s.total).toFixed(1)}`).join(' ')
    const areaPts = `${PAD_X},${PAD_TOP + innerH} ${linePts} ${(PAD_X + innerW).toFixed(1)},${PAD_TOP + innerH}`
    // 2-3 條水平刻度線
    const grid = [0, 0.5, 1].map((k) => {
      const v = min + (max - min) * k
      return { v, y: y(v) }
    })
    return { x, y, linePts, areaPts, grid, baseY: PAD_TOP + innerH }
  }, [series])

  const sel = selIdx != null ? series[selIdx] : null

  const handlePointer = (e) => {
    if (!geom || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    let bestD = Infinity
    series.forEach((s, i) => {
      const d = Math.abs(geom.x(i) - px)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    setSelIdx(best)
  }

  return (
    <>
      {/* 目前淨資產＋區間變化 */}
      <div className="bg-surface border border-line rounded-card shadow-card p-4 mb-3">
        <div className="text-[13px] text-text-secondary">目前淨資產</div>
        <div className="text-[30px] font-bold leading-tight tabular-nums mt-0.5">{formatBalance(liveTotal, opt)}</div>
        {series.length >= 1 && (
          <div className="flex items-center gap-2 mt-1.5 text-[13px]">
            <span className={`font-semibold tabular-nums ${change >= 0 ? 'text-success' : 'text-error'}`}>
              {formatSigned(change, opt)}
            </span>
            {changePct != null && !hidden && (
              <span className={`tabular-nums ${change >= 0 ? 'text-success' : 'text-error'}`}>
                ({change >= 0 ? '+' : ''}{changePct.toFixed(1)}%)
              </span>
            )}
            <span className="text-text-tertiary">此區間</span>
          </div>
        )}
      </div>

      {/* 區間切換 */}
      <div className="flex gap-1.5 p-1 mb-3 bg-surface-alt rounded-modal">
        {RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => { setRangeDays(r.id); setSelIdx(null) }}
            className={`flex-1 py-2 rounded-btn text-[13px] font-semibold ${
              rangeDays === r.id ? 'bg-surface text-text-primary shadow-segment' : 'text-text-secondary'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* 趨勢圖 */}
      <div className="bg-surface border border-line rounded-card shadow-card p-4">
        {series.length < 2 || !geom ? (
          <div className="py-14 text-center text-text-tertiary text-sm">
            淨資產快照自啟用日起每日累積，累積數日後可見趨勢
          </div>
        ) : (
          <>
            <div className="text-xs text-text-tertiary tabular-nums min-h-[16px] mb-1.5">
              {sel
                ? `${formatMd(sel.date)} ${weekday(sel.date)}・${hidden ? '••••' : formatBalance(sel.total)}`
                : `${series.length} 筆快照`}
            </div>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full touch-none select-none"
              style={{ height: 'auto' }}
              onPointerDown={handlePointer}
              onPointerMove={(e) => e.buttons && handlePointer(e)}
            >
              <defs>
                <linearGradient id="nwArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* 水平刻度線＋金額標籤 */}
              {geom.grid.map((g, i) => (
                <g key={i}>
                  <line x1={PAD_X} y1={g.y} x2={W - PAD_X} y2={g.y} stroke="var(--color-line-light)" strokeWidth="1" />
                  {!hidden && (
                    <text x={PAD_X} y={g.y - 3} fontSize="11" fill="var(--color-text-tertiary)">
                      {formatBalance(Math.round(g.v))}
                    </text>
                  )}
                </g>
              ))}
              {/* 面積＋折線 */}
              <polygon points={geom.areaPts} fill="url(#nwArea)" />
              <polyline
                points={geom.linePts}
                fill="none"
                stroke="var(--color-brand)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* 選取標記 */}
              {sel && selIdx != null && (
                <g>
                  <line
                    x1={geom.x(selIdx)}
                    y1={PAD_TOP}
                    x2={geom.x(selIdx)}
                    y2={geom.baseY}
                    stroke="var(--color-brand)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    opacity="0.6"
                  />
                  <circle cx={geom.x(selIdx)} cy={geom.y(sel.total)} r="4" fill="var(--color-brand)" />
                </g>
              )}
            </svg>
          </>
        )}
      </div>
      <p className="text-[11px] text-text-tertiary mt-2 px-1">
        趨勢自快照啟用日起每日累積；歷史不回補（缺歷史股價，避免混合口徑誤導）。
      </p>
    </>
  )
}
