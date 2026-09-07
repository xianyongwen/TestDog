import { useEffect, useState } from 'react';
import { Layout, Menu, ConfigProvider, Button } from 'antd';
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
      <Sider
        width={208}
        collapsedWidth={64}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        className="m-3 rounded-2xl"
      >
        <div
          className={`flex items-center gap-2 whitespace-nowrap overflow-hidden py-[18px] pr-4 text-ink text-base font-semibold ${
            collapsed ? 'justify-center pl-0' : 'pl-4'
          }`}
        >
          {/* 折叠按钮放侧栏顶部（Finder 风格），替代 antd 底部默认 trigger */}
          <Button
            type="text"
            size="small"
            aria-label="toggle sidebar"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          {!collapsed && <span>{t('app.title')}</span>}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selected]}
          items={menuItems}
          onClick={({ key }) => nav(`/${key}`)}
          inlineCollapsed={collapsed}
        />
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
