// 主題（階段 7）：淺／深／跟隨系統。存 localStorage（per-device）——主題屬裝置偏好，
// 且須在登入與資料載入前生效；index.html 的防閃爍 script 用同一把 key。
const KEY = 'atomcoins-theme'
// 深色值對應 index.css :root[data-theme="dark"] 的 --color-surface（PWA 狀態列跟著介面走）
const THEME_COLOR = { light: '#3B5BDB', dark: '#1A1E23' }

export function getTheme() {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

function systemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function apply(mode) {
  const dark = mode === 'dark' || (mode === 'system' && systemDark())
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light)
}

export function setTheme(mode) {
  if (mode === 'system') localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, mode)
  apply(mode)
}

// 啟動時套用一次，之後只在「跟隨系統」模式下跟隨 OS 主題變化
export function initTheme() {
  apply(getTheme())
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getTheme() === 'system') apply('system')
  })
}
