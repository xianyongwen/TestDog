import { useEffect, useState } from 'react';
import { Layout, Menu, ConfigProvider, Button, Tooltip, message } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AppstoreOutlined,
  HistoryOutlined,
  SettingOutlined,
  FileSearchOutlined,
  ApiOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  QuestionCircleOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons';
import i18n, { getCurrentLanguage, type AppLanguage } from './i18n';
import { useThemeMode, useFontSizeScale, getThemeConfig } from './theme';
import Projects from './pages/Projects';
import ProjectCases from './pages/ProjectCases';
import TestCaseDetail from './pages/TestCaseDetail';
import Generate from './pages/Generate';
import Record from './pages/Record';
import Runs from './pages/Runs';
import Settings from './pages/Settings';
import GenerationRecords from './pages/GenerationRecords';
import Plugins from './pages/Plugins';
import AppUpdater from './components/AppUpdater';
import appLogo from '../src-tauri/icons/128x128.png';
import { version as appVersion } from '../package.json';

const { Sider, Content } = Layout;

function Shell() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();

  // 浏览器标签标题随语言切换
  useEffect(() => {
    document.title = t('app.title');
  }, [t]);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sider-collapsed') === 'true';
  });
  useEffect(() => {
    localStorage.setItem('sider-collapsed', String(collapsed));
  }, [collapsed]);
  const selected = loc.pathname.startsWith('/runs')
    ? 'runs'
    : loc.pathname.startsWith('/genlogs')
      ? 'genlogs'
      : loc.pathname.startsWith('/plugins')
        ? 'plugins'
        : loc.pathname.startsWith('/settings')
          ? 'settings'
          : 'projects';

  const menuItems = [
    { key: 'projects', label: t('app.menu.projects'), icon: <AppstoreOutlined /> },
    { key: 'runs', label: t('app.menu.runs'), icon: <HistoryOutlined /> },
    { key: 'genlogs', label: t('app.menu.genlogs'), icon: <FileSearchOutlined /> },
    { key: 'plugins', label: t('app.menu.plugins'), icon: <ApiOutlined /> },
    { key: 'settings', label: t('app.menu.settings'), icon: <SettingOutlined /> },
  ];

  return (
    <Layout className="h-screen bg-page">
      <AppUpdater />
      <Sider
        width={208}
        collapsedWidth={64}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        className="app-sidebar m-3 rounded-2xl overflow-hidden"
      >
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <img className="sidebar-logo" src={appLogo} alt={collapsed ? t('app.title') : ''} />
            {!collapsed && <span className="text-ink text-base font-semibold">{t('app.title')}</span>}
          </div>
          <Button
            className="sidebar-toggle"
            type="text"
            size="small"
            aria-label={t(collapsed ? 'app.expandSidebar' : 'app.collapseSidebar')}
            title={t(collapsed ? 'app.expandSidebar' : 'app.collapseSidebar')}
            aria-expanded={!collapsed}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
        </div>
        <nav className="sidebar-nav" aria-label={t('app.title')}>
          <Menu
            mode="inline"
            selectedKeys={[selected]}
            items={menuItems}
            onClick={({ key }) => nav(`/${key}`)}
            inlineCollapsed={collapsed}
          />
        </nav>
        <Tooltip title={collapsed ? t('app.helpDocs') : undefined} placement="right">
          <a
            className="sidebar-help"
            href="https://softwing.top/testdog-doc/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('app.helpDocs')}
            onClick={(event) => {
              if (window.__TAURI__) {
                event.preventDefault();
                void window.__TAURI__.core.invoke('open_help_docs').catch(() => {
                  message.error(t('app.helpOpenFailed'));
                });
              }
            }}
          >
            <QuestionCircleOutlined />
            {!collapsed && <>
              <span className="sidebar-help-label">{t('app.helpDocs')}</span>
              <ArrowUpOutlined className="sidebar-help-external" />
            </>}
          </a>
        </Tooltip>
        <div className="sidebar-footer" title={`${t('common.version')} ${appVersion}`}>
          {!collapsed && <span>{t('common.version')}</span>}
          <span className="sidebar-version">v{appVersion}</span>
        </div>
      </Sider>
      <Layout>
        <Content className="overflow-auto">
          {/* 背景保持透明，透出根 Layout 的 bg-page 渐变 */}
          <div className="p-5 pl-1">
            <Routes>
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:projectId" element={<ProjectCases />} />
              <Route path="/cases/:caseId" element={<TestCaseDetail />} />
              <Route path="/cases/:caseId/generate" element={<Generate />} />
              <Route path="/cases/:caseId/record" element={<Record />} />
              <Route path="/runs" element={<Runs />} />
              <Route path="/genlogs" element={<GenerationRecords />} />
              <Route path="/plugins" element={<Plugins />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/projects" replace />} />
            </Routes>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

function AppInner() {
  const [lang, setLang] = useState<AppLanguage>(getCurrentLanguage());
  const [, resolved] = useThemeMode();
  const [fontScale] = useFontSizeScale();

  useEffect(() => {
    const onChange = (lng: string) => {
      const next: AppLanguage = lng === 'en-US' ? 'en-US' : 'zh-CN';
      dayjs.locale(next === 'en-US' ? 'en' : 'zh-cn');
      setLang(next);
    };
    onChange(i18n.language);
    i18n.on('languageChanged', onChange);
    return () => {
      i18n.off('languageChanged', onChange);
    };
  }, []);

  return (
    <ConfigProvider locale={lang === 'en-US' ? enUS : zhCN} theme={getThemeConfig(resolved, fontScale)}>
      <Shell />
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppInner />
    </HashRouter>
  );
}
