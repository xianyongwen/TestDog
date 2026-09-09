import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import { localeScript } from '../docs/.vitepress/locale-preference.mjs'

function visit({ path = '/testdog-doc/', language = 'en-US', saved, blocked = false } = {}) {
  const url = new URL(path, 'https://example.com')
  let redirect, click, stored = saved
  class Element {
    constructor(href) { this.href = href; this.target = '' }
    closest() { return this }
    hasAttribute() { return false }
  }
  const location = { href: url.href, origin: url.origin, pathname: url.pathname, search: url.search, hash: url.hash, replace: value => { redirect = value } }
  runInNewContext(localeScript('/testdog-doc/'), {
    URL, Element,
    navigator: { languages: [language], language },
    document: { addEventListener: (_, handler) => { click = handler } },
    window: { location, localStorage: {
      getItem: () => { if (blocked) throw Error('blocked'); return stored },
      setItem: (_, value) => { if (blocked) throw Error('blocked'); stored = value },
    } },
  })
  return { redirect, select: href => { click({button: 0, target: new Element(href)}); return stored } }
}

test('default entry follows browser primary language, with English fallback', () => {
  for (const language of ['zh-CN', 'zh-TW', 'zh-HK', 'zh']) assert.equal(visit({language}).redirect, undefined)
  for (const language of ['en-US', 'fr-FR', 'ja-JP', '']) assert.equal(visit({language}).redirect, '/testdog-doc/en/')
  assert.equal(visit({path:'/testdog-doc/index.html?q=1#start'}).redirect, '/testdog-doc/en/?q=1#start')
})

test('manual preference overrides browser language and disabled storage is supported', () => {
  assert.equal(visit({saved:'zh'}).redirect, undefined)
  assert.equal(visit({saved:'en',language:'zh-CN'}).redirect, '/testdog-doc/en/')
  assert.equal(visit({saved:'invalid',blocked:true}).redirect, '/testdog-doc/en/')
})

test('explicit locale and deep links do not redirect', () => {
  for (const path of ['/testdog-doc/en/', '/testdog-doc/guide/getting-started.html', '/testdog-doc/en/download.html']) {
    assert.equal(visit({path}).redirect, undefined)
  }
})

test('language switches are remembered; ordinary and external links are ignored', () => {
  assert.equal(visit({path:'/testdog-doc/en/'}).select('https://example.com/testdog-doc/'), 'zh')
  assert.equal(visit().select('https://example.com/testdog-doc/en/'), 'en')
  assert.equal(visit().select('https://example.com/testdog-doc/download'), undefined)
  assert.equal(visit().select('https://other.example/testdog-doc/en/'), undefined)
  assert.doesNotThrow(() => visit({blocked:true}).select('https://example.com/testdog-doc/en/'))
})
