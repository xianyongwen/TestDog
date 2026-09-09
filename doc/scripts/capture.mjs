// 文档素材采集脚本：启动 dev 后运行 `node doc/scripts/capture.mjs`
// 输出：doc/docs/public/images/*.png（截图）+ /tmp/docs-videos/*.webm（转 GIF 用）
import { createRequire } from 'module'
import { mkdirSync, writeFileSync } from 'fs'

const require = createRequire('/Users/xianyongwen/Documents/myProject/test-tool/server/package.json')
const { chromium } = require('playwright-core')

// BASE 可用环境变量覆盖（隔离端口截图时用），如 DOCS_BASE=http://localhost:1421/#
const BASE = process.env.DOCS_BASE ?? 'http://localhost:1420/#'
const IMG = '/Users/xianyongwen/Documents/myProject/test-tool/doc/docs/public/images'
const VID = '/tmp/docs-videos'
const DEMO_CASE_ID = 'cmrt3gzyr0001ydbwnd9euoz2' // 演示项目 / 新增待办

mkdirSync(IMG, { recursive: true })
mkdirSync(VID, { recursive: true })

const browser = await chromium.launch()

async function newPage(video = false) {
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    ...(video ? { recordVideo: { dir: VID, size: { width: 1600, height: 1000 } } } : {})
  })
  // 界面语言存 localStorage，须在页面脚本运行前写入
  await ctx.addInitScript(() => localStorage.setItem('app-language', 'zh-CN'))
  const page = await ctx.newPage()
  return { ctx, page }
}

const shot = (page, name, fullPage = false) =>
  page.screenshot({ path: `${IMG}/${name}.png`, fullPage })

const pause = (page, ms = 800) => page.waitForTimeout(ms)

// 平滑滚动：rAF 逐帧线性驱动 scrollTop（自动定位真实滚动容器），
// 不经 wheel/合成动画，录制帧间位移完全均匀，无抖动
const smoothScroll = (page, dy, duration = 2200) =>
  page.evaluate(({ dy, duration }) => {
    const find = () => {
      const se = document.scrollingElement
      if (se && se.scrollHeight > se.clientHeight + 2) return se
      const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2)
      let n = el
      while (n && n !== document.body) {
        const st = getComputedStyle(n)
        if (/(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 2) return n
        n = n.parentElement
      }
      return se
    }
    return new Promise((resolve) => {
      const box = find()
      const start = box.scrollTop
      const t0 = performance.now()
      const tick = (t) => {
        const pr = Math.min(1, (t - t0) / duration)
        box.scrollTop = start + dy * pr
        if (pr < 1) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
  }, { dy, duration })

// 1. 项目管理：列表 → 项目用例 → 用例详情
async function projects() {
  const { ctx, page } = await newPage(true)
  await page.goto(`${BASE}/projects`)
  await page.waitForLoadState('networkidle')
  await pause(page, 1200)
  await shot(page, 'projects-list')

  await page.getByText('客户关系管理', { exact: true }).first().click()
  await page.waitForLoadState('networkidle')
  await pause(page)
  await shot(page, 'project-cases')

  await page.getByText('查看商机阶段历史').first().click()
  await page.waitForLoadState('networkidle')
  await pause(page, 1200)
  await shot(page, 'case-detail')

  await pause(page, 400)
  await ctx.close()
  console.log('projects done')
}

// 2. AI 生成页：填写（不提交）
async function aiGenerate() {
  const { ctx, page } = await newPage(true)
  await page.goto(`${BASE}/cases/${DEMO_CASE_ID}/generate`)
  await page.waitForLoadState('networkidle')
  await pause(page, 1200)
  await shot(page, 'ai-generate-page')

  const ta = page.locator('textarea').first()
  if ((await ta.count()) > 0) {
    await ta.click()
    await pause(page, 400)
    await ta.fill('打开页面后，在输入框中填写一条新待办「采购办公用品」，点击添加按钮，校验列表中出现该待办')
    await pause(page, 600)
    await shot(page, 'ai-generate-filled')
  }
  await pause(page, 600)
  await ctx.close()
  console.log('ai-generate done')
}

// 2b. AI 生成全流程（真实跑一次）：发送 → 预拆分 → 确认计划 → 逐步执行 → 完成
async function aiGenerateRun() {
  const { ctx, page } = await newPage(true)
  await page.goto(`${BASE}/cases/${DEMO_CASE_ID}/generate`)
  await page.waitForLoadState('networkidle')
  await pause(page, 1200)

  const ta = page.locator('textarea').first()
  await ta.click()
  await pause(page, 400)
  await ta.fill('在待办输入框中输入"买牛奶"并按回车添加，断言列表中出现该条待办')
  await pause(page, 600)
  await page.getByRole('button', { name: '发送' }).click()
  await pause(page, 1500)

  // 等预拆分计划弹窗（最长 90s）
  try {
    await page.getByText('预拆分计划', { exact: false }).first().waitFor({ timeout: 90000 })
  } catch {
    console.log('WARN: plan not ready in 90s, continue recording')
  }
  await pause(page, 2500)

  // 计划确认弹窗（含测试意图与验收约定）
  await page.getByText('测试意图与验收约定', { exact: true }).first().waitFor({ timeout: 10000 }).catch(() => {})
  await pause(page, 1200)
  await shot(page, 'ai-generate-plan')

  // 点「开始执行」进入智能体执行
  const startBtn = page.getByRole('button', { name: '开始执行' }).first()
  if ((await startBtn.count()) > 0) {
    await startBtn.click()
  } else {
    console.log('WARN: start button not found')
  }

  // 等生成完成（最长 6 分钟），期间保持轨迹区滚动动态
  const started = Date.now()
  let doneHit = false
  while (Date.now() - started < 360000) {
    await pause(page, 4000)
    const body = page.locator('main, .ant-layout, body').first()
    try {
      if ((await page.getByText('已完成', { exact: true }).count()) > 0) { doneHit = true; break }
    } catch {}
    await body.hover().catch(() => {})
  }
  console.log(doneHit ? 'generation done' : 'WARN: timeout waiting generation')
  await pause(page, 3000)

  await shot(page, 'ai-generate-done')
  await ctx.close()
  console.log('ai-generate-run done')
}

async function record() {
  const { ctx, page } = await newPage(true)
  await page.goto(`${BASE}/cases/${DEMO_CASE_ID}/record`)
  await page.waitForLoadState('networkidle')
  await pause(page, 1200)
  await shot(page, 'record-page')

  const input = page.locator('input').first()
  if ((await input.count()) > 0) {
    await input.click()
    await pause(page, 400)
    await input.fill('https://example.com/todo')
    await pause(page, 600)
  }
  await pause(page, 600)
  await ctx.close()
  console.log('record done')
}

// 4. 运行记录：列表 → 详情
async function runs() {
  const { ctx, page } = await newPage(true)
  await page.goto(`${BASE}/runs`)
  await page.waitForLoadState('networkidle')
  await pause(page, 1200)
  await shot(page, 'runs-list')

  // 点第一行打开详情
  const row = page.locator('.ant-table-row').first()
  if ((await row.count()) > 0) {
    await row.click()
    await pause(page, 1200)
    await shot(page, 'run-detail')
    // 慢滚动展示步骤结果（进 GIF）
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 300)
      await pause(page, 700)
    }
  }
  await ctx.close()
  console.log('runs done')
}

// 4b. 回放全流程（真实跑一次）：运行当前版本 → 运行进度逐步日志 → 完成后查看运行记录明细
async function replayRun() {
  const { ctx, page } = await newPage(true)
  await page.goto(`${BASE}/cases/${DEMO_CASE_ID}`)
  await page.waitForLoadState('networkidle')
  await pause(page, 1500)

  // 点「运行当前版本」
  await page.getByRole('button', { name: '运行当前版本' }).click()
  await pause(page, 1500)

  // 等运行完成：「运行进度」卡片消失（最长 3 分钟）
  const started = Date.now()
  while (Date.now() - started < 180000) {
    if ((await page.getByText('运行进度', { exact: true }).count()) === 0) break
    await pause(page, 2000)
  }
  await pause(page, 2000)

  // 切「运行记录」Tab 查看结果（限定激活面板，避免匹配到隐藏 Tab 的表格）
  const runsTab = page.getByRole('tab', { name: '运行记录' })
  if ((await runsTab.count()) > 0) {
    await runsTab.click()
    await pause(page, 1200)
    const pane = page.locator('.ant-tabs-tabpane-active')
    const row = pane.locator('.ant-table-row').first()
    if ((await row.count()) > 0) {
      await row.click()
      // 选中运行后明细区重新加载，等「加载中」消失
      await page.getByText('加载中', { exact: true }).waitFor({ state: 'detached', timeout: 60000 }).catch(() => {})
      await pause(page, 4000)
      await shot(page, 'replay-run-detail')
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, 300)
        await pause(page, 600)
      }
    }
  }
  await ctx.close()
  console.log('replay-run done')
}

async function genlogs() {
  const { ctx, page } = await newPage(true)
  await page.goto(`${BASE}/genlogs`)
  await page.waitForLoadState('networkidle')
  await pause(page, 1200)
  await shot(page, 'genlogs-list')

  // 点第一行操作列的「查看」按钮打开详情抽屉
  const viewBtn = page.locator('.ant-table-row').first().locator('button').first()
  await viewBtn.click()
  await pause(page, 1500)
  await shot(page, 'genlog-detail')

  // 抽屉内慢滚动浏览工具调用轨迹
  const drawerBody = page.locator('.ant-drawer-body')
  if ((await drawerBody.count()) > 0) {
    for (let i = 0; i < 5; i++) {
      await drawerBody.hover()
      await page.mouse.wheel(0, 420)
      await pause(page, 700)
    }
  }

  // 关闭抽屉
  const closeBtn = page.locator('.ant-drawer-close')
  if ((await closeBtn.count()) > 0) {
    await closeBtn.click()
    await pause(page, 800)
  }
  await ctx.close()
  console.log('genlogs done')
}

// 6. 插件管理：插件 Tab 滚动 → 预设 Tab
async function plugins() {
  const { ctx, page } = await newPage(true)
  await page.goto(`${BASE}/plugins`)
  await page.waitForLoadState('networkidle')
  await pause(page, 1200)
  await shot(page, 'plugins-page')

  await smoothScroll(page, 1200, 2000)
  await pause(page, 500)
  await smoothScroll(page, -1200, 1500)
  await pause(page, 600)

  const presetTab = page.getByRole('tab', { name: '预设' })
  if ((await presetTab.count()) > 0) {
    await presetTab.click()
    await pause(page, 1000)
    await shot(page, 'plugins-preset')
  }
  await pause(page, 600)
  await ctx.close()
  console.log('plugins done')
}

// 7. 设置页：滚动浏览
async function settings() {
  const { ctx, page } = await newPage(true)
  await page.goto(`${BASE}/settings`)
  await page.waitForLoadState('networkidle')
  await pause(page, 1200)
  await shot(page, 'settings-gateway')

  await smoothScroll(page, 5000, 2800)
  await pause(page, 800)
  await ctx.close()
  console.log('settings done')
}

// 8. 用例详情：脚本步骤 + 导出入口（用例文件页素材）
async function caseSteps() {
  const { ctx, page } = await newPage(true)
  await page.goto(`${BASE}/cases/${DEMO_CASE_ID}`)
  await page.waitForLoadState('networkidle')
  await pause(page, 1200)
  // 脚本 Tab
  const scriptsTab = page.getByRole('tab', { name: /脚本|版本/ }).first()
  if ((await scriptsTab.count()) > 0) {
    await scriptsTab.click()
    await pause(page, 1000)
  }
  await shot(page, 'case-scripts')
  await pause(page, 500)
  await ctx.close()
  console.log('case-steps done')
}

// 9. 测试数据与登录态：环境变量弹窗 → 登录配置管理
async function testData() {
  const { ctx, page } = await newPage(true)
  await page.goto(`${BASE}/projects`)
  await page.waitForLoadState('networkidle')
  await pause(page, 1200)

  // 第一行 🔑 环境变量
  await page.locator('.ant-table-row', { hasText: '客户关系管理' }).locator('button').nth(0).click()
  await pause(page, 1200)
  await shot(page, 'env-vars')
  const addVar = page.getByRole('button', { name: '添加变量' })
  if ((await addVar.count()) > 0) {
    await addVar.click()
    await pause(page, 600)
    const inputs = page.locator('.ant-modal input')
    const n = await inputs.count()
    if (n >= 2) {
      await inputs.nth(n - 2).fill('demo_url')
      await inputs.nth(n - 1).fill('https://demo.playwright.dev')
      await pause(page, 800)
    }
  }
  await page.locator('.ant-modal:visible').getByRole('button', { name: /取\s*消/ }).last().click()
  await pause(page, 800)

  // 第一行 🔒 登录配置（管理弹窗：新增表单内嵌，footer 为「关闭」）
  await page.locator('.ant-table-row', { hasText: '客户关系管理' }).locator('button').nth(1).click()
  await pause(page, 1200)
  await shot(page, 'login-configs')
  const nameInputs = page.locator('.ant-modal:visible input')
  if ((await nameInputs.count()) >= 2) {
    await nameInputs.nth(1).fill('demo 账号')
    await pause(page, 600)
    await shot(page, 'login-config-new')
  }
  const closeBtn = page.locator('.ant-modal:visible').getByRole('button', { name: /关\s*闭/ })
  if ((await closeBtn.count()) > 0) {
    await closeBtn.first().click()
  } else {
    await page.locator('.ant-modal-close:visible').first().click().catch(() => {})
  }
  await pause(page, 600)

  await ctx.close()
  console.log('test-data done')
}


// 命令行可只跑指定流程：node capture.mjs genlogs runs
const only = process.argv.slice(2)
const flows = { projects, aiGenerate, aiGenerateRun, record, runs, replayRun, genlogs, plugins, settings, caseSteps, testData }
const runFlows = only.length ? only.map((k) => flows[k]) : Object.values(flows)
for (const fn of runFlows) await fn()

await browser.close()
writeFileSync('/tmp/docs-videos/.done', new Date().toISOString())
console.log('ALL CAPTURE DONE')
