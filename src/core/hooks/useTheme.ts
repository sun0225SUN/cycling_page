import { useEffect, useState } from 'react';
import { DEFAULT_THEME } from '../config';

function resolveDark(): boolean {
  if (typeof window === 'undefined') return DEFAULT_THEME === 'dark';
  const stored = localStorage.getItem('theme');
  if (stored === 'dark') return true;
  if (stored === 'light') return false;
  if (DEFAULT_THEME === 'dark') return true;
  if (DEFAULT_THEME === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyThemeClass(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function useTheme() {
  const [dark, setDark] = useState(() => {
    const isDark = resolveDark();
    // Sync class during the initial render, not only in useEffect.
    applyThemeClass(isDark);
    return isDark;
  });

  useEffect(() => {
    applyThemeClass(dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    // Enable theme transitions only after the first frame.
    const id = window.requestAnimationFrame(() => {
      document.documentElement.classList.add('theme-ready');
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  return { dark, toggle: () => setDark((d) => !d) };
}
