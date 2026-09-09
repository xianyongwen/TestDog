// Serialized into <head> so the default entry redirects before page rendering.
// Keep this function self-contained and safe when browser storage is disabled.
export function configureLocale(base) {
  const key = 'testdog-docs-language'
  const localeOf = pathname => {
    if (!pathname.startsWith(base)) return null
    return /^en(?:\/|$)/.test(pathname.slice(base.length)) ? 'en' : 'zh'
  }

  // Capture explicit language changes before VitePress handles SPA navigation.
  document.addEventListener('click', event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return
    const url = new URL(link.href, window.location.href)
    if (url.origin !== window.location.origin) return
    const next = localeOf(url.pathname)
    const current = localeOf(window.location.pathname)
    if (next && current && next !== current) {
      try { window.localStorage.setItem(key, next) } catch { /* Storage may be disabled. */ }
    }
  }, true)

  // Only the unqualified home page negotiates language. Deep links and /en/
  // keep their explicit language, including after a page reload.
  const path = window.location.pathname
  if (![base, base.slice(0, -1), `${base}index.html`].includes(path)) return
  let preferred
  try { preferred = window.localStorage.getItem(key) } catch { /* Use browser language. */ }
  if (preferred !== 'zh' && preferred !== 'en') {
    const language = navigator.languages?.[0] || navigator.language || 'en'
    preferred = /^zh(?:-|$)/i.test(language) ? 'zh' : 'en'
  }
  if (preferred === 'en') {
    window.location.replace(`${base}en/${window.location.search}${window.location.hash}`)
  }
}

export const localeScript = base => `(${configureLocale.toString()})(${JSON.stringify(base)});`
