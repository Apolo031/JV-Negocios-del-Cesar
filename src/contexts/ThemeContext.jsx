'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'joyerias-panel-theme';

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let initial = 'dark';
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') {
        initial = saved;
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        initial = 'light';
      }
    } catch (e) { /* localStorage no disponible: usamos oscuro por defecto */ }
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
    setReady(true);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* no pasa nada si falla */ }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, ready }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  return ctx;
}