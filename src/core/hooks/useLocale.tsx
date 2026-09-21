import { createContext, use, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { messages, type Locale } from '../i18n';
import { DEFAULT_LOCALE } from '../config';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'zh',
  setLocale: () => {},
  t: (key) => key,
});

function resolveLocale(value: string | null | undefined): Locale {
  return value === 'zh' || value === 'en' ? value : DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() =>
    resolveLocale(localStorage.getItem('locale'))
  );

  const updateLocale = useCallback((l: Locale) => {
    const next = resolveLocale(l);
    setLocale(next);
    localStorage.setItem('locale', next);
  }, []);

  const t = useCallback(
    (key: string) => {
      return messages[locale]?.[key] || messages[DEFAULT_LOCALE]?.[key] || key;
    },
    [locale]
  );

  return (
    <LocaleContext value={{ locale, setLocale: updateLocale, t }}>
      {children}
    </LocaleContext>
  );
}

export function useLocale() {
  return use(LocaleContext);
}
