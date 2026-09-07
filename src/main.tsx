import ReactDOM from 'react-dom/client';
import { App as AntApp } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';
import './i18n';
import App from './App';
import { applyTheme, resolveMode, getStoredMode } from './theme';
import './tailwind.css';
import './style.scss'

// 渲染前写入 <html data-theme>，避免 dark 下首帧白闪
applyTheme(resolveMode(getStoredMode()));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StyleProvider layer>
    {/* layer 模式：antd 的 cssinjs 样式进入 @layer antd，让 Tailwind utilities 优先级更高 */}
    <AntApp>
      <App />
    </AntApp>
  </StyleProvider>,
);
