import { createContext, useContext, useCallback } from 'react';
import { Lang, i18n } from '@/i18n.ts';

export interface LangContextType {
  lang: Lang;
  t: Record<string, string>;
  setLang: (l: Lang) => void;
}

export const LangContext = createContext<LangContextType>({
  lang: 'en',
  t: i18n['en'],
  setLang: () => {},
});

export const useLang = () => useContext(LangContext);

export const useLangPath = () => {
  const { lang } = useContext(LangContext);
  return useCallback((path: string) => `/${lang}${path}`, [lang]);
};
