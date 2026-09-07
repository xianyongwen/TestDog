import { defineConfig } from 'vitepress'

// 中 / 英共享的导航结构（en 侧路径加 /en 前缀）
const nav = (p = '') => [
  { text: '指南', link: `${p}/guide/what-is-testdog`, activeMatch: `${p}/(guide|menus)/` },
  { text: '常见问题', link: `${p}/guide/faq` }
]

const sidebar = (p = '') => [
  {
    text: '开始',
    items: [
      { text: '简介', link: `${p}/guide/what-is-testdog` },
      { text: '快速开始', link: `${p}/guide/getting-started` }
    ]
  },
  {
    text: '菜单导览',
    items: [
      { text: '项目管理', link: `${p}/menus/projects` },
      { text: '运行记录', link: `${p}/menus/runs` },
      { text: '生成记录', link: `${p}/menus/genlogs` },
      { text: '插件管理', link: `${p}/menus/plugins` },
      { text: '设置', link: `${p}/menus/settings` }
    ]
  },
  {
    text: '核心功能',
    items: [
      { text: 'AI 生成脚本', link: `${p}/guide/ai-generate` },
      { text: '手动录制脚本', link: `${p}/guide/record` },
      { text: '回放运行', link: `${p}/guide/replay` }
    ]
  },
  {
    text: '进阶',
    items: [
      { text: '插件开发', link: `${p}/guide/plugin-dev` },
      { text: '测试数据与登录态', link: `${p}/guide/test-data` },
      { text: '.testcase 用例文件', link: `${p}/guide/testcase-file` },
      { text: '常见问题', link: `${p}/guide/faq` },
      { text: '贡献指南', link: `${p}/guide/contributing` }
    ]
  }
]

const zhSearchTranslations = {
  button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
  modal: {
    noResultsText: '未找到相关结果',
    resetButtonTitle: '清除查询条件',
    footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' }
  }
}

const enSidebar = (p = '') => [
  {
    text: 'Start',
    items: [
      { text: 'Introduction', link: `${p}/guide/what-is-testdog` },
      { text: 'Getting Started', link: `${p}/guide/getting-started` }
    ]
  },
  {
    text: 'Menus',
    items: [
      { text: 'Projects', link: `${p}/menus/projects` },
      { text: 'Run Records', link: `${p}/menus/runs` },
      { text: 'Generation Logs', link: `${p}/menus/genlogs` },
      { text: 'Plugins', link: `${p}/menus/plugins` },
      { text: 'Settings', link: `${p}/menus/settings` }
    ]
  },
  {
    text: 'Core Features',
    items: [
      { text: 'AI Generation', link: `${p}/guide/ai-generate` },
      { text: 'Manual Recording', link: `${p}/guide/record` },
      { text: 'Replay & Runs', link: `${p}/guide/replay` }
    ]
  },
  {
    text: 'Advanced',
    items: [
      { text: 'Plugin Development', link: `${p}/guide/plugin-dev` },
      { text: 'Test Data & Login', link: `${p}/guide/test-data` },
      { text: '.testcase Files', link: `${p}/guide/testcase-file` },
      { text: 'FAQ', link: `${p}/guide/faq` },
      { text: 'Contributing', link: `${p}/guide/contributing` }
    ]
  }
]

const enNav = (p = '') => [
  { text: 'Guide', link: `${p}/guide/what-is-testdog`, activeMatch: `${p}/(guide|menus)/` },
  { text: 'FAQ', link: `${p}/guide/faq` }
]

export default defineConfig({
  title: 'TestDog',
  // 部署子路径（如 https://example.com/testdog-doc/）；
  // 注意：public 静态资源（/images /videos /favicon /logo）不会自动加 base，
  // 文档 md 与 head 里的引用需写死 /testdog-doc/ 前缀
  base: '/testdog-doc/',
  // 站点图标：与应用图标一致（src-tauri/icons/128x128.png，更新应用图标时同步复制到 docs/public/favicon.png）
  head: [['link', { rel: 'icon', type: 'image/png', href: '/testdog-doc/favicon.png' }]],

  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      description: 'TestDog 测试用例管理工具帮助文档：AI 生成脚本、手动录制、确定性回放、组件库语义插件',
      themeConfig: {
        nav: nav(),
        sidebar: sidebar(),
        localeLinks: { text: '简体中文', items: [{ text: 'English', link: '/en/' }] },
        footer: {
          message: 'TestDog 测试用例管理工具',
          copyright: 'Copyright © 2026 TestDog'
        }
      }
    },
    en: {
      label: 'English',
      lang: 'en-US',
      description:
        'TestDog help documentation: AI script generation, manual recording, deterministic replay, and component-library semantic plugins',
      themeConfig: {
        nav: enNav('/en'),
        sidebar: enSidebar('/en'),
        localeLinks: { text: 'English', items: [{ text: '简体中文', link: '/' }] },
        footer: {
          message: 'TestDog Test Case Management Tool',
          copyright: 'Copyright © 2026 TestDog'
        }
      }
    }
  },

  // 本地全文搜索；中文界面补充中文文案（英文用默认）
  themeConfig: {
    socialLinks: [{ icon: 'github', link: 'https://github.com/xianyongwen/TestDog' }],
    search: {
      provider: 'local',
      options: {
        locales: { root: { translations: zhSearchTranslations } }
      }
    }
  }
})
