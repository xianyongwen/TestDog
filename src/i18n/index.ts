import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN';
import enUS from './locales/en-US';
import { updaterZhCN, updaterEnUS } from './updater';

export const LANGUAGES = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' },
] as const;

export type AppLanguage = (typeof LANGUAGES)[number]['value'];

export const LANGUAGE_STORAGE_KEY = 'app-language';

function detectInitialLanguage(): AppLanguage {
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved === 'zh-CN' || saved === 'en-US') return saved;
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: { ...zhCN, updater: updaterZhCN } },
    'en-US': { translation: { ...enUS, updater: updaterEnUS } },
  },
  lng: detectInitialLanguage(),
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
});

export function getCurrentLanguage(): AppLanguage {
  return (i18n.language === 'en-US' ? 'en-US' : 'zh-CN');
}

/** 切换语言：更新 i18n、localStorage，并返回新语言。 */
export function setLanguage(lang: AppLanguage): AppLanguage {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  void i18n.changeLanguage(lang);
  return lang;
}

export default i18n;
